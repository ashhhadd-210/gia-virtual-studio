import { useState, useEffect, useRef } from "react";

/* ╔═══════════════════════════════════════════════════════════════╗
   ║  HomeView — Futuristic Conversational UI for GSNowGPT      ║
   ║  Tech-themed, minimal, interactive entry for the AI suite.  ║
   ╚═══════════════════════════════════════════════════════════════╝ */

const MAIN_OPTIONS = [
  { id: "vote",    icon: <TechIcon shape="diamond" />, label: "Vote on Collections" },
  { id: "agents",  icon: <TechIcon shape="dot" />,    label: "AI Agents" },
  { id: "futures", icon: <TechIcon shape="star" />,   label: "AI Futures" },
  { id: "chat",    icon: <TechIcon shape="circle" />, label: "Continue Conversation" },
];

const AI_AGENTS_LIST = [
  {
    id: "styling-agent",
    icon: <TechIcon shape="flash" />,
    label: "Styling Agent",
    desc: "Curates AI-powered outfit briefs, palette alternatives, and real-time Q&A for any showroom look.",
  },
  {
    id: "trend-curation",
    icon: <TechIcon shape="star" />,
    label: "Trend Curation Agent",
    desc: "Analyzes styles with live market data—forecasts silhouettes and colorways on the fly.",
  },
  {
    id: "query-agent",
    icon: <TechIcon shape="circle" />,
    label: "Query Agent",
    desc: "Instantly deep-searches all GIA archives, answers spanned queries, and narrates look histories.",
  },
  {
    id: "voting-agent",
    icon: <TechIcon shape="diamond" />,
    label: "Voting Agent",
    desc: "Connects you to governance ballots to vote or delegate instantly.",
  },
  {
    id: "proxy-voting",
    icon: <TechIcon shape="block" />,
    label: "Proxy Voting Agent",
    desc: "Automates and delegates your votes using your preferences.",
  },
];

const AI_FUTURES_LIST = [
  {
    id: "ai-stylist",
    icon: <TechIcon shape="flash" />,
    label: "AI Stylist",
    desc: "Hyper-personalized AI styling, digital wardrobe curation, and occasion-ready briefs.",
  },
  {
    id: "mood-filters",
    icon: <TechIcon shape="halfmoon" />,
    label: "Mood Filters",
    desc: "Real-time mood, aesthetic, or emotion filtering for the full collection.",
  },
  {
    id: "avatar-fitting",
    icon: <TechIcon shape="dot" />,
    label: "Avatar Fitting",
    desc: "Virtually try-on any look using your AI avatar—see yourself before hitting the floor.",
  },
  {
    id: "runway-feed",
    icon: <TechIcon shape="star" />,
    label: "Personalized Runway Feed",
    desc: "Live AI-curated stream of looks, continuously ranked by your tastes and activity.",
  },
];

/* ════════════════════════════════════════════════════════════════
   Tech-Infused Conversational Component
   ════════════════════════════════════════════════════════════════ */
export default function HomeView({ onNavigate, onOpenChat, context }) {
  const bottomRef = useRef(null);
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 0,
      role: "bot",
      text: "<pulse>Welcome to <br /><span class='cyber'>GIA</span>.</pulse>\nWhat would you like to explore today?",
      replies: MAIN_OPTIONS.map((o) => ({ ...o, handler: "main" })),
    },
  ]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    if (context?.type === "vote") {
      appendBot(
        "<glow>Initiated from showroom.</glow>\nLoading ballot…",
        null,
        400,
      );
      setTimeout(() => onOpenChat({ type: "vote" }), 1300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Message helpers — tech-themed
  const appendUser = (label) =>
    setMessages((prev) => [
      ...prev.map((m) => ({ ...m, replies: null })),
      { id: Date.now(), role: "user", text: label },
    ]);

  const appendBot = (text, replies = null, delay = 680) => {
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, role: "bot", text, replies },
      ]);
    }, delay);
  };

  // Branch handlers — with more “cyber” flavor wording & glow
  const handleMain = (opt) => {
    appendUser(opt.label);

    if (opt.id === "vote") {
      appendBot(
        "<glow>Opening</glow> active voting ballot…\nCast or delegate instantly.",
        null,
        600
      );
      setTimeout(() => onOpenChat({ type: "vote" }), 1600);

    } else if (opt.id === "agents") {
      appendBot(
        "<pulse>AI Agents Console:</pulse>",
        AI_AGENTS_LIST.map((a) => ({
          id: a.id, icon: a.icon, label: a.label, handler: "agent", data: a,
        })),
      );

    } else if (opt.id === "futures") {
      appendBot(
        "<pulse>AI Futures Deck:</pulse>",
        AI_FUTURES_LIST.map((f) => ({
          id: f.id, icon: f.icon, label: f.label, handler: "future", data: f,
        })),
      );
    } else {
      appendBot("<glow>Switching to open conversation…</glow>", null, 500);
      setTimeout(() => onNavigate("chat"), 1100);
    }
  };

  const handleAgent = (agent) => {
    appendUser(agent.label);
    appendBot(
      `<cyber>**${agent.label}**</cyber>\n\n${agent.desc}`,
      [
        {
          id: "activate",
          icon: <TechIcon shape="diamond" />,
          label: "Activate Agent",
          handler: "sub",
          fn: () => onNavigate("subscription"),
        },
        {
          id: "learn",
          icon: <TechIcon shape="circle" />,
          label: "Learn More",
          handler: "sub",
          fn: () =>
            onOpenChat({
              type: "general",
              preloadMessage: `Tell me about the ${agent.label} — what does it do and how do I get started?`,
            }),
        },
        {
          id: "back",
          icon: <TechIcon shape="arrow" />,
          label: "Back to AI Agents",
          handler: "sub",
          fn: () => returnToAgents(),
        },
      ],
    );
  };

  const returnToAgents = () => {
    appendUser("← Back to AI Agents");
    appendBot(
      "<pulse>AI Agents Console:</pulse>",
      AI_AGENTS_LIST.map((a) => ({
        id: a.id, icon: a.icon, label: a.label, handler: "agent", data: a,
      })),
    );
  };

  const handleFuture = (future) => {
    appendUser(future.label);
    appendBot(
      `<cyber>**${future.label}**</cyber>\n\n${future.desc}`,
      [
        {
          id: "try",
          icon: <TechIcon shape="star" />,
          label: "Try It",
          handler: "sub",
          fn: () =>
            onOpenChat({
              type: "feature",
              featureId: future.id,
              preloadMessage: `Activate ${future.label} for me and walk me through what it can do.`,
            }),
        },
        {
          id: "learn",
          icon: <TechIcon shape="circle" />,
          label: "Learn More",
          handler: "sub",
          fn: () =>
            onOpenChat({
              type: "general",
              preloadMessage: `Tell me more about ${future.label} — what's possible with it?`,
            }),
        },
        {
          id: "back",
          icon: <TechIcon shape="arrow" />,
          label: "Back to AI Futures",
          handler: "sub",
          fn: () => returnToFutures(),
        },
      ],
    );
  };

  const returnToFutures = () => {
    appendUser("← Back to AI Futures");
    appendBot(
      "<pulse>AI Futures Deck:</pulse>",
      AI_FUTURES_LIST.map((f) => ({
        id: f.id, icon: f.icon, label: f.label, handler: "future", data: f,
      })),
    );
  };

  // Central reply dispatcher remains mostly unchanged
  const handleReply = (reply) => {
    if      (reply.handler === "main")   handleMain(reply);
    else if (reply.handler === "agent")  handleAgent(reply.data);
    else if (reply.handler === "future") handleFuture(reply.data);
    else if (reply.handler === "sub")    reply.fn?.();
  };

  return (
    <div className="gsnowgpt-body conv-home tech-ui-bg">
      {messages.map((msg) => (
        <TechMessage
          key={msg.id}
          role={msg.role}
          isBot={msg.role === "bot"}
          msg={msg}
          handleReply={handleReply}
        />
      ))}

      {/* Animated Typing */}
      {isTyping && (
        <div className="conv-msg conv-msg--bot">
          <div className="conv-msg__dot" />
          <div className="conv-msg__content">
            <div className="conv-msg__bubble conv-msg__bubble--typing">
              <TechTyping />
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} style={{ height: 16 }} />
    </div>
  );
}

/* ════ Stylish Tech-Themed Helpers ═════════════════════════════ */

function TechIcon({ shape }) {
  const ICONS = {
    diamond: <svg width="18" height="18" style={{ marginRight: 2 }}><polygon points="9,1 17,9 9,17 1,9" fill="#41c9ef" /></svg>,
    dot:     <svg width="16" height="16"><circle cx="8" cy="8" r="6" fill="#a5ffe9" /></svg>,
    star:    <svg width="18" height="18"><polygon points="9,1 11,7 17,7 12,11 14,17 9,13 4,17 6,11 1,7 7,7" fill="#ffe35c" /></svg>,
    circle:  <svg width="18" height="18"><ellipse cx="9" cy="9" rx="7" ry="7" fill="#fff7c0" /></svg>,
    block:   <svg width="16" height="16"><rect x="3" y="3" width="10" height="10" rx="3" fill="#e6b7ff" /></svg>,
    halfmoon:<svg width="16" height="16"><path d="M8 2a6 6 0 106 6" fill="#67f7c3" /></svg>,
    arrow:   <svg width="14" height="14"><polyline points="10,2 4,7 10,12" fill="none" stroke="#84cdfa" strokeWidth="2"/></svg>,
    flash:   <svg width="16" height="16" style={{ marginLeft: -2 }}><polygon points="7,1 11,7 9,7 13,15 7,9 9,9" fill="#93fff9" /></svg>
  };
  return ICONS[shape] || null;
}

function TechMessage({ role, isBot, msg, handleReply }) {
  return (
    <div className={`conv-msg conv-msg--${role}${isBot ? " conv-msg--glow" : ""}`}>
      {isBot && <div className="conv-msg__dot conv-msg__dot--neon" />}
      <div className="conv-msg__content">
        <div className={`conv-msg__bubble${isBot ? " conv-msg__bubble--tech" : ""}`}>
          {renderText(msg.text)}
        </div>
        {msg.replies?.length > 0 && (
          <div className="conv-replies conv-replies--tech">
            {msg.replies.map((r) => (
              <button
                key={r.id}
                className="conv-reply-btn conv-reply-btn--tech"
                onClick={() => handleReply(r)}
              >
                {r.icon}
                <span>{r.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TechTyping() {
  return (
    <span className="conv-typing-tech">
      <span className="conv-typing-dot conv-typing-dot--neon" />
      <span className="conv-typing-dot conv-typing-dot--neon" />
      <span className="conv-typing-dot conv-typing-dot--neon" />
    </span>
  );
}

/** Render text w/ line breaks, bold, and tech markup (experimental) */
function renderText(raw) {
  // Replace limited markup for demo: <pulse>, <glow>, <cyber>
  let processed = raw
    .replace(/<pulse>(.*?)<\/pulse>/g, "<span class='tech-pulse'>$1</span>")
    .replace(/<glow>(.*?)<\/glow>/g, "<span class='tech-glow'>$1</span>")
    .replace(/<cyber>(.*?)<\/cyber>/g, "<span class='tech-cyber'>$1</span>");
  return processed.split("\n").map((line, li, arr) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((p, pi) =>
      p.startsWith("**") && p.endsWith("**") ? (
        <strong key={pi} style={{
          color: "#26d5ff",
          fontWeight: 700,
          letterSpacing: "0.01em",
          textShadow: "0 0 4px #3fecee77, 0 2px 8px #0002"
        }}>
          {p.slice(2, -2)}
        </strong>
      ) : (
        <span
          key={pi}
          dangerouslySetInnerHTML={{ __html: p }}
        />
      ),
    );
    return (
      <span key={li}>
        {parts}
        {li < arr.length - 1 && <br />}
      </span>
    );
  });
}
