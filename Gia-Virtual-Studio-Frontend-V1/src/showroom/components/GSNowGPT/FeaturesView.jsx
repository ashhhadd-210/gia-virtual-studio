import { AI_FEATURES, AGENTS, getStoredAgentStatuses, getStoredPremium } from "./data.js";

/**
 * FeaturesView — AI Feature bundle catalogue.
 *
 * For every feature the user can see:
 *  · What the feature does
 *  · Whether it is free or paid
 *  · Which agent(s) power it
 *  · Whether subscription is required
 *  · A contextual "Use Feature" button that either opens chat with context
 *    or routes to the subscription / agent activation flow.
 */
export default function FeaturesView({ onOpenChat, onNavigate }) {
  const agentStatuses = getStoredAgentStatuses();
  const isPremium = getStoredPremium();

  const agentName = (id) => AGENTS.find((a) => a.id === id)?.name ?? id;

  const agentIsActive = (id) => agentStatuses[id] === "subscribed";

  const canUseFeature = (feature) => {
    if (feature.free) return true;
    if (!isPremium) return false;
    return feature.agents.every((id) => agentIsActive(id));
  };

  const handleUse = (feature) => {
    if (feature.free || canUseFeature(feature)) {
      // Route directly into chat with feature context
      onOpenChat({
        type: "feature",
        featureId: feature.id,
        preloadMessage: `Activate the "${feature.name}" AI feature for me. ${feature.description}`,
      });
    } else if (!isPremium) {
      // Need premium first
      onNavigate("subscription");
    } else {
      // Need specific agent(s) subscribed
      onNavigate("agents");
    }
  };

  const buttonLabel = (feature) => {
    if (feature.free || canUseFeature(feature)) return "Use Feature";
    if (!isPremium) return "Upgrade to Use";
    return "Activate Agents";
  };

  const buttonClass = (feature) => {
    if (feature.free || canUseFeature(feature)) return "feature-use-btn feature-use-btn--free";
    return "feature-use-btn feature-use-btn--premium";
  };

  return (
    <div className="gsnowgpt-body">
      <div className="features-intro">
        <h3 className="features-intro__title">AI Features</h3>
        <p className="features-intro__desc">
          AI Features are bundled capabilities powered by one or more agents. Free features
          are available to all users. Premium features require GSNowGPT Premium and the
          listed agent(s) to be active.
        </p>
      </div>

      <div className="features-list">
        {AI_FEATURES.map((feature) => (
          <div key={feature.id} className="feature-card">
            <div className="feature-card__header">
              <span className="feature-card__icon">{feature.icon}</span>
              <span className="feature-card__name">{feature.name}</span>
              <span className={`feature-card__tier feature-card__tier--${feature.free ? "free" : "premium"}`}>
                {feature.free ? "Free" : "Premium"}
              </span>
            </div>

            <p className="feature-card__desc">{feature.description}</p>

            <div className="feature-card__agents">
              <span>Powered by:</span>
              {feature.agents.map((id) => (
                <span key={id} className="feature-card__agent-chip">
                  {agentName(id)}
                </span>
              ))}
            </div>

            {feature.requiresSubscription && !feature.free && (
              <div style={{ fontSize: 11, color: "var(--ui-text-muted)", marginBottom: 10 }}>
                Requires GSNowGPT Premium · agent(s) must be active
              </div>
            )}

            <button className={buttonClass(feature)} onClick={() => handleUse(feature)}>
              {buttonLabel(feature)}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
