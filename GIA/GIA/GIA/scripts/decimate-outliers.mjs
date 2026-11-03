#!/usr/bin/env node
/**
 * Aggressive mesh decimation for the outlier GLBs that the texture-only downsize
 * script couldn't shrink, because their cost is in vertex count, not texture size.
 *
 * Examples:
 *   - Crystal_Vine_Silver_S: 2,440,306 vertices / 65.9 MB GPU geometry — a shoe.
 *   - Echoes_of_Lace:        ~1.5M vertices estimated — a dress.
 *
 * Strategy: gltf-transform `simplify` with a 0.10–0.15 ratio (85–90% triangle
 * reduction). At showroom viewing distance (arm's length minimum), the silhouette
 * difference is invisible. Textures are also capped at 1024 as belt-and-suspenders.
 *
 * Pass file paths as CLI args to override the default outlier list.
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

const DEFAULT_OUTLIERS = [
  // path relative to ROOT, simplify ratio (0..1, lower = more aggressive), texture-size cap
  ["ASSETS/Models/ShoesBagsShowroomWeb/Meshy_AI_Crystal_Vine_Silver_S_0504193503_texture.glb", 0.08, 1024],
  ["ASSETS/Models/ManequinsOptimized/2-Cream/Meshy_AI_Echoes_of_Lace_0504091700_texture.glb", 0.18, 1024],
  ["ASSETS/Models/ShoesBagsShowroomWeb/Meshy_AI_Diamond_Laurel_Clutch_0504214744_texture.glb", 0.30, 1024],
  ["ASSETS/Models/ShoesBagsShowroomWeb/Meshy_AI_Midnight_Opulence_0504205617_texture.glb", 0.30, 1024],
  ["ASSETS/Models/ShoesBagsShowroomWeb/Meshy_AI_Emerald_Elegance_0504192355_texture.glb", 0.35, 1024],
  ["ASSETS/Models/ShoesBagsShowroomWeb/Meshy_AI_Azure_Fleur_Satchel_0504210742_texture.glb", 0.35, 1024],
  // Silver-tier hero pieces from Manequins/1-Silver — explicitly named "NoDecimation"
  // because the asset pipeline skipped them. We decimate at a conservative 0.35
  // ratio (~65% triangle reduction) which is imperceptible at showroom viewing
  // distance. The depth-compensation multipliers in ShowroomWorld.js are
  // unaffected by decimation (gltf-transform preserves the bounding box).
  ["ASSETS/Models/Manequins/1-Silver/Cerulean_Exoshell_512_MeshQuantized_NoDecimation.glb", 0.35, 1024],
  ["ASSETS/Models/Manequins/1-Silver/Midnight_Beaded_Couture_512_MeshQuantized_NoDecimation.glb", 0.35, 1024],
  ["ASSETS/Models/Manequins/1-Silver/Geometric_Bouquet_Gown_512_MeshQuantized_NoDecimation.glb", 0.40, 1024],
];

const cliArgs = process.argv.slice(2);
const targets =
  cliArgs.length > 0
    ? cliArgs.map((a) => [a, 0.15, 1024])
    : DEFAULT_OUTLIERS;

/**
 * Skip files already smaller than this threshold — they've been decimated
 * in a prior run, and re-applying simplify on already-reduced geometry would
 * destroy silhouette quality. Source files start at 7 MB+, post-decimation
 * they settle to 3-7 MB depending on input complexity.
 */
const ALREADY_DECIMATED_THRESHOLD_BYTES = 7.2 * 1024 * 1024;

let totalBefore = 0;
let totalAfter = 0;
let processed = 0;
let failed = 0;

for (const [relPath, ratio, texSize] of targets) {
  const input = path.resolve(ROOT, relPath);
  if (!fs.existsSync(input)) {
    console.warn(`skip (not found)  ${relPath}`);
    continue;
  }
  const before = fs.statSync(input).size;
  totalBefore += before;
  const tmp = input.replace(/\.glb$/i, ".decimated.glb");
  const rel = path.relative(ROOT, input);

  // Skip files already below the threshold — re-simplifying degrades silhouette.
  // The `_NoDecimation` filename suffix is a hint from the upstream asset pipeline
  // (those files start huge), not a directive to re-process every run. Once
  // they're below threshold, they're done.
  if (before < ALREADY_DECIMATED_THRESHOLD_BYTES && cliArgs.length === 0) {
    console.log(`skip (already decimated, ${(before / 1024 / 1024).toFixed(2)} MB)  ${rel}`);
    totalAfter += before;
    continue;
  }

  console.log(`decimating  ${(before / 1024 / 1024).toFixed(2)} MB  (ratio ${ratio})  ${rel}`);
  try {
    const cmd = `${quote(BIN_CMD)} optimize ${quote(input)} ${quote(tmp)} --compress meshopt --meshopt-level high --texture-compress webp --texture-size ${texSize} --simplify true --simplify-ratio ${ratio} --simplify-error 0.005 --join false --instance false --palette false`;
    execSync(cmd, { stdio: ["ignore", "ignore", "inherit"], cwd: ROOT });
  } catch (err) {
    console.warn(`  ! failed`);
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    totalAfter += before;
    failed += 1;
    continue;
  }
  if (!fs.existsSync(tmp)) {
    console.warn(`  ! no output produced`);
    totalAfter += before;
    failed += 1;
    continue;
  }
  const after = fs.statSync(tmp).size;
  if (after === 0 || after < 32 * 1024) {
    console.warn(`  ! output too small (${after} bytes), keeping original`);
    fs.unlinkSync(tmp);
    totalAfter += before;
    failed += 1;
    continue;
  }
  if (after >= before) {
    console.log(`  ↪ ${(after / 1024 / 1024).toFixed(2)} MB ≥ original, keeping original`);
    fs.unlinkSync(tmp);
    totalAfter += before;
    continue;
  }
  fs.renameSync(tmp, input);
  totalAfter += after;
  processed += 1;
  const pct = ((1 - after / before) * 100).toFixed(1);
  console.log(`  ✓ ${(after / 1024 / 1024).toFixed(2)} MB (-${pct}%)`);
}

const beforeMb = (totalBefore / 1024 / 1024).toFixed(2);
const afterMb = (totalAfter / 1024 / 1024).toFixed(2);
const savedPct = totalBefore > 0 ? ((1 - totalAfter / totalBefore) * 100).toFixed(1) : "0";
console.log(`\nDone. ${processed} decimated, ${failed} failed. ${beforeMb} MB → ${afterMb} MB (-${savedPct}%).`);
