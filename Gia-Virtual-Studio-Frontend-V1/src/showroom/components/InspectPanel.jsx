import { useState, useEffect, useRef } from "react";
import { voteProduct, fetchVoteStatus, addToCollection, fetchCollectionStatus } from "../../Api/api.js";

/**
 * InspectPanel
 *
 * Appears anchored at the bottom-centre of the screen when the camera enters
 * orbit mode around a showcase target.
 *
 * Real backend integration:
 *  - Vote  → POST /products/{product_item_id}/vote  (JWT required)
 *  - Save  → POST /auth/me/collection              (JWT required)
 *  - On mount: GET /products/{id}/vote-status and GET /auth/me/collection/status/{id}
 *
 * Props
 * ─────
 *  target        {object}   – The active ShowroomWorld showcase target, enriched
 *                             with `product_item_id` by StudioPage
 *  onBack        {function} – Calls controller.exitShowcaseFocus()
 *  onOpenChat    {function} – (context) → opens GSNowGPT with pre-loaded context
 */
export default function InspectPanel({ target, onBack, onOpenChat }) {
  // ── Vote state ────────────────────────────────────────────────────────────
  const [hasVoted,    setHasVoted]    = useState(false);
  const [voteCount,   setVoteCount]   = useState(0);
  const [voteLoading, setVoteLoading] = useState(false);
  const [voteMsg,     setVoteMsg]     = useState(null); // { text, type: 'success'|'error'|'info' }

  // ── Save state ────────────────────────────────────────────────────────────
  const [isSaved,     setIsSaved]     = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveMsg,     setSaveMsg]     = useState(null);

  // ── Status fetch on target change ──────────────────────────────────────────
  const lastTargetId = useRef(null);

  useEffect(() => {
    if (!target) return;

    // Reset messages when a new target is focused
    setVoteMsg(null);
    setSaveMsg(null);

    const itemId = target.product_item_id;
    if (!itemId || lastTargetId.current === itemId) return;
    lastTargetId.current = itemId;

    // Reset counts while loading fresh status
    setHasVoted(false);
    setVoteCount(0);
    setIsSaved(false);

    let cancelled = false;

    (async () => {
      // Vote status (works unauthenticated — returns hasVoted:false if no token)
      try {
        const vs = await fetchVoteStatus(itemId);
        if (!cancelled) {
          setHasVoted(Boolean(vs.hasVoted));
          setVoteCount(Number(vs.votes) || 0);
        }
      } catch {
        /* non-fatal — keep defaults */
      }

      // Collection status (requires auth — returns isInCollection:false if no token)
      try {
        const cs = await fetchCollectionStatus(itemId);
        if (!cancelled) {
          setIsSaved(Boolean(cs.isInCollection));
        }
      } catch {
        /* non-fatal */
      }
    })();

    return () => { cancelled = true; };
  }, [target?.product_item_id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!target) return null;

  // ── Label helpers ──────────────────────────────────────────────────────────
  const kindLabel =
    target.kind === "bag"  ? "Bag"
    : target.kind === "shoe" ? "Footwear"
    : target.kind === "look" ? "Look"
    : "Item";

  // Prefer the proper showroom title injected by StudioPage, then fall back to
  // a cleaned-up GLB filename. Never show the hardcoded "Inspect look" label.
  const displayName =
    target.title ||
    (target.sourceFileName
      ? target.sourceFileName
          .replace(/_texture\.glb$/i, "")
          .replace(/Meshy_AI_/i, "")
          .replace(/_/g, " ")
          .trim()
      : "Design");

  // ── Dismiss helper ─────────────────────────────────────────────────────────
  function flashMsg(setter, text, type = "info", ms = 3000) {
    setter({ text, type });
    setTimeout(() => setter(null), ms);
  }

  // ── Vote handler ───────────────────────────────────────────────────────────
  const handleVote = async () => {
    const itemId = target.product_item_id;

    if (!itemId) {
      flashMsg(setVoteMsg, "Voting not available for this item.", "info");
      return;
    }

    if (hasVoted) {
      flashMsg(setVoteMsg, "You've already voted for this.", "info");
      return;
    }

    const token = localStorage.getItem("gia_token");
    if (!token) {
      flashMsg(setVoteMsg, "Log in to cast your vote.", "error");
      return;
    }

    setVoteLoading(true);
    setVoteMsg(null);

    try {
      const res = await voteProduct(itemId);
      setHasVoted(true);
      setVoteCount(Number(res.votes) || voteCount + 1);
      flashMsg(setVoteMsg, "Vote cast! ✦", "success");
    } catch (err) {
      const msg = err.message || "";

      if (msg.includes("already voted")) {
        setHasVoted(true);
        flashMsg(setVoteMsg, "You've already voted for this.", "info");
      } else if (msg.includes("not found") || msg.includes("not currently active")) {
        flashMsg(setVoteMsg, "This design isn't open for voting yet.", "info");
      } else if (msg.includes("Authentication") || msg.includes("401")) {
        flashMsg(setVoteMsg, "Log in to cast your vote.", "error");
      } else if (msg.includes("429") || msg.includes("too fast")) {
        flashMsg(setVoteMsg, "Slow down — too many votes.", "error");
      } else {
        flashMsg(setVoteMsg, "Vote failed. Try again.", "error");
      }
    } finally {
      setVoteLoading(false);
    }
  };

  // ── Save handler ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    const itemId = target.product_item_id;

    if (!itemId) {
      flashMsg(setSaveMsg, "Save not available for this item.", "info");
      return;
    }

    const token = localStorage.getItem("gia_token");
    if (!token) {
      flashMsg(setSaveMsg, "Log in to save looks.", "error");
      return;
    }

    if (isSaved) {
      flashMsg(setSaveMsg, "Already in your collection.", "info");
      return;
    }

    setSaveLoading(true);
    setSaveMsg(null);

    try {
      await addToCollection(itemId, target.model_url ?? null, target.image_url ?? null);
      setIsSaved(true);
      flashMsg(setSaveMsg, "Saved to collection ◆", "success");
    } catch (err) {
      const msg = err.message || "";
      if (msg.includes("Already")) {
        setIsSaved(true);
        flashMsg(setSaveMsg, "Already in your collection.", "info");
      } else if (msg.includes("429")) {
        flashMsg(setSaveMsg, "Too many saves — slow down.", "error");
      } else {
        flashMsg(setSaveMsg, "Save failed. Try again.", "error");
      }
    } finally {
      setSaveLoading(false);
    }
  };

  // ── Ask Stylist → GSNowGPT with style context ──────────────────────────────
  const handleAskStylist = () => {
    onOpenChat({
      type: "style",
      target,
      preloadMessage: `Style this look for me: "${displayName}". Give me a complete outfit brief, colorway alternatives, and accessory pairings.`,
    });
  };

  // ── Show Similar → GSNowGPT with similarity context ───────────────────────
  const handleShowSimilar = () => {
    onOpenChat({
      type: "similar",
      target,
      preloadMessage: `Show me looks similar to "${displayName}" from across the GIA collection.`,
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="inspect-panel" role="region" aria-label="Inspect mode">

      {/* Look identity tag */}
      <div className="inspect-panel__label">
        <span className="inspect-panel__kind">{kindLabel}</span>
        <span className="inspect-panel__name">{displayName}</span>
      </div>

      {/* Inline status messages (vote / save feedback) */}
      {(voteMsg || saveMsg) && (
        <div
          className="inspect-panel__msg"
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            padding: "5px 14px",
            borderRadius: 999,
            background:
              (voteMsg || saveMsg)?.type === "success"
                ? "rgba(201,162,39,0.15)"
                : (voteMsg || saveMsg)?.type === "error"
                ? "rgba(220,60,60,0.15)"
                : "rgba(80,140,200,0.12)",
            border:
              (voteMsg || saveMsg)?.type === "success"
                ? "1px solid rgba(201,162,39,0.4)"
                : (voteMsg || saveMsg)?.type === "error"
                ? "1px solid rgba(220,60,60,0.35)"
                : "1px solid rgba(80,140,200,0.25)",
            color:
              (voteMsg || saveMsg)?.type === "success"
                ? "var(--ui-text-gold)"
                : (voteMsg || saveMsg)?.type === "error"
                ? "#ff7777"
                : "var(--ui-text-secondary)",
          }}
        >
          {(voteMsg || saveMsg)?.text}
        </div>
      )}

      {/* Action bar */}
      <div className="inspect-panel__actions">

        {/* Vote */}
        <button
          className={`inspect-btn ${hasVoted ? "inspect-btn--active" : ""}`}
          onClick={handleVote}
          disabled={voteLoading}
          aria-label={hasVoted ? "Already voted" : "Vote for this look"}
          title={hasVoted ? `Voted · ${voteCount} vote${voteCount !== 1 ? "s" : ""}` : "Vote"}
          style={{ opacity: voteLoading ? 0.6 : 1 }}
        >
          <span className="inspect-btn__icon">
            {voteLoading ? "…" : hasVoted ? "▲" : "△"}
          </span>
          <span className="inspect-btn__label">
            {voteLoading ? "…" : `Vote${voteCount > 0 ? ` · ${voteCount}` : ""}`}
          </span>
        </button>

        {/* Save */}
        <button
          className={`inspect-btn ${isSaved ? "inspect-btn--active" : ""}`}
          onClick={handleSave}
          disabled={saveLoading}
          aria-label={isSaved ? "Saved to collection" : "Save to collection"}
          title={isSaved ? "Saved to your collection" : "Save to Collection"}
          style={{ opacity: saveLoading ? 0.6 : 1 }}
        >
          <span className="inspect-btn__icon">
            {saveLoading ? "…" : isSaved ? "◆" : "◇"}
          </span>
          <span className="inspect-btn__label">
            {saveLoading ? "Saving…" : isSaved ? "Saved" : "Save"}
          </span>
        </button>

        <div className="inspect-divider" aria-hidden="true" />

        {/* Ask Stylist → GSNowGPT with style context */}
        <button
          className="inspect-btn inspect-btn--primary"
          onClick={handleAskStylist}
          title="Open GSNowGPT with this look in context"
        >
          <span className="inspect-btn__icon">✦</span>
          <span className="inspect-btn__label">Ask Stylist</span>
        </button>

        {/* Show Similar → GSNowGPT with similarity context */}
        <button
          className="inspect-btn"
          onClick={handleShowSimilar}
          title="Find similar looks via GSNowGPT"
        >
          <span className="inspect-btn__icon">◎</span>
          <span className="inspect-btn__label">Similar</span>
        </button>

        <div className="inspect-divider" aria-hidden="true" />

        {/* Back to showroom */}
        <button
          className="inspect-btn inspect-btn--back"
          onClick={onBack}
          title="Return to showroom"
        >
          <span className="inspect-btn__icon">←</span>
          <span className="inspect-btn__label">Back</span>
        </button>
      </div>
    </div>
  );
}
