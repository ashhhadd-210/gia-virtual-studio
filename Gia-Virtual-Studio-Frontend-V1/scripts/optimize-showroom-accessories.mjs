#!/usr/bin/env node
/**
 * Produces web-friendly GLBs under ASSETS/Models/ShoesBagsShowroomWeb/
 * from SHOES&BAGS-GLB-SHOWROOM (meshopt + WebP textures + mesh simplify).
 */
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "ASSETS/Models/SHOES&BAGS-GLB-SHOWROOM");
const DST = path.join(ROOT, "ASSETS/Models/ShoesBagsShowroomWeb");
const BIN = path.join(ROOT, "node_modules", ".bin", "gltf-transform");

fs.mkdirSync(DST, { recursive: true });

const files = fs.readdirSync(SRC).filter((n) => n.endsWith(".glb"));
if (files.length === 0) {
  console.error("No .glb files in", SRC);
  process.exit(1);
}

for (const name of files.sort()) {
  const input = path.join(SRC, name);
  const output = path.join(DST, name);
  console.log("optimize →", name);
  execFileSync(
    BIN,
    [
      "optimize",
      input,
      output,
      "--texture-compress",
      "webp",
      "--texture-size",
      "1024",
      "--simplify-ratio",
      "0.26",
      "--compress",
      "meshopt",
      "--meshopt-level",
      "medium",
    ],
    { stdio: "inherit", cwd: ROOT },
  );
}

console.log("Wrote", files.length, "files to", path.relative(ROOT, DST));
