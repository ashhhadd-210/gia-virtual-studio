import { useState } from "react";

/**
 * InspectPanel
 *
 * Appears anchored at the bottom-centre of the screen when the camera enters
 * orbit mode around a showcase target.  Never opens a separate window —
 * actions that need the LLM route through GSNowGPT via the onOpenChat callback.
 *
 * Props
 * ─────
 *  target        {object}   – The active ShowroomWorld showcase target
 *  onBack        {function} – Calls controller.exitShowcaseFocus()
 *  onOpenChat    {function} – (context) → opens GSNowGPT with pre-loaded context
 */
export default function InspectPanel({ target, onBack, onOpenChat }) {
  const [voted, setVoted]   = useState(false);
  const [saved, setSaved]   = useState(false);

  if (!target) return null;

  const kindLabel = target.kind === "bag"  ? "Bag"
                  : target.kind === "shoe" ? "Footwear"
                  : target.kind === "look" ? "Look"
                  : "Item";

  const displayName =
    target.label ||
    (target.sourceFileName
      ? target.sourceFileName
          .replace(/_texture\.glb$/i, "")
          .replace(/Meshy_AI_/i, "")
          .replace(/_/g, " ")
          .trim()
      : "Inspect Item");

  const handleVote = () => {
    setVoted((v) => !v);
    // Route proxy-vote context into GSNowGPT
    onOpenChat({ type: "vote", target, preloadMessage: `I'd like to vote on or proxy-delegate my vote for: "${displayName}".` });
  };

  const handleSave = () => {
    setSaved((s) => !s);
    onOpenChat({ type: "save", target, preloadMessage: `Save "${displayName}" to my wardrobe.` });
  };

  const handleAskStylist = () => {
    onOpenChat({
      type: "style",
      target,
      preloadMessage: `Style this look for me: "${displayName}". Give me a complete outfit brief, colorway alternatives, and accessory pairings.`,
    });
  };

  const handleShowSimilar = () => {
    onOpenChat({
      type: "similar",
      target,
      preloadMessage: `Show me looks similar to "${displayName}" from across the GIA collection.`,
    });
  };

  return (
    <div className="inspect-panel" role="region" aria-label="Inspect mode">
      {/* Look identity tag */}
      <div className="inspect-panel__label">
        <span className="inspect-panel__kind">{kindLabel}</span>
        <span className="inspect-panel__name">{displayName}</span>
      </div>

      {/* Action bar */}
      <div className="inspect-panel__actions">

        {/* Vote */}
        <button
          className={`inspect-btn ${voted ? "inspect-btn--active" : ""}`}
          onClick={handleVote}
          aria-label={voted ? "Remove vote" : "Vote for this look"}
          title="Vote / Proxy Vote"
        >
          <span className="inspect-btn__icon">{voted ? "▲" : "△"}</span>
          <span className="inspect-btn__label">Vote</span>
        </button>

        {/* Save */}
        <button
          className={`inspect-btn ${saved ? "inspect-btn--active" : ""}`}
          onClick={handleSave}
          aria-label={saved ? "Saved to wardrobe" : "Save to wardrobe"}
          title="Save to Wardrobe"
        >
          <span className="inspect-btn__icon">{saved ? "◆" : "◇"}</span>
          <span className="inspect-btn__label">Save</span>
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
          <span className="inspect-btn__label">Similar Looks</span>
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
