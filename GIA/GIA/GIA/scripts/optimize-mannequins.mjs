#!/usr/bin/env node
/**
 * Shrinks every mannequin GLB under ASSETS/Models/ManequinsRuntimeLOD in place using:
 *   - Meshopt geometry compression (lossless)
 *   - WebP texture compression (visually identical at default quality)
 *   - Texture size capped at 2048 (mannequins are viewed from 1-3m, plenty of detail)
 *   - NO simplification, NO joining, NO instancing → silhouette and shading stay byte-identical to the eye
 *
 * Idempotent: skips files already <= MIN_SIZE_BYTES, and reverts if the optimized
 * pass somehow produced a larger file than the input.
 */
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
// Either pass a target dir as the first CLI arg, or default to the mannequin runtime folder.
const ARG_TARGET = process.argv[2];
const TARGET_DIR = ARG_TARGET
  ? path.resolve(ROOT, ARG_TARGET)
  : path.join(ROOT, "ASSETS/Models/ManequinsRuntimeLOD");
const BIN = path.join(ROOT, "node_modules", ".bin", "gltf-transform");

// Already-optimized assets live under ~4 MB; skip anything under this.
const MIN_SIZE_BYTES = 5 * 1024 * 1024;
const SAFE_MESHOPT_ONLY_FILES = new Set([
  "Cerulean_Exoshell_512_MeshQuantized_NoDecimation.glb",
  "Geometric_Bouquet_Gown_512_MeshQuantized_NoDecimation.glb",
  "Midnight_Beaded_Couture_512_MeshQuantized_NoDecimation.glb",
]);

function collect(dir, out) {
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
collect(TARGET_DIR, all);
all.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);

if (all.length === 0) {
  console.error("No .glb files in", TARGET_DIR);
  process.exit(1);
}

let totalBefore = 0;
let totalAfter = 0;
let processed = 0;
let skipped = 0;

for (const input of all) {
  const rel = path.relative(ROOT, input);
  const before = fs.statSync(input).size;
  totalBefore += before;

  if (before < MIN_SIZE_BYTES) {
    console.log(`skip (already small) ${(before / 1024 / 1024).toFixed(1)}MB  ${rel}`);
    totalAfter += before;
    skipped += 1;
    continue;
  }

  // gltf-transform infers output format from the extension — keep it `.glb`
  // (a `.tmp` extension causes split JSON + external .bin output that breaks the model).
  const dir = path.dirname(input);
  const base = path.basename(input, ".glb");
  const tmp = path.join(dir, `${base}.optim.glb`);
  const useSafeMeshoptOnly = SAFE_MESHOPT_ONLY_FILES.has(path.basename(input));
  console.log(
    `${useSafeMeshoptOnly ? "rebuilding-safe" : "optimizing"}  ${(before / 1024 / 1024).toFixed(1)}MB  ${rel}`,
  );
  try {
    execFileSync(
      BIN,
      useSafeMeshoptOnly
        ? ["meshopt", input, tmp, "--level", "medium"]
        : [
            "optimize",
            input,
            tmp,
            "--compress",
            "meshopt",
            "--meshopt-level",
            "high",
            "--texture-compress",
            "webp",
            "--texture-size",
            "2048",
            "--simplify",
            "false",
            "--join",
            "false",
            "--instance",
            "false",
            "--palette",
            "false",
          ],
      { stdio: "inherit", cwd: ROOT },
    );
  } catch (error) {
    console.warn("  ! gltf-transform failed, keeping original:", error.message);
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    totalAfter += before;
    continue;
  }

  if (!fs.existsSync(tmp)) {
    console.warn("  ! no output produced, keeping original");
    totalAfter += before;
    continue;
  }
  const after = fs.statSync(tmp).size;
  if (after === 0 || after < 64 * 1024) {
    console.warn(`  ! output too small (${after} bytes) — likely split buffers, keeping original`);
    fs.unlinkSync(tmp);
    totalAfter += before;
    continue;
  }
  if (after >= before) {
    console.log(`  ↪ result ${(after / 1024 / 1024).toFixed(1)}MB ≥ original, keeping original`);
    fs.unlinkSync(tmp);
    totalAfter += before;
    continue;
  }

  fs.renameSync(tmp, input);
  totalAfter += after;
  processed += 1;
  const pct = ((1 - after / before) * 100).toFixed(1);
  console.log(`  ✓ ${(after / 1024 / 1024).toFixed(1)}MB (-${pct}%)`);
}

const beforeMb = (totalBefore / 1024 / 1024).toFixed(1);
const afterMb = (totalAfter / 1024 / 1024).toFixed(1);
const savedPct = totalBefore > 0 ? ((1 - totalAfter / totalBefore) * 100).toFixed(1) : "0";
console.log(
  `\nDone. ${processed} optimized, ${skipped} skipped. ${beforeMb} MB → ${afterMb} MB (-${savedPct}%).`,
);
