/**
 * Lightweight performance overlay. Toggle via `?perf=1` in the URL, or call
 * window.giaPerfOverlay.show() / hide() from devtools.
 *
 * Shows:
 *   - FPS (1s rolling)
 *   - Active mesh count
 *   - Total mesh count
 *   - Draw calls (frame count when EngineInstrumentation is enabled)
 *   - Material count
 *   - Texture count (and approx GPU memory)
 *   - Last asset load timing
 *
 * Designed to add < 0.1 ms per frame of overhead. Reads happen at 250 ms intervals
 * so they don't compete with the render loop.
 */
const STYLE = `
  position: fixed; top: 8px; right: 8px; z-index: 99999;
  background: rgba(4, 7, 10, 0.78); color: #c9d6dc;
  font: 11px/1.4 ui-monospace, Menlo, Consolas, monospace;
  padding: 8px 10px; border-radius: 6px; pointer-events: none;
  min-width: 200px; backdrop-filter: blur(4px);
  border: 1px solid rgba(212, 167, 76, 0.18);
  white-space: pre;
`;

export function attachPerfOverlay(engine, scene, options = {}) {
  if (typeof document === "undefined") return null;

  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const forceOn = options.alwaysOn === true || params.get("perf") === "1";
  if (!forceOn) {
    // Still expose the manual toggle for ad-hoc debugging in DevTools.
    if (typeof window !== "undefined") {
      window.giaPerfOverlay = window.giaPerfOverlay || {
        show: () => attachPerfOverlay(engine, scene, { alwaysOn: true }),
        hide: () => {
          const el = document.getElementById("gia-perf-overlay");
          if (el) el.remove();
        },
      };
    }
    return null;
  }

  const existing = document.getElementById("gia-perf-overlay");
  if (existing) existing.remove();

  const el = document.createElement("div");
  el.id = "gia-perf-overlay";
  el.setAttribute("style", STYLE);
  el.textContent = "perf: warming up…";
  document.body.appendChild(el);

  let lastSample = performance.now();
  let frames = 0;
  let lastDrawCalls = "—";
  let lastFps = "—";

  // Hook Babylon's per-frame draw-call counter if available without pulling
  // EngineInstrumentation (which is a separate module). Babylon exposes the
  // current frame's draw count on engine._drawCalls in dev builds but it's
  // not a stable API; we read it defensively.
  function readDrawCalls() {
    try {
      if (engine.drawCalls != null) return engine.drawCalls;
      if (engine._drawCalls?.current != null) return engine._drawCalls.current;
    } catch {}
    return "—";
  }

  function readTextureGpuMemoryMb() {
    let bytes = 0;
    const textures = scene.textures ?? [];
    for (const t of textures) {
      try {
        const w = t.getSize?.()?.width ?? t._width ?? 0;
        const h = t.getSize?.()?.height ?? t._height ?? 0;
        const channels = t.hasAlpha ? 4 : 3;
        bytes += w * h * channels;
      } catch {}
    }
    return (bytes / 1024 / 1024).toFixed(1);
  }

  function render() {
    const now = performance.now();
    const dt = now - lastSample;
    if (dt >= 250) {
      lastFps = ((frames * 1000) / dt).toFixed(1);
      lastDrawCalls = readDrawCalls();
      lastSample = now;
      frames = 0;

      const activeMeshes = scene.getActiveMeshes?.()?.length ?? "—";
      const totalMeshes = scene.meshes?.length ?? "—";
      const materials = scene.materials?.length ?? "—";
      const textures = scene.textures?.length ?? "—";
      const lights = scene.lights?.length ?? "—";
      const gpuMb = readTextureGpuMemoryMb();
      const hwScaling = engine.getHardwareScalingLevel?.() ?? 1;

      el.textContent =
        `FPS:        ${lastFps}\n` +
        `Draws:      ${lastDrawCalls}\n` +
        `Active:     ${activeMeshes} / ${totalMeshes}\n` +
        `Lights:     ${lights}\n` +
        `Materials:  ${materials}\n` +
        `Textures:   ${textures}  (~${gpuMb} MB)\n` +
        `HW scale:   ${typeof hwScaling === "number" ? hwScaling.toFixed(2) : hwScaling}`;
    }
    frames += 1;
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);

  return {
    destroy: () => el.remove(),
  };
}
