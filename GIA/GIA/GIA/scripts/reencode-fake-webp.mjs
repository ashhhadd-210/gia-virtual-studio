#!/usr/bin/env node
/**
 * Re-encodes texture files in ASSETS/Generated that are actually PNG (renamed to .webp)
 * into real WebP at quality 82 with no visual loss at viewing distance.
 *
 * Detects format with the file's magic bytes:
 *   - PNG  → starts with 0x89 0x50 0x4E 0x47
 *   - WebP → starts with "RIFF" then "WEBP" at byte 8
 *
 * Skips files that are already real WebP. Idempotent.
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const TARGETS = [
  path.join(ROOT, "ASSETS/Generated"),
  path.join(ROOT, "ASSETS/Texture"), // also covered for safety
];

const QUALITY = 82;
const MAX_DIMENSION = 2048; // hard cap — anything bigger is overkill for showroom textures

function isPng(buffer) {
  return (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  );
}

function isWebP(buffer) {
  return (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && // R
    buffer[1] === 0x49 && // I
    buffer[2] === 0x46 && // F
    buffer[3] === 0x46 && // F
    buffer[8] === 0x57 && // W
    buffer[9] === 0x45 && // E
    buffer[10] === 0x42 && // B
    buffer[11] === 0x50  // P
  );
}

async function collectFiles(dir) {
  const out = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const p = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".webp")) {
        out.push(p);
      }
    }
  } catch (err) {
    if (err.code !== "ENOENT") {
      throw err;
    }
  }
  return out;
}

let totalBefore = 0;
let totalAfter = 0;
let converted = 0;
let skipped = 0;
let failed = 0;

for (const targetDir of TARGETS) {
  const files = await collectFiles(targetDir);
  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const before = await fs.stat(file).then((s) => s.size);
    totalBefore += before;

    const head = await fs.open(file, "r");
    const buf = Buffer.alloc(16);
    await head.read(buf, 0, 16, 0);
    await head.close();

    if (isWebP(buf)) {
      console.log(`skip (already WebP) ${(before / 1024 / 1024).toFixed(2)} MB  ${rel}`);
      totalAfter += before;
      skipped += 1;
      continue;
    }

    if (!isPng(buf)) {
      console.warn(`skip (unknown format)  ${rel}`);
      totalAfter += before;
      skipped += 1;
      continue;
    }

    console.log(`re-encoding ${(before / 1024 / 1024).toFixed(2)} MB  ${rel}`);
    try {
      const metadata = await sharp(file).metadata();
      const needsResize =
        (metadata.width ?? 0) > MAX_DIMENSION || (metadata.height ?? 0) > MAX_DIMENSION;

      let pipeline = sharp(file);
      if (needsResize) {
        pipeline = pipeline.resize({
          width: MAX_DIMENSION,
          height: MAX_DIMENSION,
          fit: "inside",
          withoutEnlargement: true,
        });
      }
      const output = await pipeline.webp({ quality: QUALITY, effort: 5 }).toBuffer();

      if (output.length >= before) {
        console.log(`  ↪ re-encoded ${(output.length / 1024 / 1024).toFixed(2)} MB ≥ original, keeping original`);
        totalAfter += before;
        skipped += 1;
        continue;
      }

      await fs.writeFile(file, output);
      totalAfter += output.length;
      converted += 1;
      const pct = ((1 - output.length / before) * 100).toFixed(1);
      console.log(`  ✓ ${(output.length / 1024 / 1024).toFixed(2)} MB (-${pct}%)`);
    } catch (err) {
      console.error(`  ! failed: ${err.message}`);
      totalAfter += before;
      failed += 1;
    }
  }
}

const beforeMb = (totalBefore / 1024 / 1024).toFixed(2);
const afterMb = (totalAfter / 1024 / 1024).toFixed(2);
const savedPct = totalBefore > 0 ? ((1 - totalAfter / totalBefore) * 100).toFixed(1) : "0";
console.log(
  `\nDone. ${converted} converted, ${skipped} skipped, ${failed} failed. ${beforeMb} MB → ${afterMb} MB (-${savedPct}%).`,
);
