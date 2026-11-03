import { useEffect, useRef, useState, useCallback } from "react";

import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader.js";
import "@babylonjs/core/Culling/ray.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Scene } from "@babylonjs/core/scene.js";

import { AudioManager } from "../showroom/AudioManager.js";
import { FirstPersonController } from "../showroom/FirstPersonController.js";
import { ShowroomWorld } from "../showroom/ShowroomWorld.js";
import { getExperienceProfile } from "../showroom/deviceLoadingProfile.js";
import { waitForShowroomReady } from "../showroom/loadingScreen.js";
import { fetchGeneratedDesigns } from "../Api/api.js";
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
      /* ── Step 1: Fetch all model URLs from the backend ─────── */
      let designModelUrls  = [];
      let mainAreaModelUrls = [];
      let bagModelUrls     = [];
      let shoeModelUrls    = [];
      try {
        const data = await fetchGeneratedDesigns();
        if (data?.items?.length) {
          const mainAreaMap = new Map(MAIN_AREA_FILENAMES.map((f) => [f, null]));
          const bagMap      = new Map(SHOWROOM_BAG_FILENAMES.map((f) => [f, null]));
          const shoeMap     = new Map(SHOWROOM_SHOE_FILENAMES.map((f) => [f, null]));
          const seen        = new Set();

          for (const item of data.items) {
            // Only load GLBs for publishable designs — rejected / pending items
            // may point to deleted or incomplete files and cause silent 404s
            // that waste retry slots and slow down valid model loads.
            if (!item.model_url || !item.publishable) continue;
            const filename = item.model_url.split("/").pop().split("?")[0];

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

      const applyLoadingProgress = (pct) => setLoadingPercent(pct);

      const experienceProfile = getExperienceProfile();
      const { limitedDevice, constrainedPerformance } = experienceProfile;

      engine = new Engine(canvas, false, {
        adaptToDeviceRatio: false,
        antialias: experienceProfile.engineAntialias,
        preserveDrawingBuffer: false,
        stencil: true,
        powerPreference: experienceProfile.powerPreference,
        failIfMajorPerformanceCaveat: false,
      });
      engine.disableManifestCheck = true;

      const maxPixelRatio  = experienceProfile.maxPixelRatio;
      const devicePixelRatio = window.devicePixelRatio || 1;
      if (devicePixelRatio > maxPixelRatio) {
        engine.setHardwareScalingLevel(devicePixelRatio / maxPixelRatio);
      }

      const scene = new Scene(engine);
      scene.autoClearDepthAndStencil    = false;
      scene.skipPointerMovePicking      = true;
      scene.blockMaterialDirtyMechanism = true;
      scene.clearColor   = Color4.FromHexString("#04070aff");
      scene.fogMode      = Scene.FOGMODE_LINEAR;
      scene.fogStart     = 48;
      scene.fogEnd       = 228;
      scene.fogColor     = Color3.FromHexString("#04070a");
      scene.ambientColor = Color3.FromHexString("#435863");
      scene.maxSimultaneousLights = 4;

      const ambient = new HemisphericLight("warm-ambient", new Vector3(0, 1, 0), scene);
      ambient.diffuse     = Color3.FromHexString("#f4fbff");
      ambient.groundColor = Color3.FromHexString("#182029");
      ambient.intensity   = 1.12;

      /* ── Step 3: Create world with backend design model URLs ─ */
      const world = new ShowroomWorld(scene, designModelUrls, mainAreaModelUrls, { bags: bagModelUrls, shoes: shoeModelUrls });
      world.ready.catch((err) =>
        console.warn("Some showroom models could not be loaded before startup", err)
      );

      const camera = new FreeCamera("visitor-camera", world.spawnPoint.clone(), scene);
      camera.inputs.clear();
      camera.fov  = (72 * Math.PI) / 180;
      camera.minZ = 0.04;
      camera.maxZ = 620;
      scene.activeCamera = camera;

      const audioManager = new AudioManager();
      const controller   = new FirstPersonController(
        camera, canvas, world, compassRose, audioManager
      );
      controllerRef.current = controller;

      /* ── Render loop + Babylon→React bridge ──────────────── */
      let lastMode   = "browse";
      let lastTarget = null;

      engine.runRenderLoop(() => {
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
            setInspectTargetRef.current({ ...currentTarget });
          } else if (currentMode === "browse" && !currentTarget) {
            setInspectTargetRef.current(null);
          } else if (currentMode === "transition") {
            setInspectTargetRef.current(null);
          }
        }
      });

      handleResize = () => engine.resize();
      window.addEventListener("resize", handleResize);

      /* ── Loading sequence ────────────────────────────────── */
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
        document.body.classList.remove("loading-active");
        setLoadingHidden(true);
        scene.blockMaterialDirtyMechanism = false;

        if ("serviceWorker" in navigator && location.protocol === "https:") {
          navigator.serviceWorker.register("/sw.js").catch(() => {});
        }

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
      />
    </>
  );
}
