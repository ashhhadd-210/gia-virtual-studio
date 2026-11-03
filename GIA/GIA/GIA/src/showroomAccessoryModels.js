/**
 * Optimized vitrine accessories (see npm run optimize:showroom-accessories).
 * Sources live under ASSETS/Models/SHOES&BAGS-GLB-SHOWROOM; runtime URLs point at ShoesBagsShowroomWeb.
 */
import bagAzureFleurSatchel from "../ASSETS/Models/ShoesBagsShowroomWeb/Meshy_AI_Azure_Fleur_Satchel_0504210742_texture.glb?url";
import bagBlushPinkEnvelope from "../ASSETS/Models/ShoesBagsShowroomWeb/Meshy_AI_Blush_Pink_Envelope_S_0504212603_texture.glb?url";
import bagDiamondLaurelClutch from "../ASSETS/Models/ShoesBagsShowroomWeb/Meshy_AI_Diamond_Laurel_Clutch_0504214744_texture.glb?url";
import bagEmeraldElegance from "../ASSETS/Models/ShoesBagsShowroomWeb/Meshy_AI_Emerald_Elegance_0504192355_texture.glb?url";
import bagGildedElegance from "../ASSETS/Models/ShoesBagsShowroomWeb/Meshy_AI_Gilded_Elegance_0504190720_texture.glb?url";
import bagGildedLaurelBloom from "../ASSETS/Models/ShoesBagsShowroomWeb/Meshy_AI_Gilded_Laurel_Bloom_C_0504212105_texture.glb?url";
import bagGoldenPleatedSatchel from "../ASSETS/Models/ShoesBagsShowroomWeb/Meshy_AI_Golden_Pleated_Satche_0504210150_texture.glb?url";
import bagLaurelRingClutch from "../ASSETS/Models/ShoesBagsShowroomWeb/Meshy_AI_Laurel_Ring_Clutch_0504211453_texture.glb?url";
import bagLaurelWreathClutch from "../ASSETS/Models/ShoesBagsShowroomWeb/Meshy_AI_Laurel_Wreath_Clutch_0504213710_texture.glb?url";
import bagMidnightOpulence from "../ASSETS/Models/ShoesBagsShowroomWeb/Meshy_AI_Midnight_Opulence_0504205617_texture.glb?url";
import bagPrismaticClutch from "../ASSETS/Models/ShoesBagsShowroomWeb/Meshy_AI_Prismatic_Clutch_0504213226_texture.glb?url";

import shoeAzureFiligreeHeels from "../ASSETS/Models/ShoesBagsShowroomWeb/Meshy_AI_Azure_Filigree_Heels_0504202003_texture.glb?url";
import shoeBlueEmbroideredAnkle from "../ASSETS/Models/ShoesBagsShowroomWeb/Meshy_AI_Blue_Embroidered_Ankl_0504202650_texture.glb?url";
import shoeBlueEmbroideredPump from "../ASSETS/Models/ShoesBagsShowroomWeb/Meshy_AI_Blue_Embroidered_Pump_0504203421_texture.glb?url";
import shoeCrystalVineSilver from "../ASSETS/Models/ShoesBagsShowroomWeb/Meshy_AI_Crystal_Vine_Silver_S_0504193503_texture.glb?url";
import shoeEmeraldHaloBlueHeel from "../ASSETS/Models/ShoesBagsShowroomWeb/Meshy_AI_Emerald_Halo_Blue_Hee_0504200240_texture.glb?url";
import shoeFuchsiaPatentPumps from "../ASSETS/Models/ShoesBagsShowroomWeb/Meshy_AI_Fuchsia_Patent_Pumps_0504194237_texture.glb?url";
import shoeGildedIvyKneeHigh from "../ASSETS/Models/ShoesBagsShowroomWeb/Meshy_AI_Gilded_Ivy_Knee_High__0504204034_texture.glb?url";
import shoeGoldenStride from "../ASSETS/Models/ShoesBagsShowroomWeb/Meshy_AI_Golden_Stride_0504191602_texture.glb?url";

/** @type {readonly string[]} */
export const SHOWROOM_BAG_MODEL_URLS = [
  bagAzureFleurSatchel,
  bagBlushPinkEnvelope,
  bagDiamondLaurelClutch,
  bagEmeraldElegance,
  bagGildedElegance,
  bagGildedLaurelBloom,
  bagGoldenPleatedSatchel,
  bagLaurelRingClutch,
  bagLaurelWreathClutch,
  bagMidnightOpulence,
  bagPrismaticClutch,
];

/** @type {readonly string[]} */
export const SHOWROOM_SHOE_MODEL_URLS = [
  shoeAzureFiligreeHeels,
  shoeBlueEmbroideredAnkle,
  shoeBlueEmbroideredPump,
  shoeCrystalVineSilver,
  shoeEmeraldHaloBlueHeel,
  shoeFuchsiaPatentPumps,
  shoeGildedIvyKneeHigh,
  shoeGoldenStride,
];

/**
 * Target longest bbox edge (metres) after uniform scale — tuned per asset so types don’t share one size.
 * Heels/pumps ~foot length; ankle / knee / thigh scale with shaft height.
 */
export const SHOWROOM_SHOE_MAX_DIMENSION_BY_URL = {
  [shoeAzureFiligreeHeels]: 0.34,
  [shoeBlueEmbroideredAnkle]: 0.47,
  [shoeBlueEmbroideredPump]: 0.34,
  [shoeCrystalVineSilver]: 0.34,
  [shoeEmeraldHaloBlueHeel]: 0.34,
  [shoeFuchsiaPatentPumps]: 0.34,
  [shoeGildedIvyKneeHigh]: 0.72,
  [shoeGoldenStride]: 0.34,
};

/** Same idea for bags: minaudière/clutch vs carry vs large satchel — different caps each. */
export const SHOWROOM_BAG_MAX_DIMENSION_BY_URL = {
  [bagAzureFleurSatchel]: 0.58,
  [bagBlushPinkEnvelope]: 0.35,
  [bagDiamondLaurelClutch]: 0.31,
  [bagEmeraldElegance]: 0.48,
  [bagGildedElegance]: 0.41,
  [bagGildedLaurelBloom]: 0.37,
  [bagGoldenPleatedSatchel]: 0.58,
  [bagLaurelRingClutch]: 0.3,
  [bagLaurelWreathClutch]: 0.32,
  [bagMidnightOpulence]: 0.5,
  [bagPrismaticClutch]: 0.31,
};

export function getShowroomShoeMaxDimension(url) {
  return SHOWROOM_SHOE_MAX_DIMENSION_BY_URL[url] ?? 0.35;
}

export function getShowroomBagMaxDimension(url) {
  return SHOWROOM_BAG_MAX_DIMENSION_BY_URL[url] ?? 0.45;
}
