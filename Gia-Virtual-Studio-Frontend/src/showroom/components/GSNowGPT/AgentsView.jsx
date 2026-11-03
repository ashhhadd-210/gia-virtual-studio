import { useState } from "react";
import { AGENTS, getStoredAgentStatuses, setStoredAgentStatus } from "./data.js";

/**
 * AgentsView — Agent marketplace.
 *
 * Each agent card shows:
 *  · Name, icon, price, current access status
 *  · Description and feature chips
 *  · Context-aware action buttons: Subscribe, Activate, Delegate, Learn More
 *
 * Clicking Subscribe or Activate routes to the Subscription view.
 */
export default function AgentsView({ onNavigate, onOpenChat }) {
  const storedStatuses = getStoredAgentStatuses();

  // Merge stored statuses over defaults
  const [statuses, setStatuses] = useState(() => {
    const init = {};
    for (const agent of AGENTS) {
      init[agent.id] = storedStatuses[agent.id] ?? agent.defaultStatus;
    }
    return init;
  });

  const handleDelegate = (agent) => {
    onOpenChat({
      type: "general",
      preloadMessage: `I'd like to delegate to the ${agent.name}. Can you explain how delegation works and what it will handle on my behalf?`,
    });
  };

  const handleLearnMore = (agent) => {
    onOpenChat({
      type: "general",
      preloadMessage: `Tell me more about the ${agent.name} agent. What exactly does it do, and what becomes possible after I activate it?`,
    });
  };

  const handleActivate = (agent) => {
    // Free-preview: activate locally; for others, route to subscription
    if (statuses[agent.id] === "preview") {
      const next = { ...statuses, [agent.id]: "subscribed" };
      setStatuses(next);
      setStoredAgentStatus(agent.id, "subscribed");
    } else {
      onNavigate("subscription");
    }
  };

  const statusLabel = (id) => {
    switch (statuses[id]) {
      case "subscribed": return "Active";
      case "preview":    return "Free Preview";
      default:           return "Available";
    }
  };

  const statusClass = (id) => {
    switch (statuses[id]) {
      case "subscribed": return "agent-card__status--subscribed";
      case "preview":    return "agent-card__status--preview";
      default:           return "agent-card__status--available";
    }
  };

  return (
    <div className="gsnowgpt-body">
      <div className="agents-intro">
        <h3 className="agents-intro__title">AI Agents</h3>
        <p className="agents-intro__desc">
          Agents are specialised AI modules you can activate, subscribe to, or delegate
          tasks to — each unlocking a distinct layer of showroom intelligence.
          Subscribe to individual agents or get all of them with GSNowGPT Premium.
        </p>
      </div>

      <div className="agents-list">
        {AGENTS.map((agent) => {
          const status = statuses[agent.id];
          const isActive = status === "subscribed";

          return (
            <div key={agent.id} className="agent-card">
              <div className="agent-card__header">
                <div className="agent-card__icon">{agent.icon}</div>
                <div className="agent-card__meta">
                  <div className="agent-card__name">{agent.name}</div>
                  <div className="agent-card__price">
                    {isActive ? "✓ Active" : agent.price}
                  </div>
                </div>
                <span className={`agent-card__status ${statusClass(agent.id)}`}>
                  {statusLabel(agent.id)}
                </span>
              </div>

              <p className="agent-card__desc">{agent.description}</p>

              <div className="agent-card__features">
                {agent.features.map((f) => (
                  <span key={f} className="agent-card__feature-chip">{f}</span>
                ))}
              </div>

              <div className="agent-card__actions">
                {!isActive && (
                  <button
                    className={`agent-action-btn ${
                      status === "preview" ? "agent-action-btn--activate" : "agent-action-btn--subscribe"
                    }`}
                    onClick={() => handleActivate(agent)}
                  >
                    {status === "preview" ? "Activate" : "Subscribe"}
                  </button>
                )}

                {isActive && (
                  <button
                    className="agent-action-btn agent-action-btn--delegate"
                    onClick={() => handleDelegate(agent)}
                  >
                    Delegate
                  </button>
                )}

                <button
                  className="agent-action-btn agent-action-btn--learn"
                  onClick={() => handleLearnMore(agent)}
                >
                  Learn More
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
