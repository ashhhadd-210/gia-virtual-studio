import { useState } from "react";
import { getStoredPremium, setStoredPremium } from "./data.js";

/**
 * SubscriptionView — Payment and subscription management.
 *
 * Shows three tiers: Free, Premium Chat, and All-Access.
 * Payment is via Stripe (card) and MoonPay (crypto) — both are stubbed
 * with a realistic UI that shows the correct flow without live API keys.
 */
export default function SubscriptionView({ onUpgradeComplete }) {
  const [isPremium, setIsPremium]   = useState(() => getStoredPremium());
  const [paying, setPaying]         = useState(null); // null | 'premium' | 'allaccess'
  const [step, setStep]             = useState("plans"); // 'plans' | 'checkout' | 'success'
  const [method, setMethod]         = useState("stripe"); // 'stripe' | 'moonpay'

  const handleSelectPlan = (planId) => {
    setPaying(planId);
    setStep("checkout");
  };

  const handleConfirmPayment = () => {
    // Simulate payment success
    setStoredPremium(true);
    setIsPremium(true);
    setStep("success");
    onUpgradeComplete?.();
  };

  if (step === "success") {
    return (
      <div className="gsnowgpt-body sub-view" style={{ alignItems: "center", textAlign: "center", paddingTop: 40 }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>✦</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ui-text-gold)", marginBottom: 8 }}>
          Welcome to GSNowGPT Premium
        </div>
        <div style={{ fontSize: 13, color: "var(--ui-text-secondary)", lineHeight: 1.6, maxWidth: 300 }}>
          Unlimited chat, all AI features, and priority agent access are now active.
          Return to the showroom and explore.
        </div>
      </div>
    );
  }

  if (step === "checkout") {
    const planLabel = paying === "premium" ? "GSNowGPT Premium" : "All-Access";
    const planPrice = paying === "premium" ? "$18 / mo" : "$49 / mo";
    return (
      <div className="gsnowgpt-body sub-view">
        <div style={{ fontSize: 13, color: "var(--ui-text-muted)", marginBottom: 4 }}>
          ← <button
              style={{ background: "none", border: "none", color: "var(--ui-text-muted)", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}
              onClick={() => setStep("plans")}
            >Back to plans</button>
        </div>

        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ui-text-primary)", marginBottom: 4 }}>
          {planLabel}
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "var(--ui-text-gold)", marginBottom: 16 }}>
          {planPrice}
        </div>

        {/* Payment method selector */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {["stripe", "moonpay"].map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              style={{
                flex: 1,
                padding: "9px",
                border: `1px solid ${method === m ? "var(--ui-gold-border-active)" : "var(--ui-gold-border)"}`,
                borderRadius: "var(--ui-radius-sm)",
                background: method === m ? "rgba(201,162,39,0.08)" : "var(--ui-bg-card)",
                color: method === m ? "var(--ui-text-gold)" : "var(--ui-text-muted)",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.06em",
                transition: "all 0.12s ease",
              }}
            >
              {m === "stripe" ? "💳 Card (Stripe)" : "◈ Crypto (MoonPay)"}
            </button>
          ))}
        </div>

        {method === "stripe" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              placeholder="Card number"
              style={inputStyle}
              readOnly
              defaultValue="•••• •••• •••• ••••"
            />
            <div style={{ display: "flex", gap: 8 }}>
              <input placeholder="MM / YY" style={{ ...inputStyle, flex: 1 }} readOnly defaultValue="MM / YY" />
              <input placeholder="CVC" style={{ ...inputStyle, flex: 1 }} readOnly defaultValue="•••" />
            </div>
            <input placeholder="Name on card" style={inputStyle} readOnly defaultValue="Preview mode" />
          </div>
        ) : (
          <div style={{
            padding: 16, border: "1px solid var(--ui-gold-border)", borderRadius: "var(--ui-radius-md)",
            background: "var(--ui-bg-card)", textAlign: "center", color: "var(--ui-text-secondary)", fontSize: 12, lineHeight: 1.6,
          }}>
            MoonPay checkout would open here — supports BTC, ETH, USDC, and 30+ other currencies.
            <br /><br />
            <span style={{ color: "var(--ui-text-muted)", fontSize: 11 }}>Preview mode · no charges will be made.</span>
          </div>
        )}

        <button className="sub-cta-btn sub-cta-btn--gold" style={{ marginTop: 16 }} onClick={handleConfirmPayment}>
          Confirm & Subscribe
        </button>

        <div className="sub-disclaimer" style={{ marginTop: 12 }}>
          Preview mode — no real charges. In production this connects to your Stripe
          or MoonPay account. Cancel anytime.
        </div>
      </div>
    );
  }

  // Plans view
  return (
    <div className="gsnowgpt-body sub-view">
      {isPremium && (
        <div style={{
          padding: "12px 16px", marginBottom: 8,
          border: "1px solid var(--ui-gold-border-active)", borderRadius: "var(--ui-radius-md)",
          background: "rgba(201,162,39,0.07)", color: "var(--ui-text-gold)", fontSize: 13, fontWeight: 600,
        }}>
          ✦ GSNowGPT Premium is active
        </div>
      )}

      {/* Free */}
      <div className="sub-plan-card">
        <div className="sub-plan-card__header">
          <span className="sub-plan-card__name">Free</span>
          <div>
            <span className="sub-plan-card__price">$0</span>
            <span className="sub-plan-card__period"> / always</span>
          </div>
        </div>
        <ul className="sub-plan-card__features">
          <li>10 GSNowGPT messages</li>
          <li>Collection browse</li>
          <li>First proxy vote</li>
          <li>AI Stylist free preview</li>
        </ul>
        <button className="sub-cta-btn sub-cta-btn--outline" disabled>
          {isPremium ? "Your base plan" : "Current plan"}
        </button>
      </div>

      {/* Premium Chat */}
      <div className="sub-plan-card sub-plan-card--featured">
        <div className="sub-plan-card__header">
          <span className="sub-plan-card__name">GSNowGPT Premium</span>
          <div>
            <span className="sub-plan-card__price">$18</span>
            <span className="sub-plan-card__period"> / mo</span>
          </div>
        </div>
        <ul className="sub-plan-card__features">
          <li>Unlimited GSNowGPT chat</li>
          <li>All AI Features unlocked</li>
          <li>Priority response speed</li>
          <li>Proxy voting — unlimited</li>
          <li>Includes AI Stylist agent</li>
        </ul>
        <button
          className="sub-cta-btn sub-cta-btn--gold"
          onClick={() => handleSelectPlan("premium")}
          disabled={isPremium}
        >
          {isPremium ? "Active" : "Upgrade · $18 / mo"}
        </button>
      </div>

      {/* All-Access */}
      <div className="sub-plan-card">
        <div className="sub-plan-card__header">
          <span className="sub-plan-card__name">All-Access</span>
          <div>
            <span className="sub-plan-card__price">$49</span>
            <span className="sub-plan-card__period"> / mo</span>
          </div>
        </div>
        <ul className="sub-plan-card__features">
          <li>Everything in Premium</li>
          <li>All 5 AI Agents active</li>
          <li>Auto-delegation rules</li>
          <li>Trend Oracle + Personal Shopper</li>
          <li>Dedicated account manager</li>
        </ul>
        <button
          className="sub-cta-btn sub-cta-btn--gold"
          onClick={() => handleSelectPlan("allaccess")}
          disabled={isPremium}
        >
          All-Access · $49 / mo
        </button>
      </div>

      {/* Payment logos */}
      <div className="sub-payment-logos">
        <span style={{ fontSize: 11, color: "var(--ui-text-muted)" }}>Payments via</span>
        <span className="sub-payment-logo">Stripe</span>
        <span className="sub-payment-logo">MoonPay</span>
      </div>

      <div className="sub-disclaimer">
        Subscriptions renew monthly. Cancel anytime from this screen.
        Crypto payments handled securely via MoonPay.
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "10px 14px",
  border: "1px solid var(--ui-gold-border)",
  borderRadius: "var(--ui-radius-sm)",
  background: "rgba(20, 16, 10, 0.72)",
  color: "var(--ui-text-muted)",
  fontFamily: "inherit",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};
