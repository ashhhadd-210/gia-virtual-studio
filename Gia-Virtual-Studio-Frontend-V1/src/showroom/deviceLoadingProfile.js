/**
 * Phones, tablets, and lower-memory browsers need a conservative loading profile.
 * iOS Safari often kills WebGL tabs instead of surfacing a normal JavaScript error.
 */
export function isLimitedDevice() {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return false;
  }

  const ua = navigator.userAgent || "";
  const mobileUa =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) ||
    // iPadOS 13+ desktop UA with touch
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const androidPhone = /Android/i.test(ua) && /Mobile/i.test(ua);

  let lowChromeRam = false;
  if (typeof navigator.deviceMemory === "number") {
    lowChromeRam = navigator.deviceMemory <= 4;
  }

  let coarseSmallScreen = false;
  if (typeof window.matchMedia === "function") {
    coarseSmallScreen =
      window.innerWidth <= 900 &&
      window.matchMedia("(pointer: coarse)").matches;
  }

  return mobileUa || androidPhone || lowChromeRam || coarseSmallScreen;
}

let _cachedWebGLRenderer = null;
function getWebGLRenderer() {
  if (_cachedWebGLRenderer !== null) {
    return _cachedWebGLRenderer;
  }
  if (typeof document === "undefined") {
    _cachedWebGLRenderer = "";
    return _cachedWebGLRenderer;
  }
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    if (!gl) {
      _cachedWebGLRenderer = "";
      return _cachedWebGLRenderer;
    }
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    _cachedWebGLRenderer = String(renderer || "").toLowerCase();
  } catch {
    _cachedWebGLRenderer = "";
  }
  return _cachedWebGLRenderer;
}

// Windows laptops with integrated graphics get classified as "unconstrained" by RAM/core
// heuristics alone — but their GPUs can't sustain the full quality settings the unconstrained
// branch enables. Pattern-match the renderer string so we drop them into the constrained tier.
//
// The detection is intentionally aggressive: ANY Intel-branded iGPU (including modern
// Core Ultra "Intel(R) Graphics" / "Intel(R) Arc(TM) Graphics" Xe-LPG silicon) gets
// downgraded, because even the newest iGPUs can't sustain full glow + 1024² mirrors +
// 23-light PBR at 1.35 pixel ratio. Modern Arc iGPUs are still ~1/5 the throughput of
// even a base-tier discrete GPU.
function hasWeakDesktopGpu() {
  const renderer = getWebGLRenderer();
  if (!renderer) {
    return false;
  }
  // Aggressive: anything that runs through ANGLE on Windows is on a D3D11 translation
  // layer, which adds shader/uniform overhead regardless of underlying GPU. If it's
  // an Intel chip, it's an iGPU (Intel has no discrete consumer GPUs in laptops yet).
  if (renderer.includes("angle") && renderer.includes("intel")) {
    return true;
  }
  // Covers SwiftShader / llvmpipe explicitly (CPU fallback paths — terrible).
  if (renderer.includes("swiftshader") || renderer.includes("llvmpipe")) {
    return true;
  }
  const weakPatterns = [
    "intel(r) graphics",      // Core Ultra "Intel(R) Graphics" (Xe-LPG / Arc-LP)
    "intel(r) arc",           // Core Ultra "Intel(R) Arc(TM) Graphics"
    "intel(r) hd graphics",
    "intel(r) uhd graphics",
    "intel(r) iris",
    "intel(r) xe",
    "intel graphics",
    "intel arc",
    "intel hd graphics",
    "intel uhd graphics",
    "intel iris",
    "intel xe",
    "amd radeon(tm) vega",
    "amd radeon vega",
    "radeon(tm) graphics", // common in laptop Ryzen APUs
    "nvidia geforce mx",
    "geforce mx",
  ];
  return weakPatterns.some((p) => renderer.includes(p));
}

function isDesktopConstrained() {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return false;
  }

  if (isLimitedDevice()) {
    return false;
  }

  const connection = navigator.connection;
  const saveData = connection?.saveData === true;
  const slowNetwork = /(^|-)2g$|(^|-)3g$/.test(String(connection?.effectiveType || ""));
  const lowDesktopRam =
    typeof navigator.deviceMemory === "number" && navigator.deviceMemory <= 8;
  const lowCoreCount =
    typeof navigator.hardwareConcurrency === "number" &&
    navigator.hardwareConcurrency <= 6;
  const weakGpu = hasWeakDesktopGpu();

  return saveData || slowNetwork || (lowDesktopRam && lowCoreCount) || weakGpu;
}

function getSearchParams() {
  if (typeof window === "undefined") {
    return new URLSearchParams();
  }

  return new URLSearchParams(window.location.search);
}

let _experienceProfileLogged = false;

export function getExperienceProfile() {
  const limitedDevice = isLimitedDevice();
  const desktopConstrained = isDesktopConstrained();
  const constrainedPerformance = limitedDevice || desktopConstrained;
  if (!_experienceProfileLogged && typeof console !== "undefined") {
    _experienceProfileLogged = true;
    try {
      console.info(
        `[GIA] device tier — limited=${limitedDevice} constrained=${desktopConstrained} ` +
          `| GPU="${getWebGLRenderer() || "unknown"}" ` +
          `| RAM=${navigator.deviceMemory ?? "?"} cores=${navigator.hardwareConcurrency ?? "?"}`,
      );
    } catch {}
  }
  const params = getSearchParams();
  const quality = (params.get("quality") || "").toLowerCase();
  const models = (params.get("models") || "").toLowerCase();

  let modelMode = "full";
  if (quality === "lite" || models === "proxy") {
    modelMode = "lite";
  } else if (quality === "balanced" || quality === "mobile") {
    modelMode = "balanced";
  } else if (quality === "laptop" || quality === "desktop-balanced") {
    modelMode = "desktop-balanced";
  } else if (quality === "full" || models === "full") {
    modelMode = "full";
  } else if (limitedDevice) {
    modelMode = "balanced";
  } else if (desktopConstrained) {
    modelMode = "desktop-balanced";
  }

  const balancedMobile = limitedDevice && modelMode === "balanced";

  // Emergency "?lite=1" mode — kills mirrors, glow, and shadows entirely. Use when
  // even the constrained tier is too heavy. Verifies the floor is what limits FPS.
  const liteMode = modelMode === "lite" || params.get("lite") === "1";

  return {
    limitedDevice,
    desktopConstrained,
    constrainedPerformance,
    balancedMobile,
    liteMode,
    modelMode,
    useMaterialTextures: modelMode !== "lite",
    // Loading screen never blocks on the full model set — 51 GLBs loaded serially
    // (Babylon race forces one-at-a-time) would crawl. Only the fastest tier
    // preloads; everyone else opens the scene immediately and fills models in via
    // an eager background pass after entry (see StudioPage entry hook).
    preloadDeferredAssets: modelMode === "full" && !constrainedPerformance,
    engineAntialias: !constrainedPerformance,
    maxPixelRatio: limitedDevice ? (balancedMobile ? 1.18 : 1) : desktopConstrained ? 1.6 : 1.5,
    // Minimum hardware scaling level — forces framebuffer SMALLER than canvas
    // when set > 1, regardless of devicePixelRatio. Cuts fragment shader work
    // proportionally to area. Used to recover FPS on low-DPI iGPU laptops
    // where the DPR-based maxPixelRatio cap doesn't trigger (DPR=1 < 1.6).
    minHardwareScaling: liteMode ? 1.45 : desktopConstrained ? 1.25 : 1.0,
    powerPreference: constrainedPerformance ? "default" : "high-performance",
    disableClearCoat: constrainedPerformance,
    // Pass B atmosphere lift on desktop-constrained — the "old laptop" tier was
    // visibly flattened. Bigger shadow map + wider blur = softer/luxurier
    // shadows; glow intensity closer to full tier = more cinematic mood.
    shadowMapSize: liteMode ? 0 : limitedDevice ? (balancedMobile ? 768 : 512) : desktopConstrained ? 768 : 1024,
    shadowBlurKernel: liteMode ? 0 : limitedDevice ? (balancedMobile ? 8 : 4) : desktopConstrained ? 14 : 18,
    enableGlow: !limitedDevice && !liteMode && modelMode !== "lite",
    // Glow presence bumped: 0.42 → 0.55 (constrained), 0.5 → 0.62 (strong).
    // The reference gallery aesthetic shows light fixtures + LED strips
    // popping clearly off the dark surroundings — at 0.42 they read as
    // matte. 0.55 makes them luminous without going into bloom-bomb territory.
    glowIntensity: desktopConstrained ? 0.55 : 0.62,
    // Floor + pedestal MirrorTextures are disabled on constrained GPUs. On weak
    // iGPUs the live floor mirror re-renders the whole scene every frame and was
    // triggering a framebuffer/texture feedback loop (GL_INVALID_OPERATION) that
    // starved the GPU during load — the showroom hung at 4%. The floor still reads
    // as glossy via microSurface + environmentIntensity (env reflection), just
    // without the per-frame live mirror. Full-tier GPUs keep the real mirror.
    // Floor reflection is the single biggest "luxury showroom" cue — the
    // client complaint of "feels downgraded" was driven by this being off on
    // weak laptops. We turn it back ON for desktop-constrained (Intel iGPU
    // class), with a smaller mirror buffer + lower refresh rate (see
    // _buildFloorReflections in ShowroomWorld). Phones (limitedDevice) and
    // ?lite=1 stay reflection-free to protect mobile memory + iOS Safari.
    enableFloorReflection: !liteMode && !limitedDevice,
    // Per-pedestal mirrors are pure polish on top of the floor mirror — keep
    // them strong-desktop-only; multiple 384² mirrors per pedestal would still
    // tank an iGPU even at low refresh.
    enablePedestalReflections: !liteMode && !constrainedPerformance,
  };
}

export function wantsHighQualityModels() {
  return getExperienceProfile().modelMode === "full";
}

export function wantsMaterialTextures() {
  return getExperienceProfile().useMaterialTextures;
}

export function shouldPreloadDeferredAssets() {
  return getExperienceProfile().preloadDeferredAssets;
}
