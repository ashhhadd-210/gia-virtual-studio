import { useState } from "react";
import { FREE_MESSAGE_LIMIT, getStoredMessageCount, getStoredPremium } from "./data.js";
import ChatView from "./ChatView.jsx";

/**
 * GSNowGPT — Single-view conversational panel for the GIA showroom.
 *
 * Props
 * ─────
 *  open           {boolean}    – Controls panel visibility
 *  onClose        {function}   – Called when the user closes the panel
 *  context        {object|null}– In-world context from showroom actions:
 *                                { type, target, preloadMessage, featureId }
 *  onContextClear {function}   – Called after context has been consumed
 *  activeDesign   {object|null}– The ShowroomWorld showcase target currently in
 *                                orbit focus (set by StudioPage whenever the camera
 *                                is orbiting a mannequin/item). Passed to ChatView
 *                                so every message is design-aware when relevant.
 *
 * Context types
 * ─────────────
 *  "style"   → Ask Stylist button on a mannequin
 *  "similar" → Show Similar Looks button on a mannequin
 *  "save"    → Save to Wardrobe action
 *  "feature" → A premium AI feature hotspot
 *  "general" → Generic pre-loaded message
 */
export default function GSNowGPT({ open, onClose, context, onContextClear, activeDesign }) {
  const [isPremium, setIsPremium] = useState(() => getStoredPremium());
  const [msgCount, setMsgCount]   = useState(() => getStoredMessageCount());

  const freeRemaining = Math.max(0, FREE_MESSAGE_LIMIT - msgCount);

  const handleUpgrade = () => {
    setIsPremium(true);
    setMsgCount(0);
  };

  const handleClose = () => {
    onClose?.();
    onContextClear?.();
  };

  return (
    <>
      {/* Click-away backdrop — does NOT block the 3-D canvas */}
      <div
        className={`gsnowgpt-backdrop${open ? " gsnowgpt-backdrop--open" : ""}`}
        onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        aria-hidden={!open}
      />

      {/* Panel */}
      <aside
        className={`gsnowgpt-panel${open ? " gsnowgpt-panel--open" : ""}`}
        aria-label="GIA Showroom AI"
        role="complementary"
      >
        {/* Header */}
        <div className="gsnowgpt-header">
          <div className="gsnowgpt-header__dot" />
          <div className="gsnowgpt-header__title">
            <div className="gsnowgpt-header__name">GIA</div>
            <div className="gsnowgpt-header__sub">
              GIA Showroom AI ·{" "}
              {isPremium
                ? "Premium"
                : `${freeRemaining} free msg${freeRemaining !== 1 ? "s" : ""} left`}
            </div>
          </div>
          <button
            type="button"
            className="gsnowgpt-header__minimize"
            onClick={handleClose}
            aria-label="Minimize chat panel"
            title="Minimize"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M3 7h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Single unified chat view — welcome menu + branching + real backend */}
        <ChatView
          context={context}
          onUpgrade={handleUpgrade}
          activeDesign={activeDesign}
        />
      </aside>
    </>
  );
}
