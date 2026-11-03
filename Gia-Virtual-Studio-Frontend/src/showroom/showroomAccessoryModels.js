/**
 * Showroom accessory catalog: bags and shoes for shop vitrine display cases.
 * URLs are resolved at runtime from the backend (fetchGeneratedDesigns).
 * This module owns only the ordered filename lists and per-asset dimension data.
 */

export const SHOWROOM_BAG_FILENAMES = [
  "Meshy_AI_Azure_Fleur_Satchel_0504210742_texture.glb",
  "Meshy_AI_Blush_Pink_Envelope_S_0504212603_texture.glb",
  "Meshy_AI_Diamond_Laurel_Clutch_0504214744_texture.glb",
  "Meshy_AI_Emerald_Elegance_0504192355_texture.glb",
  "Meshy_AI_Gilded_Elegance_0504190720_texture.glb",
  "Meshy_AI_Gilded_Laurel_Bloom_C_0504212105_texture.glb",
  "Meshy_AI_Golden_Pleated_Satche_0504210150_texture.glb",
  "Meshy_AI_Laurel_Ring_Clutch_0504211453_texture.glb",
  "Meshy_AI_Laurel_Wreath_Clutch_0504213710_texture.glb",
  "Meshy_AI_Midnight_Opulence_0504205617_texture.glb",
  "Meshy_AI_Prismatic_Clutch_0504213226_texture.glb",
];

export const SHOWROOM_SHOE_FILENAMES = [
  "Meshy_AI_Azure_Filigree_Heels_0504202003_texture.glb",
  "Meshy_AI_Blue_Embroidered_Ankl_0504202650_texture.glb",
  "Meshy_AI_Blue_Embroidered_Pump_0504203421_texture.glb",
  "Meshy_AI_Crystal_Vine_Silver_S_0504193503_texture.glb",
  "Meshy_AI_Emerald_Halo_Blue_Hee_0504200240_texture.glb",
  "Meshy_AI_Fuchsia_Patent_Pumps_0504194237_texture.glb",
  "Meshy_AI_Gilded_Ivy_Knee_High__0504204034_texture.glb",
  "Meshy_AI_Golden_Stride_0504191602_texture.glb",
];

/** All accessory filenames combined — used to exclude accessories from the mannequin URL pool. */
export const SHOWROOM_ACCESSORY_FILENAMES = new Set([
  ...SHOWROOM_BAG_FILENAMES,
  ...SHOWROOM_SHOE_FILENAMES,
]);

const BAG_MAX_DIM_BY_FILENAME = {
  "Meshy_AI_Azure_Fleur_Satchel_0504210742_texture.glb": 0.58,
  "Meshy_AI_Blush_Pink_Envelope_S_0504212603_texture.glb": 0.35,
  "Meshy_AI_Diamond_Laurel_Clutch_0504214744_texture.glb": 0.31,
  "Meshy_AI_Emerald_Elegance_0504192355_texture.glb": 0.48,
  "Meshy_AI_Gilded_Elegance_0504190720_texture.glb": 0.41,
  "Meshy_AI_Gilded_Laurel_Bloom_C_0504212105_texture.glb": 0.37,
  "Meshy_AI_Golden_Pleated_Satche_0504210150_texture.glb": 0.58,
  "Meshy_AI_Laurel_Ring_Clutch_0504211453_texture.glb": 0.30,
  "Meshy_AI_Laurel_Wreath_Clutch_0504213710_texture.glb": 0.32,
  "Meshy_AI_Midnight_Opulence_0504205617_texture.glb": 0.50,
  "Meshy_AI_Prismatic_Clutch_0504213226_texture.glb": 0.31,
};

const SHOE_MAX_DIM_BY_FILENAME = {
  "Meshy_AI_Azure_Filigree_Heels_0504202003_texture.glb": 0.34,
  "Meshy_AI_Blue_Embroidered_Ankl_0504202650_texture.glb": 0.47,
  "Meshy_AI_Blue_Embroidered_Pump_0504203421_texture.glb": 0.34,
  "Meshy_AI_Crystal_Vine_Silver_S_0504193503_texture.glb": 0.34,
  "Meshy_AI_Emerald_Halo_Blue_Hee_0504200240_texture.glb": 0.34,
  "Meshy_AI_Fuchsia_Patent_Pumps_0504194237_texture.glb": 0.34,
  "Meshy_AI_Gilded_Ivy_Knee_High__0504204034_texture.glb": 0.72,
  "Meshy_AI_Golden_Stride_0504191602_texture.glb": 0.34,
};

function filenameFromUrl(url) {
  return url ? url.split("/").pop().split("?")[0] : "";
}

/** Target longest bbox edge (metres) for a bag URL fetched from the backend. */
export function getShowroomBagMaxDimension(url) {
  return BAG_MAX_DIM_BY_FILENAME[filenameFromUrl(url)] ?? 0.45;
}

/** Target longest bbox edge (metres) for a shoe URL fetched from the backend. */
export function getShowroomShoeMaxDimension(url) {
  return SHOE_MAX_DIM_BY_FILENAME[filenameFromUrl(url)] ?? 0.35;
}
