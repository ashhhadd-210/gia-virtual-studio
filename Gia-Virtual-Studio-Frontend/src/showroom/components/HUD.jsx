/**
 * HUD
 *
 * Renders the full heads-up display overlay. All DOM ids are preserved so that
 * FirstPersonController and ShowroomWorld can continue querying them via
 * getElementById exactly as before — no changes needed to those modules.
 *
 * Props:
 *   compassRoseRef {React.RefObject} – ref forwarded to #compass-rose so App.jsx
 *                                      can pass the DOM node to FirstPersonController.
 */
export default function HUD({ compassRoseRef }) {
  return (
    <div id="hud">
      {/* Desktop showroom guide panel */}
      <div id="desktop-guide" aria-live="polite">
        <p className="desktop-guide__eyebrow">Showroom Guide</p>
        <p id="desktop-guide-state" className="desktop-guide__state">
          Hover any item
        </p>
        <p className="desktop-guide__detail">
          Click any mannequin, bag, or shoe to focus it, or click the floor
          tiles to glide to that position.
        </p>
        <p id="desktop-guide-pace" className="desktop-guide__pace">
          Click any mannequin, bag, or shoe to focus it, or click the floor
          tiles to fly there.
        </p>
      </div>

      {/* Compass */}
      <div id="compass" aria-label="Compass">
        <div className="compass-marker" />
        <div id="compass-rose" ref={compassRoseRef}>
          <span className="north">N</span>
          <span className="east">E</span>
          <span className="south">S</span>
          <span className="west">W</span>
        </div>
      </div>

      {/* Hover tooltip */}
      <div id="hover-guide" aria-hidden="true">
        <p id="hover-guide-label" className="hover-guide__label">
          Inspect item
        </p>
        <p id="hover-guide-action" className="hover-guide__action">
          Click to fly here and orbit
        </p>
        <p id="hover-guide-source" className="hover-guide__source" hidden>
          GLB: model.glb
        </p>
      </div>

      {/* Centre crosshair (desktop) */}
      <div id="desktop-reticle" aria-hidden="true">
        <div className="desktop-reticle__ring" />
        <div className="desktop-reticle__dot" />
      </div>

      {/* Corner orbit buttons */}
      <div
        id="corner-rotate-left"
        className="corner-rotate corner-rotate--left"
        aria-hidden="true"
      >
        <span>360</span>
      </div>
      <div
        id="corner-rotate-right"
        className="corner-rotate corner-rotate--right"
        aria-hidden="true"
      >
        <span>360</span>
      </div>

      {/* Mobile joystick + look hint */}
      <div id="mobile-controls" aria-hidden="true">
        <div id="move-joystick" className="mobile-control">
          <div className="mobile-control__ring" />
          <div id="move-knob" className="mobile-control__knob" />
        </div>
        <div id="look-hint" className="mobile-look-hint">
          Drag right side to look
        </div>
      </div>
    </div>
  );
}
