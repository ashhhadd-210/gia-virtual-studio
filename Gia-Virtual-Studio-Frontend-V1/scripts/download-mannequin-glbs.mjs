#!/usr/bin/env node
/**
 * Downloads every published mannequin GLB from the production backend into
 * a local cache directory. Idempotent: skips files that already exist
 * locally with matching size.
 *
 * Usage:
 *   node scripts/download-mannequin-glbs.mjs               # default backend
 *   node scripts/download-mannequin-glbs.mjs --backend=https://other.app
 *   node scripts/download-mannequin-glbs.mjs --out=./my-cache
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [k, v] = arg.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

const BACKEND = args.backend || "https://gia-app-du2mz.ondigitalocean.app";
const OUT_DIR = path.resolve(ROOT, args.out || "glb-cache");

fs.mkdirSync(OUT_DIR, { recursive: true });

console.log(`Fetching design list from ${BACKEND}/generated-designs ...`);
const res = await fetch(`${BACKEND}/generated-designs`);
if (!res.ok) {
  console.error(`Backend returned ${res.status} ${res.statusText}`);
  process.exit(1);
}
const { items = [] } = await res.json();
const withUrls = items.filter((it) => it.model_url);
console.log(`Found ${withUrls.length} designs with model_url (of ${items.length} total).`);

let downloaded = 0;
let skipped = 0;
let failed = 0;

for (const item of withUrls) {
  const url = item.model_url;
  const filename = path.basename(new URL(url).pathname);
  const outPath = path.join(OUT_DIR, filename);

  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
    skipped += 1;
    console.log(`skip  ${filename}`);
    continue;
  }

  try {
    const r = await fetch(url);
    if (!r.ok) {
      throw new Error(`HTTP ${r.status}`);
    }
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(outPath, buf);
    downloaded += 1;
    console.log(`saved ${(buf.length / 1024 / 1024).toFixed(1)}MB  ${filename}`);
  } catch (err) {
    failed += 1;
    console.warn(`FAIL  ${filename}: ${err.message}`);
  }
}

console.log("");
console.log(`Done. downloaded=${downloaded} skipped=${skipped} failed=${failed}`);
console.log(`Files in: ${OUT_DIR}`);
