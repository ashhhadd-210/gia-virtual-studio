import { useEffect, useRef, useState, useCallback } from "react";

import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader.js";
import "@babylonjs/core/Culling/ray.js";
import { KhronosTextureContainer2 } from "@babylonjs/core/Misc/khronosTextureContainer2.js";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { FxaaPostProcess } from "@babylonjs/core/PostProcesses/fxaaPostProcess.js";
import { Scene } from "@babylonjs/core/scene.js";

import { AudioManager } from "../showroom/AudioManager.js";
import { FirstPersonController } from "../showroom/FirstPersonController.js";
import { ShowroomWorld } from "../showroom/ShowroomWorld.js";
import { getExperienceProfile } from "../showroom/deviceLoadingProfile.js";
import { waitForShowroomReady } from "../showroom/loadingScreen.js";
import { attachPerfOverlay } from "../showroom/perfOverlay.js";
import { fetchGeneratedDesigns, fetchShowroom } from "../Api/api.js";
import {
  SHOWROOM_BAG_FILENAMES,
  SHOWROOM_SHOE_FILENAMES,
  SHOWROOM_ACCESSORY_FILENAMES,
} from "../showroom/showroomAccessoryModels.js";

import LoadingScreen from "../showroom/components/LoadingScreen.jsx";
import HUD          from "../showroom/components/HUD.jsx";
import InspectPanel from "../showroom/components/InspectPanel.jsx";
import GSNowGPT     from "../showroom/components/GSNowGPT/index.jsx";

import "../showroom/styles.css";
import "../showroom/showroom-ui.css";

export default function StudioPage() {
  /* ── Babylon refs ──────────────────────────────────────── */
  const canvasRef      = useRef(null);
  const compassRoseRef = useRef(null);
  const controllerRef  = useRef(null); // exposes exitShowcaseFocus to InspectPanel

  /* ── Loading state ─────────────────────────────────────── */
  const [loadingPercent, setLoadingPercent] = useState(0);
  const [loadingHidden,  setLoadingHidden]  = useState(false);

  /* ── Inspect Mode state ────────────────────────────────── */
  const [inspectTarget, setInspectTarget] = useState(null);

  /* ── GSNowGPT state ────────────────────────────────────── */
  const [chatOpen,    setChatOpen]    = useState(true);   // always visible by default
  const [chatContext, setChatContext] = useState(null);

  /* ── Callbacks (stable refs so the render loop closure is safe) ── */
  const setInspectTargetRef = useRef(setInspectTarget);
  setInspectTargetRef.current = setInspectTarget;

  /**
   * Maps GLB filename → "design-{id}" product item ID.
   * Populated when design data is fetched from /generated-designs.
   * Stored in a ref so the Babylon render-loop closure always reads the
   * latest value without triggering a re-render.
   */
  const modelFileToProductItemIdRef = useRef(new Map());

  /**
   * Maps "design-{id}" → the showroom title string (e.g. "Cascade Evening Gown").
   * Populated from /showroom so the InspectPanel and chat always use the real
   * model name rather than the hardcoded "Inspect look" or raw GLB filename.
   */
  const productItemIdToTitleRef = useRef(new Map());

  /**
   * Maps GLB filename → { model_url, image_url }.
   * Populated from /generated-designs so InspectPanel can persist both URLs
   * into user_collections when the user saves a design.
   */
  const modelFileToAssetsRef = useRef(new Map());

  /* ── Open GSNowGPT with an optional context ─────────────── */
  const openChat = useCallback((ctx = null) => {
    setChatContext(ctx);
    setChatOpen(true);
  }, []);

  const closeChat = useCallback(() => {
    setChatOpen(false);
  }, []);

  const clearChatContext = useCallback(() => {
    setChatContext(null);
  }, []);

  const handleBack = useCallback(() => {
    controllerRef.current?.exitShowcaseFocus();
  }, []);

  /* ── Sync body class + engine resize when chat panel toggles ── */
  useEffect(() => {
    document.body.classList.toggle("chat-sidebar-open", chatOpen);
    const id = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    return () => cancelAnimationFrame(id);
  }, [chatOpen]);

  /* ── Babylon.js initialisation ─────────────────────────── */
  useEffect(() => {
    const canvas      = canvasRef.current;
    const compassRose = compassRoseRef.current;
    if (!canvas) return;

    // Track whether the effect has been torn down so the async setup can bail
    // out early if the component unmounts while the API fetch is in-flight.
    let active = true;
    let engine = null;
    let handleResize = null;

    // Ordered filenames for the 3 center-platform slots.
    // Order determines which slot (left / center / right) each gown occupies.
    const MAIN_AREA_FILENAMES = [
      "Geometric_Bouquet_Gown_512_MeshQuantized_NoDecimation.glb",
      "Meshy_AI_Petal_Cascade_Evening_0502210207_texture.glb",
      "Meshy_Azure_Origami_Gown_texture_only_max512_q70.glb",
    ];

    (async () => {
      /* ── Step 1: Fetch design URLs + showroom titles in parallel ── */
      let designModelUrls  = [];
      let mainAreaModelUrls = [];
      let bagModelUrls     = [];
      let shoeModelUrls    = [];

      // Kick off both requests simultaneously so neither blocks the other.
      const [designData, showroomData] = await Promise.allSettled([
        fetchGeneratedDesigns(),
        fetchShowroom({ limit: 200 }),   // 200 covers any realistic showroom
      ]);

      // Build the productItemId → title map from showroom data first so it is
      // ready by the time the render-loop bridge starts enriching targets.
      if (showroomData.status === "fulfilled" && showroomData.value?.items?.length) {
        const titleMap = new Map();
        for (const item of showroomData.value.items) {
          // product_item_id is "design-{generated_designs.id}" from the backend query
          if (item.product_item_id && item.title) {
            titleMap.set(item.product_item_id, item.title);
          }
        }
        productItemIdToTitleRef.current = titleMap;
        console.log(`[StudioPage] Loaded ${titleMap.size} showroom title(s).`);
      }

      try {
        const data = designData.status === "fulfilled" ? designData.value : null;
        if (!data) throw new Error("Design fetch failed");
        if (data.items?.length) {
          const mainAreaMap = new Map(MAIN_AREA_FILENAMES.map((f) => [f, null]));
          const bagMap      = new Map(SHOWROOM_BAG_FILENAMES.map((f) => [f, null]));
          const shoeMap     = new Map(SHOWROOM_SHOE_FILENAMES.map((f) => [f, null]));
          const seen        = new Set();

          // Build the filename → "design-{id}" product-item map for InspectPanel voting/saving.
          const productItemMap = new Map();
          // Build the filename → { model_url, image_url } asset map so InspectPanel
          // can persist the real URLs into user_collections when a user saves a design.
          const assetMap = new Map();

          for (const item of data.items) {
            // Only load GLBs for publishable designs — rejected / pending items
            // may point to deleted or incomplete files and cause silent 404s
            // that waste retry slots and slow down valid model loads.
            if (!item.model_url || !item.publishable) continue;
            const filename = item.model_url.split("/").pop().split("?")[0];

            // Always register every publishable design's item ID so the InspectPanel
            // can vote or save regardless of which display slot the model ends up in.
            if (filename && item.id != null) {
              productItemMap.set(filename, `design-${item.id}`);
              assetMap.set(filename, {
                model_url: item.model_url || null,
                image_url: item.image_url  || null,
              });
            }

            // Capture pinned center-platform gowns (first occurrence wins).
            if (mainAreaMap.has(filename)) {
              if (mainAreaMap.get(filename) === null) mainAreaMap.set(filename, item.model_url);
              continue;
            }
            // Capture vitrine bags.
            if (bagMap.has(filename)) {
              if (bagMap.get(filename) === null) bagMap.set(filename, item.model_url);
              continue;
            }
            // Capture vitrine shoes.
            if (shoeMap.has(filename)) {
              if (shoeMap.get(filename) === null) shoeMap.set(filename, item.model_url);
              continue;
            }
            // Remaining items go to the general mannequin pool (accessories already excluded above).
            if (!SHOWROOM_ACCESSORY_FILENAMES.has(filename) && !seen.has(item.model_url)) {
              seen.add(item.model_url);
              designModelUrls.push(item.model_url);
            }
          }

          // Preserve declaration order for each category.
          mainAreaModelUrls = MAIN_AREA_FILENAMES.map((f) => mainAreaMap.get(f)).filter(Boolean);
          bagModelUrls      = SHOWROOM_BAG_FILENAMES.map((f) => bagMap.get(f)).filter(Boolean);
          shoeModelUrls     = SHOWROOM_SHOE_FILENAMES.map((f) => shoeMap.get(f)).filter(Boolean);

          // Publish maps so the render-loop closure can enrich inspect targets.
          modelFileToProductItemIdRef.current = productItemMap;
          modelFileToAssetsRef.current        = assetMap;
        }
        console.log(
          `ShowroomWorld: ${designModelUrls.length} mannequins, ` +
          `${mainAreaModelUrls.length}/3 main-area gowns, ` +
          `${bagModelUrls.length} bags, ${shoeModelUrls.length} shoes from API.`
        );
      } catch (err) {
        console.warn("Failed to fetch generated designs from API:", err);
      }

      if (!active) return;

      /* ── Step 2: Babylon.js engine + scene setup ─────────── */
      SceneLoader.ShowLoadingScreen = false;

      // KTX2/Basis transcoders — required to decode .ktx2 textures inside GLBs.
      // We point at Babylon's CDN-hosted WASM modules so nothing needs to be
      // bundled or self-hosted. Set BEFORE any GLB load attempts; safe to set
      // even when the project has no KTX2 textures (no-op until one is loaded).
      // Texture compression is the only way to cut the constrained-tier VRAM
      // budget below the iGPU thrash threshold (~700 MB).
      KhronosTextureContainer2.URLConfig = {
        jsDecoderModule:        "https://cdn.babylonjs.com/babylon.ktx2Decoder.js",
        wasmUASTCToASTC:        "https://cdn.babylonjs.com/ktx2Transcoders/1/uastc_astc.wasm",
        wasmUASTCToBC7:         "https://cdn.babylonjs.com/ktx2Transcoders/1/uastc_bc7.wasm",
        wasmUASTCToRGBA_UNORM:  "https://cdn.babylonjs.com/ktx2Transcoders/1/uastc_rgba8_unorm.wasm",
        wasmUASTCToRGBA_SRGB:   "https://cdn.babylonjs.com/ktx2Transcoders/1/uastc_rgba8_srgb.wasm",
        wasmUASTCToR8_UNORM:    "https://cdn.babylonjs.com/ktx2Transcoders/1/uastc_r8_unorm.wasm",
        wasmUASTCToRG8_UNORM:   "https://cdn.babylonjs.com/ktx2Transcoders/1/uastc_rg8_unorm.wasm",
        jsMSCTranscoder:        "https://cdn.babylonjs.com/ktx2Transcoders/1/msc_basis_transcoder.js",
        wasmMSCTranscoder:      "https://cdn.babylonjs.com/ktx2Transcoders/1/msc_basis_transcoder.wasm",
        wasmZSTDDecoder:        "https://cdn.babylonjs.com/zstddec.wasm",
      };

      const applyLoadingProgress = (pct) => setLoadingPercent(pct);

      const experienceProfile = getExperienceProfile();
      const { limitedDevice, constrainedPerformance } = experienceProfile;

      engine = new Engine(canvas, false, {
        adaptToDeviceRatio: false,
        antialias: experienceProfile.engineAntialias,
        preserveDrawingBuffer: false,
        // Stencil costs uniform pressure on ANGLE; we only need it for the
        // outline/highlight layer which is off on constrained.
        stencil: !constrainedPerformance,
        powerPreference: experienceProfile.powerPreference,
        failIfMajorPerformanceCaveat: false,
        // We use Howler for all audio; Babylon's audio engine is unused weight.
        audioEngine: false,
      });
      engine.disableManifestCheck = true;

      // ── Weak-GPU shader fix ───────────────────────────────────────────────
      // Intel iGPUs (and other low-end GPUs) running through ANGLE cap
      // GL_MAX_VERTEX_UNIFORM_BUFFERS at 12. Babylon's PBR vertex shader needs
      // more uniform-buffer bindings than that with our lighting, so the shader
      // fails to compile ("uniform block count exceeds GL_MAX_VERTEX_UNIFORM_BUFFERS")
      // → nothing renders → the loader hangs forever. Forcing the non-UBO
      // uniform path removes the limit (individual uniforms are bounded by
      // GL_MAX_VERTEX_UNIFORM_VECTORS, which is >=256 even on weak GPUs). Costs a
      // little CPU per draw, but it's the difference between rendering and a black
      // screen. Probe the real limit too, so any GPU under the threshold is caught
      // even if our name-based tier detection missed it.
      try {
        const gl = engine._gl;
        const maxVertexUBOs =
          gl && gl.MAX_VERTEX_UNIFORM_BLOCKS ? gl.getParameter(gl.MAX_VERTEX_UNIFORM_BLOCKS) : 0;
        if (constrainedPerformance || (maxVertexUBOs && maxVertexUBOs < 16)) {
          engine.disableUniformBuffers = true;
        }
      } catch {
        if (constrainedPerformance) engine.disableUniformBuffers = true;
      }

      const maxPixelRatio  = experienceProfile.maxPixelRatio;
      const devicePixelRatio = window.devicePixelRatio || 1;
      // Babylon `setHardwareScalingLevel(N)`: framebuffer = canvas / N.
      // N > 1 → smaller framebuffer → less fragment work.
      let hwScaling = 1.0;
      if (devicePixelRatio > maxPixelRatio) {
        hwScaling = devicePixelRatio / maxPixelRatio;
      }
      // Floor at min from device profile (constrained/lite tiers force a
      // smaller framebuffer even when DPR=1, where the cap above wouldn't fire).
      const minScaling = experienceProfile.minHardwareScaling ?? 1.0;
      if (hwScaling < minScaling) {
        hwScaling = minScaling;
      }
      if (hwScaling !== 1.0) {
        engine.setHardwareScalingLevel(hwScaling);
      }

      const scene = new Scene(engine);
      // ACES tone mapping + small contrast lift → cinematic luxury feel. Raw
      // linear-to-sRGB (Babylon default) is what reads as "flat / not premium"
      // even when materials are otherwise correct. Near-zero GPU cost.
      scene.imageProcessingConfiguration.toneMappingEnabled = true;
      scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
      // Slight exposure lift + contrast punch: the dark-stone showroom mood
      // looked muddy at neutral 1.0/1.08. Editorial fashion photography
      // typically pushes exposure +0.05 and contrast to ~1.12 for separation
      // between hot mannequin spots and the surrounding darkness. ACES
      // curve handles the highlights so we don't clip.
      scene.imageProcessingConfiguration.exposure = 1.05;
      scene.imageProcessingConfiguration.contrast = 1.12;
      // Subtle cinematic vignette — corner darkening reads as "you're looking
      // through a luxury camera lens", not "filter applied". Weight 1.5 is
      // gentle enough to be subconscious; centre offset 0 keeps it symmetric.
      // Costs ~0.2ms/frame on iGPU — negligible vs the perception lift.
      scene.imageProcessingConfiguration.vignetteEnabled = true;
      scene.imageProcessingConfiguration.vignetteWeight = 1.5;
      scene.imageProcessingConfiguration.vignetteStretch = 0;
      scene.imageProcessingConfiguration.vignetteCentreX = 0;
      scene.imageProcessingConfiguration.vignetteCentreY = 0;
      scene.imageProcessingConfiguration.vignetteBlendMode = ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;
      scene.autoClearDepthAndStencil    = false;
      scene.skipPointerMovePicking      = true;
      scene.blockMaterialDirtyMechanism = true;
      scene.clearColor   = Color4.FromHexString("#04070aff");
      scene.fogMode      = Scene.FOGMODE_LINEAR;
      scene.fogStart     = 48;
      scene.fogEnd       = 228;
      scene.fogColor     = Color3.FromHexString("#04070a");
      scene.ambientColor = Color3.FromHexString("#435863");
      // Raised from 4 → 6 so every dedicated mannequin dedolight (key light +
      // up to 5 spot fixtures) actually illuminates the PBR mannequin materials.
      scene.maxSimultaneousLights = 6;

      const ambient = new HemisphericLight("warm-ambient", new Vector3(0, 1, 0), scene);
      ambient.diffuse     = Color3.FromHexString("#f4fbff");
      ambient.groundColor = Color3.FromHexString("#2a3a45");
      // Slightly brighter ground bounce so the underside of garments reads clearly.
      ambient.intensity   = 1.18;

      /* ── Step 3: Create world with backend design model URLs ─ */
      const world = new ShowroomWorld(scene, designModelUrls, mainAreaModelUrls, { bags: bagModelUrls, shoes: shoeModelUrls });
      world.ready.catch((err) =>
        console.warn("Some showroom models could not be loaded before startup", err)
      );

      const camera = new FreeCamera("visitor-camera", world.spawnPoint.clone(), scene);
      camera.inputs.clear();
      camera.fov  = (72 * Math.PI) / 180;
      // Tighter near/far plane buys depth-buffer precision on mobile (16-bit
      // depth on iOS Safari). The far wall is at z≈-115 so 250 is ample.
      camera.minZ = 0.12;
      camera.maxZ = 250;
      scene.activeCamera = camera;

      // Cheap post-process AA — recovers edge sharpness on the constrained tier
      // (engine MSAA is off there) without the cost of MSAA. Negligible on
      // strong GPUs, perceptually meaningful on weak ones.
      new FxaaPostProcess("gia-fxaa", 1.0, camera, undefined, engine);

      // ?perf=1 mounts a live FPS / draws / textures / GPU-mem overlay. Costs
      // <0.1 ms/frame — safe to leave in production.
      attachPerfOverlay(engine, scene);

      const audioManager = new AudioManager();
      const controller   = new FirstPersonController(
        camera, canvas, world, compassRose, audioManager
      );
      controllerRef.current = controller;

      /* ── Render loop + Babylon→React bridge ──────────────── */
      let lastMode   = "browse";
      let lastTarget = null;

      // Defined here but NOT started yet. Running the full render loop
      // (world.update + scene.render every frame) DURING loading starves the GPU
      // on weak devices — it competes with GLB texture decode and shader
      // compilation, which is what stalled the loader at ~4%. We start it only
      // after waitForShowroomReady, whose warmup phase does its own controlled
      // scene.render() calls.
      const renderLoop = () => {
        const delta = engine.getDeltaTime() / 1000;
        controller.update(delta);
        world.update(camera.position, delta);
        scene.render();

        // Bridge: detect when orbit mode begins/ends and update React state.
        const currentMode   = controller.desktopMode;
        const currentTarget = controller.activeTarget;

        const modeChanged   = currentMode   !== lastMode;
        const targetChanged = currentTarget !== lastTarget;

        if (modeChanged || targetChanged) {
          lastMode   = currentMode;
          lastTarget = currentTarget;

          if (currentMode === "orbit" && currentTarget) {
            // Look up the backend product_item_id from the GLB filename.
            const productItemId =
              currentTarget.sourceFileName
                ? (modelFileToProductItemIdRef.current.get(currentTarget.sourceFileName) ?? null)
                : null;

            // Look up the proper showroom title (e.g. "Cascade Evening Gown").
            // Falls back to null so InspectPanel / ChatView use their own fallbacks.
            const title = productItemId
              ? (productItemIdToTitleRef.current.get(productItemId) ?? null)
              : null;

            // Look up the raw CDN model_url and image_url so InspectPanel can
            // persist them into user_collections when the user saves a design.
            const assets = currentTarget.sourceFileName
              ? (modelFileToAssetsRef.current.get(currentTarget.sourceFileName) ?? null)
              : null;

            setInspectTargetRef.current({
              ...currentTarget,
              product_item_id: productItemId,
              title,
              model_url: assets?.model_url ?? null,
              image_url: assets?.image_url ?? null,
            });
          } else if (currentMode === "browse" && !currentTarget) {
            setInspectTargetRef.current(null);
          } else if (currentMode === "transition") {
            setInspectTargetRef.current(null);
          }
        }
      };

      handleResize = () => engine.resize();
      window.addEventListener("resize", handleResize);

      /* ── Loading sequence ────────────────────────────────── */
      const __loadStart = performance.now();
      try {
        await waitForShowroomReady(scene, world, {
          onProgress: applyLoadingProgress,
          engine,
          camera,
          limitedDevice,
          constrainedPerformance,
        });
      } catch (err) {
        console.warn("Loading sequence incomplete", err);
      } finally {
        // Start the continuous render loop only NOW — after the GPU-heavy load
        // phase. Keeping it off during loading frees the GPU for decode/compile.
        engine.runRenderLoop(renderLoop);
        console.info(
          `[GIA] total load → interactive: ${((performance.now() - __loadStart) / 1000).toFixed(2)}s`,
        );
        document.body.classList.remove("loading-active");
        setLoadingHidden(true);
        scene.blockMaterialDirtyMechanism = false;

        if ("serviceWorker" in navigator && location.protocol === "https:") {
          navigator.serviceWorker.register("/sw.js").catch(() => {});
        }

        // Stream models on-approach only. Eager-loading all 51 mannequins after
        // entry blows the VRAM budget on constrained GPUs (uncompressed RGBA
        // textures → 1.6 GB → page-thrash → 8 FPS). With on-approach streaming,
        // only ~5-10 nearby models stay resident, VRAM stays manageable.
        // Trade-off: distant mannequins appear as you walk toward them.
        // The only way to have "all loaded at once" on weak hardware is to
        // compress textures (KTX2 / Basis Universal) — see scripts/compress-textures-ktx2.mjs.
        requestAnimationFrame(() => world.activateStreaming?.());
      }
    })();

    return () => {
      active = false;
      if (handleResize) window.removeEventListener("resize", handleResize);
      engine?.dispose();
      controllerRef.current = null;
    };
  }, []);

  return (
    <>
      {/* ── Loading overlay ───────────────────────────────── */}
      <LoadingScreen percent={loadingPercent} hidden={loadingHidden} />

      {/* ── 3D canvas ─────────────────────────────────────── */}
      <canvas
        ref={canvasRef}
        id="render-canvas"
        style={{ width: chatOpen ? "calc(100% - 360px)" : "100%" }}
        aria-label="GIA 3D showroom"
      />

      {/* ── HUD (compass, guide, joystick…) ──────────────── */}
      <HUD compassRoseRef={compassRoseRef} />

      {/* ── Inspect Mode action bar ───────────────────────── */}
      {inspectTarget && (
        <InspectPanel
          target={inspectTarget}
          onBack={handleBack}
          onOpenChat={openChat}
        />
      )}

      {/* ── GSNowGPT trigger button (shown only when panel is closed) ── */}
      {loadingHidden && !chatOpen && (
        <button
          className="gsnowgpt-trigger"
          onClick={() => openChat(null)}
          aria-label="Open GSNowGPT showroom AI"
          aria-expanded={chatOpen}
        >
          <span className="gsnowgpt-trigger__dot" />
          <span>
            <div className="gsnowgpt-trigger__label">GSNowGPT</div>
            <div className="gsnowgpt-trigger__sub">Showroom AI</div>
          </span>
        </button>
      )}

      {/* ── GSNowGPT panel ───────────────────────────────── */}
      <GSNowGPT
        open={chatOpen}
        onClose={closeChat}
        context={chatContext}
        onContextClear={clearChatContext}
        activeDesign={inspectTarget}
      />
    </>
  );
}
