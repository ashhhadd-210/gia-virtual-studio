#!/usr/bin/env node
/**
 * Compresses every texture in every .glb under an input directory using
 * KTX2/UASTC (Khronos GPU-native compression). The compressed GLBs stay
 * compressed in VRAM after the GPU finishes transcoding, which is what
 * makes them ~4× cheaper than the source PNG/WebP textures (those decode
 * to full RGBA before upload).
 *
 * Requirements:
 *   1. KTX-Software installed on PATH — provides `toktx`.
 *      Windows installer: https://github.com/KhronosGroup/KTX-Software/releases
 *      After install, restart your shell so PATH picks up `toktx`.
 *   2. @gltf-transform/cli installed locally (`npm install --save-dev @gltf-transform/cli`).
 *      We invoke its cli.js directly via `node` to bypass the npx → cmd.exe
 *      → batch-file argv-splitting pipeline that breaks on Windows paths
 *      containing spaces (e.g. "C:\Users\Muhammad Ashhad\...").
 *
 * Usage:
 *   node scripts/compress-textures-ktx2.mjs ./glb-cache
 *   node scripts/compress-textures-ktx2.mjs ./glb-cache --out=./glb-ktx2
 *
 * Outputs (default):
 *   <input-dir>/_ktx2/<filename>.glb     - compressed copies
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

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
const OUT_DIR = path.resolve(ROOT, flags.out || path.join(INPUT_DIR, "_ktx2"));

if (!fs.existsSync(INPUT_DIR)) {
  console.error(`Input dir not found: ${INPUT_DIR}`);
  process.exit(1);
}

// Verify toktx is available — gltf-transform's uastc command shells out to it.
const toktxCheck = spawnSync("toktx", ["--version"], { encoding: "utf8" });
if (toktxCheck.error || toktxCheck.status !== 0) {
  console.error("`toktx` not found on PATH.");
  console.error("Install KTX-Software (provides toktx):");
  console.error("  https://github.com/KhronosGroup/KTX-Software/releases");
  console.error("Then restart your shell and retry.");
  process.exit(1);
}
console.log(`toktx OK: ${toktxCheck.stdout.split("\n")[0]}`);

// Resolve the gltf-transform CLI's entry JS so we can invoke it as
// `node <cli.js> ...` — bypassing npx, cmd.exe, and the .cmd shim wrapper
// (each of those layers introduces a different argv-splitting bug on
// Windows paths with spaces). Direct node→node is the only reliable path.
// We read package.json via fs (not require.resolve) because @gltf-transform/cli
// has a strict "exports" field that blocks resolving its package.json directly.
let cliEntry;
try {
  const pkgDir = path.join(ROOT, "node_modules", "@gltf-transform", "cli");
  const pkgJsonPath = path.join(pkgDir, "package.json");
  if (!fs.existsSync(pkgJsonPath)) {
    throw new Error(`not installed: ${pkgJsonPath} missing`);
  }
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
  const binField = typeof pkg.bin === "string"
    ? pkg.bin
    : pkg.bin?.["gltf-transform"] ?? Object.values(pkg.bin ?? {})[0];
  if (typeof binField !== "string") {
    throw new Error("could not find bin entry in package.json");
  }
  cliEntry = path.resolve(pkgDir, binField);
  if (!fs.existsSync(cliEntry)) {
    throw new Error(`bin file missing on disk: ${cliEntry}`);
  }
} catch (err) {
  console.error("@gltf-transform/cli is not installed locally.");
  console.error("Install it with:");
  console.error("  npm install --save-dev @gltf-transform/cli");
  console.error("Underlying error:", err.message);
  process.exit(1);
}
console.log(`gltf-transform CLI: ${cliEntry}`);

// gltf-transform needs `sharp` to decode WebP / AVIF textures during the
// optimize → texture-compress pipeline. Without sharp, those textures are
// SILENTLY skipped (you only see "Skipping, unsupported texture type
// "image/webp"" warnings per-image — easy to miss). Fail loud here instead.
try {
  const sharpPkgPath = path.join(ROOT, "node_modules", "sharp", "package.json");
  if (!fs.existsSync(sharpPkgPath)) {
    throw new Error("sharp not installed");
  }
} catch {
  console.error("");
  console.error("⚠️  sharp is not installed. WebP/AVIF textures will be SILENTLY");
  console.error("    skipped by the optimize pipeline (you'll get tiny size cuts");
  console.error("    or none at all on WebP-textured GLBs).");
  console.error("");
  console.error("    Install it with:");
  console.error("      npm install --save-dev sharp");
  console.error("");
  console.error("    Then re-run this script.");
  process.exit(1);
}
console.log("sharp OK");

fs.mkdirSync(OUT_DIR, { recursive: true });

const inputs = fs
  .readdirSync(INPUT_DIR, { withFileTypes: true })
  .filter((d) => d.isFile() && d.name.toLowerCase().endsWith(".glb"))
  .map((d) => path.join(INPUT_DIR, d.name));

if (inputs.length === 0) {
  console.error(`No .glb files in ${INPUT_DIR}`);
  process.exit(1);
}

let totalBefore = 0;
let totalAfter = 0;
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
    console.log(`skip  ${name}`);
    continue;
  }

  console.log(`optimize ${(before / 1024 / 1024).toFixed(1)}MB  ${name}`);
  try {
    // Use `optimize` (full pipeline), NOT `uastc` alone:
    //   - `uastc` only converts PNG/JPEG textures, SKIPS WebP. Our source GLBs
    //     have WebP textures (from optimize-mannequins.mjs), so plain uastc
    //     leaves them untouched.
    //   - `uastc` ALSO decodes meshopt geometry and doesn't re-apply it,
    //     bloating geometry size.
    //   - `optimize` decodes WebP → raw → UASTC, AND re-applies meshopt.
    // --texture-size=1024 caps every texture at 1024² (2K → 1K linear, 4× VRAM cut
    // on top of the UASTC GPU-format compression). --simplify-error=0 disables
    // geometry decimation so silhouettes stay byte-identical.
    execFileSync(
      process.execPath, // current node binary
      [
        cliEntry, "optimize",
        input, outPath,
        // `ktx2` selects KTX2 container with default UASTC encoding (high quality,
        // GPU-native). gltf-transform 4.x renamed the option values — uastc/etc1s
        // are no longer accepted on `optimize`; use `ktx2` to mean the KTX2
        // pipeline (which internally picks UASTC for color textures).
        "--texture-compress", "ktx2",
        "--compress", "meshopt",
        "--texture-size", "1024",
        "--simplify-error", "0",
      ],
      { stdio: "inherit" },
    );
    const after = fs.statSync(outPath).size;
    totalAfter += after;
    processed += 1;
    console.log(
      `  → ${(after / 1024 / 1024).toFixed(1)}MB  (${((1 - after / before) * 100).toFixed(0)}% smaller)`,
    );
  } catch (err) {
    failed += 1;
    console.warn(`FAIL  ${name}: ${err.message}`);
    // Don't leave a half-written file behind.
    try { fs.unlinkSync(outPath); } catch {}
  }
}

console.log("");
console.log(`Done. processed=${processed} skipped=${skipped} failed=${failed}`);
console.log(`Total: ${(totalBefore / 1024 / 1024).toFixed(0)}MB → ${(totalAfter / 1024 / 1024).toFixed(0)}MB`);
console.log(`Outputs: ${OUT_DIR}`);
console.log("");
console.log("Next: upload the files in the output directory to Supabase Storage");
console.log("(the same bucket/path as the originals), then update the");
console.log("`generated_designs.model_url` rows to point at the new URLs.");
