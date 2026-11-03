#!/usr/bin/env node
/**
 * Downscales every texture in every .glb under an input directory to a max
 * dimension (default 1024 px on the longest side). Pure sharp + gltf-transform
 * Node API — no CLI shell-out, no toktx, no KTX2 plumbing. Texture format is
 * preserved (WebP stays WebP, PNG stays PNG) so no decoder needs to be wired
 * into the frontend.
 *
 * Why this and not KTX2?
 *   - gltf-transform's KTX2 encoder doesn't decode WebP source textures in 4.x
 *     (silent skip), so KTX2 conversion fails to compress the textures we care
 *     about. Downscaling sidesteps the whole problem.
 *   - 2K → 1K is a 4× VRAM reduction per texture. 51 mannequins × 3 textures
 *     each at 2048² = ~2.4 GB; at 1024² it's ~600 MB. Below the iGPU thrash
 *     threshold.
 *   - Quality at 1024² on fashion garment textures is indistinguishable from
 *     2K at the showroom's normal viewing distance (0.5-3m).
 *
 * Usage:
 *   node scripts/downscale-textures.mjs ./glb-cache
 *   node scripts/downscale-textures.mjs ./glb-cache --max=512   # more aggressive
 *   node scripts/downscale-textures.mjs ./glb-cache --out=./tiny
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((arg) => {
      const [k, v] = arg.replace(/^--/, "").split("=");
      return [k, v ?? true];
    }),
);

const INPUT_DIR = path.resolve(ROOT, positional[0] || "glb-cache");
const OUT_DIR = path.resolve(ROOT, flags.out || path.join(INPUT_DIR, "_small"));
const MAX_DIM = parseInt(flags.max ?? "1024", 10);
const WEBP_QUALITY = parseInt(flags["webp-quality"] ?? "85", 10);

if (!fs.existsSync(INPUT_DIR)) {
  console.error(`Input dir not found: ${INPUT_DIR}`);
  process.exit(1);
}
fs.mkdirSync(OUT_DIR, { recursive: true });

const inputs = fs
  .readdirSync(INPUT_DIR, { withFileTypes: true })
  .filter((d) => d.isFile() && d.name.toLowerCase().endsWith(".glb"))
  .map((d) => path.join(INPUT_DIR, d.name));

if (inputs.length === 0) {
  console.error(`No .glb files in ${INPUT_DIR}`);
  process.exit(1);
}

console.log(`Downscaling ${inputs.length} GLBs → max ${MAX_DIM}px → ${OUT_DIR}`);
console.log("");

// MeshoptDecoder/Encoder are required to read/write GLBs that use
// EXT_meshopt_compression. Without registering these as dependencies, NodeIO
// fails with "Please install extension dependency, meshopt.decoder" on every
// meshopt-compressed file — which is most of them (see optimize-mannequins.mjs).
await MeshoptDecoder.ready;
await MeshoptEncoder.ready;

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "meshopt.decoder": MeshoptDecoder,
    "meshopt.encoder": MeshoptEncoder,
  });

let totalBefore = 0;
let totalAfter = 0;
let totalTexturesBefore = 0;
let totalTexturesAfter = 0;
let processed = 0;
let skipped = 0;
let failed = 0;

for (const input of inputs) {
  const name = path.basename(input);
  const outPath = path.join(OUT_DIR, name);
  const before = fs.statSync(input).size;
  totalBefore += before;

  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
    skipped += 1;
    totalAfter += fs.statSync(outPath).size;
    console.log(`skip   ${name}`);
    continue;
  }

  process.stdout.write(`shrink ${(before / 1024 / 1024).toFixed(1)}MB  ${name}  `);
  try {
    const doc = await io.read(input);
    let texBytesBefore = 0;
    let texBytesAfter = 0;
    let texResized = 0;

    for (const texture of doc.getRoot().listTextures()) {
      const buf = texture.getImage();
      if (!buf) continue;
      texBytesBefore += buf.byteLength;
      const mime = texture.getMimeType() || "";
      const meta = await sharp(buf).metadata();
      const longest = Math.max(meta.width ?? 0, meta.height ?? 0);
      if (longest > MAX_DIM) {
        let pipeline = sharp(buf).resize({
          width: MAX_DIM,
          height: MAX_DIM,
          fit: "inside",
          withoutEnlargement: true,
        });
        if (mime === "image/webp") {
          pipeline = pipeline.webp({ quality: WEBP_QUALITY });
        } else if (mime === "image/jpeg") {
          pipeline = pipeline.jpeg({ quality: 90 });
        } else {
          pipeline = pipeline.png({ compressionLevel: 9 });
        }
        const out = await pipeline.toBuffer();
        texture.setImage(out);
        texBytesAfter += out.byteLength;
        texResized += 1;
      } else {
        texBytesAfter += buf.byteLength;
      }
    }

    await io.write(outPath, doc);
    const after = fs.statSync(outPath).size;
    totalAfter += after;
    totalTexturesBefore += texBytesBefore;
    totalTexturesAfter += texBytesAfter;
    processed += 1;
    const overall = before > 0 ? ((1 - after / before) * 100).toFixed(0) : "0";
    console.log(
      `→ ${(after / 1024 / 1024).toFixed(1)}MB (${overall}% smaller, ${texResized} textures resized)`,
    );
  } catch (err) {
    failed += 1;
    console.log(`FAIL: ${err.message}`);
    try { fs.unlinkSync(outPath); } catch {}
  }
}

console.log("");
console.log(`Done. processed=${processed} skipped=${skipped} failed=${failed}`);
console.log(`File size:     ${(totalBefore / 1024 / 1024).toFixed(0)}MB → ${(totalAfter / 1024 / 1024).toFixed(0)}MB`);
console.log(`Texture bytes: ${(totalTexturesBefore / 1024 / 1024).toFixed(1)}MB → ${(totalTexturesAfter / 1024 / 1024).toFixed(1)}MB`);
console.log(`Outputs: ${OUT_DIR}`);
console.log("");
console.log("VRAM impact (estimate): downscaling 2K → 1K is a 4× per-texture");
console.log("reduction. Source ~1676 MB of GPU texture memory should drop to");
console.log("~400 MB after these GLBs replace the originals in Supabase.");
