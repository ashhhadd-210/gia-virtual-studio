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
    minVisibleMs = 720,
    /**
     * Hard ceiling on the post-preload `whenReadyAsync` polling phase.
     * The full preload (which can be slow on cellular connections) has its own timeout,
     * so this only governs the "compile + bind textures" tail at the end.
     */
    maxWaitMs = constrainedPerformance ? 22000 : 16000,
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
    /** GPU warmup is only needed when we did the full preload AND have spare memory. */
    warmupEnabled = !constrainedPerformance,
    warmupRendersPerStop = 2,
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

    // Repair any mannequin slots whose _loadMannequinModel failed all retries
    // (detected by absence of the "{root}-model-root" child TransformNode).
    if (typeof world.repairMissingMannequins === "function") {
      await world.repairMissingMannequins().catch(() => {});
    }
  } else {
    tick(38, true);
  }

  const started = performance.now();
  const readyPromise = scene.whenReadyAsync();

  const meshWeight = constrainedPerformance ? 0.72 : 0.62;
  const texWeight = constrainedPerformance ? 0.28 : 0.38;
  const phaseLow = preloadDeferred ? 80 : 38;
  const phaseHigh = preloadDeferred ? 92 : 82;

  while (performance.now() - started < maxWaitMs) {
    const race = await Promise.race([
      readyPromise.then(() => "done"),
      new Promise((r) => setTimeout(() => r("tick"), 28)),
    ]);
    if (race === "done") {
      break;
    }

    const tex = textureReadyRatio(scene);
    const mesh = meshReadyRatio(scene);
    const blended = tex * texWeight + mesh * meshWeight;
    tick(phaseLow + blended * (phaseHigh - phaseLow));
  }

  await Promise.race([
    readyPromise,
    new Promise((r) => setTimeout(r, 1200)),
  ]).catch(() => {});

  tick(92, true);

  const runWarmup =
    preloadDeferred &&
    warmupEnabled &&
    engine &&
    camera &&
    typeof scene.render === "function";

  if (runWarmup) {
    await warmUpGpu(scene, engine, camera, world, {
      rendersPerStop: warmupRendersPerStop,
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
  const { rendersPerStop = 2, onProgress } = options;

  const savedPosition = camera.position.clone();
  const savedRotation = camera.rotation.clone();

  const waypointsZ = [142, 118, 104, 76, 60, 36, 0, -44, -76, -110];
  const totalSteps = waypointsZ.length * Math.max(1, rendersPerStop);
  let step = 0;

  for (let w = 0; w < waypointsZ.length; w++) {
    camera.position.x = savedPosition.x;
    camera.position.y = savedPosition.y;
    camera.position.z = waypointsZ[w];
    camera.rotation.copyFrom(savedRotation);

    world.update(camera.position, world.optimizationConfig?.updateInterval ?? 0.4);

    for (let r = 0; r < rendersPerStop; r++) {
      scene.render();
      step += 1;
      onProgress?.(step / totalSteps);
    }

    await new Promise((requestAnimationFrame));
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
