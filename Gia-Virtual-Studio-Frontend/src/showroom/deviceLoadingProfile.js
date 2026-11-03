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

  return saveData || slowNetwork || (lowDesktopRam && lowCoreCount);
}

function getSearchParams() {
  if (typeof window === "undefined") {
    return new URLSearchParams();
  }

  return new URLSearchParams(window.location.search);
}

export function getExperienceProfile() {
  const params = getSearchParams();
  const quality = (params.get("quality") || "").toLowerCase();
  const models = (params.get("models") || "").toLowerCase();

  // Force full quality on localhost for development
  const isLocalhost = typeof window !== "undefined" && /localhost|127\.0\.0\.1/.test(window.location.hostname);
  if (isLocalhost && !quality && !models) {
    return {
      limitedDevice: false,
      desktopConstrained: false,
      constrainedPerformance: false,
      balancedMobile: false,
      modelMode: "full",
      useMaterialTextures: true,
      preloadDeferredAssets: true,
      engineAntialias: true,
      maxPixelRatio: 1.35,
      powerPreference: "high-performance",
      shadowMapSize: 1024,
      shadowBlurKernel: 18,
      enableGlow: true,
      glowIntensity: 0.52,
    };
  }

  const limitedDevice = isLimitedDevice();
  const desktopConstrained = isDesktopConstrained();
  const constrainedPerformance = limitedDevice || desktopConstrained;

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

  return {
    limitedDevice,
    desktopConstrained,
    constrainedPerformance,
    balancedMobile,
    modelMode,
    useMaterialTextures: modelMode !== "lite",
    preloadDeferredAssets: modelMode === "full" && !constrainedPerformance,
    engineAntialias: !constrainedPerformance,
    maxPixelRatio: limitedDevice ? (balancedMobile ? 1.18 : 1) : desktopConstrained ? 1.1 : 1.35,
    powerPreference: constrainedPerformance ? "default" : "high-performance",
    shadowMapSize: limitedDevice ? (balancedMobile ? 768 : 512) : desktopConstrained ? 768 : 1024,
    shadowBlurKernel: limitedDevice ? (balancedMobile ? 12 : 8) : desktopConstrained ? 12 : 18,
    enableGlow: !limitedDevice && modelMode !== "lite",
    glowIntensity: desktopConstrained ? 0.38 : 0.52,
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
