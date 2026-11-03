#!/usr/bin/env node
/**
 * Bulk-uploads every .glb in ./glb-cache/_small/ to Supabase Storage,
 * overwriting the originals at the same paths. Pulls the path map from the
 * backend's /generated-designs response so each file lands where its row
 * already expects it — no DB updates needed afterward.
 *
 * Required env vars:
 *   SUPABASE_SERVICE_ROLE_KEY — admin key, NEVER commit. Get it from
 *     Supabase dashboard → Settings → API → service_role (secret).
 *
 * Optional env vars:
 *   BACKEND_API_URL — defaults to production backend
 *   SUPABASE_URL    — defaults to the project we use
 *   GLB_BUCKET      — defaults to "models"
 *   SMALL_DIR       — defaults to ./glb-cache/_small
 *
 * Usage (PowerShell):
 *   $env:SUPABASE_SERVICE_ROLE_KEY = "<paste-key-here>"
 *   node scripts/upload-small-glbs-to-supabase.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BACKEND = process.env.BACKEND_API_URL || "https://gia-app-du2mz.ondigitalocean.app";
const SUPABASE_URL = process.env.SUPABASE_URL || "https://nfkzpyxvwxlxazvrprki.supabase.co";
const BUCKET = process.env.GLB_BUCKET || "models";
const SMALL_DIR = path.resolve(ROOT, process.env.SMALL_DIR || "glb-cache/_small");

if (!SERVICE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY env var.");
  console.error("Set it in PowerShell with:");
  console.error('  $env:SUPABASE_SERVICE_ROLE_KEY = "<paste-key>"');
  console.error("Get the key from Supabase dashboard → Settings → API → service_role");
  process.exit(1);
}

if (!fs.existsSync(SMALL_DIR)) {
  console.error(`Compressed GLB dir not found: ${SMALL_DIR}`);
  process.exit(1);
}

console.log(`Fetching design list from ${BACKEND}/generated-designs ...`);
const res = await fetch(`${BACKEND}/generated-designs`);
if (!res.ok) {
  console.error(`Backend returned ${res.status} ${res.statusText}`);
  process.exit(1);
}
const { items = [] } = await res.json();
const withUrls = items.filter((it) => it.model_url);
console.log(`Backend reports ${withUrls.length} designs with model URLs.`);

// Build a {filename → supabase storage path} map from the public URLs.
// Public URLs look like:
//   https://<proj>.supabase.co/storage/v1/object/public/<bucket>/<storage-path>
// We need <storage-path> to PUT back to /storage/v1/object/<bucket>/<storage-path>
const publicPrefix = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
const fileToStoragePath = new Map();
for (const item of withUrls) {
  if (!item.model_url.startsWith(publicPrefix)) {
    console.warn(`skip: URL not in expected bucket: ${item.model_url}`);
    continue;
  }
  const storagePath = item.model_url.slice(publicPrefix.length);
  const filename = path.basename(storagePath);
  fileToStoragePath.set(filename, storagePath);
}

const localFiles = fs
  .readdirSync(SMALL_DIR, { withFileTypes: true })
  .filter((d) => d.isFile() && d.name.toLowerCase().endsWith(".glb"))
  .map((d) => d.name);

console.log(`Found ${localFiles.length} local compressed GLBs in ${SMALL_DIR}`);
console.log("");

let uploaded = 0;
let skipped = 0;
let failed = 0;

for (const filename of localFiles) {
  const storagePath = fileToStoragePath.get(filename);
  if (!storagePath) {
    skipped += 1;
    console.log(`skip (no matching DB row)  ${filename}`);
    continue;
  }

  const localPath = path.join(SMALL_DIR, filename);
  const body = fs.readFileSync(localPath);
  const sizeMb = (body.length / 1024 / 1024).toFixed(1);

  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`;
  process.stdout.write(`upload ${sizeMb}MB → ${storagePath}  `);
  try {
    const r = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "model/gltf-binary",
        "x-upsert": "true",
        "Cache-Control": "max-age=31536000",
      },
      body,
    });
    if (!r.ok) {
      const errText = await r.text().catch(() => "<no body>");
      throw new Error(`HTTP ${r.status}: ${errText}`);
    }
    uploaded += 1;
    console.log("✓");
  } catch (err) {
    failed += 1;
    console.log(`FAIL: ${err.message}`);
  }
}

console.log("");
console.log(`Done. uploaded=${uploaded} skipped=${skipped} failed=${failed}`);
if (failed === 0) {
  console.log("");
  console.log("All compressed GLBs are now live at their original URLs.");
  console.log("Hard-refresh /studio?perf=1 and check the Textures MB row drop.");
  console.log("No DB updates needed — URLs already point at the (now-smaller) files.");
}
