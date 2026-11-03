#!/usr/bin/env node
/**
 * KTX2 / UASTC texture compression for the showroom GLBs.
 *
 * WHY: WebP/PNG/JPEG textures are fully *uncompressed* in GPU memory at runtime
 * (RGBA = 4 bytes/pixel). A scene with ~489 MB of VRAM textures can crash old
 * laptops / iOS Safari. KTX2 (Basis UASTC) stays GPU-compressed in VRAM
 * (transcodes to BC7/ASTC), cutting VRAM roughly 4× (~489 MB → ~120-150 MB)
 * with near-lossless quality — so no visible quality drop, just less memory and
 * faster GPU upload.
 *
 * DEPENDENCY: KTX-Software must be installed (gltf-transform shells out to `toktx`):
 *   https://github.com/KhronosGroup/KTX-Software/releases
 *   After install, make sure `toktx` is on your PATH (open a new terminal).
 *
 * USAGE:
 *   # Test ONE model first, verify it loads on the live site, THEN batch the rest:
 *   node scripts/compress-textures-ktx2.mjs "ASSETS/Models/Manequins/1-Silver/Some_Model.glb"
 *
 *   # Or a whole folder (recurses for .glb):
 *   node scripts/compress-textures-ktx2.mjs "ASSETS/Models/Manequins"
 *
 * Output is written NON-DESTRUCTIVELY as "<name>.ktx2.glb" next to each input,
 * so your originals are never touched. Verify the .ktx2.glb loads correctly,
 * then upload it to Supabase in place of the original (same filename).
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const BIN = path.join(ROOT, "node_modules", ".bin", "gltf-transform");
const BIN_CMD = process.platform === "win32" && fs.existsSync(`${BIN}.cmd`) ? `${BIN}.cmd` : BIN;

function quote(s) {
  return `"${String(s).replace(/"/g, '\\"')}"`;
}

function collectGlbs(target) {
  const abs = path.resolve(ROOT, target);
  if (!fs.existsSync(abs)) {
    return [];
  }
  if (fs.statSync(abs).isDirectory()) {
    const out = [];
    for (const entry of fs.readdirSync(abs)) {
      out.push(...collectGlbs(path.join(abs, entry)));
    }
    return out;
  }
  // Skip already-compressed outputs and non-glb files.
  if (/\.ktx2\.glb$/i.test(abs) || !/\.glb$/i.test(abs)) {
    return [];
  }
  return [abs];
}

const cliArgs = process.argv.slice(2);
if (cliArgs.length === 0) {
  console.error("Pass one or more .glb files or folders (paths relative to the GIA root).");
  console.error('Example: node scripts/compress-textures-ktx2.mjs "ASSETS/Models/Manequins/1-Silver/Some_Model.glb"');
  process.exit(1);
}

const inputs = [...new Set(cliArgs.flatMap(collectGlbs))];
if (inputs.length === 0) {
  console.error("No .glb files found for the given paths.");
  process.exit(1);
}

console.log(`KTX2/UASTC compressing ${inputs.length} model(s)…\n`);

let processed = 0;
let failed = 0;
let toktxMissing = false;

for (const input of inputs) {
  const rel = path.relative(ROOT, input);
  const before = fs.statSync(input).size;
  const output = input.replace(/\.glb$/i, ".ktx2.glb");

  // UASTC = high-quality (near-lossless) Basis bitstream. Defaults are tuned for
  // quality; the VRAM win comes from staying GPU-compressed, not from the file size.
  const cmd = `${quote(BIN_CMD)} uastc ${quote(input)} ${quote(output)} --level 3`;
  process.stdout.write(`  ${rel} … `);
  try {
    execSync(cmd, { stdio: ["ignore", "ignore", "pipe"], cwd: ROOT });
  } catch (err) {
    const msg = String(err?.stderr || err?.message || "");
    if (/toktx|KTX-?Software|not found|ENOENT/i.test(msg)) {
      toktxMissing = true;
      console.log("FAILED (KTX-Software/toktx not found)");
      break;
    }
    console.log("failed");
    failed += 1;
    continue;
  }
  if (!fs.existsSync(output)) {
    console.log("no output");
    failed += 1;
    continue;
  }
  const after = fs.statSync(output).size;
  processed += 1;
  console.log(`✓ ${(before / 1024 / 1024).toFixed(2)} MB → ${(after / 1024 / 1024).toFixed(2)} MB (.ktx2.glb)`);
}

if (toktxMissing) {
  console.error("\n✗ KTX-Software (toktx) is not installed or not on PATH.");
  console.error("  Install it from https://github.com/KhronosGroup/KTX-Software/releases,");
  console.error("  open a NEW terminal so PATH refreshes, then run this script again.");
  process.exit(1);
}

console.log(`\nDone. ${processed} compressed, ${failed} failed.`);
console.log("Verify a .ktx2.glb loads correctly in the showroom, then upload it to");
console.log("Supabase under the ORIGINAL filename to replace it. VRAM drops ~4×.");
