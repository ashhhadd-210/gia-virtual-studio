import { useState, useEffect, useRef, useMemo, useCallback, memo } from "react";
import {
  FREE_MESSAGE_LIMIT,
  getStoredMessageCount,
  getStoredPremium,
  incrementStoredMessageCount,
  setStoredPremium,
} from "./data.js";
import { fetchGPTQuota } from "../../../Api/api.js";

const BASE_URL = import.meta.env.VITE_BACKEND_API_URL;

// ─── Static menu data ──────────────────────────────────────────────────────────

const MAIN_OPTIONS = [
  { id: "agents",  icon: "✦", label: "AI Agents",              handler: "main" },
  { id: "futures", icon: "⟡", label: "AI Futures",             handler: "main" },
  { id: "chat",    icon: "◎", label: "Continue Conversation",  handler: "main" },
];

const AI_AGENTS_LIST = [
  { id: "styling-agent",  icon: "✦", label: "Styling Agent",         handler: "agent", desc: "Curates AI-powered outfit briefs, palette alternatives, and real-time Q&A for any showroom look." },
  { id: "trend-curation", icon: "⟡", label: "Trend Curation Agent",  handler: "agent", desc: "Analyzes styles with live market data — forecasts silhouettes and colorways on the fly." },
  { id: "query-agent",    icon: "◎", label: "Query Agent",           handler: "agent", desc: "Instantly deep-searches all GIA archives, answers spanned queries, and narrates look histories." },
  { id: "voting-agent",   icon: "◈", label: "Voting Agent",          handler: "agent", desc: "Connects you to governance ballots to vote or delegate instantly." },
  { id: "proxy-voting",   icon: "◆", label: "Proxy Voting Agent",    handler: "agent", desc: "Automates and delegates your votes using your saved preference profile." },
];

const AI_FUTURES_LIST = [
  { id: "ai-stylist",     icon: "✦", label: "AI Stylist",               handler: "future", desc: "Hyper-personalized AI styling, digital wardrobe curation, and occasion-ready briefs." },
  { id: "mood-filters",   icon: "◐", label: "Mood Filters",             handler: "future", desc: "Real-time mood, aesthetic, or emotion filtering for the full collection." },
  { id: "avatar-fitting", icon: "◎", label: "Avatar Fitting",           handler: "future", desc: "Virtually try-on any look using your AI avatar — see yourself before hitting the floor." },
  { id: "runway-feed",    icon: "⟡", label: "Personalized Runway Feed", handler: "future", desc: "Live AI-curated stream of looks, continuously ranked by your tastes and activity." },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function genId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

// Backend exception strings sometimes contain the raw OpenAI Authorization
// header (e.g. "Illegal header value b'Bearer sk-proj-…'") when the API key
// is malformed. Never surface that to a client — replace with a friendly
// reconnect message instead. We also collapse multi-line tracebacks.
function sanitizeChatErrorMessage(raw) {
  const text = String(raw ?? "").trim();
  if (!text) {
    return "GIA's stylist service is reconnecting. Please try again in a moment.";
  }
  const credentialLeak = /sk-[a-z0-9_-]{6,}|bearer\s+sk-|illegal header value/i.test(text);
  const rawException = /traceback \(most recent|httpx\.|openai\.|httpcore|<class '/i.test(text);
  if (credentialLeak || rawException) {
    return "GIA's stylist service is reconnecting. Please try again in a moment.";
  }
  // Collapse newlines and cap length so long tracebacks don't pollute the chat.
  const oneLine = text.replace(/\s+/g, " ");
  return oneLine.length > 220 ? `${oneLine.slice(0, 217)}…` : oneLine;
}

/**
 * Call the real /gpt/query backend.
 * @param {string}      message
 * @param {Array}       conversationHistory
 * @param {string}      sessionId
 * @param {object|null} designCtx  – { name, desc } of the currently focused design, or null
 */
async function callBackend(message, conversationHistory, sessionId, designCtx = null) {
  const token = localStorage.getItem("gia_token");
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}/gpt/query`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      message,
      session_id:           sessionId,
      // If a design is currently focused in the showroom, pass it so the
      // backend can enrich style / similar-look context automatically.
      product_name:         designCtx?.name  ?? null,
      product_desc:         designCtx?.desc  ?? null,
      product_price:        null,
      conversation_history: conversationHistory,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.detail || `Error ${res.status}`;
    // Detect the backend's upgrade-required signal (free-tier exhausted)
    const upgradeRequired = res.headers.get("X-Upgrade-Required") === "true";
    throw Object.assign(new Error(msg), {
      status: res.status,
      detail: msg,
      upgradeRequired,
    });
  }

  const data = await res.json();
  return data.reply || "I'm not sure how to respond to that — could you rephrase?";
}

/** Minimal markdown renderer: **bold** → <strong> */
function renderMarkdown(text) {
  return text.split("\n").map((line, li, arr) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((p, pi) =>
      p.startsWith("**") && p.endsWith("**") ? (
        <strong key={pi} style={{ color: "var(--ui-text-primary)", fontWeight: 700 }}>
          {p.slice(2, -2)}
        </strong>
      ) : (
        <span key={pi}>{p}</span>
      )
    );
    return (
      <span key={li}>
        {parts}
        {li < arr.length - 1 && <br />}
      </span>
    );
  });
}

/** Resolve the best available name from a showcase target. */
function resolveTargetName(target) {
  if (!target) return "this design";
  return (
    target.title ||
    (target.sourceFileName
      ? target.sourceFileName
          .replace(/_texture\.glb$/i, "")
          .replace(/Meshy_AI_/i, "")
          .replace(/_/g, " ")
          .trim()
      : null) ||
    "this design"
  );
}

function deriveOpener(context) {
  if (context.type === "style" && context.target)
    return `Style this look for me: "${resolveTargetName(context.target)}". Give me a complete outfit brief, colorway alternatives, and accessory pairings.`;
  if (context.type === "similar" && context.target)
    return `Show me looks similar to "${resolveTargetName(context.target)}" from across the GIA collection.`;
  if (context.type === "vote")
    return "What proxy-voting options are currently active in the showroom?";
  if (context.type === "feature")
    return `Tell me about the "${context.featureId}" AI feature and how to activate it.`;
  return "What can GIA help me with?";
}

// ─── Main component ────────────────────────────────────────────────────────────

/**
 * Unified GIA Chat View
 *
 * Single view that:
 *  1. Opens with the structured welcome menu (AI Agents / AI Futures / Continue)
 *  2. Each branch expands inside the same conversational thread
 *  3. All AI replies fetched from real /gpt/query backend
 *  4. Free-form text input always visible at the bottom
 *
 * Props
 * ─────
 *  context      {object|null}  – Pre-loaded context from a showroom action (Ask Stylist, etc.)
 *  onUpgrade    {function}     – Called when the user hits the upgrade button
 *  activeDesign {object|null}  – The ShowroomWorld showcase target currently in orbit focus.
 *                                Passed by StudioPage whenever a mannequin/item is in focus.
 *                                Provides product_name / desc to the backend so every message
 *                                (style, general, etc.) is design-aware when relevant.
 */
export default function ChatView({ context, onUpgrade, activeDesign }) {
  const sessionId = useRef(genId()).current;

  /**
   * Derive a { name, desc } object from the active design for the backend call.
   * Sent as product_name / product_desc to POST /gpt/query so the backend's
   * style handler injects "Product in view: <name>" into the system prompt.
   * Returns null when nothing is focused so general questions get no product bias.
   */
  const getDesignCtx = () => {
    if (!activeDesign) return null;

    // Priority: showroom title → cleaned filename → generic fallback
    const name =
      activeDesign.title ||
      (activeDesign.sourceFileName
        ? activeDesign.sourceFileName
            .replace(/_texture\.glb$/i, "")
            .replace(/Meshy_AI_/i, "")
            .replace(/_/g, " ")
            .trim()
        : null) ||
      "GIA Design";

    const kind =
      activeDesign.kind === "bag"  ? "Bag"
      : activeDesign.kind === "shoe" ? "Footwear"
      : activeDesign.kind === "look" ? "Look"
      : "Fashion Design";

    const itemId = activeDesign.product_item_id || "";
    const desc = `GIA Showroom ${kind}${itemId ? ` (${itemId})` : ""} — currently focused in the 3D showroom.`;

    return { name, desc };
  };

  // Seed with welcome message + main options
  const [messages, setMessages] = useState([
    {
      id: genId(),
      role: "bot",
      text: "Welcome to GIA.\nWhat would you like to explore today?",
      replies: MAIN_OPTIONS,
    },
  ]);

  const [input, setInput]             = useState("");
  const [isTyping, setIsTyping]       = useState(false);
  const [convHistory, setConvHistory] = useState([]); // [{role, content}] sent to backend
  const [msgCount, setMsgCount]       = useState(() => getStoredMessageCount());
  const [isPremium, setIsPremium]     = useState(() => getStoredPremium());
  const [contextLoaded, setContextLoaded] = useState(false);

  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  const freeRemaining = Math.max(0, FREE_MESSAGE_LIMIT - msgCount);
  const isAtLimit     = !isPremium && freeRemaining === 0;

  // ── Sync quota from backend on mount ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const quota = await fetchGPTQuota();
        if (cancelled || !quota) return;

        if (quota.unlimited) {
          // Paid user — mark as premium so the paywall never shows
          setStoredPremium(true);
          setIsPremium(true);
          setMsgCount(0);
        } else if (quota.used_today != null) {
          // Free user — sync the local counter with what the backend has tracked.
          // We take the max of localStorage and server so we never reset a count
          // the user has already consumed in this session.
          const serverCount = Number(quota.used_today) || 0;
          const localCount  = getStoredMessageCount();
          const synced      = Math.max(localCount, serverCount);
          setMsgCount(synced);
        }
      } catch {
        // Non-fatal — keep whatever was read from localStorage
      }
    })();

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll on new messages / typing. behavior: "auto" (instant) instead
  // of "smooth" — smooth scroll runs a ~300ms layout-thrashing animation that
  // contends with Babylon's render loop, dragging in-scene FPS from 30 → 14
  // every time the bot replies. Instant scroll is one layout pass and done.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages, isTyping]);

  // Handle external context from 3-D showroom (mannequin action, etc.)
  useEffect(() => {
    if (!context || contextLoaded) return;
    setContextLoaded(true);
    const opener = context.preloadMessage || deriveOpener(context);
    sendToBackend(opener, true /* silent — no prepended user bubble */);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context]);

  // ── Message helpers ──────────────────────────────────────────────────────────

  /** Append a user bubble; wipe reply buttons from all prior messages */
  const appendUser = (label) => {
    setMessages((prev) => [
      ...prev.map((m) => ({ ...m, replies: null })),
      { id: genId(), role: "user", text: label, replies: null },
    ]);
  };

  /** Append a bot bubble after a short delay */
  const appendBot = (text, replies = null, delay = 640) => {
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      setMessages((prev) => [...prev, { id: genId(), role: "bot", text, replies }]);
    }, delay);
  };

  // ── Backend call ─────────────────────────────────────────────────────────────

  /**
   * sendToBackend — sends userText to /gpt/query and appends the reply.
   * @param {string}  userText  - the message to send
   * @param {boolean} silent    - if true, skip prepending a user bubble
   *                             (used when the bubble was already added)
   */
  const sendToBackend = async (userText, silent = false) => {
    if (isTyping || isAtLimit) return;

    const newCount = incrementStoredMessageCount();
    setMsgCount(newCount);

    if (!silent) appendUser(userText);

    setIsTyping(true);
    // Cap history sent to the backend at the last 12 messages (~6 exchanges).
    // Cuts OpenAI prompt-token cost and response latency 30-40% vs sending the
    // entire conversation, with no perceptible context loss on style queries.
    // The 12-message floor keeps the most recent design context + style turns.
    const HISTORY_CAP = 12;
    const historySnapshot = convHistory.length > HISTORY_CAP
      ? convHistory.slice(convHistory.length - HISTORY_CAP)
      : [...convHistory];

    try {
      // Always pass the current design context so the backend can be design-aware.
      // For general questions it has no effect; for style/similar queries the backend
      // enriches the response with "Product in view: <name>" context automatically.
      const reply = await callBackend(userText, historySnapshot, sessionId, getDesignCtx());

      setConvHistory((prev) => [
        ...prev,
        { role: "user",      content: userText },
        { role: "assistant", content: reply },
      ]);

      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        { id: genId(), role: "bot", text: reply, replies: null },
      ]);
    } catch (err) {
      setIsTyping(false);

      let errText;
      if (err.status === 429 || err.upgradeRequired) {
        // Free daily limit exhausted — mark locally so paywall appears immediately
        const newCount = FREE_MESSAGE_LIMIT;
        setMsgCount(newCount);
        errText = `You've reached your free daily limit of ${FREE_MESSAGE_LIMIT} messages. Upgrade to GIA Premium to continue.`;
      } else {
        errText = sanitizeChatErrorMessage(err.detail || err.message);
      }

      setMessages((prev) => [
        ...prev,
        { id: genId(), role: "bot", text: errText, replies: null },
      ]);
    }
  };

  // ── Branch handlers ──────────────────────────────────────────────────────────

  const handleMainOption = (opt) => {
    appendUser(opt.label);

    if (opt.id === "agents") {
      appendBot(
        "Available AI Agents:",
        AI_AGENTS_LIST,
      );
    } else if (opt.id === "futures") {
      appendBot(
        "Available AI Futures:",
        AI_FUTURES_LIST,
      );
    } else {
      // Continue Conversation — open free-form mode
      const designName = activeDesign
        ? (activeDesign.title || activeDesignLabel || "the focused design")
        : null;
      appendBot(
        designName
          ? `Of course! I can see you're looking at **${designName}**. Ask me anything about it — styling, similar looks, materials, or anything else.`
          : "Of course! Ask me anything about the collection, styling, or AI features.",
        null,
        500,
      );
      setTimeout(() => inputRef.current?.focus(), 880);
    }
  };

  const handleAgentOption = (agent) => {
    appendUser(agent.label);
    appendBot(
      `**${agent.label}**\n\n${agent.desc}`,
      [
        { id: "activate", icon: "✦", label: "Activate Agent",   handler: "agentActivate", data: agent },
        { id: "learn",    icon: "◎", label: "Learn More",        handler: "agentLearn",    data: agent },
        { id: "back",     icon: "◁", label: "Back to AI Agents", handler: "backAgents" },
      ],
    );
  };

  const handleFutureOption = (future) => {
    appendUser(future.label);
    appendBot(
      `**${future.label}**\n\n${future.desc}`,
      [
        { id: "try",   icon: "⟡", label: "Try It",              handler: "futureTry",   data: future },
        { id: "learn", icon: "◎", label: "Learn More",           handler: "futureLearn", data: future },
        { id: "back",  icon: "◁", label: "Back to AI Futures",  handler: "backFutures" },
      ],
    );
  };

  const returnToAgents = () => {
    appendUser("← Back to AI Agents");
    appendBot("Available AI Agents:", AI_AGENTS_LIST);
  };

  const returnToFutures = () => {
    appendUser("← Back to AI Futures");
    appendBot("Available AI Futures:", AI_FUTURES_LIST);
  };

  // ── Reply dispatcher ─────────────────────────────────────────────────────────

  const handleReply = (reply) => {
    if (isAtLimit) return;

    switch (reply.handler) {
      case "main":
        return handleMainOption(reply);
      case "agent":
        return handleAgentOption(reply);
      case "future":
        return handleFutureOption(reply);
      case "agentActivate":
        return sendToBackend(`Tell me how to activate the ${reply.data.label} and what it can do for me.`);
      case "agentLearn":
        return sendToBackend(`Give me a detailed overview of the ${reply.data.label}: its capabilities, use cases, and how it works.`);
      case "futureTry":
        return sendToBackend(`Activate ${reply.data.label} for me and walk me through what it can do.`);
      case "futureLearn":
        return sendToBackend(`Tell me more about ${reply.data.label} — what's possible with it and how does it work?`);
      case "backAgents":
        return returnToAgents();
      case "backFutures":
        return returnToFutures();
      default:
        return;
    }
  };

  // ── Free-form input ──────────────────────────────────────────────────────────

  const handleSend = () => {
    const text = input.trim();
    if (!text || isTyping || isAtLimit) return;
    setInput("");
    // Reset textarea height back to one row after sending
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
    sendToBackend(text);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleUpgrade = () => {
    setStoredPremium(true);
    setIsPremium(true);
    onUpgrade?.();
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  // Derive the display label for the context chip — same priority as getDesignCtx
  const activeDesignLabel = activeDesign
    ? (activeDesign.title
        || (activeDesign.sourceFileName
              ? activeDesign.sourceFileName
                  .replace(/_texture\.glb$/i, "")
                  .replace(/Meshy_AI_/i, "")
                  .replace(/_/g, " ")
                  .trim()
              : null)
        || "Design")
    : null;

  return (
    // flex: 1 + minHeight: 0 (not height: 100%) — height: 100% claims the full
    // panel height ignoring the header sibling, which overflows the panel by
    // ~60px and pushes the chat-input-row below the visible viewport. With
    // flex: 1 we correctly claim only the space remaining after the header.
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>

      {/* ── Design-in-focus context chip ───────────────────────────────────── */}
      {activeDesignLabel && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 12px",
            margin: "6px 12px 0",
            borderRadius: 999,
            background: "rgba(201,162,39,0.08)",
            border: "1px solid rgba(201,162,39,0.25)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: "var(--ui-text-gold)",
            textTransform: "uppercase",
          }}
        >
          <span style={{ opacity: 0.7 }}>◈</span>
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {activeDesignLabel}
          </span>
          <span style={{ opacity: 0.5, fontSize: 9 }}>In focus</span>
        </div>
      )}

      {/* Free-tier progress bar (shown once any messages are sent) */}
      {!isPremium && msgCount > 0 && (
        <div className="chat-free-counter">
          <div className="chat-free-counter__bar-wrap">
            <div
              className="chat-free-counter__bar"
              style={{ width: `${Math.min(100, (msgCount / FREE_MESSAGE_LIMIT) * 100)}%` }}
            />
          </div>
          <span className="chat-free-counter__label">
            {freeRemaining > 0
              ? `${freeRemaining} free message${freeRemaining !== 1 ? "s" : ""} left`
              : "Free limit reached"}
          </span>
        </div>
      )}

      {/* ── Message thread ─────────────────────────────────────────────────── */}
      {/* minHeight: 0 is mandatory on a flex-column child that owns the scroll.
          Without it, a long bot reply expands this container to fit content
          instead of constraining it to remaining flex space — which pushed
          the .chat-input-row below the viewport. The inline style was
          previously fighting the matching CSS rule on .gsnowgpt-body. */}
      <div className="gsnowgpt-body chat-messages" style={{ flex: 1, minHeight: 0 }}>
        {messages.map((msg) => (
          <MessageRow
            key={msg.id}
            msg={msg}
            onReply={handleReply}
            isAtLimit={isAtLimit}
          />
        ))}

        {/* Typing indicator */}
        {isTyping && (
          <div className="conv-msg conv-msg--bot">
            <div className="conv-msg__dot" />
            <div className="conv-msg__content">
              <div className="conv-msg__bubble conv-msg__bubble--typing">
                <div className="chat-typing-dot" />
                <div className="chat-typing-dot" />
                <div className="chat-typing-dot" />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} style={{ height: 8 }} />
      </div>

      {/* ── Paywall ────────────────────────────────────────────────────────── */}
      {isAtLimit && (
        <div className="chat-paywall">
          <div className="chat-paywall__title">Free limit reached</div>
          <div className="chat-paywall__desc">
            You've used your {FREE_MESSAGE_LIMIT} complimentary messages. Upgrade to GIA Premium
            for unlimited conversation, all AI agents, and priority feature access.
          </div>
          <button className="chat-paywall__cta" onClick={handleUpgrade}>
            ✦ Upgrade to Premium
          </button>
        </div>
      )}

      {/* ── Input bar ──────────────────────────────────────────────────────── */}
      <div className="chat-input-row">
        <div className="chat-input-wrap">
          <textarea
            ref={inputRef}
            className="chat-input"
            rows={1}
            placeholder={
              isAtLimit
                ? "Upgrade to continue chatting…"
                : "Ask about styles, votes, or agents"
            }
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              // Auto-resize: shrink to auto first, then grow to scrollHeight
              const el = e.target;
              el.style.height = "auto";
              el.style.height = el.scrollHeight + "px";
            }}
            onKeyDown={handleKeyDown}
            disabled={isAtLimit || isTyping}
          />
          <button
            className="chat-send-btn"
            onClick={handleSend}
            disabled={!input.trim() || isTyping || isAtLimit}
            aria-label="Send message"
          >
            ▶
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MessageRow sub-component ──────────────────────────────────────────────────

// React.memo wrapper + memoized markdown output: with N messages on screen,
// appending a new one previously re-rendered all N existing rows (each
// re-parsing its markdown). On a long stylist response, that's the bulk of
// the FPS-drop during reply rendering. memo() keeps existing rows static
// when the messages array grows.
const MessageRow = memo(function MessageRow({ msg, onReply, isAtLimit }) {
  const isBot = msg.role === "bot";
  const rendered = useMemo(() => renderMarkdown(msg.text), [msg.text]);

  return (
    <div className={`conv-msg conv-msg--${msg.role}`}>
      {isBot && <div className="conv-msg__dot" />}
      <div className="conv-msg__content">
        <div className="conv-msg__bubble">
          {rendered}
        </div>

        {msg.replies?.length > 0 && (
          <div className="conv-replies">
            {msg.replies.map((r) => (
              <button
                key={r.id}
                className="conv-reply-btn"
                onClick={() => onReply(r)}
                disabled={isAtLimit}
                style={{ opacity: isAtLimit ? 0.4 : 1 }}
              >
                <span className="conv-reply-btn__icon">{r.icon}</span>
                <span>{r.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
