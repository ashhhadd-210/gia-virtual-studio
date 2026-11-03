import { useState, useEffect } from "react";

/* ─────────────────────────────────────────────────────────────
   LoadingScreen — Blue luxury entry screen for the GIA showroom.

   Props
   ─────
   percent {number}  0-100 progress value
   hidden  {boolean} when true the overlay fades out
   ───────────────────────────────────────────────────────────── */

const STATUS_PHRASES = [
  { at: 0,  text: "Initializing showroom environment…" },
  { at: 14, text: "Streaming spatial geometry…" },
  { at: 28, text: "Loading collection assets…" },
  { at: 42, text: "Calibrating lighting & materials…" },
  { at: 56, text: "Synchronizing AI intelligence layer…" },
  { at: 70, text: "Preparing agent protocols…" },
  { at: 84, text: "Finalizing your GIA experience…" },
  { at: 96, text: "Entering the showroom…" },
];

const TAGLINES = [
  "Where fashion meets intelligence.",
  "The future of couture, rendered in real time.",
  "Powered by GIA Intelligence.",
  "Curated by AI. Defined by you.",
  "Step into tomorrow's atelier today.",
];

const FEATURES = ["3D Showroom", "AI Agents", "Proxy Voting", "Live Collection", "Avatar Fitting"];

export default function LoadingScreen({ percent, hidden }) {
  const [taglineIdx, setTaglineIdx] = useState(0);
  const [fade, setFade]             = useState(true);

  /* Rotate tagline every 2.6 s with a fade */
  useEffect(() => {
    const id = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setTaglineIdx((i) => (i + 1) % TAGLINES.length);
        setFade(true);
      }, 350);
    }, 2600);
    return () => clearInterval(id);
  }, []);

  /* Derive current status phrase from percent */
  const phrase = [...STATUS_PHRASES]
    .reverse()
    .find((p) => percent >= p.at) ?? STATUS_PHRASES[0];

  return (
    <div
      id="loading-screen"
      className={`loading-screen${hidden ? " loading-screen--hidden" : ""}`}
      aria-busy={!hidden}
      aria-live="polite"
      aria-label="Loading GIA Showroom"
    >
      {/* ── Ambient background orbs ───────────────────────── */}
      <div className="ls-orb ls-orb--1" />
      <div className="ls-orb ls-orb--2" />
      <div className="ls-orb ls-orb--3" />

      {/* ── Dot-grid overlay ──────────────────────────────── */}
      <div className="ls-grid" />

      {/* ── Horizontal scan line ──────────────────────────── */}
      {/* <div className="ls-scan" /> */}

      {/* ── Main content ──────────────────────────────────── */}
      <div className="loading-screen__inner">

        {/* Brand lockup */}
        <div className="ls-brand-wrap">
          <span className="ls-brand-line" />
          <h1 className="loading-screen__brand">GIA</h1>
          <span className="ls-brand-line" />
        </div>

        {/* <p className="ls-wordmark">Global Intelligence Atelier</p> */}

        {/* Rotating tagline */}
        <p className={`ls-tagline${fade ? " ls-tagline--visible" : ""}`}>
          {TAGLINES[taglineIdx]}
        </p>

        {/* Divider */}
        <div className="ls-divider" />

        {/* Progress bar */}
        <div
          className="loading-screen__bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div
            className="loading-screen__bar-glow"
            style={{ width: `${percent}%` }}
          />
          <div
            className="loading-screen__bar-fill"
            style={{ transform: `scaleX(${percent / 100})` }}
          />
        </div>

        {/* Status + percent */}
        <div className="ls-status-row">
          <span className="ls-status-phrase">{phrase.text}</span>
          <span className="loading-screen__percent">{percent}%</span>
        </div>

        {/* Feature chips */}
        <div className="ls-chips">
          {FEATURES.map((f) => (
            <span key={f} className="ls-chip">{f}</span>
          ))}
        </div>

        {/* Footer note */}
        <p className="ls-footer">
          AI-powered · Immersive · Interactive
        </p>
      </div>
    </div>
  );
}
