import { useState, useEffect } from "react";

/**
 * LicenseGate — Delivery-pending access gate for the GIA Showroom.
 *
 * Until the developer flips `RELEASED = true` in this file (or sets
 * VITE_GIA_RELEASED="true" at build time), every visitor to `/studio` is
 * blocked by a fullscreen passcode prompt. The correct access code unlocks
 * the showroom for that browser (localStorage flag) so the client doesn't
 * have to re-enter it on every visit.
 *
 * To unlock universally after final payment / delivery acceptance:
 *   1. Set `RELEASED = true` below
 *   2. git push (DO auto-redeploys in ~90s)
 *
 * To rotate the access code (e.g. revoke after a testing window):
 *   1. Change `ACCESS_CODE` below to a new value
 *   2. git push — old localStorage tokens become invalid because the
 *      stored token includes a hash of the current code.
 */

// ── Configuration ──────────────────────────────────────────────────────────
// Flip this to `true` after the client has confirmed delivery acceptance.
// When true, the gate is bypassed entirely for everyone.
const RELEASED = false;

// The access code the developer shares privately with the client for testing.
// Read from env (VITE_GIA_GATE_CODE) so the code never enters source control.
// Falls back to a random per-build string if env is unset — that intentionally
// locks everyone out so a leaked source tree alone can't unlock the gate.
const ACCESS_CODE =
  import.meta.env.VITE_GIA_GATE_CODE ||
  `HOLD-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

// localStorage key — includes a salt so rotating ACCESS_CODE invalidates
// existing browser sessions automatically.
const STORAGE_KEY = "gia_access_v1";

// ── Helpers ────────────────────────────────────────────────────────────────

function hashCode(str) {
  // Tiny non-cryptographic hash — enough to make the stored token opaque
  // and invalidate it when ACCESS_CODE changes. We're not defending against
  // a determined attacker; we're gating non-dev clients.
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}

function isUnlocked() {
  if (RELEASED) return true;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === hashCode(ACCESS_CODE);
  } catch {
    return false;
  }
}

function setUnlocked() {
  try {
    localStorage.setItem(STORAGE_KEY, hashCode(ACCESS_CODE));
  } catch {
    /* localStorage unavailable — non-fatal */
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export default function LicenseGate({ children }) {
  const [unlocked, setUnlocked_] = useState(() => isUnlocked());
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  // Re-check on mount in case another tab set the flag
  useEffect(() => {
    setUnlocked_(isUnlocked());
  }, []);

  if (unlocked) return children;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (input.trim() === ACCESS_CODE) {
      setUnlocked();
      setUnlocked_(true);
    } else {
      setError("Invalid access code.");
      setTimeout(() => setError(""), 2400);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "linear-gradient(135deg, #05070d 0%, #0a1228 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          background: "rgba(8, 18, 44, 0.85)",
          border: "1px solid rgba(201, 162, 39, 0.35)",
          borderRadius: 12,
          padding: "36px 32px 30px",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6), 0 2px 30px rgba(201,162,39,0.08)",
          textAlign: "center",
          color: "#e8f4ff",
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.32em",
            fontWeight: 700,
            color: "#c9a227",
            textTransform: "uppercase",
            marginBottom: 14,
          }}
        >
          GIA Virtual Studio
        </div>
        <div
          style={{
            fontSize: 22,
            fontWeight: 600,
            marginBottom: 10,
            letterSpacing: "0.02em",
          }}
        >
          Pending Delivery Acceptance
        </div>
        <div
          style={{
            fontSize: 13.5,
            lineHeight: 1.6,
            color: "rgba(232,244,255,0.75)",
            marginBottom: 26,
          }}
        >
          This build is in final review and not yet released for general access.
          Please enter the access code provided by the developer to continue.
        </div>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Access code"
            autoFocus
            style={{
              width: "100%",
              padding: "12px 16px",
              fontSize: 14,
              fontFamily: "inherit",
              background: "rgba(4, 10, 26, 0.78)",
              border: "1.5px solid rgba(77, 200, 255, 0.25)",
              borderRadius: 8,
              color: "#e8f4ff",
              outline: "none",
              textAlign: "center",
              letterSpacing: "0.08em",
              marginBottom: 14,
              boxSizing: "border-box",
            }}
          />
          <button
            type="submit"
            style={{
              width: "100%",
              padding: "12px 16px",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              background: "linear-gradient(135deg, #c9a227 0%, #a47f17 100%)",
              color: "#0a1228",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontFamily: "inherit",
              boxShadow: "0 4px 16px rgba(201,162,39,0.25)",
            }}
          >
            Unlock
          </button>
          <div
            style={{
              marginTop: 12,
              fontSize: 12,
              color: error ? "#ff6b6b" : "rgba(232,244,255,0.4)",
              minHeight: 18,
              transition: "color 0.2s ease",
            }}
          >
            {error || ""}
          </div>
        </form>

        <div
          style={{
            marginTop: 18,
            fontSize: 11,
            color: "rgba(232,244,255,0.35)",
            letterSpacing: "0.04em",
          }}
        >
          © GIA Virtual Studio · Developer Build
        </div>
      </div>
    </div>
  );
}
