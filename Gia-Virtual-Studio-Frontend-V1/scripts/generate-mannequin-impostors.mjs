#!/usr/bin/env node
/**
 * Builds portrait-style transparent WebP impostors under ASSETS/Models/MannequinImpostors/.
 *
 * When the source GLBs are present locally, you can extend this script to sample
 * baseColor textures from each GLB; until then it emits deterministic, lightweight
 * placeholders (unique gradient + soft alpha) so gameplay stays smooth without parsing GLBs.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "../ASSETS/Models/MannequinImpostors");

/** Basenames must match the former .glb filenames (without extension). */
const STEMS = [
  "Meshy_Azure_Origami_Gown_texture_only_max512_q70",
  "Geometric_Bouquet_Gown_512_MeshQuantized_NoDecimation",
  "Geometric_Noir_Gown_512_MeshQuantized_NoDecimation",
  "Meshy_AI_Origami_Blue_Mini_Dre_0502204102_texture",
  "Meshy_AI_Pearl_Studded_Power_B_0502220826_texture",
  "Meshy_AI_Pearl_Studded_Power_S_0504070039_texture",
  "Midnight_Beaded_Couture_512_MeshQuantized_NoDecimation",
  "Meshy_AI_Ivory_Petal_Dress_in__0503084029_texture",
  "Meshy_AI_Neon_Petals_0503225451_texture",
  "Meshy_AI_Petal_Cascade_Evening_0502210207_texture",
  "Meshy_AI_Sculpted_Spiral_Ensem_0503122647_texture",
  "Cerulean_Exoshell_512_MeshQuantized_NoDecimation",
  "Meshy_AI_Silver_Spiral_0503225947_texture",
  "Meshy_AI_Cascade_of_Icosahedra_0503091942_texture",
  "Meshy_AI_Echoes_of_Lace_0504091700_texture",
  "Meshy_AI_Ethereal_Wings_0504135855_texture",
  "Meshy_AI_Lattice_of_Light_0504072241_texture",
  "Meshy_AI_Luminous_Lattice_Gown_0504082312_texture",
  "Meshy_AI_Midnight_Origami_Dres_0504085628_texture",
  "Meshy_AI_Neon_Bloom_in_White_0504065549_texture",
  "Meshy_AI_Neon_Corridor_Couture_0503114452_texture",
  "Meshy_AI_Neon_Frame_Couture_0504090741_texture",
  "Meshy_AI_Neon_Geometric_Coutur_0503102128_texture",
  "Meshy_AI_Neon_Origami_0503220953_texture",
  "Meshy_AI_Neon_Origami_Gown_0503071402_texture",
  "Meshy_AI_Neon_Petal_Gown_0503213221_texture",
  "Meshy_AI_Neon_Pink_Sequin_Dres_0503111000_texture",
  "Meshy_AI_Neon_Violet_Geometry_0503075309_texture",
  "Meshy_AI_Petal_Wings_Gown_0504084127_texture",
  "Meshy_AI_Pink_Origami_Couture_0503123139_texture",
  "Meshy_AI_Prismatic_Violet_Dres_0503090317_texture",
];

function huesFromStem(stem) {
  const digest = crypto.createHash("sha256").update(stem).digest();
  const hueA = ((digest[0] << 8) | digest[1]) % 360;
  const delta = 28 + (digest[2] % 48);
  const hueB = (hueA + delta) % 360;
  return { hueA, hueB, lite: 42 + (digest[3] % 18), sat: 62 + (digest[4] % 22) };
}

function buildPortraitSvg(stem) {
  const { hueA, hueB, lite, sat } = huesFromStem(stem);
  const accent = (hueA + 140) % 360;
  const w = 512;
  const h = 896;
  const id = `p_${stem.replace(/[^a-zA-Z0-9]+/g, "_")}`;
  return `
<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="${id}_bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="hsl(${hueA},${sat}%,${lite}%)" />
      <stop offset="55%" stop-color="hsl(${hueB},${sat - 6}%,${lite - 12}%)" />
      <stop offset="100%" stop-color="hsl(${accent},${sat - 10}%,${lite - 18}%)" />
    </linearGradient>
    <linearGradient id="${id}_sheen" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.22)" />
      <stop offset="40%" stop-color="rgba(255,255,255,0.06)" />
      <stop offset="100%" stop-color="rgba(0,0,0,0.15)" />
    </linearGradient>
    <radialGradient id="${id}_silhouette" cx="50%" cy="38%" r="58%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.97)" />
      <stop offset="72%" stop-color="rgba(255,255,255,0.82)" />
      <stop offset="100%" stop-color="rgba(255,255,255,0)" />
    </radialGradient>
    <radialGradient id="${id}_fade" cx="50%" cy="40%" r="72%">
      <stop offset="0%" stop-color="white" stop-opacity="1" />
      <stop offset="78%" stop-color="white" stop-opacity="0.92" />
      <stop offset="100%" stop-color="white" stop-opacity="0" />
    </radialGradient>
    <filter id="${id}_blur" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="14" />
    </filter>
    <mask id="${id}_mask">
      <rect width="${w}" height="${h}" fill="black" />
      <rect width="${w}" height="${h}" fill="url(#${id}_fade)" />
    </mask>
  </defs>
  <g mask="url(#${id}_mask)">
    <rect width="${w}" height="${h}" fill="url(#${id}_bg)" />
    <ellipse cx="${w * 0.5}" cy="${h * 0.52}" rx="${w * 0.34}" ry="${h * 0.38}" fill="url(#${id}_bg)" opacity="0.55" filter="url(#${id}_blur)" />
    <ellipse cx="${w * 0.5}" cy="${h * 0.48}" rx="${w * 0.22}" ry="${h * 0.34}" fill="url(#${id}_silhouette)" opacity="0.88" />
    <ellipse cx="${w * 0.5}" cy="${h * 0.51}" rx="${w * 0.26}" ry="${h * 0.36}" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="3" />
    <rect width="${w}" height="${h}" fill="url(#${id}_sheen)" />
  </g>
</svg>`;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const stem of STEMS) {
    const svg = buildPortraitSvg(stem);
    const dest = path.join(OUT_DIR, `${stem}.webp`);
    await sharp(Buffer.from(svg))
      .webp({ quality: 82, alphaQuality: 100, effort: 4 })
      .toFile(dest);
    process.stdout.write(`Wrote ${path.relative(process.cwd(), dest)}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
