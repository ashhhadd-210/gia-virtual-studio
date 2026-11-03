import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { SpotLight } from "@babylonjs/core/Lights/spotLight.js";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { MirrorTexture } from "@babylonjs/core/Materials/Textures/mirrorTexture.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Plane } from "@babylonjs/core/Maths/math.plane.js";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CreateText } from "@babylonjs/core/Meshes/Builders/textBuilder.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader.js";
import "@babylonjs/loaders/glTF/index.js";
import earcut from "earcut";

import {
  getShowroomBagMaxDimension,
  getShowroomShoeMaxDimension,
} from "./showroomAccessoryModels.js";
import { getExperienceProfile } from "./deviceLoadingProfile.js";

import blackTerrazzoFloorUrl from "../../ASSETS//Texture/GIA_Black_Terrazzo_Rectangle_Tile_Albedo_2048.webp";

import helvetikerBoldFontData from "../../ASSETS//Fonts/helvetiker_bold.typeface.json";
import optimerRegularFontData from "../../ASSETS//Fonts/optimer_regular.typeface.json";
import corridorPanel01Url from "../../ASSETS//Generated/gia_corridor_panel_01.webp";
import corridorPanel02Url from "../../ASSETS//Generated/gia_corridor_panel_02.webp";
import corridorPanel03Url from "../../ASSETS//Generated/gia_corridor_panel_03.webp";
import corridorWallTexture03Url from "../../ASSETS//Generated/gia_corridor_wall_texture_03.webp";
import centerPlatformLightSilverMarbleUrl from "../../ASSETS//Generated/gia_center_platform_light_silver_marble.webp";
import pillarWhiteMarbleUrl from "../../ASSETS//Generated/gia_pillar_white_marble_stone.webp";
import shopFloorLightStoneUrl from "../../ASSETS//Generated/gia_shop_floor_light_polished_stone.webp";
import shopInnerSilverWhiteMarbleUrl from "../../ASSETS//Generated/gia_shop_inner_silver_white_marble.webp";
import shopWallSoftStoneUrl from "../../ASSETS//Generated/gia_shop_wall_soft_concrete_marble.webp";
import mainHallPremiumDarkWallUrl from "../../ASSETS//Generated/gia_main_hall_premium_dark_wall.webp";
import mainHallPremiumDarkWallOuterShopFlippedUrl from "../../ASSETS//Generated/gia_main_hall_premium_dark_wall_outer_shop_flipped.webp";
import mainHallPremiumDarkWallOuterShopFlippedWestUrl from "../../ASSETS//Generated/gia_main_hall_premium_dark_wall_outer_shop_flipped_west.webp";
import mainHallPerimeterDarkMarbleWallUrl from "../../ASSETS//Generated/gia_main_hall_perimeter_dark_marble_wall.webp";
// Design model URLs are now fetched dynamically from the backend API (/generated-designs)
// and passed into ShowroomWorld via the constructor. No frontend mannequin GLBs are loaded.

const EXPERIENCE_PROFILE = getExperienceProfile();
const LIMITED_DEVICE_PROFILE = EXPERIENCE_PROFILE.limitedDevice;
const USE_MATERIAL_TEXTURES = EXPERIENCE_PROFILE.useMaterialTextures;

// Visual hierarchy: hero surfaces (floor, pedestals, gate stone, mannequin
// platforms) always render with maximum anisotropy and keep their clearcoat
// even on constrained tiers. Background surfaces use the tier default. This is
// how we spend the rendering budget on what the eye actually judges as luxury.
const DEFAULT_ANISOTROPY = EXPERIENCE_PROFILE.constrainedPerformance ? 8 : 16;
const HERO_ANISOTROPY = 16;

function getAssetFileName(assetUrl) {
  if (typeof assetUrl !== "string" || assetUrl.length === 0) {
    return null;
  }
  const normalized = assetUrl.split("?")[0] ?? assetUrl;
  const fileName = normalized.slice(normalized.lastIndexOf("/") + 1);
  return fileName ? decodeURIComponent(fileName) : null;
}

function getMannequinDepthCompensation(_assetUrl) {
  // Backend-sourced models use a uniform depth compensation of 1.
  return 1;
}

function makePbr(scene, name, options) {
  const material = new PBRMaterial(name, scene);
  material.albedoColor = Color3.FromHexString(options.color);
  if (options.albedoTexture && USE_MATERIAL_TEXTURES) {
    material.albedoTexture = new Texture(options.albedoTexture, scene);
    material.albedoTexture.uScale = options.uScale ?? 1;
    material.albedoTexture.vScale = options.vScale ?? 1;
    material.albedoTexture.uOffset = options.uOffset ?? 0;
    material.albedoTexture.vOffset = options.vOffset ?? 0;
    material.albedoTexture.uAng = options.uAng ?? 0;
    material.albedoTexture.vAng = options.vAng ?? 0;
    material.albedoTexture.wAng = options.wAng ?? 0;
    material.albedoTexture.wrapU = Texture.WRAP_ADDRESSMODE;
    material.albedoTexture.wrapV = Texture.WRAP_ADDRESSMODE;
    material.albedoTexture.anisotropicFilteringLevel =
      options.anisotropy ?? (options.heroSurface ? HERO_ANISOTROPY : DEFAULT_ANISOTROPY);
    material.albedoTexture.updateSamplingMode(Texture.TRILINEAR_SAMPLINGMODE);
  }
  if (options.emissiveTexture && USE_MATERIAL_TEXTURES) {
    material.emissiveTexture = new Texture(options.emissiveTexture, scene);
    material.emissiveTexture.uScale = options.uScale ?? 1;
    material.emissiveTexture.vScale = options.vScale ?? 1;
    material.emissiveTexture.wrapU = Texture.WRAP_ADDRESSMODE;
    material.emissiveTexture.wrapV = Texture.WRAP_ADDRESSMODE;
  }
  if (options.bumpTexture && USE_MATERIAL_TEXTURES) {
    material.bumpTexture = new Texture(options.bumpTexture, scene);
    material.bumpTexture.uScale = options.uScale ?? 1;
    material.bumpTexture.vScale = options.vScale ?? 1;
    material.bumpTexture.level = options.bumpLevel ?? 0.45;
    material.bumpTexture.wrapU = Texture.WRAP_ADDRESSMODE;
    material.bumpTexture.wrapV = Texture.WRAP_ADDRESSMODE;
  }
  material.metallic = options.metallic ?? 0;
  material.roughness = options.roughness ?? 0.55;
  if (options.clearCoat) {
    material.clearCoat.isEnabled = true;
    material.clearCoat.intensity = options.clearCoat.intensity ?? 0.35;
    material.clearCoat.roughness = options.clearCoat.roughness ?? 0.22;
  }
  material.emissiveColor = options.emissive
    ? Color3.FromHexString(options.emissive)
    : Color3.Black();
  // Light-count uniform pressure is brutal on ANGLE/D3D11 (Windows iGPUs).
  // Cap at 4 on phones/tablets, 6 on Intel-iGPU laptops (desktopConstrained),
  // 8 on discrete-GPU desktops. Each light adds a per-pixel cost on PBR.
  if (EXPERIENCE_PROFILE.limitedDevice) {
    material.maxSimultaneousLights = Math.min(options.maxSimultaneousLights ?? 4, 4);
  } else if (EXPERIENCE_PROFILE.desktopConstrained) {
    // Hard 4-light cap on Intel iGPU. PBR fragment cost scales near-linearly
    // with maxSimultaneousLights — 4 vs 6 is a ~33% shader cost cut. We have 24
    // scene lights but distance-culling already disables far ones, and 4
    // simultaneous in-range lights is enough for the warm/cool fill we use.
    material.maxSimultaneousLights = Math.min(options.maxSimultaneousLights ?? 4, 4);
  } else {
    material.maxSimultaneousLights = options.maxSimultaneousLights ?? 8;
  }
  // ClearCoat is a 2nd full BRDF eval per pixel — beautiful, but kills fragment
  // shader throughput on Intel Xe-LPG. Disable on constrained tier EXCEPT for
  // hero surfaces (floor, pedestal tops, gate stone, mannequin platforms) — those
  // are where the eye actually reads "luxury", so they keep their gloss even on
  // weak GPUs. Background materials carry the perf savings.
  if (
    EXPERIENCE_PROFILE.disableClearCoat &&
    !options.heroSurface &&
    material.clearCoat?.isEnabled !== undefined
  ) {
    material.clearCoat.isEnabled = false;
  }
  material.alpha = options.alpha ?? 1;
  material.backFaceCulling = options.backFaceCulling ?? true;
  if (material.alpha < 1) {
    material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  }
  return material;
}

function aabb(x, z, width, depth, padding = 0) {
  return {
    minX: x - width * 0.5 - padding,
    maxX: x + width * 0.5 + padding,
    minZ: z - depth * 0.5 - padding,
    maxZ: z + depth * 0.5 + padding,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Per-mannequin dedolight tuning. Bumped 0.55 → 0.72 to match the
// client-referenced "Prada gallery installation" feel — mannequins should
// read as lit pieces of art with clear light pools under them, not just
// softly washed. Range/angle also nudged for tighter, more dramatic light
// shape.
const MODEL_DEDOLIGHT_INTENSITY_SCALE = 0.72;
const MODEL_DEDOLIGHT_RANGE_SCALE = 0.92;
const MODEL_DEDOLIGHT_ANGLE_SCALE = 0.97;
const SHOP_OCCUPIED_PEDESTAL_RADIUS_SCALE = 0.78;
const SUBTLE_OPTICAL_GLOW_INTENSITY = 0.9;

export class ShowroomWorld {
  constructor(scene, designModelUrls = [], mainAreaModelUrls = [], accessoryModelUrls = {}) {
    this.scene = scene;
    this.bounds = { minX: -46.5, maxX: 46.5, minZ: 53, maxZ: 146.5 };
    this.spawnPoint = new Vector3(0, 1.72, 142);
    this.colliders = [];
    this.shadowCasters = [];
    this.welcomeSign = null;
    this.welcomeParticles = [];
    this.welcomeParticleClock = 0;
    this.welcomeOpacity = 0;
    this.welcomeDismissed = false;
    this.entryGateZ = 104;
    this.welcomeSignZ = 86.15;
    this.distanceGroups = [];
    this.distanceOptimizationClock = 1;
    this.lastOptimizationCameraZ = this.spawnPoint.z;
    this.optimizationWarmupRemaining = 0.75;
    this.optimizationConfig = {
      updateInterval: 0.4,
      cameraMoveThreshold: 8,
      meshHysteresis: 28,
      lightHysteresis: 18,
    };
    this.floorReflectionCandidates = [];
    this.shopPedestalTopReflections = [];
    this.shopPedestalTopMaterials = new Map();
    this.showcaseTargets = [];
    this.showcaseTargetsById = new Map();
    this.showcaseTargetCounter = 0;
    this.pendingModelLoads = [];
    this.deferredModelLoadTasks = [];
    this.deferredModelLoadActiveCount = 0;
    this.deferredModelLoadClock = 0;
    this.experienceProfile = EXPERIENCE_PROFILE;
    this.useLimitedDeviceProfile = LIMITED_DEVICE_PROFILE;
    this.useDesktopBalancedMode = EXPERIENCE_PROFILE.modelMode === "desktop-balanced";
    this.useBalancedMobileMode = EXPERIENCE_PROFILE.modelMode === "balanced";
    this.usePerformanceMannequinProxies = EXPERIENCE_PROFILE.modelMode === "lite";
    this.useAccessoryProxies = this.useBalancedMobileMode || this.usePerformanceMannequinProxies;
    this.streamingActive = EXPERIENCE_PROFILE.preloadDeferredAssets;
    /** Streaming fallback: only used if the loading screen's preload phase failed/skipped. */
    this.deferredModelLoadInterval = this.useLimitedDeviceProfile ? 0.9 : this.useDesktopBalancedMode ? 0.65 : 0.4;
    this.deferredModelLoadDistanceLimit = this.useLimitedDeviceProfile
      ? this.useBalancedMobileMode
        ? 40
        : 32
      : this.useDesktopBalancedMode
        ? 48
        : 64;
    this.deferredModelLoadMaxParallel = this.useLimitedDeviceProfile ? 1 : this.useDesktopBalancedMode ? 2 : 3;
    // Semaphore: caps concurrent SceneLoader.ImportMeshAsync calls to prevent
    // Babylon.js race conditions (material/texture deduplication conflicts, mesh
    // naming collisions) that cause mannequins to randomly appear invisible.
    // MUST be 1 — even 2 concurrent imports trigger Babylon's internal race.
    this._glbSlotActive = 0;
    this._glbSlotMax = 1;
    this._glbSlotQueue = [];
    // Set of root TransformNodes currently being loaded — used to prevent the
    // repair pass from double-loading a slot that is still in-flight.
    this._mannequinLoadingInProgress = new Set();
    // Tracks every slot that scheduled a real GLB load so we can detect and
    // repair any that silently failed all retry attempts after preload finishes.
    this._mannequinRepairSlots = [];
    // Resolved after preloadAllDeferredAssets workers finish — lets
    // repairMissingMannequins wait for stragglers before checking for gaps.
    this._preloadWorkersPromise = null;
    // Deduplicate design model URLs supplied from the backend API.
    const _seenDesignUrls = new Set();
    this.uniqueSceneMannequinModelUrls = designModelUrls.filter((url) => {
      if (!url || _seenDesignUrls.has(url)) return false;
      _seenDesignUrls.add(url);
      return true;
    });
    this._defaultMannequinModelUrl = this.uniqueSceneMannequinModelUrls[0] ?? null;
    this._mannequinModelUrlIndex = 0;
    this.mainAreaModelUrls = [...mainAreaModelUrls];
    /** Bag/shoe URL pools sourced from the backend — pools shrink with `shift()`; extra shop slots stay empty. */
    const { bags: bagUrls = [], shoes: shoeUrls = [] } = accessoryModelUrls;
    this._showroomBagUrlPool = [...bagUrls].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    this._showroomShoeUrlPool = [...shoeUrls].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    this.materials = this._createMaterials();
    // GlowLayer renders a full-screen blur pass. blurKernelSize 32 + full-res
    // texture is the biggest per-frame cost after the floor mirror. Drop both
    // on constrained — visually nearly identical, especially with our reduced
    // glow intensity.
    this.glow = !EXPERIENCE_PROFILE.enableGlow
      ? null
      : new GlowLayer("gia-glow", scene, {
          mainTextureRatio: EXPERIENCE_PROFILE.constrainedPerformance ? 0.25 : 1.0,
        });
    if (this.glow) {
      this.glow.intensity = Math.max(EXPERIENCE_PROFILE.glowIntensity, SUBTLE_OPTICAL_GLOW_INTENSITY);
      this.glow.blurKernelSize = EXPERIENCE_PROFILE.constrainedPerformance ? 12 : 32;
      this.glow.isEnabled = true;
      this._configureGlowExclusions();
    }

    this._buildLighting();
    this._buildShell();
    this._buildEntryGate();
    this._buildMallPlan();
    this._buildCeiling();
    this._buildPremiumHall();
    this._buildShowroomMoments();
    this._updateDistanceOptimization(this.spawnPoint, this.optimizationConfig.updateInterval);
    this._buildFloorReflections();
    this._freezeStaticScene();
    this.ready = Promise.allSettled(this.pendingModelLoads);
  }

  _createShowcaseTarget({
    kind = "item",
    label = "Inspect item",
    focusPoint = null,
    orbitRadius = 2.4,
    cameraY = this.spawnPoint.y,
    orbitSpeed = 0.26,
    preferredAngle = 0,
    sourceFileName = null,
  } = {}) {
    const target = {
      id: `showcase-${++this.showcaseTargetCounter}`,
      kind,
      label,
      focusPoint: focusPoint?.clone() ?? new Vector3(0, this.spawnPoint.y, 0),
      orbitRadius,
      cameraY,
      orbitSpeed,
      preferredAngle,
      sourceFileName,
    };
    this.showcaseTargets.push(target);
    this.showcaseTargetsById.set(target.id, target);
    return target;
  }

  _assignShowcaseTarget(nodes, showcaseTarget) {
    if (!showcaseTarget || !nodes) {
      return;
    }

    const list = Array.isArray(nodes) ? nodes : [nodes];
    for (const node of list) {
      if (!node) {
        continue;
      }
      node.metadata = {
        ...(node.metadata ?? {}),
        showcaseTargetId: showcaseTarget.id,
      };
    }
  }

  _updateShowcaseTargetFromMeshes(
    showcaseTarget,
    meshes,
    {
      focusHeightBias = 0.55,
      cameraHeightBias = 0.44,
      orbitPadding = 1.15,
      minOrbitRadius = 1.8,
      maxOrbitRadius = 4.35,
      minCameraY = 1.62,
      maxCameraY = 2.34,
    } = {},
  ) {
    if (!showcaseTarget || !meshes?.length) {
      return;
    }

    const min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    const max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);

    for (const mesh of meshes) {
      if (!mesh || mesh.isDisposed?.()) {
        continue;
      }
      mesh.computeWorldMatrix(true);
      mesh.refreshBoundingInfo();
      const bounds = mesh.getBoundingInfo().boundingBox;
      min.minimizeInPlace(bounds.minimumWorld);
      max.maximizeInPlace(bounds.maximumWorld);
    }

    if (!Number.isFinite(min.x) || !Number.isFinite(max.x)) {
      return;
    }

    const width = max.x - min.x;
    const depth = max.z - min.z;
    const height = max.y - min.y;
    const center = Vector3.Lerp(min, max, 0.5);
    showcaseTarget.focusPoint.copyFrom(center);
    showcaseTarget.focusPoint.y = min.y + height * focusHeightBias;
    showcaseTarget.cameraY = clamp(min.y + height * cameraHeightBias, minCameraY, maxCameraY);
    showcaseTarget.orbitRadius = clamp(
      Math.max(width, depth) * 0.72 + height * 0.32 + orbitPadding,
      minOrbitRadius,
      maxOrbitRadius,
    );
  }

  getShowcaseTargetForMesh(mesh) {
    let current = mesh;
    while (current) {
      const targetId = current.metadata?.showcaseTargetId;
      if (targetId && this.showcaseTargetsById.has(targetId)) {
        return this.showcaseTargetsById.get(targetId) ?? null;
      }
      current = current.parent ?? null;
    }
    return null;
  }

  pickShowcaseTarget(screenX, screenY, camera = this.scene.activeCamera) {
    const pick = this.scene.pick(
      screenX,
      screenY,
      (mesh) => this.getShowcaseTargetForMesh(mesh) != null,
      false,
      camera,
    );
    if (!pick?.hit || !pick.pickedMesh) {
      return null;
    }
    return this.getShowcaseTargetForMesh(pick.pickedMesh);
  }

  pickNavigableFloorPoint(screenX, screenY, camera = this.scene.activeCamera) {
    const pick = this.scene.pick(
      screenX,
      screenY,
      (mesh) =>
        mesh?.metadata?.isNavigableFloor === true ||
        mesh?.metadata?.isNavigationBlocker === true ||
        this.getShowcaseTargetForMesh(mesh) != null,
      false,
      camera,
    );
    if (!pick?.hit || !pick.pickedPoint || pick.pickedMesh?.metadata?.isNavigableFloor !== true) {
      return null;
    }
    const point = pick.pickedPoint.clone();
    return this.isNavigableFloorPoint(point) ? point : null;
  }

  isNavigableFloorPoint(point) {
    if (!point) {
      return false;
    }
    if (
      point.x < this.bounds.minX ||
      point.x > this.bounds.maxX ||
      point.z < this.bounds.minZ ||
      point.z > this.bounds.maxZ
    ) {
      return false;
    }

    // The old east/west entrance side spaces still share the same floor mesh.
    // Keep click-to-fly inside the real corridor once the map is closed by the gate walls.
    if (point.z > this.entryGateZ + 0.45 && Math.abs(point.x) > 7.05) {
      return false;
    }

    return true;
  }

  /**
   * Preloads every deferred mannequin / accessory GLB (normally loaded as the camera approaches).
   * Drains `deferredModelLoadTasks` so nothing streams in after the loading screen.
   */
  async preloadAllDeferredAssets(options = {}) {
    const {
      onProgress,
      concurrency = 4,
      perTaskTimeoutMs = 12000,
      overallTimeoutMs = 120000,
    } = options;
    const tasks = this.deferredModelLoadTasks.splice(0, this.deferredModelLoadTasks.length);
    const total = tasks.length;
    if (total === 0) {
      onProgress?.(1);
      return;
    }

    let completed = 0;
    const report = () => {
      completed += 1;
      onProgress?.(completed / total);
    };

    let nextIndex = 0;
    const runWorker = async () => {
      while (true) {
        const i = nextIndex;
        nextIndex += 1;
        if (i >= total) {
          return;
        }
        const task = tasks[i];
        try {
          await Promise.race([
            task.loadModel(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error(`preload-timeout (${perTaskTimeoutMs}ms)`)), perTaskTimeoutMs),
            ),
          ]);
        } catch (error) {
          console.warn("Could not preload showroom model", error);
        } finally {
          report();
        }
      }
    };

    const pool = Math.min(Math.max(1, concurrency), total);
    const workers = Promise.all(Array.from({ length: pool }, () => runWorker()));
    // Store the workers promise so repairMissingMannequins can await any
    // still-running workers before checking for missing model roots.
    this._preloadWorkersPromise = workers;
    const timeout = new Promise((resolve) => setTimeout(resolve, overallTimeoutMs));
    // Whichever finishes first wins.  If the timeout fires, workers continue
    // in the background — repairMissingMannequins waits for them before acting.
    await Promise.race([workers, timeout]);
  }

  /**
   * One-shot freeze applied right before gameplay starts. Locks down every
   * world matrix that won't move. We intentionally do NOT freeze Babylon's
   * active-mesh list here: the player spawns facing north, then can immediately
   * spin 180 degrees toward the entrance corridor. Freezing the active mesh set
   * at startup was causing small static details behind the spawn view (entry
   * platforms, ceiling fixtures, frame strips) to disappear until reload.
   */
  freezeForRuntime() {
    for (const mesh of this.scene.meshes) {
      if (!mesh || mesh.isDisposed?.() || mesh.name?.startsWith?.("welcome-fade-particle")) {
        continue;
      }
      try {
        mesh.freezeWorldMatrix();
      } catch {
        /* mesh may have a non-identity skeleton; skipping is safe. */
      }
    }
  }

  update(cameraPosition, delta = 0) {
    if (this.welcomeSign) {
      if (cameraPosition.z < this.welcomeSignZ) {
        this.welcomeDismissed = true;
      }

      const shouldShow =
        !this.welcomeDismissed &&
        cameraPosition.z < this.entryGateZ &&
        cameraPosition.z > this.welcomeSignZ;
      const targetOpacity = shouldShow ? 1 : 0;
      const fadeSpeed = targetOpacity > this.welcomeOpacity ? 2.8 : 3.6;
      const blend = Math.min(1, delta * fadeSpeed);

      this.welcomeOpacity += (targetOpacity - this.welcomeOpacity) * blend;
      if (Math.abs(this.welcomeOpacity - targetOpacity) < 0.01) {
        this.welcomeOpacity = targetOpacity;
      }

      this.welcomeSign.isVisible = this.welcomeOpacity > 0.01;
      this.welcomeSign.visibility = this.welcomeOpacity;
      if (this.welcomeSign.material) {
        this.welcomeSign.material.alpha = this.welcomeOpacity;
      }
      this._updateWelcomeParticles(delta);
    }

    if (this.optimizationWarmupRemaining > 0) {
      this.optimizationWarmupRemaining = Math.max(0, this.optimizationWarmupRemaining - delta);
      if (this.optimizationWarmupRemaining > 0) {
        return;
      }
      this.distanceOptimizationClock = this.optimizationConfig.updateInterval;
    }

    this._updateDistanceOptimization(cameraPosition, delta);
    if (this.streamingActive) {
      this._updateDeferredModelLoads(cameraPosition, delta);
    }
  }

  activateStreaming() {
    this.streamingActive = true;
  }

  _createMaterials() {
    const makeMainHallWall = (
      name,
      uScale,
      { flipY = false, color = "#d6d0c6", textureUrl = mainHallPremiumDarkWallUrl } = {},
    ) =>
      makePbr(this.scene, name, {
        color,
        albedoTexture: textureUrl,
        uScale,
        vScale: flipY ? -1 : 1,
        vOffset: flipY ? 1 : 0,
        metallic: 0.04,
        roughness: 0.62,
        clearCoat: {
          intensity: 0.08,
          roughness: 0.72,
        },
        backFaceCulling: false,
      });

    const makeShopWallTiled = (name, uScale) =>
      makePbr(this.scene, name, {
        color: "#ffffff",
        albedoTexture: shopInnerSilverWhiteMarbleUrl,
        uScale,
        vScale: 1,
        metallic: 0.03,
        roughness: 0.31,
        backFaceCulling: false,
      });

    const makeSoftWallWashMaterial = (
      name,
      { color = "#f3efe7", emissive = "#b8aa95", width = 512, height = 1024 } = {},
    ) => {
      const texture = new DynamicTexture(
        `${name}-texture`,
        { width, height },
        this.scene,
        false,
        Texture.TRILINEAR_SAMPLINGMODE,
      );
      texture.hasAlpha = true;
      texture.wrapU = Texture.CLAMP_ADDRESSMODE;
      texture.wrapV = Texture.CLAMP_ADDRESSMODE;
      texture.anisotropicFilteringLevel = DEFAULT_ANISOTROPY;

      const context = texture.getContext();
      context.clearRect(0, 0, width, height);
      const gradient = context.createRadialGradient(width * 0.5, height * 0.9, 24, width * 0.5, height * 0.92, width * 0.7);
      gradient.addColorStop(0, "rgba(255,255,255,0.9)");
      gradient.addColorStop(0.18, "rgba(255,255,255,0.42)");
      gradient.addColorStop(0.52, "rgba(255,255,255,0.14)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = gradient;
      context.beginPath();
      context.ellipse(width * 0.5, height * 0.72, width * 0.25, height * 0.42, 0, 0, Math.PI * 2);
      context.fill();
      texture.update(false);

      const material = new StandardMaterial(name, this.scene);
      material.diffuseTexture = texture;
      material.opacityTexture = texture;
      material.emissiveTexture = texture;
      material.useAlphaFromDiffuseTexture = true;
      material.diffuseColor = Color3.FromHexString(color);
      material.emissiveColor = Color3.FromHexString(emissive).scale(0.8);
      material.disableLighting = true;
      material.backFaceCulling = false;
      return material;
    };

    const hashNoise = (seed) => {
      const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453123;
      return value - Math.floor(value);
    };

    const makeBrushedMetalTexture = (
      name,
      {
        width = 512,
        height = 512,
        gradientStops = [
          [0, "#565c64"],
          [0.2, "#6f757d"],
          [0.5, "#868d96"],
          [0.78, "#6c727a"],
          [1, "#4d535b"],
        ],
        lineToneBase = 138,
        lineToneRange = 62,
        shadowColor = [26, 30, 36],
        shadowAlphaBase = 0.012,
        shadowAlphaRange = 0.03,
      } = {},
    ) => {
      const texture = new DynamicTexture(
        `${name}-texture`,
        { width, height },
        this.scene,
        false,
        Texture.TRILINEAR_SAMPLINGMODE,
      );
      texture.wrapU = Texture.WRAP_ADDRESSMODE;
      texture.wrapV = Texture.WRAP_ADDRESSMODE;
      texture.anisotropicFilteringLevel = DEFAULT_ANISOTROPY;

      const context = texture.getContext();
      const gradient = context.createLinearGradient(0, 0, width, 0);
      for (const [stop, color] of gradientStops) {
        gradient.addColorStop(stop, color);
      }
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);

      for (let i = 0; i < 720; i += 1) {
        const x = hashNoise(i + 17) * width;
        const lineWidth = 1 + hashNoise(i + 101) * 2.4;
        const alpha = 0.025 + hashNoise(i + 211) * 0.05;
        const tone = lineToneBase + Math.floor(hashNoise(i + 307) * lineToneRange);
        context.fillStyle = `rgba(${tone}, ${tone + 1}, ${tone + 5}, ${alpha})`;
        context.fillRect(x, 0, lineWidth, height);
      }

      for (let i = 0; i < 240; i += 1) {
        const x = hashNoise(i + 401) * width;
        const alpha = shadowAlphaBase + hashNoise(i + 503) * shadowAlphaRange;
        context.fillStyle = `rgba(${shadowColor[0]}, ${shadowColor[1]}, ${shadowColor[2]}, ${alpha})`;
        context.fillRect(x, 0, 1, height);
      }

      texture.update(false);
      return texture;
    };

    const makeTurnedMetalTexture = (name, { size = 512 } = {}) => {
      const texture = new DynamicTexture(
        `${name}-texture`,
        { width: size, height: size },
        this.scene,
        false,
        Texture.TRILINEAR_SAMPLINGMODE,
      );
      texture.wrapU = Texture.CLAMP_ADDRESSMODE;
      texture.wrapV = Texture.CLAMP_ADDRESSMODE;
      texture.anisotropicFilteringLevel = DEFAULT_ANISOTROPY;

      const context = texture.getContext();
      const center = size * 0.5;
      const gradient = context.createRadialGradient(center, center, size * 0.08, center, center, size * 0.52);
      gradient.addColorStop(0, "#9098a2");
      gradient.addColorStop(0.24, "#7c838c");
      gradient.addColorStop(0.66, "#646b74");
      gradient.addColorStop(1, "#4d545d");
      context.fillStyle = gradient;
      context.fillRect(0, 0, size, size);

      for (let i = 0; i < 190; i += 1) {
        const radius = (i / 190) * size * 0.47;
        const alpha = 0.02 + hashNoise(i + 607) * 0.04;
        const tone = 150 + Math.floor(hashNoise(i + 701) * 55);
        context.strokeStyle = `rgba(${tone}, ${tone}, ${tone + 6}, ${alpha})`;
        context.lineWidth = 0.8 + hashNoise(i + 809) * 0.8;
        context.beginPath();
        context.arc(center, center, radius, 0, Math.PI * 2);
        context.stroke();
      }

      texture.update(false);
      return texture;
    };

    const shopPedestalSilverTexture = makeBrushedMetalTexture("dark-silver-shop-pedestal");
    const shopPedestalSilverTopTexture = makeTurnedMetalTexture("dark-silver-shop-pedestal-top");

    const shopPedestalSilver = makePbr(this.scene, "dark-silver-shop-pedestal", {
      color: "#6a7078",
      metallic: 0.76,
      roughness: 0.38,
      clearCoat: {
        intensity: 0.18,
        roughness: 0.44,
      },
    });
    shopPedestalSilver.albedoTexture = shopPedestalSilverTexture;
    shopPedestalSilver.environmentIntensity = 0.28;
    shopPedestalSilver.microSurface = 0.34;

    const shopPedestalSilverTop = makePbr(this.scene, "dark-silver-shop-pedestal-top", {
      heroSurface: true,
      color: "#7a8089",
      metallic: 0.84,
      roughness: 0.18,
      clearCoat: {
        intensity: 0.62,
        roughness: 0.16,
      },
    });
    shopPedestalSilverTop.albedoTexture = shopPedestalSilverTopTexture;
    shopPedestalSilverTop.environmentIntensity = 0.42;
    shopPedestalSilverTop.microSurface = 0.52;

    const centerPlatformStoneMetal = makePbr(this.scene, "dark-stone-metal-center-platform", {
      heroSurface: true,
      color: "#aeb7c0",
      albedoTexture: centerPlatformLightSilverMarbleUrl,
      uScale: 2.2,
      vScale: 1.25,
      metallic: 0.05,
      roughness: 0.34,
      maxSimultaneousLights: 8,
      clearCoat: {
        intensity: 0.24,
        roughness: 0.28,
      },
    });
    centerPlatformStoneMetal.environmentIntensity = 0.26;
    centerPlatformStoneMetal.microSurface = 0.36;

    return {
      floor: makePbr(this.scene, "polished-cream-stone", {
        heroSurface: true,
        color: "#ffffff",
        albedoTexture: blackTerrazzoFloorUrl,
        uScale: 12.3,
        vScale: 38.5,
        metallic: 0.02,
        roughness: 0.28,
        maxSimultaneousLights: 8,
      }),
      ceiling: makePbr(this.scene, "dark-gray-graphite-ceiling", {
        color: "#6f6b63",
        albedoTexture: pillarWhiteMarbleUrl,
        emissiveTexture: pillarWhiteMarbleUrl,
        emissive: "#171716",
        uScale: 16,
        vScale: 46,
        metallic: 0.02,
        roughness: 0.28,
      }),
      darkFloor: makePbr(this.scene, "dark-inlay-stone", {
        color: "#242628",
        metallic: 0.04,
        roughness: 0.24,
      }),
      wall: makeMainHallWall("premium-dark-main-hall-wall", 4.2, { flipY: true }),
      shopExteriorWall: makeMainHallWall("premium-dark-shop-exterior-wall", 4.2, {
        flipY: false,
        textureUrl: mainHallPremiumDarkWallOuterShopFlippedUrl,
      }),
      shopExteriorWallWest: makeMainHallWall("premium-dark-shop-exterior-wall-west", 4.2, {
        flipY: false,
        textureUrl: mainHallPremiumDarkWallOuterShopFlippedWestUrl,
      }),
      mainHallLongWall: makeMainHallWall("premium-dark-main-hall-long-wall", 32.6, {
        flipY: true,
        color: "#ffffff",
        textureUrl: mainHallPerimeterDarkMarbleWallUrl,
      }),
      mainHallWideWall: makeMainHallWall("premium-dark-main-hall-wide-wall", 10.4, {
        flipY: true,
        color: "#ffffff",
        textureUrl: mainHallPerimeterDarkMarbleWallUrl,
      }),
      mainHallUpperSideWall: makeMainHallWall("premium-dark-main-hall-upper-side-wall", 9.5, {
        flipY: true,
        color: "#ffffff",
        textureUrl: mainHallPerimeterDarkMarbleWallUrl,
      }),
      entrySideFoundationWall: makePbr(this.scene, "entry-side-foundation-wall", {
        color: "#ffffff",
        albedoTexture: mainHallPerimeterDarkMarbleWallUrl,
        emissiveTexture: mainHallPerimeterDarkMarbleWallUrl,
        emissive: "#121212",
        uScale: 0.9,
        vScale: 1,
        metallic: 0.04,
        roughness: 0.34,
        clearCoat: {
          intensity: 0.18,
          roughness: 0.24,
        },
        backFaceCulling: false,
      }),
      shopWall: makePbr(this.scene, "gray-marble-boutique-inner-wall", {
        color: "#ffffff",
        albedoTexture: shopInnerSilverWhiteMarbleUrl,
        uScale: 4,
        vScale: 1.6,
        metallic: 0.03,
        roughness: 0.31,
        clearCoat: {
          intensity: 0.18,
          roughness: 0.3,
        },
        backFaceCulling: false,
      }),
      shopWallBackTiled: makeShopWallTiled("warm-boutique-back-wall-full-height-tiles", 30 / 7.2),
      shopWallPartitionTiled: makeShopWallTiled("warm-boutique-partition-full-height-tiles", 24 / 7.2),
      shopFloorStone: makePbr(this.scene, "light-polished-shop-floor-stone", {
        heroSurface: true,
        color: "#ffffff",
        albedoTexture: shopFloorLightStoneUrl,
        uScale: 4.2,
        vScale: 5.2,
        metallic: 0.02,
        roughness: 0.16,
        clearCoat: {
          intensity: 0.55,
          roughness: 0.12,
        },
      }),
      shopPedestalSilver,
      shopPedestalSilverTop,
      entryGateTitleLetters: makePbr(this.scene, "entry-gate-title-letters", {
        color: "#f5cf86",
        emissive: "#d6a14c",
        metallic: 0.08,
        roughness: 0.26,
        maxSimultaneousLights: 8,
        clearCoat: {
          intensity: 0.34,
          roughness: 0.18,
        },
      }),
      champagne: makePbr(this.scene, "brushed-champagne-metal", {
        color: "#9aa6ad",
        metallic: 0.68,
        roughness: 0.22,
      }),
      bronze: makePbr(this.scene, "deep-bronze-metal", {
        color: "#2a343d",
        metallic: 0.62,
        roughness: 0.24,
      }),
      black: makePbr(this.scene, "black-lacquer", {
        color: "#020508",
        metallic: 0.24,
        roughness: 0.12,
      }),
      gateStone: makePbr(this.scene, "neutral-black-gate-stone", {
        heroSurface: true,
        color: "#030303",
        metallic: 0.08,
        roughness: 0.16,
        clearCoat: {
          intensity: 0.86,
          roughness: 0.12,
        },
      }),
      corridorPanel01: makePbr(this.scene, "corridor-immersive-panel-01", {
        color: "#ffffff",
        albedoTexture: corridorPanel01Url,
        emissiveTexture: corridorPanel01Url,
        emissive: "#080d10",
        metallic: 0,
        roughness: 0.24,
        backFaceCulling: false,
      }),
      corridorPanel02: makePbr(this.scene, "corridor-immersive-panel-02", {
        color: "#ffffff",
        albedoTexture: corridorPanel02Url,
        emissiveTexture: corridorPanel02Url,
        emissive: "#070b0e",
        metallic: 0,
        roughness: 0.3,
        backFaceCulling: false,
      }),
      corridorPanel03: makePbr(this.scene, "corridor-immersive-panel-03", {
        color: "#ffffff",
        albedoTexture: corridorPanel03Url,
        emissiveTexture: corridorPanel03Url,
        emissive: "#080c11",
        metallic: 0,
        roughness: 0.26,
        backFaceCulling: false,
      }),
      corridorWall03: makePbr(this.scene, "corridor-premium-wall-texture-03", {
        color: "#ffffff",
        albedoTexture: corridorWallTexture03Url,
        uScale: 1,
        vScale: 1,
        metallic: 0.08,
        roughness: 0.36,
        clearCoat: {
          intensity: 0.22,
          roughness: 0.38,
        },
      }),
      corridorBackWall03: makePbr(this.scene, "corridor-premium-back-wall-texture-03", {
        color: "#ffffff",
        albedoTexture: corridorWallTexture03Url,
        uScale: 10,
        vScale: 1,
        metallic: 0.08,
        roughness: 0.36,
        clearCoat: {
          intensity: 0.22,
          roughness: 0.38,
        },
      }),
      corridorWall03FlipY: makePbr(this.scene, "corridor-premium-wall-texture-03-flip-y", {
        color: "#ffffff",
        albedoTexture: corridorWallTexture03Url,
        uScale: 1,
        vScale: -1,
        metallic: 0.08,
        roughness: 0.36,
        clearCoat: {
          intensity: 0.22,
          roughness: 0.38,
        },
      }),
      gateLight: makePbr(this.scene, "neutral-white-gate-led", {
        color: "#ffffff",
        emissive: "#f5fbf8",
        roughness: 0.06,
      }),
      spotlightLens: makePbr(this.scene, "warm-dedolight-lens", {
        color: "#ffd36a",
        emissive: "#ffc65a",
        metallic: 0,
        roughness: 0.02,
      }),
      glass: makePbr(this.scene, "smoked-glass", {
        color: "#90a4a6",
        metallic: 0,
        roughness: 0.04,
        alpha: 0.28,
        backFaceCulling: false,
      }),
      light: makePbr(this.scene, "warm-light-strip", {
        color: "#f2fbff",
        emissive: "#d7f5ff",
        roughness: 0.14,
      }),
      softLight: makePbr(this.scene, "soft-neutral-light-strip", {
        color: "#d8e4e4",
        emissive: "#9fb7bd",
        roughness: 0.2,
        alpha: 0.58,
        backFaceCulling: false,
      }),
      ceilingSoftLight: makePbr(this.scene, "soft-ceiling-light-card", {
        color: "#d8e4e4",
        emissive: "#9fb7bd",
        roughness: 0.18,
        alpha: 0.54,
        backFaceCulling: false,
      }),
      coolLight: makePbr(this.scene, "cool-white-vitrine-led", {
        color: "#f7fdff",
        emissive: "#e0f7ff",
        roughness: 0.08,
      }),
      softCoolLight: makePbr(this.scene, "soft-cool-white-strip", {
        color: "#dbe9ea",
        emissive: "#9fbcc4",
        roughness: 0.18,
        alpha: 0.58,
        backFaceCulling: false,
      }),
      platformBlueLight: makePbr(this.scene, "blue-plinth-edge-led", {
        color: "#e8f7ff",
        emissive: "#73cfff",
        roughness: 0.08,
      }),
      softPlatformBlueLight: makePbr(this.scene, "soft-blue-plinth-edge-strip", {
        color: "#d7ecf2",
        emissive: "#5aa9c9",
        roughness: 0.18,
        alpha: 0.62,
        backFaceCulling: false,
      }),
      shopWarmLight: makePbr(this.scene, "warm-shop-vitrine-led", {
        color: "#fff3dc",
        emissive: "#ffd79a",
        roughness: 0.1,
      }),
      softShopWarmLight: makePbr(this.scene, "soft-warm-shop-strip", {
        color: "#f2dfc0",
        emissive: "#c89252",
        roughness: 0.2,
        alpha: 0.6,
        backFaceCulling: false,
      }),
      softGateLight: makePbr(this.scene, "soft-neutral-gate-strip", {
        color: "#e2e8e4",
        emissive: "#b8c4bd",
        roughness: 0.18,
        alpha: 0.6,
        backFaceCulling: false,
      }),
      shopOuterFloorLightLens: makePbr(this.scene, "shop-outer-floor-light-lens", {
        color: "#eef2f2",
        emissive: "#dbe6e6",
        metallic: 0,
        roughness: 0.04,
      }),
      shopOuterFloorLightWash: makeSoftWallWashMaterial("shop-outer-floor-light-wash"),
      cabinet: makePbr(this.scene, "matte-graphite-display-cabinet", {
        color: "#070b10",
        metallic: 0.18,
        roughness: 0.18,
      }),
      platformGray: makePbr(this.scene, "neutral-gray-display-platform", {
        color: "#5b5d5f",
        metallic: 0.08,
        roughness: 0.32,
      }),
      centerPlatformStoneMetal,
      pillarWhiteMarble: makePbr(this.scene, "soft-gray-marble-pillar-stone", {
        color: "#6f6b63",
        albedoTexture: pillarWhiteMarbleUrl,
        uScale: 1.15,
        vScale: 2.6,
        metallic: 0.02,
        roughness: 0.24,
        clearCoat: {
          intensity: 0.38,
          roughness: 0.16,
        },
      }),
      platformBlack: makePbr(this.scene, "glossy-black-mannequin-platform", {
        heroSurface: true,
        color: "#020202",
        metallic: 0.18,
        roughness: 0.08,
        clearCoat: {
          intensity: 0.95,
          roughness: 0.06,
        },
      }),
      productWhite: makePbr(this.scene, "placeholder-white-leather", {
        color: "#f1eee8",
        roughness: 0.5,
      }),
      productBlack: makePbr(this.scene, "placeholder-black-leather", {
        color: "#090807",
        roughness: 0.34,
      }),
      productBlush: makePbr(this.scene, "placeholder-blush-leather", {
        color: "#9d8f86",
        roughness: 0.42,
      }),
      fabric: makePbr(this.scene, "warm-display-fabric", {
        color: "#aeb8c0",
        roughness: 0.54,
      }),
      mannequin: makePbr(this.scene, "matte-placeholder-mannequin", {
        color: "#cfd5d8",
        roughness: 0.48,
      }),
    };
  }

  _configureGlowExclusions() {
    if (!this.glow) {
      return;
    }

    this.glow.customEmissiveColorSelector = (mesh, subMesh, material, result) => {
      if (!material) {
        result.set(0, 0, 0, 0);
        return;
      }

      const glowScale = mesh?.metadata?.glowScale;
      const glowTint = mesh?.metadata?.glowTint ?? { r: 1, g: 1, b: 1 };
      if (typeof glowScale !== "number") {
        result.set(0, 0, 0, 0);
        return;
      }

      const emissiveColor = material.emissiveColor ?? Color3.Black();
      const emissiveIntensity = material.emissiveIntensity ?? 1;
      result.set(
        emissiveColor.r * emissiveIntensity * glowScale * glowTint.r,
        emissiveColor.g * emissiveIntensity * glowScale * glowTint.g,
        emissiveColor.b * emissiveIntensity * glowScale * glowTint.b,
        Math.min(1, material.alpha ?? 1),
      );
    };
  }

  _getGlowScaleForMaterial(materialName = "") {
    const glowScales = new Map([
      [this.materials.spotlightLens.name, 3.25],
      [this.materials.shopOuterFloorLightLens.name, 1.65],
      [this.materials.gateLight.name, 1.18],
      [this.materials.light.name, 1.02],
      [this.materials.softLight.name, 0.5],
      [this.materials.ceilingSoftLight.name, 0.46],
      [this.materials.coolLight.name, 1.14],
      [this.materials.softCoolLight.name, 0.44],
      [this.materials.platformBlueLight.name, 0.78],
      [this.materials.softPlatformBlueLight.name, 0.3],
      [this.materials.shopWarmLight.name, 0.9],
      [this.materials.softShopWarmLight.name, 0.34],
      [this.materials.softGateLight.name, 0.4],
    ]);
    return glowScales.get(materialName) ?? null;
  }

  _getGlowTintForMaterial(materialName = "") {
    const coolBlueTint = { r: 0.9, g: 0.98, b: 1.18 };
    const subtleBlueTint = { r: 0.94, g: 1, b: 1.1 };
    const glowTints = new Map([
      [this.materials.spotlightLens.name, { r: 0.84, g: 0.94, b: 1.28 }],
      [this.materials.shopOuterFloorLightLens.name, coolBlueTint],
      [this.materials.gateLight.name, coolBlueTint],
      [this.materials.light.name, coolBlueTint],
      [this.materials.softLight.name, subtleBlueTint],
      [this.materials.ceilingSoftLight.name, subtleBlueTint],
      [this.materials.coolLight.name, { r: 0.88, g: 0.98, b: 1.22 }],
      [this.materials.softCoolLight.name, { r: 0.9, g: 1, b: 1.18 }],
      [this.materials.platformBlueLight.name, { r: 0.86, g: 0.96, b: 1.26 }],
      [this.materials.softPlatformBlueLight.name, { r: 0.9, g: 1, b: 1.18 }],
      [this.materials.shopWarmLight.name, subtleBlueTint],
      [this.materials.softShopWarmLight.name, subtleBlueTint],
      [this.materials.softGateLight.name, coolBlueTint],
    ]);
    return glowTints.get(materialName) ?? { r: 1, g: 1, b: 1 };
  }

  _registerGlowEmitter(mesh, material = mesh?.material) {
    if (!this.glow || !mesh || mesh.isDisposed?.() || !material) {
      return;
    }
    const glowScale = this._getGlowScaleForMaterial(material.name ?? "");
    if (typeof glowScale !== "number") {
      return;
    }
    mesh.metadata = {
      ...(mesh.metadata ?? {}),
      glowScale,
      glowTint: this._getGlowTintForMaterial(material.name ?? ""),
    };
    this.glow.addIncludedOnlyMesh(mesh);
  }

  _registerGlowOccluder(mesh, material = mesh?.material) {
    if (!this.glow || !mesh || mesh.isDisposed?.() || !material) {
      return;
    }
    if (typeof this._getGlowScaleForMaterial(material.name ?? "") === "number") {
      return;
    }
    if (material.disableDepthWrite) {
      return;
    }
    if (typeof material.needAlphaBlendingForMesh === "function" && material.needAlphaBlendingForMesh(mesh)) {
      return;
    }
    if ((material.alpha ?? 1) < 0.98) {
      return;
    }

    mesh.metadata = {
      ...(mesh.metadata ?? {}),
      glowOccluder: true,
    };
    this.glow.addIncludedOnlyMesh(mesh);
  }

  /**
   * Forces shader compilation on each unique material+mesh pair NOW (during
   * streaming, when this mannequin isn't visible yet) instead of letting
   * Babylon lazy-compile on first render. Lazy compilation causes a
   * 50-200ms main-thread stall the first time a newly-enabled mannequin
   * is rendered, which on tightly distance-culled scenes produces visible
   * FPS oscillation (3-4 → 34-35) every time the user walks past a
   * culling threshold. Pre-warming moves that cost to streaming time.
   *
   * forceCompilationAsync is non-blocking — it queues the compile and
   * returns a promise; we don't await it. Errors are swallowed because
   * compilation of an unused material isn't worth crashing the load.
   */
  _prewarmMaterialShaders(renderMeshes) {
    const seen = new Set();
    for (const mesh of renderMeshes) {
      const mat = mesh.material;
      if (!mat || seen.has(mat)) continue;
      seen.add(mat);
      if (typeof mat.forceCompilationAsync !== "function") continue;
      try {
        mat.forceCompilationAsync(mesh).catch(() => {});
      } catch {}
    }
  }

  _buildLighting() {
    const keyLightPosition = new Vector3(-14, 8.36, 84);
    const keyLight = new SpotLight(
      "shadow-service-light-no-illumination",
      keyLightPosition,
      new Vector3(0.18, -1, -0.08),
      Math.PI * 0.58,
      20,
      this.scene,
    );
    keyLight.diffuse = Color3.FromHexString("#fff4e1");
    keyLight.specular = Color3.FromHexString("#ffffff");
    keyLight.intensity = 0.92;

    this.shadowGenerator = new ShadowGenerator(EXPERIENCE_PROFILE.shadowMapSize, keyLight);
    this.shadowGenerator.useBlurExponentialShadowMap = EXPERIENCE_PROFILE.shadowBlurKernel > 0;
    this.shadowGenerator.blurKernel = EXPERIENCE_PROFILE.shadowBlurKernel;
    // Shadow map refresh: every-frame on strong GPUs (refreshRate=0). On
    // constrained, refresh every 2nd frame (refreshRate=1) — shadow casters
    // here are mostly static + frozen so per-frame re-render is wasted cost.
    this.shadowGenerator.getShadowMap().refreshRate =
      EXPERIENCE_PROFILE.constrainedPerformance ? 1 : 0;
  }

  _captureSceneAdditions(buildFn) {
    const meshStart = this.scene.meshes.length;
    const lightStart = this.scene.lights.length;
    const transformNodeStart = this.scene.transformNodes.length;
    const result = buildFn();

    return {
      result,
      meshes: this.scene.meshes.slice(meshStart),
      lights: this.scene.lights.slice(lightStart),
      transformNodes: this.scene.transformNodes.slice(transformNodeStart),
    };
  }

  _registerDistanceGroup(
    name,
    anchor,
    {
      // Tightened from 92/58 → 68/36. Showroom is ~95m long end-to-end, so
      // 92m meant "always enabled" for most groups. 68m mesh / 36m light
      // means a mannequin disappears when you're ~70m past it (still well
      // beyond visible range) and stops contributing its 4-5 spotlights to
      // per-pixel light selection at ~40m. Cuts fragment shader cost in
      // dense corridor views proportionally to lights culled, which on
      // constrained tier translates to a real FPS recovery without any
      // visible pop-in (the meshes only blink when far behind you).
      meshDistance = 68,
      lightDistance = 36,
      meshHysteresis = this.optimizationConfig.meshHysteresis,
      lightHysteresis = this.optimizationConfig.lightHysteresis,
    } = {},
    additions,
  ) {
    const meshes = additions.meshes ?? [];
    const lights = additions.lights ?? [];
    const transformNodes = additions.transformNodes ?? [];

    if (!meshes.length && !lights.length && !transformNodes.length) {
      return additions.result;
    }

    const nodeSet = new Set(transformNodes);
    const meshSet = new Set(meshes);
    const nodes = transformNodes.filter((node) => {
      const parent = node.parent;
      return !parent || (!nodeSet.has(parent) && !meshSet.has(parent));
    });
    this.distanceGroups.push({
      name,
      anchor: anchor.clone ? anchor.clone() : new Vector3(anchor.x, anchor.y, anchor.z),
      meshEnterDistance: meshDistance,
      meshExitDistance: meshDistance + meshHysteresis,
      lightEnterDistance: lightDistance,
      lightExitDistance: lightDistance + lightHysteresis,
      nodes,
      meshes,
      lights: lights.map((light) => ({
        light,
        intensity: light.intensity ?? 0,
      })),
      meshesEnabled: true,
      lightsEnabled: true,
    });

    return additions.result;
  }

  _registerDistanceGroupFromBuild(name, anchor, config, buildFn) {
    return this._registerDistanceGroup(name, anchor, config, this._captureSceneAdditions(buildFn));
  }

  _applyDistanceGroupNodesEnabled(group, enabled) {
    if (group.meshesEnabled === enabled) {
      return;
    }

    if (enabled) {
      for (const node of group.nodes) {
        if (!node || node.isDisposed?.()) {
          continue;
        }
        node.setEnabled(true);
      }
    }

    for (const mesh of group.meshes) {
      if (!mesh || mesh.isDisposed?.()) {
        continue;
      }
      if (!mesh.isEnabled()) {
        mesh.setEnabled(true);
      }
      mesh.isVisible = enabled;
    }

    if (!enabled) {
      for (const node of group.nodes) {
        if (!node || node.isDisposed?.()) {
          continue;
        }
        node.setEnabled(false);
      }
    }

    group.meshesEnabled = enabled;
  }

  _applyDistanceGroupLightsEnabled(group, enabled) {
    if (group.lightsEnabled === enabled) {
      return;
    }

    for (const entry of group.lights) {
      const { light, intensity } = entry;
      if (!light || light.isDisposed?.()) {
        continue;
      }
      // Keep lights registered so materials do not recompile while walking.
      light.intensity = enabled ? intensity : 0;
    }

    group.lightsEnabled = enabled;
  }

  _updateDeferredModelLoads(cameraPosition, delta = 0) {
    if (!this.deferredModelLoadTasks.length) {
      return;
    }
    if (this.deferredModelLoadActiveCount >= this.deferredModelLoadMaxParallel) {
      return;
    }

    this.deferredModelLoadClock += delta;
    if (this.deferredModelLoadClock < this.deferredModelLoadInterval) {
      return;
    }
    this.deferredModelLoadClock = 0;

    while (this.deferredModelLoadActiveCount < this.deferredModelLoadMaxParallel) {
      const taskIndex = this.deferredModelLoadTasks.findIndex((task) => {
        const effectiveLoadDistance = Math.min(task.loadDistance, this.deferredModelLoadDistanceLimit);
        return Math.abs(task.anchorZ - cameraPosition.z) <= effectiveLoadDistance;
      });
      if (taskIndex < 0) {
        return;
      }

      const [task] = this.deferredModelLoadTasks.splice(taskIndex, 1);
      this.deferredModelLoadActiveCount += 1;
      task
        .loadModel()
        .catch((error) => {
          console.warn("Could not load deferred mannequin model", error);
        })
        .finally(() => {
          this.deferredModelLoadActiveCount -= 1;
        });
    }
  }

  _updateDistanceOptimization(cameraPosition, delta = 0) {
    this.distanceOptimizationClock += delta;
    if (
      this.distanceOptimizationClock < this.optimizationConfig.updateInterval &&
      Math.abs(cameraPosition.z - this.lastOptimizationCameraZ) < this.optimizationConfig.cameraMoveThreshold
    ) {
      return;
    }

    this.distanceOptimizationClock = 0;
    this.lastOptimizationCameraZ = cameraPosition.z;

    for (const group of this.distanceGroups) {
      const distance = Math.abs(group.anchor.z - cameraPosition.z);
      const nextMeshesEnabled = group.meshesEnabled
        ? distance <= group.meshExitDistance
        : distance <= group.meshEnterDistance;
      const nextLightsEnabled = group.lightsEnabled
        ? distance <= group.lightExitDistance
        : distance <= group.lightEnterDistance;
      this._applyDistanceGroupNodesEnabled(group, nextMeshesEnabled);
      this._applyDistanceGroupLightsEnabled(group, nextLightsEnabled);
    }

    if (this.floorReflection) {
      this._updateFloorReflectionWindow();
    }
  }

  _updateFloorReflectionWindow() {
    if (!this.floorReflection && (!this.shopPedestalTopReflections || this.shopPedestalTopReflections.length === 0)) {
      return;
    }

    // On constrained GPUs the mirror cost scales linearly with renderList size.
    // Filter to a tight z-window around the active camera — meshes more than ~30m
    // away read as a wash of pixels through a heavy blurKernel anyway, so we
    // gain nothing by including them and pay the full draw cost. Strong-tier
    // GPUs keep the full list since they can afford it.
    const camera = this.scene.activeCamera;
    const cameraZ = camera?.position?.z;
    const useTightWindow = EXPERIENCE_PROFILE.constrainedPerformance && typeof cameraZ === "number";
    const windowDepth = 30;

    const renderList = this.floorReflectionCandidates.filter((mesh) => {
      if (!mesh || mesh.isDisposed?.() || !mesh.material || !mesh.isEnabled() || !mesh.isVisible) {
        return false;
      }
      if (useTightWindow) {
        const meshZ = mesh.absolutePosition?.z ?? mesh.position?.z ?? 0;
        if (Math.abs(meshZ - cameraZ) > windowDepth) {
          return false;
        }
      }
      return true;
    });
    if (this.floorReflection) {
      this.floorReflection.renderList = renderList;
    }
    for (const reflection of this.shopPedestalTopReflections ?? []) {
      if (reflection) {
        reflection.renderList = renderList;
      }
    }
  }

  _isStableFloorReflectionCandidate(mesh) {
    if (!mesh || mesh.isDisposed?.() || !mesh.material || mesh.name.startsWith("welcome-fade-particle")) {
      return false;
    }

    const materialName = mesh.material.name ?? "";
    const excludedMaterialNames = new Set([
      this.materials.gateLight.name,
      this.materials.light.name,
      this.materials.softLight.name,
      this.materials.ceilingSoftLight.name,
      this.materials.coolLight.name,
      this.materials.softCoolLight.name,
      this.materials.platformBlueLight.name,
      this.materials.softPlatformBlueLight.name,
      this.materials.shopWarmLight.name,
      this.materials.softShopWarmLight.name,
      this.materials.softGateLight.name,
      this.materials.shopOuterFloorLightLens.name,
      this.materials.shopOuterFloorLightWash.name,
      this.materials.spotlightLens.name,
      this.materials.glass.name,
    ]);
    if (excludedMaterialNames.has(materialName)) {
      return false;
    }

    const lowerName = mesh.name.toLowerCase();
    if (
      lowerName.includes("led") ||
      lowerName.includes("light") ||
      lowerName.includes("lens") ||
      lowerName.includes("glass") ||
      lowerName.includes("top-cap")
    ) {
      return false;
    }

    return ![
      "300m-black-terrazzo-floor",
      "continuous-graphite-ceiling",
      "north-double-height-marble-ceiling",
      "premium-hall-entry-ceiling-bridge",
    ].includes(mesh.name);
  }

  _getShopPedestalTopMaterialForSurfaceY(surfaceY) {
    const key = surfaceY.toFixed(3);
    const existing = this.shopPedestalTopMaterials.get(key);
    if (existing) {
      return existing;
    }

    const material = this.materials.shopPedestalSilverTop.clone(`dark-silver-shop-pedestal-top-${key}`);

    // Per-pedestal mirrors are pure luxury polish — disabled entirely on
    // constrained tier. Floor mirror (above) is already enough reflectivity.
    if (EXPERIENCE_PROFILE.enablePedestalReflections) {
      const reflection = new MirrorTexture(`shop-pedestal-top-reflection-${key}`, 384, this.scene, true);
      reflection.mirrorPlane = new Plane(0, -1, 0, Number(key));
      reflection.level = 0.42;
      reflection.blurKernel = 10;
      material.reflectionTexture = reflection;
      this.shopPedestalTopReflections.push(reflection);
    }
    material.microSurface = 0.9;
    material.environmentIntensity = 0.6;

    this.shopPedestalTopMaterials.set(key, material);
    this._updateFloorReflectionWindow();
    return material;
  }

  _freezeStaticScene() {
    for (const mesh of this.scene.meshes) {
      if (!mesh || mesh.isDisposed?.() || mesh.name.startsWith("welcome-fade-particle")) {
        continue;
      }
      mesh.freezeWorldMatrix();
    }
    // (Static-world shader pre-warm was tried via _prewarmMaterialShaders here
    //  in commit ee3506f. It triggered async shader compilation on materials
    //  that include the floor's MirrorTexture as reflectionTexture, racing
    //  with the mirror's own render pass and reintroducing the
    //  GL_INVALID_OPERATION feedback loop we had killed in Pass C. Reverted.
    //  Streamed-mannequin pre-warm in _loadMannequinModel is kept — those
    //  materials don't reference the mirror texture.)
  }

  _createVisibleLightMarker(name, position, diameter) {
    const housing = MeshBuilder.CreateCylinder(
      `${name}-visible-ceiling-housing`,
      { diameter, height: 0.16, tessellation: 32 },
      this.scene,
    );
    housing.position.copyFrom(position);
    housing.position.y += 0.1;
    housing.material = this.materials.gateStone;
    housing.receiveShadows = true;
    this._registerGlowOccluder(housing, housing.material);

    const lens = MeshBuilder.CreateCylinder(
      `${name}-visible-ceiling-lens`,
      { diameter: diameter * 0.68, height: 0.035, tessellation: 32 },
      this.scene,
    );
    lens.position.copyFrom(position);
    lens.material = this.materials.spotlightLens;
    lens.receiveShadows = false;
    this._registerGlowEmitter(lens, lens.material);
  }

  _addBox(name, position, size, material, { collide = true, shadow = true } = {}) {
    const mesh = MeshBuilder.CreateBox(name, size, this.scene);
    mesh.position.copyFrom(position);
    mesh.material = material;
    mesh.receiveShadows = true;
    mesh.metadata = {
      ...(mesh.metadata ?? {}),
      isNavigationBlocker: collide,
    };
    this._registerGlowEmitter(mesh, material);
    this._registerGlowOccluder(mesh, material);

    if (shadow) {
      this.shadowCasters.push(mesh);
      this.shadowGenerator.addShadowCaster(mesh);
    }

    if (collide) {
      this.colliders.push(aabb(position.x, position.z, size.width, size.depth, 0.08));
    }

    return mesh;
  }

  /** Short cylinder plinth; bottom sits on `floorY`, center XZ at (`cx`, `cz`). */
  _addCircularPedestal(
    name,
    cx,
    cz,
    radius,
    height,
    floorY,
    material,
    {
      collide = true,
      shadow = true,
      topMaterial = null,
      topThickness = 0.055,
      topReflective = false,
      showcaseTarget = null,
    } = {},
  ) {
    const bodyHeight = topMaterial ? Math.max(0.06, height - topThickness) : height;
    const mesh = MeshBuilder.CreateCylinder(
      name,
      { diameter: radius * 2, height: bodyHeight, tessellation: 32 },
      this.scene,
    );
    mesh.position.set(cx, floorY + bodyHeight * 0.5, cz);
    mesh.material = material;
    mesh.receiveShadows = true;
    mesh.metadata = {
      ...(mesh.metadata ?? {}),
      isNavigationBlocker: collide,
    };
    this._registerGlowOccluder(mesh, material);
    this._assignShowcaseTarget(mesh, showcaseTarget);
    if (shadow) {
      this.shadowCasters.push(mesh);
      this.shadowGenerator.addShadowCaster(mesh);
    }
    if (topMaterial) {
      const topSurfaceY = floorY + height;
      const resolvedTopMaterial = topReflective
        ? this._getShopPedestalTopMaterialForSurfaceY(topSurfaceY)
        : topMaterial;
      const topCap = MeshBuilder.CreateCylinder(
        `${name}-top-cap`,
        { diameter: radius * 1.96, height: topThickness, tessellation: 32 },
        this.scene,
      );
      topCap.position.set(cx, floorY + bodyHeight + topThickness * 0.5, cz);
      topCap.material = resolvedTopMaterial;
      topCap.receiveShadows = true;
      topCap.metadata = {
        ...(topCap.metadata ?? {}),
        isNavigationBlocker: collide,
      };
      this._registerGlowOccluder(topCap, resolvedTopMaterial);
      this._assignShowcaseTarget(topCap, showcaseTarget);
      if (shadow) {
        this.shadowCasters.push(topCap);
        this.shadowGenerator.addShadowCaster(topCap);
      }
    }
    if (collide) {
      this.colliders.push(aabb(cx, cz, radius * 2, radius * 2, 0.06));
    }
    return mesh;
  }

  _addGround(name, position, size, material, { faceDown = false } = {}) {
    const mesh = MeshBuilder.CreateGround(
      name,
      { width: size.width, height: size.depth, subdivisions: 24 },
      this.scene,
    );
    mesh.position.copyFrom(position);
    if (faceDown) {
      mesh.rotation.x = Math.PI;
    }
    mesh.material = material;
    mesh.receiveShadows = true;
    mesh.metadata = {
      ...(mesh.metadata ?? {}),
      isNavigableFloor: !faceDown,
    };
    return mesh;
  }

  _addWallPlane(name, position, size, rotationY, material) {
    const mesh = MeshBuilder.CreatePlane(name, { width: size.width, height: size.height }, this.scene);
    mesh.position.copyFrom(position);
    mesh.rotation.y = rotationY;
    mesh.material = material;
    mesh.receiveShadows = true;
    mesh.metadata = {
      ...(mesh.metadata ?? {}),
      isNavigationBlocker: true,
    };
    this._registerGlowEmitter(mesh, material);
    return mesh;
  }

  _createShopExteriorFloorUplights(backExteriorX, z, sign, side) {
    const fixtureX = backExteriorX - sign * 0.28;
    const washX = backExteriorX - sign * 0.03;
    const wallRotation = sign < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;

    for (const [index, zOffset] of [-8.6, 8.6].entries()) {
      const fixtureZ = z + zOffset;

      const housing = MeshBuilder.CreateCylinder(
        `${side}-outer-floor-light-housing-${z}-${index}`,
        { diameter: 0.62, height: 0.052, tessellation: 24 },
        this.scene,
      );
      housing.position.set(fixtureX, 0.026, fixtureZ);
      housing.material = this.materials.gateStone;
      housing.receiveShadows = false;

      const trim = MeshBuilder.CreateCylinder(
        `${side}-outer-floor-light-trim-${z}-${index}`,
        { diameter: 0.48, height: 0.016, tessellation: 24 },
        this.scene,
      );
      trim.position.set(fixtureX, 0.041, fixtureZ);
      trim.material = this.materials.black;
      trim.receiveShadows = false;

      const lens = MeshBuilder.CreateCylinder(
        `${side}-outer-floor-light-lens-${z}-${index}`,
        { diameter: 0.38, height: 0.012, tessellation: 24 },
        this.scene,
      );
      lens.position.set(fixtureX, 0.05, fixtureZ);
      lens.material = this.materials.shopOuterFloorLightLens;
      lens.receiveShadows = false;
      this._registerGlowEmitter(lens, lens.material);

      const wash = this._addWallPlane(
        `${side}-outer-floor-light-wash-${z}-${index}`,
        new Vector3(washX, 2.52, fixtureZ),
        { width: 4.2, height: 5.05 },
        wallRotation,
        this.materials.shopOuterFloorLightWash,
      );
      wash.receiveShadows = false;
    }
  }

  _buildShell() {
    const playableCenterZ = 100.5;
    const playableDepth = 99;
    const northBoundaryZ = 51;

    this._addGround(
      "playable-black-terrazzo-floor",
      new Vector3(0, 0, playableCenterZ),
      { width: 96, depth: playableDepth },
      this.materials.floor,
    );

    this._addBox(
      "west-showroom-wall",
      new Vector3(-48, 4.6, playableCenterZ),
      { width: 3, height: 9.2, depth: playableDepth },
      this.materials.mainHallLongWall,
    );
    this._addBox(
      "east-showroom-wall",
      new Vector3(48, 4.6, playableCenterZ),
      { width: 3, height: 9.2, depth: playableDepth },
      this.materials.mainHallLongWall,
    );
    this._addBox(
      "north-showroom-wall",
      new Vector3(0, 4.6, northBoundaryZ),
      { width: 96, height: 9.2, depth: 3 },
      this.materials.mainHallWideWall,
    );
    this._addBox(
      "south-showroom-entry-wall",
      new Vector3(0, 4.6, 150),
      { width: 96, height: 9.2, depth: 3 },
      this.materials.mainHallWideWall,
    );

    this._addWallPlane(
      "west-showroom-wall-premium-inner-face",
      new Vector3(-46.48, 4.6, playableCenterZ),
      { width: playableDepth, height: 9.2 },
      Math.PI * 0.5,
      this.materials.mainHallLongWall,
    );
    this._addWallPlane(
      "east-showroom-wall-premium-inner-face",
      new Vector3(46.48, 4.6, playableCenterZ),
      { width: playableDepth, height: 9.2 },
      -Math.PI * 0.5,
      this.materials.mainHallLongWall,
    );
    this._addWallPlane(
      "north-showroom-wall-premium-inner-face",
      new Vector3(0, 4.6, northBoundaryZ + 1.52),
      { width: 96, height: 9.2 },
      0,
      this.materials.mainHallWideWall,
    );
    this._addWallPlane(
      "south-showroom-wall-premium-inner-face",
      new Vector3(0, 4.6, 148.48),
      { width: 96, height: 9.2 },
      Math.PI,
      this.materials.mainHallWideWall,
    );
  }

  _buildMallPlan() {
    // Only keep the first boutique row and entrance showcase inside the reduced playable area.
    const bays = [76];
    const entranceShowcaseZ = 86;
    for (const z of bays) {
      this._buildBoutiqueBay(-32, z, "west");
      this._buildBoutiqueBay(32, z, "east");
    }

    for (const z of [entranceShowcaseZ]) {
      this._addBox(
        `central-display-island-${z}`,
        new Vector3(0, 0.45, z),
        { width: 10, height: 0.9, depth: 5.5 },
        this.materials.centerPlatformStoneMetal,
      );
      this._addBox(
        `champagne-display-top-${z}`,
        new Vector3(0, 0.96, z),
        { width: 10.5, height: 0.14, depth: 6 },
        this.materials.centerPlatformStoneMetal,
        { collide: false },
      );
      this._registerDistanceGroupFromBuild(
        `center-platform-dedolights-${z}`,
        new Vector3(0, 1.4, z),
        { meshDistance: 72, lightDistance: 52 },
        () => {
          this._addCenterPlatformDedolights(z);
        },
      );

      if (z === entranceShowcaseZ) {
        this._registerDistanceGroupFromBuild(
          `center-platform-mannequin-${z}`,
          new Vector3(0, 2.4, z),
          { meshDistance: 78, lightDistance: 0 },
          () => {
            const mainSlots = [
              { pos: new Vector3(0, 0, z),     yaw: 0 },
              { pos: new Vector3(-3.05, 0, z), yaw: -Math.PI * 0.5 },
              { pos: new Vector3(3.05, 0, z),  yaw: Math.PI * 0.5 },
            ];
            const opts = { includePlatform: false, platformTopY: 1.03, mobileHero: true };
            for (let i = 0; i < mainSlots.length; i++) {
              const { pos, yaw } = mainSlots[i];
              const pinnedUrl = this.mainAreaModelUrls[i] ?? null;
              if (pinnedUrl) {
                this._createMannequin(pos, yaw, 4.2, pinnedUrl, opts);
              } else {
                this._createUniqueSceneMannequin(pos, yaw, 4.2, opts);
              }
            }
          },
        );
      }
    }
  }

  _addCenterPlatformDedolights(platformZ) {
    const xPositions = [-3.7, 0, 3.7];
    const sideConfigs = [
      { label: "upper", zOffset: -6.35 },
      { label: "bottom", zOffset: 6.35 },
    ];

    for (const side of sideConfigs) {
      this._addBox(
        `center-platform-${side.label}-dedolight-track-${platformZ}`,
        new Vector3(0, 8.82, platformZ + side.zOffset),
        { width: 9.4, height: 0.08, depth: 0.12 },
        this.materials.gateStone,
        { collide: false },
      );

      for (const x of xPositions) {
        const lightPosition = new Vector3(x, 8.18, platformZ + side.zOffset);
        const target = new Vector3(x * 0.5, 0.35, platformZ);
        const direction = target.subtract(lightPosition).normalize();
        const name = `center-platform-${side.label}-dedolight-${x}`;
        const zAim = side.zOffset < 0 ? 1 : -1;
        const tiltX = side.zOffset < 0 ? -Math.PI * 0.3 : Math.PI * 0.3;

        const light = new SpotLight(
          name,
          lightPosition,
          direction,
          Math.PI * 0.18 * MODEL_DEDOLIGHT_ANGLE_SCALE,
          18,
          this.scene,
        );
        light.diffuse = Color3.FromHexString("#fff3c2");
        light.specular = Color3.FromHexString("#ffffff");
        light.intensity = 460 * MODEL_DEDOLIGHT_INTENSITY_SCALE;
        light.range = 20 * MODEL_DEDOLIGHT_RANGE_SCALE;

        this._addBox(
          `${name}-track-stem`,
          new Vector3(x, 8.55, platformZ + side.zOffset),
          { width: 0.075, height: 0.5, depth: 0.075 },
          this.materials.gateStone,
          { collide: false },
        );
        this._addBox(
          `${name}-swivel-yoke`,
          new Vector3(x, 8.34, platformZ + side.zOffset),
          { width: 0.72, height: 0.08, depth: 0.12 },
          this.materials.gateStone,
          { collide: false },
        );

        const fixture = MeshBuilder.CreateCylinder(
          `${name}-angled-can`,
          { diameter: 0.5, height: 0.72, tessellation: 32 },
          this.scene,
        );
        fixture.position.copyFrom(lightPosition);
        fixture.rotation.x = tiltX;
        fixture.material = this.materials.gateStone;
        fixture.receiveShadows = true;

        const frontRim = MeshBuilder.CreateCylinder(
          `${name}-front-rim`,
          { diameter: 0.56, height: 0.055, tessellation: 32 },
          this.scene,
        );
        frontRim.position = new Vector3(x, 8.0, platformZ + side.zOffset + zAim * 0.28);
        frontRim.rotation.x = tiltX;
        frontRim.material = this.materials.gateStone;
        frontRim.receiveShadows = true;

        const lens = MeshBuilder.CreateCylinder(
          `${name}-lens`,
          { diameter: 0.43, height: 0.035, tessellation: 32 },
          this.scene,
        );
        lens.position = new Vector3(x, 7.96, platformZ + side.zOffset + zAim * 0.31);
        lens.rotation.x = tiltX;
        lens.material = this.materials.spotlightLens;
        lens.receiveShadows = false;
        this._registerGlowEmitter(lens, lens.material);
      }
    }
  }

  _buildEntryGate() {
    const gateZ = 104;
    const southFaceZ = gateZ + 1.39;
    const sideWallInnerFaceX = 46.5;
    const gateOuterFaceX = 7.95 + 3.05 * 0.5;

    for (const x of [-7.95, 7.95]) {
      this._addBox(
        `south-entry-gate-column-${x}`,
        new Vector3(x, 4.35, gateZ),
        { width: 3.05, height: 8.7, depth: 2.75 },
        this.materials.gateStone,
      );
    }

    this._addBox(
      "south-entry-gate-header",
      new Vector3(0, 7.48, gateZ),
      { width: 18.9, height: 2.05, depth: 2.75 },
      this.materials.gateStone,
      { collide: false },
    );

    for (const side of [-1, 1]) {
      const closureInnerEdgeX = side * gateOuterFaceX;
      const closureOuterEdgeX = side * sideWallInnerFaceX;
      const closureCenterX = (closureInnerEdgeX + closureOuterEdgeX) * 0.5;
      const closureWidth = Math.abs(closureOuterEdgeX - closureInnerEdgeX) + 0.08;
      this._addBox(
        `south-entry-side-closure-wall-${side < 0 ? "west" : "east"}`,
        new Vector3(closureCenterX, 4.6, gateZ),
        { width: closureWidth, height: 9.2, depth: 2.75 },
        this.materials.mainHallWideWall,
      );
    }

    // Main corridor wall boxes keep the inner faces unchanged.
    for (const x of [-8.18, 8.4]) {
      this._addBox(
        `south-entry-tight-hall-wall-${x}`,
        new Vector3(x, 3.55, 126.75),
        { width: 2.1, height: 7.1, depth: 43.5 },
        this.materials.corridorWall03,
      );
    }
    this._addBox(
      "south-entry-east-outer-wall-flipped-texture",
      new Vector3(-9.25, 3.55, 126.75),
      { width: 0.035, height: 7.1, depth: 43.5 },
      this.materials.corridorWall03FlipY,
      { collide: false },
    );
    this._addBox(
      "south-entry-west-inner-wall-flipped-texture",
      new Vector3(7.33, 3.55, 126.75),
      { width: 0.035, height: 7.1, depth: 43.5 },
      this.materials.corridorWall03FlipY,
      { collide: false },
    );
    this._addBox(
      "south-entry-tight-hall-back-wall-texture",
      new Vector3(0, 4.9, 148.42),
      { width: 96, height: 9.8, depth: 0.12 },
      this.materials.corridorBackWall03,
      { collide: false },
    );
    this._registerDistanceGroupFromBuild(
      "first-boutique-platforms",
      new Vector3(0, 0.55, 59.5),
      { meshDistance: 88, lightDistance: 78 },
      () => {
        this._buildBackWallOuterPlatforms();
      },
    );
    // These framed wall panels are part of the player's first impression at spawn,
    // so keep them built and visible unconditionally instead of tying them to the
    // distance-group system.
    this._buildEntryCorridorWallPresence();

    for (const z of [124, 136]) {
      this._addBox(
        `south-entry-ceiling-light-${z}`,
        new Vector3(0, 8.2, z),
        { width: 13.4, height: 0.018, depth: 0.36 },
        this.materials.softCoolLight,
        { collide: false, shadow: false },
      );
    }

    for (const x of [-6.22, 6.22]) {
      this._addBox(
        `south-entry-gate-vertical-led-${x}`,
        new Vector3(x, 3.3, southFaceZ + 0.035),
        { width: 0.12, height: 5.95, depth: 0.12 },
        this.materials.softGateLight,
        { collide: false, shadow: false },
      );
    }

    this._addBox(
      "south-entry-gate-top-led",
      new Vector3(0, 6.27, southFaceZ + 0.03),
      { width: 12.45, height: 0.12, depth: 0.16 },
      this.materials.softGateLight,
      { collide: false, shadow: false },
    );
    this._addBox(
      "south-entry-gate-upper-linear-led",
      new Vector3(0, 8.52, southFaceZ + 0.035),
      { width: 18.5, height: 0.12, depth: 0.18 },
      this.materials.softGateLight,
      { collide: false, shadow: false },
    );
    this._addBox(
      "south-entry-gate-left-outer-led",
      new Vector3(-9.45, 4.35, southFaceZ + 0.035),
      { width: 0.14, height: 8.35, depth: 0.14 },
      this.materials.softGateLight,
      { collide: false, shadow: false },
    );
    this._addBox(
      "south-entry-gate-right-outer-led",
      new Vector3(9.45, 4.35, southFaceZ + 0.035),
      { width: 0.14, height: 8.35, depth: 0.14 },
      this.materials.softGateLight,
      { collide: false, shadow: false },
    );
    this._createTracked3DText("south-entry-gate-title", "GIA", new Vector3(0, 6.99, southFaceZ + 0.09), {
      width: 5.7,
      targetHeight: 0.76,
      depth: 0.06,
      rotationY: Math.PI,
      material: this.materials.entryGateTitleLetters,
      fontData: optimerRegularFontData,
      resolution: 42,
      fillWidth: false,
      tracking: 0.14,
    });

    // Promote z=108/119/130 corridor pairs to `critical: true` so they load
    // eagerly at scene-ready instead of streaming-on-approach. These are the
    // entry-corridor mannequins the user sees IMMEDIATELY on landing — empty
    // pedestals at spawn read as "broken showroom" even when streaming is
    // working. Was loadDistance:140 (lazy); now critical (preload).
    for (const z of [108]) {
      this._createUniqueSceneMannequin(new Vector3(-5.65, 0, z), 0.68, 4.05, {
        critical: true,
      });
      this._createUniqueSceneMannequin(new Vector3(5.65, 0, z), -0.68, 4.05, {
        critical: true,
      });
    }
    this._addGateMannequinSpotlight(-5.65, 108);
    this._addGateMannequinSpotlight(5.65, 108);

    // The entrance corridor mannequin slots are visible immediately at spawn.
    // Build them eagerly and keep the nearest pair on the same logic/offset as
    // the rest of the corridor mannequins so the first empty-looking spot is
    // rebuilt exactly like the others.
    for (const z of [119, 130]) {
      if (z === 119) {
        this._createUniqueSceneMannequin(new Vector3(-5.65, 0, z), 0.68, 4.05, {
          critical: true,
        });
        this._createUniqueSceneMannequin(new Vector3(5.65, 0, z), -0.68, 4.05, {
          critical: true,
        });
        this._addGateMannequinSpotlight(-5.65, z);
        this._addGateMannequinSpotlight(5.65, z);
      } else if (z === 130) {
        this._createUniqueSceneMannequin(new Vector3(-5.65, 0, z), 0.68, 4.05, {
          critical: true,
        });
        this._createUniqueSceneMannequin(new Vector3(5.65, 0, z), -0.68, 4.05, {
          critical: true,
        });
        this._addGateMannequinSpotlight(-5.65, z, {
          targetY: 2.2,
          intensity: 1120,
          range: 18,
          angle: Math.PI * 0.16,
          diffuse: "#ffe7bc",
        });
        this._addGateMannequinSpotlight(5.65, z, {
          targetY: 2.2,
          intensity: 1120,
          range: 18,
          angle: Math.PI * 0.16,
          diffuse: "#ffe7bc",
        });
      }
    }

    // The nearest corridor pair sits right on the spawn line. Pull it slightly
    // farther into the corridor and a touch inward so it stays inside the
    // player's first frame instead of landing on the camera edge.
    const firstEntryPairZ = 140.25;
    for (const [x, yaw] of [
      [-5.05, 0.68],
      [5.05, -0.68],
    ]) {
      this._createMannequinPlatform(new Vector3(x, 0, firstEntryPairZ));
      this._addGateMannequinSpotlight(x, firstEntryPairZ, {
        targetY: 2.05,
        intensity: 1080,
        range: 17,
        angle: Math.PI * 0.15,
        diffuse: "#ffe7bc",
      });
      this._createUniqueSceneMannequin(new Vector3(x, 0, firstEntryPairZ), yaw, 4.05, {
        critical: true,
        includePlatform: false,
      });
    }
  }

  _addEntryPlatformDedolight(x, z) {
    const side = x < 0 ? "left" : "right";
    const name = `entry-platform-dedolight-${side}-${z}`;
    const lightPosition = new Vector3(x, 8.35, z - 0.28);
    const target = new Vector3(x, 0.45, z);
    const direction = target.subtract(lightPosition).normalize();

    const light = new SpotLight(
      name,
      lightPosition,
      direction,
      Math.PI * 0.13 * MODEL_DEDOLIGHT_ANGLE_SCALE,
      24,
      this.scene,
    );
    light.diffuse = Color3.FromHexString("#fff0db");
    light.specular = Color3.FromHexString("#ffffff");
    light.intensity = 520 * MODEL_DEDOLIGHT_INTENSITY_SCALE;
    light.range = 15 * MODEL_DEDOLIGHT_RANGE_SCALE;

    const fixture = MeshBuilder.CreateCylinder(
      `${name}-fixture`,
      { diameter: 0.72, height: 0.18, tessellation: 24 },
      this.scene,
    );
    fixture.position.copyFrom(lightPosition);
    fixture.position.y += 0.25;
    fixture.material = this.materials.gateStone;
    fixture.receiveShadows = true;

    const lens = MeshBuilder.CreateCylinder(
      `${name}-lens`,
      { diameter: 0.5, height: 0.035, tessellation: 32 },
      this.scene,
    );
    lens.position.copyFrom(lightPosition);
    lens.position.y += 0.13;
    lens.material = this.materials.spotlightLens;
    lens.receiveShadows = false;
    this._registerGlowEmitter(lens, lens.material);
  }

  _buildBackWallOuterPlatforms() {
    // Line up all 8 mannequins beside the closure wall, centered between the first shop pair.
    const showcaseRowZ = 59.5;
    const showcaseRowXs = [-15.75, -11.25, -6.75, -2.25, 2.25, 6.75, 11.25, 15.75];

    for (const x of showcaseRowXs) {
      // Critical: these 8 are highly visible in the user's spawn-line-of-sight
      // down the corridor toward the back wall. Empty pedestals here read as
      // "the showroom is broken" on first impression. Loading screen extends
      // ~10-15s for these 8 — acceptable trade for delivery quality.
      this._createUniqueSceneMannequin(new Vector3(x, 0, showcaseRowZ), 0, 4.05, {
        critical: true,
      });
      this._addBackWallPlatformDedolight(x, showcaseRowZ);
    }
  }

  _addBackWallPlatformDedolight(x, z) {
    const name = `back-wall-platform-dedolight-${x < 0 ? "east" : "west"}-${Math.abs(x)}-${z}`;
    const lightPosition = new Vector3(x, 8.35, z - 0.28);
    const target = new Vector3(x, 0.35, z);
    const direction = target.subtract(lightPosition).normalize();

    const light = new SpotLight(
      name,
      lightPosition,
      direction,
      Math.PI * 0.12 * MODEL_DEDOLIGHT_ANGLE_SCALE,
      24,
      this.scene,
    );
    light.diffuse = Color3.FromHexString("#fff0db");
    light.specular = Color3.FromHexString("#ffffff");
    light.intensity = 320 * MODEL_DEDOLIGHT_INTENSITY_SCALE;
    light.range = 12 * MODEL_DEDOLIGHT_RANGE_SCALE;

    const fixture = MeshBuilder.CreateCylinder(
      `${name}-fixture`,
      { diameter: 0.58, height: 0.16, tessellation: 24 },
      this.scene,
    );
    fixture.position.copyFrom(lightPosition);
    fixture.position.y += 0.18;
    fixture.material = this.materials.gateStone;
    fixture.receiveShadows = true;

    const lens = MeshBuilder.CreateCylinder(
      `${name}-lens`,
      { diameter: 0.4, height: 0.035, tessellation: 32 },
      this.scene,
    );
    lens.position.copyFrom(lightPosition);
    lens.position.y += 0.07;
    lens.material = this.materials.spotlightLens;
    lens.receiveShadows = false;
    this._registerGlowEmitter(lens, lens.material);
  }

  _addShowroomWallPlatformDedolight(x, z) {
    const side = x < 0 ? "west" : "east";
    const name = `showroom-wall-platform-dedolight-${side}-${Math.abs(x)}-${z}`;
    const lightPosition = new Vector3(x, 8.28, z - 0.22);
    const target = new Vector3(x * 0.92, 0.38, z);
    const direction = target.subtract(lightPosition).normalize();

    const light = new SpotLight(
      name,
      lightPosition,
      direction,
      Math.PI * 0.13 * MODEL_DEDOLIGHT_ANGLE_SCALE,
      24,
      this.scene,
    );
    light.diffuse = Color3.FromHexString("#fff0db");
    light.specular = Color3.FromHexString("#ffffff");
    light.intensity = 340 * MODEL_DEDOLIGHT_INTENSITY_SCALE;
    light.range = 12.5 * MODEL_DEDOLIGHT_RANGE_SCALE;

    const fixture = MeshBuilder.CreateCylinder(
      `${name}-fixture`,
      { diameter: 0.58, height: 0.16, tessellation: 24 },
      this.scene,
    );
    fixture.position.copyFrom(lightPosition);
    fixture.position.y += 0.18;
    fixture.material = this.materials.gateStone;
    fixture.receiveShadows = true;

    const lens = MeshBuilder.CreateCylinder(
      `${name}-lens`,
      { diameter: 0.4, height: 0.035, tessellation: 32 },
      this.scene,
    );
    lens.position.copyFrom(lightPosition);
    lens.position.y += 0.07;
    lens.material = this.materials.spotlightLens;
    lens.receiveShadows = false;
    this._registerGlowEmitter(lens, lens.material);
  }

  _buildEntryCorridorWallPresence() {
    for (const side of [-1, 1]) {
      const wallX = side < 0 ? -7.02 : 7.02;

      for (const [index, z] of [116, 128, 140].entries()) {
        this._createEntryProminencePanel(side, wallX, z, index);
      }
    }

  }

  _createEntryProminencePanel(side, wallX, z, index) {
    const prefix = `south-entry-prominence-${side}-${z}`;
    const faceX = wallX - side * 0.12;
    const trimX = wallX - side * 0.22;
    const centerY = 4.02;
    const imageHeight = 4.05;
    const imageWidth = imageHeight * 1.5;
    const frameHeight = imageHeight + 0.28;
    const frameDepth = imageWidth + 0.28;
    const frameHalfDepth = frameDepth * 0.5;
    const frameTopY = centerY + frameHeight * 0.5;
    const frameBottomY = centerY - frameHeight * 0.5;
    const panelMaterials = [
      this.materials.corridorPanel01,
      this.materials.corridorPanel02,
      this.materials.corridorPanel03,
    ];
    const panelMaterial = panelMaterials[(index + (side > 0 ? 1 : 0)) % panelMaterials.length];

    // Inner corridor frame wall texture: same glossy black stone material as the entry gate.
    this._addBox(
      `${prefix}-raised-main-slab`,
      new Vector3(wallX, 4.08, z),
      { width: 0.18, height: 6.5, depth: 8.3 },
      this.materials.gateStone,
      { collide: false },
    );

    // Inner corridor picture texture: decorative immersive panel image inside the frame.
    const imagePanel = MeshBuilder.CreatePlane(
      `${prefix}-immersive-image-panel`,
      { width: imageWidth, height: imageHeight, sideOrientation: 2 /* DOUBLESIDE */ },
      this.scene,
    );
    imagePanel.position = new Vector3(trimX + side * 0.065, centerY, z + 0.02);
    imagePanel.rotation.y = side > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
    imagePanel.material = panelMaterial;
    imagePanel.receiveShadows = false;

    this._addBox(
      `${prefix}-front-shadow-reveal`,
      new Vector3(trimX, centerY, z - frameHalfDepth),
      { width: 0.035, height: frameHeight, depth: 0.12 },
      this.materials.black,
      { collide: false },
    );
    this._addBox(
      `${prefix}-rear-shadow-reveal`,
      new Vector3(trimX, centerY, z + frameHalfDepth),
      { width: 0.035, height: frameHeight, depth: 0.12 },
      this.materials.black,
      { collide: false },
    );
    this._addBox(
      `${prefix}-bottom-shadow-reveal`,
      new Vector3(trimX, frameBottomY, z),
      { width: 0.035, height: 0.12, depth: frameDepth },
      this.materials.black,
      { collide: false },
    );
    this._addBox(
      `${prefix}-top-shadow-reveal`,
      new Vector3(trimX, frameTopY, z),
      { width: 0.035, height: 0.12, depth: frameDepth },
      this.materials.black,
      { collide: false },
    );

    const ledX = trimX - side * 0.018;
    for (const [name, lineZ] of [
      ["front", z - imageWidth * 0.5],
      ["rear", z + imageWidth * 0.5],
    ]) {
      this._addBox(
        `${prefix}-${name}-picture-border-led`,
        new Vector3(ledX, centerY, lineZ),
        { width: 0.055, height: imageHeight, depth: 0.055 },
        this.materials.softCoolLight,
        { collide: false, shadow: false },
      );
    }
    for (const [name, lineY] of [
      ["bottom", centerY - imageHeight * 0.5],
      ["top", centerY + imageHeight * 0.5],
    ]) {
      this._addBox(
        `${prefix}-${name}-picture-border-led`,
        new Vector3(ledX, lineY, z),
        { width: 0.055, height: 0.055, depth: imageWidth },
        this.materials.softCoolLight,
        { collide: false, shadow: false },
      );
    }

    this._addBox(
      `${prefix}-floor-base-plinth`,
      new Vector3(faceX, 0.55, z),
      { width: 0.1, height: 0.55, depth: 7.05 },
      this.materials.gateStone,
      { collide: false },
    );
  }

  _addGateMannequinSpotlight(x, z, options = {}) {
    const {
      targetY = 1.95,
      intensity = 860,
      range = 16,
      angle = Math.PI * 0.13,
      exponent = 26,
      diffuse = "#ffe1b0",
    } = options;
    const lightPosition = new Vector3(x, 8.35, z - 0.35);
    const target = new Vector3(x, targetY, z);
    const direction = target.subtract(lightPosition).normalize();
    const side = x < 0 ? "left" : "right";

    const light = new SpotLight(
      `gate-mannequin-dedolight-${side}-${z}`,
      lightPosition,
      direction,
      angle * MODEL_DEDOLIGHT_ANGLE_SCALE,
      exponent,
      this.scene,
    );
    light.diffuse = Color3.FromHexString(diffuse);
    light.specular = Color3.FromHexString("#ffffff");
    light.intensity = intensity * MODEL_DEDOLIGHT_INTENSITY_SCALE;
    light.range = range * MODEL_DEDOLIGHT_RANGE_SCALE;

    const fixture = MeshBuilder.CreateCylinder(
      `gate-mannequin-dedolight-fixture-${side}-${z}`,
      { diameter: 0.72, height: 0.18, tessellation: 24 },
      this.scene,
    );
    fixture.position.copyFrom(lightPosition);
    fixture.position.y += 0.25;
    fixture.material = this.materials.gateStone;
    fixture.receiveShadows = true;

    const lens = MeshBuilder.CreateCylinder(
      `gate-mannequin-dedolight-lens-${side}-${z}`,
      { diameter: 0.5, height: 0.035, tessellation: 32 },
      this.scene,
    );
    lens.position.copyFrom(lightPosition);
    lens.position.y += 0.13;
    lens.material = this.materials.spotlightLens;
    lens.receiveShadows = false;
    this._registerGlowEmitter(lens, lens.material);
  }

 _tuneImportedMannequinMaterial(material, seenMaterials, sourceUrl = null) {
    if (!material || seenMaterials.has(material)) {
      return;
    }
    seenMaterials.add(material);

    if (typeof material.maxSimultaneousLights === "number") {
      // Allow up to 6 simultaneous lights so every dedicated dedolight above
      // the model reaches it (key light + up to 5 spot dedolights).
      material.maxSimultaneousLights = 6;
    }
    if (typeof material.disableLighting === "boolean") {
      material.disableLighting = false;
    }

    if (material instanceof PBRMaterial) {
      // ── Full PBR rendering ──────────────────────────────────────────────────
      // The previous approach forced unlit=true and routed all textures through
      // the emissive channel. That completely bypassed the PBR lighting pipeline,
      // producing flat, sketch-like models with no shading, depth, or highlights.
      // Real PBR lets the scene's dedolights, ambient light, and normal maps work
      // together to render models with proper depth and material quality.
      material.unlit = false;
      material.backFaceCulling = false;
      material.twoSidedLighting = true;

      // ── albedoColor guard ───────────────────────────────────────────────────
      // AI-generated GLBs (Meshy AI, etc.) sometimes export baseColorFactor as
      // [0,0,0,1] (black) when a baseColorTexture carries all the colour.
      // In a PBR-lit scene this makes the model appear nearly invisible.
      // When an albedo texture is present and the color multiplier is very dark,
      // normalise it to white so the texture renders at its intended brightness.
      if (material.albedoTexture) {
        const c = material.albedoColor;
        if ((c.r * 0.299 + c.g * 0.587 + c.b * 0.114) < 0.08) {
          material.albedoColor = Color3.White();
        }
      }

      // ── emissive channel ────────────────────────────────────────────────────
      // Keep the GLB's emissive texture and color exactly as exported.
      // Models that bake their design into emissive (emissiveColor=[1,1,1] +
      // emissiveTexture) will show the design clearly on top of PBR lighting.
      // Models with no emissive: zero it out to prevent a spurious uniform glow.
      const hasEmissiveTex = !!material.emissiveTexture;
      const ec = material.emissiveColor;
      const hasEmissiveColor = ec && (ec.r > 0.02 || ec.g > 0.02 || ec.b > 0.02);
      if (hasEmissiveTex && !hasEmissiveColor) {
        // Texture present but color is black — force white so the texture shows.
        material.emissiveColor = Color3.White();
        material.emissiveIntensity = 1;
      } else if (!hasEmissiveTex && !hasEmissiveColor) {
        // No emissive at all — make sure it stays off.
        material.emissiveColor = Color3.Black();
        material.emissiveIntensity = 0;
      }
      // If both texture and color are present, leave them exactly as the GLB set them.

      // ── roughness floor ─────────────────────────────────────────────────────
      // Without an HDR environment texture, perfectly smooth surfaces (roughness
      // near 0) appear as featureless black mirrors. Clamp to a minimum so
      // glossy fabrics read like fabric rather than chrome.
      if (typeof material.roughness === "number" && material.roughness < 0.15) {
        material.roughness = 0.15;
      }

      // ── environment reflection ──────────────────────────────────────────────
      // Without an .env / HDR file the default environment contributes nothing.
      // A moderate environmentIntensity with the scene's ambient colour keeps
      // PBR from looking completely flat in the absence of an HDR probe.
      // Bumped 0.35 → 0.45 — post the backdrop-filter cost cut we have iGPU
      // headroom to spend on a slightly richer PBR look on the garments.
      material.environmentIntensity = 0.45;

      // ── anisotropic texture filtering ───────────────────────────────────────
      // Babylon's GLB loader leaves textures at the default aniso=4, which
      // produces visible blur on garment textures at inspect-mode viewing
      // angles (~0.5-1.5m). Aniso 8 on iGPU / 16 on strong GPUs sharpens
      // grazing-angle detail (lace, beading, fabric weave) at near-zero cost.
      const targetAniso = EXPERIENCE_PROFILE.constrainedPerformance ? 8 : 16;
      const tx = [
        material.albedoTexture,
        material.bumpTexture,
        material.metallicTexture,
        material.metallicRoughnessTexture,
        material.emissiveTexture,
        material.ambientTexture,
      ];
      for (const t of tx) {
        if (t && typeof t.anisotropicFilteringLevel === "number") {
          t.anisotropicFilteringLevel = targetAniso;
        }
      }

      // ── disable unsupported / expensive features ────────────────────────────
      // anisotropy (the PBR BRDF anisotropy feature — different from texture
      // aniso filtering above) stays off — it's a costly BRDF eval mostly
      // used for brushed metal, not garments.
      material.clearCoat.isEnabled = false;
      material.sheen.isEnabled = false;
      material.iridescence.isEnabled = false;
      material.anisotropy.isEnabled = false;
      material.subSurface.isEnabled = false;

      // ── transparency ────────────────────────────────────────────────────────
      // Do NOT key off albedoTexture.hasAlpha — most AI-generated GLBs export
      // 4-channel textures where the alpha carries AO/roughness data (or is
      // simply 255 padding), not actual transparency. Forcing ALPHABLEND on
      // those makes the mesh nearly invisible.
      const usesTransparency = material.alpha < 1 || material.opacityTexture != null;
      if (usesTransparency) {
        material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
      } else {
        material.transparencyMode = PBRMaterial.PBRMATERIAL_OPAQUE;
      }

      return;
    }

    if (material instanceof StandardMaterial) {
      // Keep the diffuse texture; zero out any emissive wash.
      material.emissiveColor = Color3.Black();
      if (material.specularColor) {
        material.specularColor = Color3.FromHexString("#222222");
      }
      return;
    }

    if (Array.isArray(material.subMaterials)) {
      for (const subMaterial of material.subMaterials) {
        this._tuneImportedMannequinMaterial(subMaterial, seenMaterials);
      }
    }
  }

  _getStorefrontMetrics(x, sign, storefrontOpeningDepth) {
    const storefrontFaceX = x - sign * 10.75;
    const storefrontFrameThickness = 0.2;
    const storefrontFrameCenterX = storefrontFaceX + sign * (storefrontFrameThickness * 0.5);
    const storefrontFrameVisibleFaceX = storefrontFaceX - sign * 0.012;
    const storefrontHeaderY = 6.18;
    const storefrontHeaderHeight = 1.15;
    const storefrontPlinthY = 0.28;
    const storefrontPlinthHeight = 0.56;
    const storefrontOpeningTopY = storefrontHeaderY - storefrontHeaderHeight * 0.5;
    const storefrontOpeningBottomY = storefrontPlinthY + storefrontPlinthHeight * 0.5;
    const storefrontOpeningCenterY = (storefrontOpeningTopY + storefrontOpeningBottomY) * 0.5;
    const storefrontOpeningHeight = storefrontOpeningTopY - storefrontOpeningBottomY;
    const storefrontStoneDepth = storefrontOpeningDepth + 0.6;
    const storefrontSideJambDepth = 0.3;
    const storefrontSideJambZOffset = storefrontStoneDepth * 0.5 - storefrontSideJambDepth * 0.5;

    return {
      storefrontFaceX,
      storefrontFrameThickness,
      storefrontFrameCenterX,
      storefrontFrameVisibleFaceX,
      storefrontHeaderY,
      storefrontHeaderHeight,
      storefrontPlinthY,
      storefrontPlinthHeight,
      storefrontOpeningTopY,
      storefrontOpeningBottomY,
      storefrontOpeningCenterY,
      storefrontOpeningHeight,
      storefrontStoneDepth,
      storefrontSideJambDepth,
      storefrontSideJambZOffset,
    };
  }

  _buildBoutiqueBay(x, z, side) {
    const sign = side === "west" ? -1 : 1;
    const isEntranceBoutique = z === 76;
    const storefrontOpeningDepth = 22.2;
    const storefrontGlassDepth = storefrontOpeningDepth - 0.24;
    const storefrontGlassThickness = 0.12;
    const storefrontGlassInsetX = 0.08;
    const storefrontGlassInsetY = 0.1;
    const storefrontMetrics = this._getStorefrontMetrics(x, sign, storefrontOpeningDepth);
    const storefrontGlassX =
      storefrontMetrics.storefrontFaceX + sign * (storefrontGlassInsetX + storefrontGlassThickness * 0.5);
    const storefrontGlassHeight = storefrontMetrics.storefrontOpeningHeight - storefrontGlassInsetY * 2;

    this._addBox(
      `${side}-glass-front-${z}`,
      new Vector3(storefrontGlassX, storefrontMetrics.storefrontOpeningCenterY, z),
      { width: storefrontGlassThickness, height: storefrontGlassHeight, depth: storefrontGlassDepth },
      this.materials.glass,
      { collide: false, shadow: false },
    );
    this._addBox(
      `${side}-boutique-back-wall-${z}`,
      new Vector3(x + sign * 11.5, 3.6, z),
      { width: 1.2, height: 7.2, depth: 30 },
      this.materials.shopWall,
    );
    this._addBox(
      `${side}-boutique-north-partition-${z}`,
      new Vector3(x, 3.6, z - 15),
      { width: 24, height: 7.2, depth: 1.2 },
      this.materials.shopWall,
    );
    this._addBox(
      `${side}-boutique-south-partition-${z}`,
      new Vector3(x, 3.6, z + 15),
      { width: 24, height: 7.2, depth: 1.2 },
      this.materials.shopWall,
    );
    this._addShopInteriorWallTiling(x, z, sign, side);
    this._addGround(
      `${side}-boutique-light-stone-floor-${z}`,
      new Vector3(x + sign * 0.48, 0.018, z),
      { width: 20.75, depth: 24.35 },
      this.materials.shopFloorStone,
    );
    this._addShopExteriorStoneCladding(x, z, sign, side, storefrontOpeningDepth);
    this._registerDistanceGroupFromBuild(
      `${side}-boutique-detail-${z}`,
      new Vector3(x, 2.8, z),
      { meshDistance: 78, lightDistance: 46 },
      () => {
        this._createStorefrontLightFrame(x, z, sign, side, storefrontOpeningDepth);
        this._addBox(
          `${side}-wall-light-${z}`,
          new Vector3(x + sign * 10.88, 5.2, z),
          { width: 0.09, height: 0.05, depth: 17 },
          this.materials.softShopWarmLight,
          { collide: false, shadow: false },
        );
        if (isEntranceBoutique) {
          this._buildShopInteriorDisplay(x, z, sign, side);
        }
      },
    );
  }

  _addShopInteriorWallTiling(x, z, sign, side) {
    const wallCenterY = 3.6;

    this._addWallPlane(
      `${side}-boutique-back-wall-full-height-tiles-${z}`,
      new Vector3(x + sign * 10.88, wallCenterY, z),
      { width: 30, height: 7.2 },
      sign < 0 ? Math.PI * 0.5 : -Math.PI * 0.5,
      this.materials.shopWallBackTiled,
    );
    this._addWallPlane(
      `${side}-boutique-north-partition-full-height-tiles-${z}`,
      new Vector3(x, wallCenterY, z - 14.38),
      { width: 24, height: 7.2 },
      0,
      this.materials.shopWallPartitionTiled,
    );
    this._addWallPlane(
      `${side}-boutique-south-partition-full-height-tiles-${z}`,
      new Vector3(x, wallCenterY, z + 14.38),
      { width: 24, height: 7.2 },
      Math.PI,
      this.materials.shopWallPartitionTiled,
    );
  }

  _addShopExteriorStoneCladding(x, z, sign, side, storefrontOpeningDepth) {
    const backExteriorX = x + sign * 12.13;
    const visibleFaceOffset = 0.07;
    const backWallFaceOffset = 0.084;
    const storefrontMetrics = this._getStorefrontMetrics(x, sign, storefrontOpeningDepth);
    const storefrontFrameMaterial = this.materials.entrySideFoundationWall;
    const exteriorVisibleWallMaterial =
      side === "west" ? this.materials.shopExteriorWallWest : this.materials.shopExteriorWall;

    this._addBox(
      `${side}-outside-back-stone-${z}`,
      new Vector3(backExteriorX, 3.62, z),
      { width: 0.1, height: 7.24, depth: 30.2 },
      exteriorVisibleWallMaterial,
      { collide: false },
    );
    this._addWallPlane(
      `${side}-outside-back-stone-visible-face-${z}`,
      new Vector3(backExteriorX - sign * backWallFaceOffset, 3.62, z),
      { width: 30.2, height: 7.24 },
      sign < 0 ? Math.PI * 0.5 : -Math.PI * 0.5,
      exteriorVisibleWallMaterial,
    );
    this._createShopExteriorFloorUplights(backExteriorX, z, sign, side);
    this._addBox(
      `${side}-outside-north-partition-stone-${z}`,
      new Vector3(x, 3.62, z - 15.66),
      { width: 24.2, height: 7.24, depth: 0.1 },
      this.materials.black,
      { collide: false },
    );
    this._addWallPlane(
      `${side}-outside-north-partition-visible-face-${z}`,
      new Vector3(x, 3.62, z - 15.66 - visibleFaceOffset),
      { width: 24.2, height: 7.24 },
      Math.PI,
      exteriorVisibleWallMaterial,
    );
    this._addBox(
      `${side}-outside-south-partition-stone-${z}`,
      new Vector3(x, 3.62, z + 15.66),
      { width: 24.2, height: 7.24, depth: 0.1 },
      this.materials.black,
      { collide: false },
    );
    this._addWallPlane(
      `${side}-outside-south-partition-visible-face-${z}`,
      new Vector3(x, 3.62, z + 15.66 + visibleFaceOffset),
      { width: 24.2, height: 7.24 },
      0,
      exteriorVisibleWallMaterial,
    );
    this._addBox(
      `${side}-outside-storefront-header-stone-${z}`,
      new Vector3(storefrontMetrics.storefrontFrameCenterX, storefrontMetrics.storefrontHeaderY, z),
      {
        width: storefrontMetrics.storefrontFrameThickness,
        height: storefrontMetrics.storefrontHeaderHeight,
        depth: storefrontMetrics.storefrontStoneDepth,
      },
      storefrontFrameMaterial,
      { collide: false },
    );
    this._addWallPlane(
      `${side}-outside-storefront-header-visible-face-${z}`,
      new Vector3(storefrontMetrics.storefrontFrameVisibleFaceX, storefrontMetrics.storefrontHeaderY, z),
      { width: storefrontMetrics.storefrontStoneDepth, height: storefrontMetrics.storefrontHeaderHeight },
      sign < 0 ? Math.PI * 0.5 : -Math.PI * 0.5,
      storefrontFrameMaterial,
    );
    this._addBox(
      `${side}-outside-storefront-plinth-stone-${z}`,
      new Vector3(storefrontMetrics.storefrontFrameCenterX, storefrontMetrics.storefrontPlinthY, z),
      {
        width: storefrontMetrics.storefrontFrameThickness,
        height: storefrontMetrics.storefrontPlinthHeight,
        depth: storefrontMetrics.storefrontStoneDepth,
      },
      storefrontFrameMaterial,
      { collide: false },
    );
    this._addWallPlane(
      `${side}-outside-storefront-plinth-visible-face-${z}`,
      new Vector3(storefrontMetrics.storefrontFrameVisibleFaceX, storefrontMetrics.storefrontPlinthY, z),
      { width: storefrontMetrics.storefrontStoneDepth, height: storefrontMetrics.storefrontPlinthHeight },
      sign < 0 ? Math.PI * 0.5 : -Math.PI * 0.5,
      storefrontFrameMaterial,
    );

    for (const [edge, zOffset] of [
      ["north", -storefrontMetrics.storefrontSideJambZOffset],
      ["south", storefrontMetrics.storefrontSideJambZOffset],
    ]) {
      this._addBox(
        `${side}-outside-storefront-${edge}-jamb-stone-${z}`,
        new Vector3(storefrontMetrics.storefrontFrameCenterX, storefrontMetrics.storefrontOpeningCenterY, z + zOffset),
        {
          width: storefrontMetrics.storefrontFrameThickness,
          height: storefrontMetrics.storefrontOpeningHeight,
          depth: storefrontMetrics.storefrontSideJambDepth,
        },
        storefrontFrameMaterial,
        { collide: false },
      );
      this._addWallPlane(
        `${side}-outside-storefront-${edge}-jamb-visible-face-${z}`,
        new Vector3(
          storefrontMetrics.storefrontFrameVisibleFaceX,
          storefrontMetrics.storefrontOpeningCenterY,
          z + zOffset,
        ),
        { width: storefrontMetrics.storefrontSideJambDepth, height: storefrontMetrics.storefrontOpeningHeight },
        sign < 0 ? Math.PI * 0.5 : -Math.PI * 0.5,
        storefrontFrameMaterial,
      );
    }
  }

  _createStorefrontLightFrame(x, z, sign, side, storefrontOpeningDepth) {
    const storefrontMetrics = this._getStorefrontMetrics(x, sign, storefrontOpeningDepth);
    const ledThickness = 0.08;
    const ledInsetX = 0.035;
    const ledInsetY = 0.14;
    const ledX = storefrontMetrics.storefrontFaceX + sign * (ledInsetX + ledThickness * 0.5);
    const ledDepth = storefrontOpeningDepth - 0.12;
    const ledVerticalHeight = storefrontMetrics.storefrontOpeningHeight - ledInsetY * 2;

    this._addBox(
      `${side}-storefront-left-led-${z}`,
      new Vector3(ledX, storefrontMetrics.storefrontOpeningCenterY, z - ledDepth * 0.5),
      { width: ledThickness, height: ledVerticalHeight, depth: ledThickness },
      this.materials.softCoolLight,
      { collide: false, shadow: false },
    );
    this._addBox(
      `${side}-storefront-right-led-${z}`,
      new Vector3(ledX, storefrontMetrics.storefrontOpeningCenterY, z + ledDepth * 0.5),
      { width: ledThickness, height: ledVerticalHeight, depth: ledThickness },
      this.materials.softCoolLight,
      { collide: false, shadow: false },
    );
    this._addBox(
      `${side}-storefront-top-led-${z}`,
      new Vector3(ledX, storefrontMetrics.storefrontOpeningTopY - ledInsetY, z),
      { width: ledThickness, height: ledThickness, depth: ledDepth },
      this.materials.softCoolLight,
      { collide: false, shadow: false },
    );
    this._addBox(
      `${side}-storefront-bottom-led-${z}`,
      new Vector3(ledX, storefrontMetrics.storefrontOpeningBottomY + ledInsetY, z),
      { width: ledThickness, height: ledThickness, depth: ledDepth },
      this.materials.softCoolLight,
      { collide: false, shadow: false },
    );
  }

  /**
   * Concentrate all boutique interior products into the first entrance-side shop pair only.
   */
  _buildShopInteriorDisplay(x, z, sign, side) {
    const displayLayouts = [
      { key: "north-back", xShift: sign * 5.2, zShift: -6.3 },
      { key: "south-back", xShift: sign * 5.2, zShift: 6.3 },
      { key: "north-front", xShift: -sign * 5.2, zShift: -6.3 },
      { key: "south-front", xShift: -sign * 5.2, zShift: 6.3 },
    ];

    for (const layout of displayLayouts) {
      this._buildShopInteriorDisplayCluster(x, z, sign, side, layout);
    }
  }

  _buildShopInteriorDisplayCluster(x, z, sign, side, { key, xShift = 0, zShift = 0 }) {
    const floorCx = x + sign * 0.48;
    const floorY = 0.018;
    const plinthMat = this.materials.shopPedestalSilver;
    const plinthTopMat = this.materials.shopPedestalSilverTop;
    const mannequinYaw = sign < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
    const accessoryPreferredAngle = sign < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;

    const displayCx = floorCx - sign * 1.12 + xShift;
    const shoeYaw = sign * 0.18;
    const standTopEpsilon = 0.012;
    const pedestals = [
      {
        suffix: "north-bag",
        px: displayCx + sign * 0.78,
        pz: z + zShift - 3.12,
        radius: 0.5,
        height: 1.38,
        kind: "bag",
      },
      {
        suffix: "south-bag",
        px: displayCx + sign * 0.78,
        pz: z + zShift + 3.12,
        radius: 0.48,
        height: 1.26,
        kind: "bag",
      },
      {
        suffix: "shoe",
        px: displayCx - sign * 3.05,
        pz: z + zShift,
        radius: 0.46,
        height: 1.45,
        kind: "shoe",
      },
    ];

    for (const p of pedestals) {
      const topY = floorY + p.height + standTopEpsilon;
      if (p.kind === "bag") {
        const url = this._takeNextShowroomBagModelUrl();
        if (url) {
          const showcaseTarget = this._createShowcaseTarget({
            kind: "bag",
            label: "Inspect bag",
            focusPoint: new Vector3(p.px, topY + 0.24, p.pz),
            orbitRadius: 2.05,
            cameraY: 1.74,
            orbitSpeed: 0.28,
            preferredAngle: accessoryPreferredAngle,
            sourceFileName: getAssetFileName(url),
          });
          this._addCircularPedestal(
            `${side}-shop-round-pedestal-${key}-${p.suffix}-${z}`,
            p.px,
            p.pz,
            p.radius * SHOP_OCCUPIED_PEDESTAL_RADIUS_SCALE,
            p.height,
            floorY,
            plinthMat,
            { collide: true, shadow: true, topMaterial: plinthTopMat, showcaseTarget },
          );
          this._queueShowroomAccessoryLoad(new Vector3(p.px, topY, p.pz), Math.PI * 0.5, url, {
            kind: "bag",
            maxDimension: getShowroomBagMaxDimension(url),
            loadDistance: 76,
            showcaseTarget,
          });
        }
      } else if (p.kind === "shoe") {
        const shoeUrl = this._takeNextShowroomShoeModelUrl();
        if (shoeUrl) {
          const showcaseTarget = this._createShowcaseTarget({
            kind: "shoe",
            label: "Inspect shoe",
            focusPoint: new Vector3(p.px, topY + 0.18, p.pz),
            orbitRadius: 1.9,
            cameraY: 1.68,
            orbitSpeed: 0.32,
            preferredAngle: accessoryPreferredAngle,
            sourceFileName: getAssetFileName(shoeUrl),
          });
          this._addCircularPedestal(
            `${side}-shop-round-pedestal-${key}-${p.suffix}-${z}`,
            p.px,
            p.pz,
            p.radius * SHOP_OCCUPIED_PEDESTAL_RADIUS_SCALE,
            p.height,
            floorY,
            plinthMat,
            { collide: true, shadow: true, topMaterial: plinthTopMat, showcaseTarget },
          );
          this._queueShowroomAccessoryLoad(new Vector3(p.px, topY, p.pz), shoeYaw, shoeUrl, {
            kind: "shoe",
            maxDimension: getShowroomShoeMaxDimension(shoeUrl),
            loadDistance: 76,
            showcaseTarget,
          });
        }
      }
    }

    const mannequinX = floorCx + sign * 4.45;
    const mannequinShiftedX = mannequinX + xShift;
    // Shop-floor mannequins visible through the shop windows from the
    // corridor — critical-preload so the side shops aren't empty on entry.
    this._createUniqueSceneMannequin(new Vector3(mannequinShiftedX, floorY, z + zShift - 3.35), mannequinYaw, 4.05, {
      critical: true,
    });
    this._createUniqueSceneMannequin(new Vector3(mannequinShiftedX, floorY, z + zShift + 3.35), mannequinYaw, 4.05, {
      critical: true,
    });
  }

  _createWelcomeParticles(position) {
    const material = new StandardMaterial("welcome-particle-material", this.scene);
    material.diffuseColor = Color3.FromHexString("#efe6d4");
    material.emissiveColor = Color3.FromHexString("#8f8066");
    material.alpha = 0.48;
    material.backFaceCulling = false;

    const pseudoRandom = (index, salt) => {
      const value = Math.sin(index * 91.13 + salt * 37.71) * 10000;
      return value - Math.floor(value);
    };

    for (let i = 0; i < 42; i += 1) {
      const particle = MeshBuilder.CreatePlane(
        `welcome-fade-particle-${i}`,
        { width: 0.022 + pseudoRandom(i, 1) * 0.032, height: 0.022 + pseudoRandom(i, 2) * 0.032 },
        this.scene,
      );
      particle.material = material;
      particle.rotation.y = Math.PI;
      particle.isVisible = false;
      particle.metadata = {
        baseX: (pseudoRandom(i, 3) - 0.5) * 10.4,
        baseY: (pseudoRandom(i, 4) - 0.5) * 1.85,
        driftX: (pseudoRandom(i, 5) - 0.5) * 0.42,
        driftY: (pseudoRandom(i, 6) - 0.5) * 0.32,
        phase: pseudoRandom(i, 7) * Math.PI * 2,
      };
      particle.position.set(
        position.x + particle.metadata.baseX,
        position.y + particle.metadata.baseY,
        position.z + 0.09,
      );
      this.welcomeParticles.push(particle);
    }
  }

  _updateWelcomeParticles(delta) {
    if (this.welcomeParticles.length === 0) {
      return;
    }

    this.welcomeParticleClock += delta;
    const transitionAmount = Math.sin(this.welcomeOpacity * Math.PI);
    const particleOpacity = Math.pow(Math.max(0, transitionAmount), 1.55) * 0.54;

    for (const particle of this.welcomeParticles) {
      const data = particle.metadata;
      const shimmer = 0.66 + 0.22 * Math.sin(this.welcomeParticleClock * 3.2 + data.phase);
      particle.isVisible = particleOpacity > 0.012;
      particle.visibility = particleOpacity * shimmer;
      particle.position.x = this.welcomeSign.position.x + data.baseX + data.driftX * transitionAmount;
      particle.position.y =
        this.welcomeSign.position.y +
        data.baseY +
        data.driftY * transitionAmount +
        Math.sin(this.welcomeParticleClock * 2.8 + data.phase) * 0.035;
      particle.position.z = this.welcomeSign.position.z + 0.09;
    }
  }

  _buildCeiling() {
    const playableCenterZ = 100.5;
    const playableDepth = 99;

    this._addGround(
      "continuous-graphite-ceiling",
      new Vector3(0, 9.15, playableCenterZ),
      { width: 96, depth: playableDepth },
      this.materials.ceiling,
      { faceDown: true },
    );

    for (const z of [60, 84]) {
      this._addBox(
        `linear-ceiling-light-${z}`,
        new Vector3(0, 8.86, z),
        { width: 34, height: 0.018, depth: 0.42 },
        this.materials.ceilingSoftLight,
        { collide: false, shadow: false },
      );
    }

    for (const x of [-38, 38]) {
      this._addBox(
        `side-cove-light-${x}`,
        new Vector3(x, 8.3, playableCenterZ),
        { width: 0.28, height: 0.018, depth: playableDepth - 3 },
        this.materials.ceilingSoftLight,
        { collide: false, shadow: false },
      );
    }
  }

  _buildPremiumHall() {
    this._addBox(
      "premium-hall-closure-wall",
      new Vector3(0, 4.64, 53),
      { width: 96, height: 9.28, depth: 1.15 },
      this.materials.mainHallWideWall,
    );
  }

  _buildFloorReflections() {
    // ── Tier-gate the floor mirror — the single biggest perf hit for weak GPUs ──
    // Lite mode / `?lite=1` skips the mirror entirely. Constrained drops to 384²
    // (and a 3-frame refresh rate) which is still readable as a reflection on a
    // floor viewed at oblique angles, but is 7× cheaper to render per frame.
    if (!EXPERIENCE_PROFILE.enableFloorReflection) {
      this.materials.floor.microSurface = 0.78;
      this.materials.floor.environmentIntensity = 0.6;
      return;
    }
    // Constrained tier (Intel iGPU laptops): 384² mirror, every-8th-frame refresh.
    // The mirror was the largest per-frame cost in Pass C — full-scene render
    // pass + blur passes were dragging FPS to ~5. 384² + 8-frame interval brings
    // amortized cost down ~10× while a heavy blurKernel hides the lower res.
    // Floor mirror also gets a tight renderList (mannequins + ceiling fixtures
    // only) instead of the full scene, see _refreshFloorReflectionRenderList.
    const mirrorSize = EXPERIENCE_PROFILE.constrainedPerformance ? 384 : 1024;
    const floorReflection = new MirrorTexture("terrazzo-floor-reflection", mirrorSize, this.scene, true);
    floorReflection.mirrorPlane = new Plane(0, -1, 0, 0);
    // Reflection presence dial bumped 0.42/0.46 → 0.52/0.56. The reference
    // gallery aesthetic shows a "wet-look" polished black floor that throws
    // sharp mannequin reflections — at 0.42 our floor reads as "slightly
    // glossy stone", at 0.52 it reads as "luxury showroom installation".
    // Blur kernel also tightened so reflections are less washy, more clean.
    floorReflection.level = EXPERIENCE_PROFILE.constrainedPerformance ? 0.52 : 0.56;
    floorReflection.blurKernel = EXPERIENCE_PROFILE.constrainedPerformance ? 12 : 14;
    if (EXPERIENCE_PROFILE.constrainedPerformance) {
      floorReflection.refreshRate = 8;
    }

    this.floorReflectionCandidates = this.scene.meshes.filter((mesh) => this._isStableFloorReflectionCandidate(mesh));
    this.floorReflection = floorReflection;
    this._updateFloorReflectionWindow();

    this.materials.floor.reflectionTexture = floorReflection;
    this.materials.floor.microSurface = 0.86;
    this.materials.floor.environmentIntensity = 0.62;
    this.materials.shopPedestalSilver.reflectionTexture = null;
    this.materials.shopPedestalSilver.environmentIntensity = 0.28;
    this.materials.shopPedestalSilver.microSurface = 0.34;
  }

  _buildShowroomMoments() {
    // Removed the 16 outer shop-front wall platforms.
  }

  _takeNextUniqueSceneMannequinModelUrl() {
    if (this.uniqueSceneMannequinModelUrls.length === 0) return null;
    // Cycle through the pool so every slot always receives a model even when
    // the number of positions exceeds the number of unique assets.
    const url = this.uniqueSceneMannequinModelUrls[this._mannequinModelUrlIndex % this.uniqueSceneMannequinModelUrls.length];
    this._mannequinModelUrlIndex += 1;
    return url ?? null;
  }

  _shouldUseDetailedMannequin(position, options = {}) {
    if (options.forceModel === true) {
      return true;
    }
    // Only the emergency lite tier (?lite=1) substitutes proxy mannequins.
    // Every other tier — including balanced mobile — now shows the real
    // (decimated) garment designs, streamed one-at-a-time via the GLB semaphore.
    // Accessories stay proxied on mobile (see useAccessoryProxies); only the
    // looks themselves render at full detail, since they ARE the product.
    return !this.usePerformanceMannequinProxies;
  }

  _createUniqueSceneMannequin(position, yaw = 0, targetHeight = 4.05, options = {}) {
    if (!this._shouldUseDetailedMannequin(position, options)) {
      this._createMannequin(position, yaw, targetHeight, null, options);
      return true;
    }

    const modelUrl = this._takeNextUniqueSceneMannequinModelUrl();
    if (!modelUrl) {
      this._createMannequinPlatform(position);
      return false;
    }

    this._createMannequin(position, yaw, targetHeight, modelUrl, options);
    return true;
  }

  _createMannequin(position, yaw = 0, targetHeight = 3.15, modelUrl = null, options = {}) {
    const root = new TransformNode(`placeholder-mannequin-${position.x}-${position.z}`, this.scene);
    root.position.copyFrom(position);
    const platformTopY = options.platformTopY ?? 0.39;
    const showcaseTarget = this._createShowcaseTarget({
      kind: "mannequin",
      label: "Inspect look",
      focusPoint: new Vector3(position.x, position.y + platformTopY + targetHeight * 0.56, position.z),
      orbitRadius: clamp(targetHeight * 0.72, 2.7, 3.6),
      cameraY: clamp(position.y + platformTopY + targetHeight * 0.38, 1.78, 2.26),
      orbitSpeed: 0.24,
      preferredAngle: yaw + Math.PI,
    });
    this._assignShowcaseTarget(root, showcaseTarget);

    if (options.includePlatform !== false) {
      this._createMannequinPlatform(position, root, showcaseTarget);
    }

    if (!this._shouldUseDetailedMannequin(position, options)) {
      this._createLightweightMannequinProxy(root, yaw, targetHeight, platformTopY, showcaseTarget);
      return;
    }

    const resolvedModelUrl = modelUrl ?? this._defaultMannequinModelUrl;
    if (showcaseTarget) {
      showcaseTarget.sourceFileName = getAssetFileName(resolvedModelUrl);
    }
    if (!resolvedModelUrl) {
      this._createLightweightMannequinProxy(root, yaw, targetHeight, platformTopY, showcaseTarget);
      return;
    }
    this._mannequinRepairSlots.push({ root, yaw, targetHeight, resolvedModelUrl, platformTopY, showcaseTarget });
    const loadModel = () =>
      this._loadMannequinModel(root, yaw, targetHeight, resolvedModelUrl, platformTopY, showcaseTarget);
    if (options.critical === true) {
      this.pendingModelLoads.push(loadModel());
    } else {
      this.deferredModelLoadTasks.push({
        anchorZ: position.z,
        loadDistance: options.loadDistance ?? 88,
        loadModel,
      });
    }
  }

  /**
   * Sequential repair pass: any slot whose _loadMannequinModel failed all retry
   * attempts will have no "{root.name}-model-root" child. Re-attempt those slots
   * one at a time (leveraging the existing semaphore + retry in _loadMannequinModel).
   * Called by loadingScreen.js after preloadAllDeferredAssets completes.
   */
  async repairMissingMannequins() {
    // Wait for any still-running preload workers to settle before inspecting
    // which slots are truly empty.  Without this, slots that are in-flight
    // look "missing" and get double-loaded, causing a second Babylon.js race.
    if (this._preloadWorkersPromise) {
      await Promise.race([
        this._preloadWorkersPromise,
        new Promise((r) => setTimeout(r, 3000)),
      ]).catch(() => {});
      this._preloadWorkersPromise = null;
    }

    // A model root can have a retry suffix (-r1, -r2) so check with includes
    // rather than endsWith.  Also skip any slot still actively loading.
    const missing = this._mannequinRepairSlots.filter(
      ({ root }) =>
        !this._mannequinLoadingInProgress.has(root) &&
        !root.getChildTransformNodes(true).some((n) => n.name.includes("-model-root")),
    );
    if (missing.length === 0) return;
    console.log(`[ShowroomWorld] Repairing ${missing.length} missing mannequin(s)…`);
    for (const { root, yaw, targetHeight, resolvedModelUrl, platformTopY, showcaseTarget } of missing) {
      // Skip if a concurrent attempt already succeeded while iterating.
      if (
        this._mannequinLoadingInProgress.has(root) ||
        root.getChildTransformNodes(true).some((n) => n.name.includes("-model-root"))
      ) {
        continue;
      }
      await this._loadMannequinModel(root, yaw, targetHeight, resolvedModelUrl, platformTopY, showcaseTarget).catch(
        () => {},
      );
    }
  }

  _createMannequinPlatform(position, root = null, showcaseTarget = null) {
    const platformRoot = root ?? new TransformNode(`mannequin-platform-${position.x}-${position.z}`, this.scene);
    if (!root) {
      platformRoot.position.copyFrom(position);
    }

    const pedestal = MeshBuilder.CreateBox(
      `${platformRoot.name}-square-plinth`,
      { width: 1.65, height: 0.34, depth: 1.65 },
      this.scene,
    );
    pedestal.parent = platformRoot;
    pedestal.position.y = 0.17;
    pedestal.material = this.materials.platformBlack;
    this._assignShowcaseTarget([platformRoot, pedestal], showcaseTarget);

    const platformLights = [
      {
        name: "front",
        position: new Vector3(0, 0.045, -0.84),
        size: { width: 1.68, height: 0.024, depth: 0.1 },
      },
      {
        name: "back",
        position: new Vector3(0, 0.045, 0.84),
        size: { width: 1.68, height: 0.024, depth: 0.1 },
      },
      {
        name: "left",
        position: new Vector3(-0.84, 0.045, 0),
        size: { width: 0.1, height: 0.024, depth: 1.68 },
      },
      {
        name: "right",
        position: new Vector3(0.84, 0.045, 0),
        size: { width: 0.1, height: 0.024, depth: 1.68 },
      },
    ].map((edge) => {
      const light = MeshBuilder.CreateBox(
        `${platformRoot.name}-plinth-${edge.name}-led`,
        edge.size,
        this.scene,
      );
      light.parent = platformRoot;
      light.position.copyFrom(edge.position);
      light.material = this.materials.softPlatformBlueLight;
      this._assignShowcaseTarget(light, showcaseTarget);
      return light;
    });

    for (const mesh of [pedestal, ...platformLights]) {
      this.shadowGenerator.addShadowCaster(mesh);
      mesh.receiveShadows = true;
    }

    this.colliders.push(aabb(position.x, position.z, 1.7, 1.7, 0.2));
    return platformRoot;
  }

  _takeNextShowroomBagModelUrl() {
    return this._showroomBagUrlPool.shift() ?? null;
  }

  _takeNextShowroomShoeModelUrl() {
    return this._showroomShoeUrlPool.shift() ?? null;
  }

  _queueShowroomAccessoryLoad(worldPosition, yawY, modelUrl, options = {}) {
    if (!modelUrl) {
      return;
    }

    if (this.useAccessoryProxies) {
      this._createLightweightAccessoryProxy(worldPosition, yawY, { ...options, modelUrl });
      return;
    }

    const loadModel = () => this._loadShowroomAccessoryGlb(worldPosition, yawY, modelUrl, options);
    this.deferredModelLoadTasks.push({
      anchorZ: worldPosition.z,
      loadDistance: options.loadDistance ?? 76,
      loadModel,
    });
  }

  _pickAccessoryProxyMaterial(seed) {
    const palette = [this.materials.productWhite, this.materials.productBlush, this.materials.productBlack];
    const value = String(seed ?? "");
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash * 33 + value.charCodeAt(i)) >>> 0;
    }
    return palette[hash % palette.length];
  }

  _createLightweightAccessoryProxy(worldPosition, yawY, options = {}) {
    const kind = options.kind ?? "bag";
    const size = options.maxDimension ?? 0.55;
    const showcaseTarget = options.showcaseTarget ?? null;
    const anchor = new TransformNode(`accessory-proxy-${worldPosition.x}-${worldPosition.y}-${worldPosition.z}`, this.scene);
    anchor.position.copyFrom(worldPosition);
    anchor.rotation.y = yawY;

    const proxyRoot = new TransformNode(`${anchor.name}-root`, this.scene);
    proxyRoot.parent = anchor;

    const productMaterial = this._pickAccessoryProxyMaterial(options.modelUrl ?? `${kind}-${worldPosition.x}-${worldPosition.z}`);
    const accentMaterial = this.materials.champagne;
    const proxyMeshes = [];
    const addProxyMesh = (mesh) => {
      mesh.parent = proxyRoot;
      mesh.receiveShadows = false;
      this._assignShowcaseTarget(mesh, showcaseTarget);
      proxyMeshes.push(mesh);
      return mesh;
    };

    if (kind === "shoe") {
      const sole = addProxyMesh(
        MeshBuilder.CreateBox(
          `${anchor.name}-sole`,
          { width: size * 0.92, height: size * 0.08, depth: size * 0.28 },
          this.scene,
        ),
      );
      sole.position.y = size * 0.04;
      sole.material = accentMaterial;

      const upper = addProxyMesh(
        MeshBuilder.CreateCylinder(
          `${anchor.name}-upper`,
          {
            diameterTop: size * 0.2,
            diameterBottom: size * 0.34,
            height: size * 0.68,
            tessellation: 12,
          },
          this.scene,
        ),
      );
      upper.position.set(-size * 0.06, size * 0.22, 0);
      upper.rotation.z = Math.PI * 0.5;
      upper.material = productMaterial;

      const heel = addProxyMesh(
        MeshBuilder.CreateCylinder(
          `${anchor.name}-heel`,
          { diameter: size * 0.09, height: size * 0.42, tessellation: 10 },
          this.scene,
        ),
      );
      heel.position.set(size * 0.25, size * 0.21, 0);
      heel.material = accentMaterial;

      const toe = addProxyMesh(
        MeshBuilder.CreateSphere(
          `${anchor.name}-toe`,
          { diameter: size * 0.2, segments: 10 },
          this.scene,
        ),
      );
      toe.position.set(-size * 0.35, size * 0.12, 0);
      toe.scaling.z = 1.35;
      toe.material = productMaterial;
    } else {
      const body = addProxyMesh(
        MeshBuilder.CreateBox(
          `${anchor.name}-body`,
          { width: size * 0.9, height: size * 0.56, depth: size * 0.32 },
          this.scene,
        ),
      );
      body.position.y = size * 0.24;
      body.material = productMaterial;

      const flap = addProxyMesh(
        MeshBuilder.CreateBox(
          `${anchor.name}-flap`,
          { width: size * 0.78, height: size * 0.18, depth: size * 0.08 },
          this.scene,
        ),
      );
      flap.position.set(0, size * 0.32, size * 0.14);
      flap.material = accentMaterial;

      const handle = addProxyMesh(
        MeshBuilder.CreateTorus(
          `${anchor.name}-handle`,
          { diameter: size * 0.48, thickness: size * 0.06, tessellation: 18 },
          this.scene,
        ),
      );
      handle.position.y = size * 0.55;
      handle.rotation.x = Math.PI * 0.5;
      handle.material = accentMaterial;

      const charm = addProxyMesh(
        MeshBuilder.CreateSphere(
          `${anchor.name}-charm`,
          { diameter: size * 0.1, segments: 8 },
          this.scene,
        ),
      );
      charm.position.set(size * 0.18, size * 0.24, size * 0.19);
      charm.material = this.materials.shopWarmLight;
    }

    proxyRoot.freezeWorldMatrix();
    const isAccessory = kind === "shoe" || kind === "bag";
    this._updateShowcaseTargetFromMeshes(showcaseTarget, proxyMeshes, {
      focusHeightBias: isAccessory ? 0.82 : 0.5,
      cameraHeightBias: isAccessory ? 0.78 : 0.28,
      orbitPadding: kind === "shoe" ? 1.55 : 1.55,
      minOrbitRadius: kind === "shoe" ? 1.92 : 1.9,
      maxOrbitRadius: 2.9,
      minCameraY: isAccessory ? 1.95 : 1.62,
      maxCameraY: isAccessory ? 2.4 : 1.82,
    });
    for (const mesh of proxyMeshes) {
      mesh.freezeWorldMatrix();
    }
    anchor.freezeWorldMatrix();
  }

  /**
   * Scale to max dimension; center on XZ. If `surfaceWorldY` is set, sit the mesh bottom on that Y
   * (avoids clipping through round plinth tops when the bbox center was placed at the surface).
   */
  _fitShowroomAccessory(modelRoot, meshes, maxDimension, surfaceWorldY = null) {
    if (meshes.length === 0) {
      return;
    }

    const measure = () => {
      this.scene.incrementRenderId();
      for (const mesh of meshes) {
        mesh.refreshBoundingInfo();
        mesh.computeWorldMatrix(true);
      }

      const min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
      const max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);

      for (const mesh of meshes) {
        const boundingBox = mesh.getBoundingInfo().boundingBox;
        min.minimizeInPlace(boundingBox.minimumWorld);
        max.maximizeInPlace(boundingBox.maximumWorld);
      }

      const maxSide = Math.max(max.x - min.x, max.y - min.y, max.z - min.z);
      const center = Vector3.Lerp(min, max, 0.5);
      return { center, maxSide, min, max };
    };

    const initial = measure();
    if (initial.maxSide > 1e-6) {
      modelRoot.scaling.setAll(maxDimension / initial.maxSide);
    }

    const fitted = measure();
    modelRoot.computeWorldMatrix(true);
    const invWorld = Matrix.Invert(modelRoot.getWorldMatrix());
    const centerLocal = Vector3.TransformCoordinates(fitted.center, invWorld);
    modelRoot.position.x -= centerLocal.x;
    modelRoot.position.z -= centerLocal.z;

    if (surfaceWorldY != null && Number.isFinite(surfaceWorldY)) {
      modelRoot.computeWorldMatrix(true);
      let minWorldY = Number.POSITIVE_INFINITY;
      for (const mesh of meshes) {
        mesh.computeWorldMatrix(true);
        minWorldY = Math.min(minWorldY, mesh.getBoundingInfo().boundingBox.minimumWorld.y);
      }
      if (minWorldY !== Number.POSITIVE_INFINITY) {
        modelRoot.position.y += surfaceWorldY - minWorldY;
      }
    } else {
      modelRoot.position.y -= centerLocal.y;
    }
  }

  async _loadShowroomAccessoryGlb(worldPosition, yawY, modelUrl, options = {}) {
    const maxDimension = options.maxDimension ?? 0.55;
    const showcaseTarget = options.showcaseTarget ?? null;

    const MAX_RETRIES = 2;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 600 * attempt));
      }

      const anchor = new TransformNode(`accessory-${worldPosition.x}-${worldPosition.y}-${worldPosition.z}`, this.scene);
      anchor.position.copyFrom(worldPosition);
      anchor.rotation.y = yawY;

      const modelRoot = new TransformNode(`${anchor.name}-model-root`, this.scene);
      modelRoot.parent = anchor;

      try {
        await this._acquireGlbSlot();
        let result;
        try {
          result = await SceneLoader.ImportMeshAsync("", "", modelUrl, this.scene);
        } finally {
          this._releaseGlbSlot();
        }

        const importedRoots = result.meshes.filter((mesh) => !mesh.parent);
        for (const mesh of importedRoots) {
          mesh.parent = modelRoot;
        }

        const renderMeshes = result.meshes.filter((mesh) => mesh.getTotalVertices && mesh.getTotalVertices() > 0);
        if (renderMeshes.length === 0) {
          throw new Error("no-renderable-meshes");
        }

        const seenMaterials = new Set();
        for (const mesh of renderMeshes) {
          mesh.receiveShadows = false;
          if (mesh.material) {
            this._tuneImportedMannequinMaterial(mesh.material, seenMaterials, modelUrl);
          }
          this._registerGlowOccluder(mesh, mesh.material);
          this._assignShowcaseTarget(mesh, showcaseTarget);
        }
        // (Streamed-mannequin shader pre-warm reverted — the async
        //  forceCompilationAsync calls were poisoning Babylon's GLB
        //  import pipeline, causing mannequins to silently fail to
        //  reach renderable state. FPS oscillation tradeoff accepted.)

        this._fitShowroomAccessory(modelRoot, renderMeshes, maxDimension, worldPosition.y);
        // Accessory inspect framing — shoes and bags sit on tall pedestals.
        // The previous bias values placed focusPoint 42% up the *combined*
        // pedestal+product bbox, which landed below the actual product on the
        // pedestal top. Camera then looked UP at the pedestal underside.
        // For accessories, raise both focus and camera so we look slightly
        // DOWN at the product (product-photography framing) instead of up
        // at the stand.
        const isAccessory = options.kind === "shoe" || options.kind === "bag";
        this._updateShowcaseTargetFromMeshes(showcaseTarget, renderMeshes, {
          focusHeightBias: isAccessory ? 0.82 : 0.5,
          cameraHeightBias: isAccessory ? 0.78 : 0.3,
          orbitPadding: options.kind === "shoe" ? 1.55 : 1.5,
          minOrbitRadius: options.kind === "shoe" ? 1.95 : 1.92,
          maxOrbitRadius: 3.05,
          minCameraY: isAccessory ? 1.95 : 1.62,
          maxCameraY: isAccessory ? 2.4 : 1.84,
        });
        modelRoot.freezeWorldMatrix();
        for (const mesh of renderMeshes) {
          if (this.floorReflection && this._isStableFloorReflectionCandidate(mesh)) {
            this.floorReflectionCandidates.push(mesh);
          }
          mesh.freezeWorldMatrix();
        }
        anchor.freezeWorldMatrix();
        if (this.floorReflection) {
          this._updateFloorReflectionWindow();
        }
        return; // success — exit retry loop
      } catch (error) {
        anchor.dispose();
        if (attempt < MAX_RETRIES) {
          console.warn(`[ShowroomWorld] Accessory load attempt ${attempt + 1} failed, retrying…`, modelUrl);
        } else {
          console.warn("[ShowroomWorld] Could not load showroom accessory model after retries", modelUrl, error);
        }
      }
    }
  }

  _createLightweightMannequinProxy(root, yaw = 0, targetHeight = 4.05, platformTopY = 0.39, showcaseTarget = null) {
    const proxyRoot = new TransformNode(`${root.name}-performance-proxy`, this.scene);
    proxyRoot.parent = root;
    proxyRoot.rotation.y = yaw;
    proxyRoot.position.y = platformTopY;

    const scale = targetHeight / 4.05;
    const gown = MeshBuilder.CreateCylinder(
      `${root.name}-proxy-gown`,
      { diameterTop: 0.56 * scale, diameterBottom: 1.08 * scale, height: 2.82 * scale, tessellation: 10 },
      this.scene,
    );
    gown.parent = proxyRoot;
    gown.position.y = 1.41 * scale;
    gown.material = this.materials.fabric;
    gown.receiveShadows = false;
    this._registerGlowOccluder(gown, gown.material);
    this._assignShowcaseTarget(gown, showcaseTarget);

    const torso = MeshBuilder.CreateCylinder(
      `${root.name}-proxy-torso`,
      { diameterTop: 0.46 * scale, diameterBottom: 0.62 * scale, height: 0.86 * scale, tessellation: 10 },
      this.scene,
    );
    torso.parent = proxyRoot;
    torso.position.y = 2.96 * scale;
    torso.material = this.materials.mannequin;
    torso.receiveShadows = false;
    this._registerGlowOccluder(torso, torso.material);
    this._assignShowcaseTarget(torso, showcaseTarget);

    const head = MeshBuilder.CreateSphere(
      `${root.name}-proxy-head`,
      { diameter: 0.34 * scale, segments: 10 },
      this.scene,
    );
    head.parent = proxyRoot;
    head.position.y = 3.58 * scale;
    head.material = this.materials.mannequin;
    head.receiveShadows = false;
    this._registerGlowOccluder(head, head.material);
    this._assignShowcaseTarget(head, showcaseTarget);

    const proxyMeshes = [gown, torso, head];
    for (const side of [-1, 1]) {
      const arm = MeshBuilder.CreateCylinder(
        `${root.name}-proxy-arm-${side}`,
        { diameter: 0.08 * scale, height: 0.98 * scale, tessellation: 8 },
        this.scene,
      );
      arm.parent = proxyRoot;
      arm.position.set(side * 0.43 * scale, 2.78 * scale, 0);
      arm.rotation.z = side * 0.18;
      arm.material = this.materials.mannequin;
      arm.receiveShadows = false;
      this._registerGlowOccluder(arm, arm.material);
      this._assignShowcaseTarget(arm, showcaseTarget);
      proxyMeshes.push(arm);
    }

    this._updateShowcaseTargetFromMeshes(showcaseTarget, proxyMeshes, {
      focusHeightBias: 0.58,
      cameraHeightBias: 0.42,
      orbitPadding: 1.86,
      minOrbitRadius: 2.95,
      maxOrbitRadius: 3.8,
      minCameraY: 1.8,
      maxCameraY: 2.22,
    });
    proxyRoot.freezeWorldMatrix();
    for (const mesh of proxyMeshes) {
      mesh.freezeWorldMatrix();
    }
  }

  /** Acquire one GLB import slot (blocks until a slot is free). */
  _acquireGlbSlot() {
    if (this._glbSlotActive < this._glbSlotMax) {
      this._glbSlotActive += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this._glbSlotQueue.push(resolve);
    });
  }

  /** Release a GLB import slot, waking the next queued waiter if any. */
  _releaseGlbSlot() {
    const next = this._glbSlotQueue.shift();
    if (next) {
      // pass the slot directly to the next waiter without decrementing
      next();
    } else {
      this._glbSlotActive -= 1;
    }
  }

  async _loadMannequinModel(root, yaw, targetHeight, modelUrl = null, platformTopY = 0.39, showcaseTarget = null) {
    const resolvedModelUrl = modelUrl ?? this._defaultMannequinModelUrl;
    const depthCompensation = getMannequinDepthCompensation(resolvedModelUrl);
    if (!resolvedModelUrl) return;

    // Guard: skip if a load is already in progress for this slot (prevents
    // the repair pass from double-loading a slot that is still in-flight).
    if (this._mannequinLoadingInProgress.has(root)) return;
    this._mannequinLoadingInProgress.add(root);

    const MAX_RETRIES = 2;
    try {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 600 * attempt));
        }

        // Use a unique name per attempt so Babylon.js never sees a name that
        // is still lingering in its internal node registry from a failed attempt.
        const attemptSuffix = attempt === 0 ? "" : `-r${attempt}`;
        const modelRoot = new TransformNode(`${root.name}-model-root${attemptSuffix}`, this.scene);
        modelRoot.parent = root;
        modelRoot.rotation.y = yaw;

        try {
          await this._acquireGlbSlot();
          let result;
          try {
            result = await SceneLoader.ImportMeshAsync("", "", resolvedModelUrl, this.scene);
          } finally {
            this._releaseGlbSlot();
          }

          const importedRoots = result.meshes.filter((mesh) => !mesh.parent);
          for (const mesh of importedRoots) {
            mesh.parent = modelRoot;
          }

          const renderMeshes = result.meshes.filter((mesh) => mesh.getTotalVertices && mesh.getTotalVertices() > 0);
          if (renderMeshes.length === 0) {
            throw new Error("no-renderable-meshes");
          }

          const seenMaterials = new Set();
          for (const mesh of renderMeshes) {
            mesh.receiveShadows = false;
            if (mesh.material) {
              this._tuneImportedMannequinMaterial(mesh.material, seenMaterials, resolvedModelUrl);
            }
            this._registerGlowOccluder(mesh, mesh.material);
            this._assignShowcaseTarget(mesh, showcaseTarget);
          }
          // (Streamed-mannequin shader pre-warm reverted — see other
          //  import path for details.)

          this._fitModelToPlatform(
            modelRoot,
            renderMeshes,
            root.position,
            platformTopY,
            targetHeight,
            depthCompensation,
          );
          this._updateShowcaseTargetFromMeshes(showcaseTarget, renderMeshes, {
            focusHeightBias: 0.58,
            cameraHeightBias: 0.42,
            orbitPadding: 1.92,
            minOrbitRadius: 3.05,
            maxOrbitRadius: 4.15,
            minCameraY: 1.8,
            maxCameraY: 2.28,
          });
          for (const mesh of renderMeshes) {
            if (this.floorReflection && this._isStableFloorReflectionCandidate(mesh)) {
              this.floorReflectionCandidates.push(mesh);
            }
            mesh.freezeWorldMatrix();
          }
          if (this.floorReflection) {
            this._updateFloorReflectionWindow();
          }
          return; // success — exit retry loop
        } catch (error) {
          modelRoot.dispose();
          if (attempt < MAX_RETRIES) {
            console.warn(`[ShowroomWorld] Mannequin load attempt ${attempt + 1} failed, retrying…`, resolvedModelUrl);
          } else {
            console.warn("[ShowroomWorld] Could not load mannequin model after retries", resolvedModelUrl, error);
          }
        }
      }
    } finally {
      // Always release the in-progress guard so the repair pass can re-attempt
      // this slot if all retries failed.
      this._mannequinLoadingInProgress.delete(root);
    }
  }

  _fitModelToPlatform(modelRoot, meshes, rootPosition, platformTopY, targetHeight, depthCompensation = 1) {
    if (meshes.length === 0) {
      return;
    }

    const measure = () => {
      // We measure in LOCAL space (using minimum/maximum, not minimumWorld/maximumWorld)
      // for two reasons:
      //
      // 1. KHR_mesh_quantization: calling refreshBoundingInfo() on quantized meshes
      //    recomputes bounds from raw integer vertex data before dequantization, producing
      //    a bounding box covering the entire quantization range (~90 units) instead of
      //    the actual mesh extents. The glTF loader sets correct bounds from the accessor
      //    min/max — we must NOT call refreshBoundingInfo() or we destroy them.
      //
      // 2. World-space bounds: minimumWorld/maximumWorld require the full parent chain
      //    to have up-to-date world matrices. Since we're adjusting modelRoot.scaling and
      //    modelRoot.position across two measure() calls, world-space reads between those
      //    two calls require re-propagating every ancestor — error-prone. Local space is
      //    stable: the loader sets it correctly and we don't touch per-mesh local transforms.
      //
      // We then manually apply modelRoot's world matrix to convert local → world.
      this.scene.incrementRenderId();
      modelRoot.computeWorldMatrix(true);

      const min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
      const max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);

      const rootWorldMatrix = modelRoot.getWorldMatrix();
      for (const mesh of meshes) {
        mesh.computeWorldMatrix(true);
        const bb = mesh.getBoundingInfo().boundingBox;
        // Transform the local-space corners through the full world matrix
        const meshWorldMatrix = mesh.getWorldMatrix();
        const localMin = bb.minimum;
        const localMax = bb.maximum;
        // Sample all 8 corners of the AABB and transform each
        for (let xi = 0; xi < 2; xi++) {
          for (let yi = 0; yi < 2; yi++) {
            for (let zi = 0; zi < 2; zi++) {
              const corner = new Vector3(
                xi === 0 ? localMin.x : localMax.x,
                yi === 0 ? localMin.y : localMax.y,
                zi === 0 ? localMin.z : localMax.z,
              );
              const worldCorner = Vector3.TransformCoordinates(corner, meshWorldMatrix);
              min.minimizeInPlace(worldCorner);
              max.maximizeInPlace(worldCorner);
            }
          }
        }
      }

      return { min, max, center: min.add(max).scale(0.5), height: max.y - min.y };
    };

    const initial = measure();
    if (initial.height > 0) {
      modelRoot.scaling.setAll(targetHeight / initial.height);
    }
    if (depthCompensation !== 1) {
      // A few older mannequin repacks in the source folder carry a baked non-uniform
      // root matrix that compresses their depth, making them look "sliced" in-scene.
      // Restore the lost depth here while keeping their height and placement logic.
      modelRoot.scaling.z *= depthCompensation;
    }

    const fitted = measure();
    modelRoot.position.x += rootPosition.x - fitted.center.x;
    modelRoot.position.z += rootPosition.z - fitted.center.z;
    modelRoot.position.y += rootPosition.y + platformTopY - fitted.min.y;
  }

  _createTracked3DText(
    name,
    text,
    position,
    {
      width,
      targetHeight,
      depth = 0.05,
      rotationY = Math.PI,
      material = this.materials.entryGateTitleLetters,
      fontData = helvetikerBoldFontData,
      fontSize = 1,
      resolution = 24,
      fillWidth = true,
      tracking = 0,
    },
  ) {
    const root = new TransformNode(`${name}-root`, this.scene);
    const entries = [];
    const chars = [...text];
    let naturalWidth = 0;
    let maxHeight = 0;
    const naturalSpaceWidth = ((fontData.glyphs[" "]?.ha ?? 375) * fontSize) / fontData.resolution;

    for (const [index, char] of chars.entries()) {
      if (char === " ") {
        entries.push({ mesh: null, width: naturalSpaceWidth });
        naturalWidth += naturalSpaceWidth;
        continue;
      }

      const mesh = CreateText(
        `${name}-${index}-${char}`,
        char,
        fontData,
        {
          size: fontSize,
          resolution,
          depth,
        },
        this.scene,
        earcut,
      );

      if (!mesh) {
        continue;
      }

      const bounds = mesh.getBoundingInfo().boundingBox;
      const meshWidth = bounds.extendSize.x * 2;
      const meshHeight = bounds.extendSize.y * 2;
      mesh.material = material;
      mesh.parent = root;
      mesh.receiveShadows = true;

      maxHeight = Math.max(maxHeight, meshHeight);
      naturalWidth += meshWidth;
      entries.push({ mesh, width: meshWidth });
    }

    if (!entries.length || maxHeight <= 0) {
      root.dispose();
      return null;
    }

    const gapCount = Math.max(0, entries.length - 1);
    const scale = Math.min(targetHeight / maxHeight, width / naturalWidth);
    const trackedGap =
      fillWidth && gapCount > 0 ? Math.max(0, (width - naturalWidth * scale) / gapCount) : tracking;
    const layoutWidth = naturalWidth * scale + gapCount * trackedGap;

    let cursorX = -layoutWidth * 0.5;
    for (const entry of entries) {
      if (entry.mesh) {
        entry.mesh.scaling.setAll(scale);
        entry.mesh.position.x = cursorX + entry.width * scale * 0.5;
        entry.mesh.position.y = 0;
        entry.mesh.position.z = 0;
      }

      cursorX += entry.width * scale + trackedGap;
    }

    root.position.copyFrom(position);
    root.rotation.y = rotationY;
    return root;
  }

  _createSign(
    text,
    position,
    {
      width = 10,
      height = 2.5,
      fontSize = 92,
      fontWeight = "bold",
      letterSpacing = 0.18,
      textureWidth = 4096,
      textureHeight = 1024,
      shadowBlur = 10,
      emissiveIntensity = 1,
      color = "#f3d39b",
      emissive = "#d7a84d",
      rotationY = Math.PI,
    } = {},
  ) {
    // The 4096×1024 default uses 16 MB of GPU memory per sign — overkill on
    // weak GPUs. 1024×256 still reads sharp at viewing distance because the
    // sign material clamps to a small UV region.
    const finalTextureWidth = EXPERIENCE_PROFILE.constrainedPerformance
      ? Math.min(textureWidth, 1024)
      : textureWidth;
    const finalTextureHeight = EXPERIENCE_PROFILE.constrainedPerformance
      ? Math.min(textureHeight, 256)
      : textureHeight;
    const texture = new DynamicTexture(
      `sign-texture-${text}`,
      { width: finalTextureWidth, height: finalTextureHeight },
      this.scene,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    texture.hasAlpha = true;
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    // Anisotropy 16 is fragment-shader-killer territory on Intel iGPUs.
    texture.anisotropicFilteringLevel = EXPERIENCE_PROFILE.constrainedPerformance ? 4 : 16;

    const context = texture.getContext();
    // Scale derives from the FINAL texture height so the font fits the
    // downsized canvas on constrained tiers without overflowing.
    const scale = finalTextureHeight / 256;
    const letters = [...text];
    const font = `${fontWeight} ${fontSize * scale}px Georgia`;
    const spacing = fontSize * letterSpacing * scale;

    context.clearRect(0, 0, finalTextureWidth, finalTextureHeight);
    context.save();
    context.translate(0, finalTextureHeight);
    context.scale(1, -1);
    context.font = font;
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.fillStyle = color;
    context.shadowColor = emissive;
    context.shadowBlur = shadowBlur * scale;

    const textWidth =
      letters.reduce((total, letter) => total + context.measureText(letter).width, 0) +
      spacing * Math.max(0, letters.length - 1);
    let cursorX = (finalTextureWidth - textWidth) * 0.5;

    for (const letter of letters) {
      context.fillText(letter, cursorX, finalTextureHeight * 0.5);
      cursorX += context.measureText(letter).width + spacing;
    }
    context.restore();
    texture.update(false);

    const material = new StandardMaterial(`sign-material-${text}`, this.scene);
    material.diffuseTexture = texture;
    material.diffuseColor = Color3.FromHexString(color);
    material.emissiveColor = Color3.FromHexString(emissive).scale(emissiveIntensity);
    material.useAlphaFromDiffuseTexture = true;
    material.backFaceCulling = false;

    const sign = MeshBuilder.CreatePlane(`floating-sign-${text}`, { width, height }, this.scene);
    sign.position.copyFrom(position);
    sign.rotation.y = rotationY;
    sign.material = material;
    return sign;
  }
}