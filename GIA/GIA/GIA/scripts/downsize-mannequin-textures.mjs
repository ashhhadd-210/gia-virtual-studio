#!/usr/bin/env node
/**
 * Aggressively downsizes textures inside every mannequin GLB to MAX_SIZE.
 *
 * Why: the existing `optimize:mannequins` script caps at 2048² which leaves
 * 16 MB of GPU memory per texture per mannequin. With ~10 mannequins each
 * carrying ~6 PBR textures, that's 1+ GB of VRAM before anything else
 * loads — enough to OOM-crash Intel iGPU Windows laptops.
 *
 * Strategy: re-pack each GLB through gltf-transform with --texture-size 1024
 * AND --texture-compress webp. Meshopt geometry compression is preserved.
 * Idempotent: skips files where the result wouldn't shrink.
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

function quote(s) {
  return `"${String(s).replace(/"/g, '\\"')}"`;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const ARG_TARGET = process.argv[2];
const DEFAULT_TARGETS = [
  path.join(ROOT, "ASSETS/Models/ManequinsOptimized"),
  path.join(ROOT, "ASSETS/Models/ManequinsRuntimeLOD"),
  path.join(ROOT, "ASSETS/Models/ShoesBagsShowroomWeb"),
];
const TARGETS = ARG_TARGET ? [path.resolve(ROOT, ARG_TARGET)] : DEFAULT_TARGETS;
const BIN = path.join(ROOT, "node_modules", ".bin", "gltf-transform");
const BIN_CMD = process.platform === "win32" && fs.existsSync(`${BIN}.cmd`) ? `${BIN}.cmd` : BIN;

const MAX_TEXTURE_SIZE = 1024;
// Don't bother re-processing files that are already very small.
const MIN_SIZE_BYTES = 600 * 1024;

// Some mannequins arrived as meshopt-compressed-only (no texture re-encode tolerated);
// running `optimize` would fail on them. Restrict to safe pass.
const SAFE_MESHOPT_ONLY_FILES = new Set([
  "Cerulean_Exoshell_512_MeshQuantized_NoDecimation.glb",
  "Geometric_Bouquet_Gown_512_MeshQuantized_NoDecimation.glb",
  "Geometric_Noir_Gown_512_MeshQuantized_NoDecimation.glb",
  "Midnight_Beaded_Couture_512_MeshQuantized_NoDecimation.glb",
]);

function collect(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collect(p, out);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".glb")) {
      out.push(p);
    }
  }
}

const all = [];
for (const target of TARGETS) {
  collect(target, all);
}
all.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);

if (all.length === 0) {
  console.error("No .glb files found in:", TARGETS.join(", "));
  process.exit(1);
}

let totalBefore = 0;
let totalAfter = 0;
let processed = 0;
let skipped = 0;
let failed = 0;

for (const input of all) {
  const rel = path.relative(ROOT, input);
  const before = fs.statSync(input).size;
  totalBefore += before;

  if (before < MIN_SIZE_BYTES) {
    console.log(`skip (small)  ${(before / 1024).toFixed(0)} KB  ${rel}`);
    totalAfter += before;
    skipped += 1;
    continue;
  }

  const dir = path.dirname(input);
  const base = path.basename(input, ".glb");
  const tmp = path.join(dir, `${base}.downsize.glb`);

  const useSafeMeshoptOnly = SAFE_MESHOPT_ONLY_FILES.has(path.basename(input));
  console.log(`${useSafeMeshoptOnly ? "meshopt-only" : "downsizing"}  ${(before / 1024 / 1024).toFixed(2)} MB  ${rel}`);

  try {
    const cmd = useSafeMeshoptOnly
      ? `${quote(BIN_CMD)} meshopt ${quote(input)} ${quote(tmp)} --level medium`
      : `${quote(BIN_CMD)} optimize ${quote(input)} ${quote(tmp)} --compress meshopt --meshopt-level high --texture-compress webp --texture-size ${MAX_TEXTURE_SIZE} --simplify false --join false --instance false --palette false`;
    execSync(cmd, { stdio: ["ignore", "ignore", "pipe"], cwd: ROOT });
  } catch (err) {
    console.warn(`  ! gltf-transform failed: ${err.message?.slice(0, 200)}`);
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    totalAfter += before;
    failed += 1;
    continue;
  }

  if (!fs.existsSync(tmp)) {
    console.warn("  ! no output produced, keeping original");
    totalAfter += before;
    failed += 1;
    continue;
  }

  const after = fs.statSync(tmp).size;
  if (after === 0 || after < 64 * 1024) {
    console.warn(`  ! output too small (${after} bytes) — likely split buffers, keeping original`);
    fs.unlinkSync(tmp);
    totalAfter += before;
    failed += 1;
    continue;
  }
  if (after >= before) {
    console.log(`  ↪ result ${(after / 1024 / 1024).toFixed(2)} MB ≥ original, keeping original`);
    fs.unlinkSync(tmp);
    totalAfter += before;
    skipped += 1;
    continue;
  }

  fs.renameSync(tmp, input);
  totalAfter += after;
  processed += 1;
  const pct = ((1 - after / before) * 100).toFixed(1);
  console.log(`  ✓ ${(after / 1024 / 1024).toFixed(2)} MB (-${pct}%)`);
}

const beforeMb = (totalBefore / 1024 / 1024).toFixed(1);
const afterMb = (totalAfter / 1024 / 1024).toFixed(1);
const savedPct = totalBefore > 0 ? ((1 - totalAfter / totalBefore) * 100).toFixed(1) : "0";
console.log(
  `\nDone. ${processed} downsized, ${skipped} skipped, ${failed} failed. ${beforeMb} MB → ${afterMb} MB (-${savedPct}%).`,
);
