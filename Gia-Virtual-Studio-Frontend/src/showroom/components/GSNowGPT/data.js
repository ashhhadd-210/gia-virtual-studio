/* ─────────────────────────────────────────────────────────
   GSNowGPT / data.js
   Agent catalog, AI Feature catalog, and mock LLM layer.
   ───────────────────────────────────────────────────────── */

export const FREE_MESSAGE_LIMIT = 10;
export const STORAGE_KEY_MSG_COUNT = "gsnowgpt_msg_count";
export const STORAGE_KEY_SUBSCRIBED = "gsnowgpt_premium";
export const STORAGE_KEY_AGENTS = "gsnowgpt_agents";

// ── Agent catalog ──────────────────────────────────────────
export const AGENTS = [
  {
    id: "ai-stylist",
    name: "AI Stylist",
    icon: "✦",
    price: "$12 / mo",
    description:
      "Curates complete outfit briefs, suggests alternate colorways, and answers styling questions about any look in the showroom — in real time.",
    features: ["Outfit curation", "Style Q&A", "Colorway suggestions", "Look matching"],
    defaultStatus: "preview", // 'preview' | 'available' | 'subscribed'
  },
  {
    id: "proxy-voting",
    name: "Proxy Voting Agent",
    icon: "◈",
    price: "$8 / mo",
    description:
      "Delegates your governance votes on collection decisions, seasonal trend ballots, and GIA brand direction proposals on your behalf.",
    features: ["Vote delegation", "Collection ballots", "Trend influence", "Auto-proxy rules"],
    defaultStatus: "available",
  },
  {
    id: "collection-navigator",
    name: "Collection Navigator",
    icon: "◎",
    price: "$9 / mo",
    description:
      "Deep-searches the full GIA archive across seasons, answers cross-collection queries, and narrates the story behind any look.",
    features: ["Archive search", "Cross-season queries", "Collection storytelling", "Look history"],
    defaultStatus: "available",
  },
  {
    id: "trend-oracle",
    name: "Trend Oracle",
    icon: "⟡",
    price: "$15 / mo",
    description:
      "Scores looks against live market signals, predicts emerging silhouettes and colorways, and ranks new arrivals by trend velocity.",
    features: ["Trend forecasting", "Look scoring", "Market signals", "New-arrival ranking"],
    defaultStatus: "available",
  },
  {
    id: "personal-shopper",
    name: "Personal Shopper",
    icon: "◆",
    price: "$10 / mo",
    description:
      "Maintains your wardrobe profile, tracks saved looks across sessions, sends personalized restock and drop alerts.",
    features: ["Wardrobe profile", "Saved looks", "Restock alerts", "Drop notifications"],
    defaultStatus: "available",
  },
];

// ── AI Feature catalog ─────────────────────────────────────
export const AI_FEATURES = [
  {
    id: "style-this-look",
    name: "Style This Look",
    icon: "✦",
    free: false,
    agents: ["ai-stylist"],
    description:
      "Generates a complete outfit brief for any focused mannequin: alternate colorways, layering options, accessory pairings, and occasion notes.",
    requiresSubscription: true,
  },
  {
    id: "show-similar",
    name: "Show Similar Looks",
    icon: "◎",
    free: false,
    agents: ["collection-navigator", "ai-stylist"],
    description:
      "Finds visually and conceptually similar looks across the full GIA archive, ranked by style proximity and season.",
    requiresSubscription: true,
  },
  {
    id: "proxy-vote",
    name: "Proxy Voting",
    icon: "◈",
    free: true,
    agents: ["proxy-voting"],
    description:
      "Opens the active governance ballot and lets you vote directly or delegate to the Proxy Voting Agent — first vote always free.",
    requiresSubscription: false,
  },
  {
    id: "trend-score",
    name: "Trend Score",
    icon: "⟡",
    free: false,
    agents: ["trend-oracle"],
    description:
      "Rates a focused look against live trend signals and explains how it indexes across current and upcoming fashion markets.",
    requiresSubscription: true,
  },
  {
    id: "wardrobe-save",
    name: "Save to Wardrobe",
    icon: "◆",
    free: false,
    agents: ["personal-shopper"],
    description:
      "Saves any focused look to your personal wardrobe profile with one tap. Requires Personal Shopper to be active.",
    requiresSubscription: true,
  },
  {
    id: "collection-tour",
    name: "Collection Tour",
    icon: "◐",
    free: false,
    agents: ["collection-navigator", "ai-stylist"],
    description:
      "AI-narrated walkthrough of the latest GIA collection — automatically guides you through key looks with commentary from Collection Navigator and AI Stylist.",
    requiresSubscription: true,
  },
];

// ── Mock LLM response layer ────────────────────────────────

const STYLE_RESPONSES = [
  (look) =>
    `This look reads as architectural minimalism meeting couture volume. The silhouette prioritises a strong shoulder-to-hem line — ideal for high-ceilinged interiors or formal event environments.\n\nFor alternate styling: consider pairing with structured metallic accessories and a single-note shoe in ivory or deep noir. The proportions carry well under directional lighting, which makes it a natural anchor piece for evening.\n\nWould you like me to find looks in a similar silhouette family, or explore colorway alternatives?`,
  (look) =>
    `There's a rigorous geometry to this piece — the surface texture catches light in a way that reads differently at close range versus across a room. That dual quality is rare.\n\nStyling brief: keep accessories architectural. A single cuff or minimal earring in oxidised silver reads correctly. Avoid layering — the piece is designed to hold the frame alone.\n\nDo you want me to surface similar looks, or run a Trend Score on this one?`,
];

const SIMILAR_RESPONSES = [
  (look) =>
    `Across the GIA archive I'm finding three strong matches by silhouette:\n\n**1. Cascade Series, Season 4** — shares the volume-to-structure ratio and uses a similar weight of fabric.\n\n**2. Corridor Noir, Season 6** — closer in surface texture. The drape origin point differs but the visual weight is comparable.\n\n**3. Meridian Statement, Season 7** — same shoulder geometry, opposite hem treatment. Worth seeing side by side.\n\nShall I navigate you to any of these, or narrow the search by colorway?`,
  () =>
    `I found several near-matches across the current collection. The closest by silhouette is a structured gown from the Silver tier — same orbitRadius range, slightly warmer tonality.\n\nWould you like to continue browsing those, or would you prefer I filter by a specific season?`,
];

const VOTE_RESPONSES = [
  () =>
    `The active ballot this cycle covers three items:\n\n**1. Spring/Summer direction** — organic drape vs. structural geometry (closes in 4 days)\n\n**2. Material focus for next season** — recycled couture fabric vs. traditional atelier sourcing\n\n**3. New artist collaboration** — two shortlisted designers, final selection by vote\n\nYour Proxy Voting Agent can cast on all three automatically using your saved preference profile, or you can vote manually on each. Which do you prefer?`,
];

const GENERAL_RESPONSES = [
  () =>
    `I can help you with style queries, collection navigation, look comparisons, and proxy voting. For deeper features — like Trend Scoring or Save to Wardrobe — those are available through the AI Features tab above.\n\nWhat would you like to explore?`,
  () =>
    `That's a great question. Let me clarify the layers available to you here:\n\n**Free tier** — basic chat (up to 10 messages), collection browse, and proxy voting.\n\n**Premium Chat** — unlimited conversation after upgrade.\n\n**Paid Agents** — activate individual agents like AI Stylist or Collection Navigator to unlock deeper capabilities.\n\n**AI Features** — bundled premium features powered by one or more agents.\n\nWhat would you like to start with?`,
  (msg) =>
    `I want to make sure I address that accurately. Based on your message, this sounds like it could involve the ${msg.toLowerCase().includes("style") ? "AI Stylist agent (paid)" : msg.toLowerCase().includes("vote") ? "Proxy Voting Agent (first vote free)" : "Collection Navigator agent (paid)"}. You can activate that agent from the Agents tab, or I can give you a brief overview now — which would you prefer?`,
];

export function getMockResponse(context, userMessage = "") {
  if (context?.type === "style") {
    const pick = STYLE_RESPONSES[Math.floor(Math.random() * STYLE_RESPONSES.length)];
    return pick(context.target);
  }
  if (context?.type === "similar") {
    const pick = SIMILAR_RESPONSES[Math.floor(Math.random() * SIMILAR_RESPONSES.length)];
    return pick(context.target);
  }
  if (context?.type === "vote") {
    return VOTE_RESPONSES[0]();
  }
  const pick = GENERAL_RESPONSES[Math.floor(Math.random() * GENERAL_RESPONSES.length)];
  return pick(userMessage);
}

// ── Local-storage helpers ──────────────────────────────────

export function getStoredMessageCount() {
  try {
    return parseInt(localStorage.getItem(STORAGE_KEY_MSG_COUNT) ?? "0", 10) || 0;
  } catch {
    return 0;
  }
}

export function incrementStoredMessageCount() {
  try {
    const next = getStoredMessageCount() + 1;
    localStorage.setItem(STORAGE_KEY_MSG_COUNT, String(next));
    return next;
  } catch {
    return 0;
  }
}

export function getStoredPremium() {
  try {
    return localStorage.getItem(STORAGE_KEY_SUBSCRIBED) === "true";
  } catch {
    return false;
  }
}

export function setStoredPremium(val) {
  try {
    localStorage.setItem(STORAGE_KEY_SUBSCRIBED, val ? "true" : "false");
  } catch { /* ignore */ }
}

export function getStoredAgentStatuses() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_AGENTS) ?? "{}");
  } catch {
    return {};
  }
}

export function setStoredAgentStatus(agentId, status) {
  try {
    const current = getStoredAgentStatuses();
    current[agentId] = status;
    localStorage.setItem(STORAGE_KEY_AGENTS, JSON.stringify(current));
  } catch { /* ignore */ }
}
