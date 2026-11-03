import { useState, useEffect, useRef } from "react";
import {
  FREE_MESSAGE_LIMIT,
  getStoredMessageCount,
  getStoredPremium,
  incrementStoredMessageCount,
  setStoredPremium,
} from "./data.js";

const BASE_URL = import.meta.env.VITE_BACKEND_API_URL;

// ─── Static menu data ──────────────────────────────────────────────────────────

const MAIN_OPTIONS = [
  { id: "vote",    icon: "◈", label: "Vote on Collections",    handler: "main" },
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

/** Call the real /gpt/query backend */
async function callBackend(message, conversationHistory, sessionId) {
  const token = localStorage.getItem("gia_token");
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}/gpt/query`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      message,
      session_id: sessionId,
      conversation_history: conversationHistory,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.detail || `Error ${res.status}`;
    throw Object.assign(new Error(msg), { status: res.status, detail: msg });
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

function deriveOpener(context) {
  if (context.type === "style" && context.target)
    return `Style this look for me: "${context.target.label || "Inspect Item"}". Give me a complete outfit brief.`;
  if (context.type === "similar" && context.target)
    return `Show me looks similar to "${context.target.label || "Inspect Item"}" from the GIA collection.`;
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
 *  1. Opens with the structured welcome menu (Vote / AI Agents / AI Futures / Continue)
 *  2. Each branch expands inside the same conversational thread
 *  3. All AI replies fetched from real /gpt/query backend
 *  4. Free-form text input always visible at the bottom
 */
export default function ChatView({ context, onUpgrade }) {
  const sessionId = useRef(genId()).current;

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

  // Auto-scroll on new messages / typing
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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
    const historySnapshot = [...convHistory];

    try {
      const reply = await callBackend(userText, historySnapshot, sessionId);

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
      const errText =
        err.status === 429
          ? "You've reached your free daily message limit. Upgrade to GIA Premium to continue."
          : `Something went wrong: ${err.detail || err.message}`;
      setMessages((prev) => [
        ...prev,
        { id: genId(), role: "bot", text: errText, replies: null },
      ]);
    }
  };

  // ── Branch handlers ──────────────────────────────────────────────────────────

  const handleMainOption = (opt) => {
    appendUser(opt.label);

    if (opt.id === "vote") {
      // Directly query backend about voting
      setTimeout(() =>
        sendToBackend(
          "I want to vote on collections. What active ballots are available and how can I cast or delegate my vote?",
          true // bubble already added above
        ), 50
      );

    } else if (opt.id === "agents") {
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
      appendBot(
        "Of course! Ask me anything about the collection, styling, proxy voting, or AI features.",
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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

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
      <div className="gsnowgpt-body chat-messages" style={{ flex: 1 }}>
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

function MessageRow({ msg, onReply, isAtLimit }) {
  const isBot = msg.role === "bot";

  return (
    <div className={`conv-msg conv-msg--${msg.role}`}>
      {isBot && <div className="conv-msg__dot" />}
      <div className="conv-msg__content">
        <div className="conv-msg__bubble">
          {renderMarkdown(msg.text)}
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
}
