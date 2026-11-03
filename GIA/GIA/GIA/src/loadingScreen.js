import { getExperienceProfile } from "./deviceLoadingProfile.js";

/**
 * Drives the full pre-gameplay loading sequence:
 *   1. Wait for static scene + ImportMesh tasks scheduled in the constructor.
 *   2. Preload every deferred mannequin / accessory GLB so nothing streams in mid-walk.
 *   3. Wait for the scene to become render-ready (textures uploaded, shaders compiled).
 *   4. Optional GPU sweep on desktop to warm shader caches before the player sees the scene.
 *   5. Freeze static world matrices and active meshes for steady FPS on weak devices.
 */
export async function waitForShowroomReady(scene, world, options = {}) {
  const experienceProfile = getExperienceProfile();
  const limitedDevice = options.limitedDevice ?? experienceProfile.limitedDevice;
  const constrainedPerformance =
    options.constrainedPerformance ?? experienceProfile.constrainedPerformance;
  const defaultPreloadDeferred = experienceProfile.preloadDeferredAssets;
  const {
    onProgress,
    minVisibleMs = 220,
    /**
     * Hard ceiling on the post-preload scene-ready wait. The expensive per-tick scene
     * traversal was removed (it was stalling the main thread itself); we now race a
     * smooth time-based animation against `whenReadyAsync` with a tight timeout.
     */
    maxWaitMs = constrainedPerformance ? 5500 : 8000,
    /** Generous parallel fetches → the GLBs are now small enough that the bottleneck is per-file RTT. */
    preloadConcurrency = constrainedPerformance ? 4 : 8,
    /** Per-asset preload timeout. Fail fast on slow phones so the bar never stalls forever. */
    preloadAssetTimeoutMs = constrainedPerformance ? 9000 : 12000,
    /** Hard upper bound on the entire preload phase. */
    preloadPhaseTimeoutMs = constrainedPerformance ? 90000 : 120000,
    /** Balanced mobile mode streams deferred assets after entry instead of front-loading them. */
    preloadDeferred = defaultPreloadDeferred,
    engine,
    camera,
    /**
     * GPU warmup precompiles all PBR shader variants and forces texture uploads.
     * Without it, the first 1-3 minutes of gameplay stall as shaders compile
     * lazily on first-frame-of-each-material. Enable for ALL tiers, just use
     * fewer waypoints / lighter passes on constrained.
     */
    warmupEnabled = true,
    warmupRendersPerStop = constrainedPerformance ? 1 : 2,
  } = options;

  let smooth = 0;
  const tick = (target, immediate = false) => {
    if (immediate) {
      smooth = target;
    } else {
      smooth += (target - smooth) * 0.14;
    }
    const pct = Math.min(100, Math.max(0, Math.round(smooth)));
    onProgress?.(pct);
    return pct;
  };

  tick(4, true);

  await world.ready;
  tick(10);

  if (preloadDeferred) {
    await world.preloadAllDeferredAssets({
      concurrency: preloadConcurrency,
      perTaskTimeoutMs: preloadAssetTimeoutMs,
      overallTimeoutMs: preloadPhaseTimeoutMs,
      onProgress: (ratio) => {
        tick(10 + ratio * 70, true);
      },
    });
    tick(80);
  } else {
    tick(38, true);
  }

  const started = performance.now();
  const readyPromise = scene.whenReadyAsync();

  // Smooth time-based animation in the post-preload phase. Per-tick scene traversal
  // (textureReadyRatio / meshReadyRatio) was itself stalling the main thread, which
  // is why the bar visibly inched. The bar now animates on elapsed time and we just
  // race `whenReadyAsync` against a hard timeout.
  const phaseLow = preloadDeferred ? 80 : 38;
  const phaseHigh = preloadDeferred ? 92 : 82;
  const expectedPhaseMs = constrainedPerformance ? 2800 : 4500;

  while (true) {
    const race = await Promise.race([
      readyPromise.then(() => "done"),
      new Promise((r) => setTimeout(r, 60)),
    ]);
    if (race === "done") {
      break;
    }
    const elapsed = performance.now() - started;
    if (elapsed > maxWaitMs) {
      break;
    }
    const progress = Math.min(1, elapsed / expectedPhaseMs);
    tick(phaseLow + progress * (phaseHigh - phaseLow));
  }

  tick(92, true);

  // Warmup is now ALWAYS attempted (regardless of preloadDeferred), because the
  // user-visible "3-minute stutter at start of gameplay" is caused by lazy shader
  // compilation + texture upload. Doing it during the loading screen makes
  // gameplay smooth from frame 1.
  const runWarmup =
    warmupEnabled &&
    engine &&
    camera &&
    typeof scene.render === "function";

  if (runWarmup) {
    await warmUpGpu(scene, engine, camera, world, {
      rendersPerStop: warmupRendersPerStop,
      lightWarmup: constrainedPerformance,
      onProgress: (t) => tick(92 + t * 6, true),
    });
  }

  // Freeze static world matrices, but do not freeze the scene's active-mesh list.
  // The player starts facing away from some entrance-corridor details; freezing
  // active meshes at startup can hide small platforms / fixtures / frame strips
  // until the page reloads.
  try {
    if (typeof world.freezeForRuntime === "function") {
      world.freezeForRuntime();
    }
  } catch (error) {
    console.warn("Could not freeze static meshes", error);
  }

  smooth = Math.max(smooth, 98);
  tick(100, true);
  onProgress?.(100);

  const elapsed = performance.now() - started;
  if (elapsed < minVisibleMs) {
    await new Promise((r) => setTimeout(r, minVisibleMs - elapsed));
  }
}

async function warmUpGpu(scene, engine, camera, world, options = {}) {
  const { rendersPerStop = 2, onProgress, lightWarmup = false } = options;

  const savedPosition = camera.position.clone();
  const savedRotation = camera.rotation.clone();

  // Lighter waypoint set on constrained tiers — 5 instead of 10. Each waypoint
  // is positioned at a region where new materials/lights come into view, so
  // 5 still covers all unique shader permutations: spawn, gate, premium hall,
  // boutique bay, far back wall.
  const waypointsZ = lightWarmup
    ? [142, 104, 86, 60, 0]
    : [142, 118, 104, 76, 60, 36, 0, -44, -76, -110];

  // Additional rotations per waypoint — captures shader variants for materials
  // that face different directions at the same location.
  const rotations = lightWarmup
    ? [0]
    : [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];

  const totalSteps = waypointsZ.length * rotations.length * Math.max(1, rendersPerStop);
  let step = 0;

  for (let w = 0; w < waypointsZ.length; w++) {
    camera.position.x = savedPosition.x;
    camera.position.y = savedPosition.y;
    camera.position.z = waypointsZ[w];

    for (const yawOffset of rotations) {
      camera.rotation.copyFrom(savedRotation);
      camera.rotation.y += yawOffset;

      world.update(camera.position, world.optimizationConfig?.updateInterval ?? 0.4);

      for (let r = 0; r < rendersPerStop; r++) {
        scene.render();
        step += 1;
        onProgress?.(step / totalSteps);
      }
    }

    await new Promise((requestAnimationFrame));
  }

  // Force any remaining textures to be uploaded to GPU. Calling getInternalTexture
  // touches the texture, which triggers upload if not yet done. This catches
  // textures that were never visible from a waypoint angle.
  for (const tex of scene.textures ?? []) {
    try {
      if (typeof tex.getInternalTexture === "function") {
        tex.getInternalTexture();
      }
    } catch {}
  }

  camera.position.copyFrom(savedPosition);
  camera.rotation.copyFrom(savedRotation);
  world.update(camera.position, world.optimizationConfig?.updateInterval ?? 0.4);
  scene.render();
}

function textureReadyRatio(scene) {
  const textures = scene.textures ?? [];
  if (textures.length === 0) {
    return 1;
  }
  let ready = 0;
  for (const t of textures) {
    try {
      if (typeof t.isReady === "function" && t.isReady()) {
        ready++;
      } else if (t.isReady === true) {
        ready++;
      }
    } catch {
      ready++;
    }
  }
  return ready / textures.length;
}

function meshReadyRatio(scene) {
  const meshes = scene.meshes ?? [];
  if (meshes.length === 0) {
    return 1;
  }
  let ready = 0;
  for (const m of meshes) {
    try {
      if (typeof m.isReady === "function" && m.isReady(true)) {
        ready++;
      }
    } catch {
      ready++;
    }
  }
  return ready / meshes.length;
}
