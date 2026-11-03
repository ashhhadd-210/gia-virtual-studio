import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader.js";
import "@babylonjs/core/Culling/ray.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Scene } from "@babylonjs/core/scene.js";

import { AudioManager } from "./AudioManager.js";
import { FirstPersonController } from "./FirstPersonController.js";
import { ShowroomWorld } from "./ShowroomWorld.js";
import { getExperienceProfile } from "./deviceLoadingProfile.js";
import { waitForShowroomReady } from "./loadingScreen.js";
import { attachPerfOverlay } from "./perfOverlay.js";

const canvas = document.getElementById("render-canvas");
const compassRose = document.getElementById("compass-rose");
const loadingScreenEl = document.getElementById("loading-screen");
const loadingPercentEl = document.getElementById("loading-percent");
const loadingBarFillEl = document.getElementById("loading-bar-fill");
const loadingBarEl = document.getElementById("loading-bar");
const experienceProfile = getExperienceProfile();
const limitedDevice = experienceProfile.limitedDevice;
const constrainedPerformance = experienceProfile.constrainedPerformance;

// We render our own loading overlay; suppress Babylon's default DOM screen.
// Manifest probing is skipped on the engine below — Vercel doesn't serve them
// and each probe costs ~1 RTT per asset.
SceneLoader.ShowLoadingScreen = false;

function applyLoadingProgress(pct) {
  if (!loadingPercentEl || !loadingBarFillEl) {
    return;
  }
  loadingPercentEl.textContent = `${pct}%`;
  loadingBarFillEl.style.transform = `scaleX(${pct / 100})`;
  loadingBarEl?.setAttribute("aria-valuenow", String(pct));
}

const engine = new Engine(canvas, true, {
  adaptToDeviceRatio: false,
  antialias: experienceProfile.engineAntialias,
  preserveDrawingBuffer: false,
  // Stencil disabled on constrained tiers — we don't use stencil-based effects
  // and the depth/stencil buffer combo allocates more VRAM than a depth-only.
  stencil: !experienceProfile.constrainedPerformance,
  powerPreference: experienceProfile.powerPreference,
  failIfMajorPerformanceCaveat: false,
  // Babylon's WebAudio engine is unused — Howler runs audio. Saves the
  // AudioContext init delay on first interaction (~50-150ms on weak Android).
  audioEngine: false,
  // Disable WebGL2's "depth used as resource" requirement — small but free
  // improvement to driver memory layout on Intel iGPU.
  doNotHandleContextLost: false,
});

// Skip the per-asset .manifest HEAD request — Vercel doesn't serve them and
// every cache check adds ~100-300ms of TTFB on cellular.
engine.disableManifestCheck = true;

const maxPixelRatio = experienceProfile.maxPixelRatio;
const devicePixelRatio = window.devicePixelRatio || 1;
if (devicePixelRatio > maxPixelRatio) {
  engine.setHardwareScalingLevel(devicePixelRatio / maxPixelRatio);
}

const scene = new Scene(engine);
scene.autoClearDepthAndStencil = false;
scene.skipPointerMovePicking = true;
scene.blockMaterialDirtyMechanism = true;
scene.clearColor = Color4.FromHexString("#04070aff");
scene.fogMode = Scene.FOGMODE_LINEAR;
scene.fogStart = 48;
scene.fogEnd = 228;
scene.fogColor = Color3.FromHexString("#04070a");
scene.ambientColor = Color3.FromHexString("#435863");

const ambient = new HemisphericLight("warm-ambient", new Vector3(0, 1, 0), scene);
ambient.diffuse = Color3.FromHexString("#f4fbff");
ambient.groundColor = Color3.FromHexString("#182029");
ambient.intensity = 1.12;

const world = new ShowroomWorld(scene);
world.ready.catch((error) => {
  console.warn("Some showroom models could not be loaded before startup", error);
});

const camera = new FreeCamera("visitor-camera", world.spawnPoint.clone(), scene);
camera.inputs.clear();
camera.fov = (72 * Math.PI) / 180;
// Tightened from 0.04/620 (15,500:1 ratio — disastrous z-precision on 16-bit
// mobile depth buffers). Showroom bounds max ~150 m; 250 m max gives 6x safety
// margin. Near plane 0.12 still allows close mannequin inspection without
// near-clipping while dramatically improving depth precision on Android.
camera.minZ = 0.12;
camera.maxZ = 250;
scene.activeCamera = camera;

const audioManager = new AudioManager();
const controller = new FirstPersonController(camera, canvas, world, compassRose, audioManager);

// Performance overlay: toggle with ?perf=1 in the URL. Hidden by default in prod.
attachPerfOverlay(engine, scene);

engine.runRenderLoop(() => {
  const delta = engine.getDeltaTime() / 1000;
  controller.update(delta);
  world.update(camera.position, delta);
  scene.render();
});

window.addEventListener("resize", () => {
  engine.resize();
});

// Critical for dev-mode HMR memory hygiene: every save during `vite dev`
// would otherwise leave the old engine + scene + textures + buffers retained
// in GPU memory. After a few reloads the browser tab climbs past 4 GB.
// Disposing on `beforeunload` lets the GPU driver release VRAM cleanly.
const disposeRuntime = () => {
  try {
    scene.dispose();
  } catch {}
  try {
    engine.dispose();
  } catch {}
};
window.addEventListener("beforeunload", disposeRuntime);
window.addEventListener("pagehide", disposeRuntime);
// Vite HMR: when this module is replaced, also dispose so memory doesn't pile up.
if (import.meta.hot) {
  import.meta.hot.dispose(disposeRuntime);
}

(async () => {
  const tBoot = performance.now();
  // Marker timeline — visible in DevTools Performance tab as well as console.
  performance.mark?.("gia:boot-start");
  try {
    await waitForShowroomReady(scene, world, {
      onProgress: applyLoadingProgress,
      engine,
      camera,
      limitedDevice,
      constrainedPerformance,
    });
  } catch (error) {
    console.warn("Loading sequence incomplete", error);
  } finally {
    const tReady = performance.now();
    performance.mark?.("gia:scene-ready");
    performance.measure?.("gia:total-load", "gia:boot-start", "gia:scene-ready");
    console.info(
      `[GIA] Scene ready in ${((tReady - tBoot) / 1000).toFixed(2)}s ` +
        `| tier=${limitedDevice ? "limited" : constrainedPerformance ? "constrained" : "full"} ` +
        `| meshes=${scene.meshes.length} | materials=${scene.materials.length} | textures=${scene.textures.length}`,
    );

    document.body.classList.remove("loading-active");
    loadingScreenEl?.classList.add("loading-screen--hidden");
    loadingScreenEl?.setAttribute("aria-busy", "false");
    // Re-enable material recompilation now that the world is in steady state;
    // any new texture/material flag flip just triggers a single recompile.
    scene.blockMaterialDirtyMechanism = false;

    if ("serviceWorker" in navigator && location.protocol === "https:") {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* ignore — caching is a progressive enhancement */
      });
    }

    requestAnimationFrame(() => {
      world.activateStreaming?.();
    });
  }
})();
