import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, Check, X, Crown, Zap, Users, Loader2 } from 'lucide-react';
import { createCheckoutSession } from '../Api/api'; // adjust path if needed

export default function Pricing() {
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [loadingPlan, setLoadingPlan] = useState(null);
  const navigate = useNavigate();

  // ←←← REPLACE THESE WITH YOUR REAL STRIPE PRICE IDs ←←←
  const plans = [
    {
      name: "Explorer",
      icon: Users,
      price: billingCycle === 'monthly' ? 9 : 89,
      period: billingCycle === 'monthly' ? "/month" : "/year",
      description: "Perfect for fashion enthusiasts",
      priceId: billingCycle === 'monthly' ? "price_1TKxTBC44qztMoL6MuFTq0jD" : "price_1TKxTgC44qztMoL6Zbg6AfkO", // ← your Explorer monthly/yearly price ID
      features: [
        "Access to Virtual Showroom",
        "Browse 150+ AI designs per collection",
        "Basic styling recommendations",
        "Trend blog access",
        "Community voting",
        "Watermarked downloads",
      ],
      notIncluded: ["Priority generation", "Commercial usage"],
      buttonText: "Start Free Trial",
      buttonVariant: "secondary",
      popular: false,
    },
    {
      name: "Creator",
      icon: Sparkles,
      price: billingCycle === 'monthly' ? 29 : 290,
      period: billingCycle === 'monthly' ? "/month" : "/year",
      description: "For designers & creators",
      priceId: billingCycle === 'monthly' ? "price_1TKxU7C44qztMoL6D4PdpRPY" : "price_1TKxUYC44qztMoL65POoTE9O", // ← your Creator price IDs
      features: [
        "Everything in Explorer",
        "Unlimited Showroom access",
        "High-resolution downloads",
        "Commercial usage rights",
        "Advanced AI styling agent",
        "Early access to new collections",
        "Priority support",
      ],
      notIncluded: [],
      buttonText: "Subscribe Now",
      buttonVariant: "primary",
      popular: true,
    },
    {
      name: "Studio",
      icon: Crown,
      price: billingCycle === 'monthly' ? 79 : 790,
      period: billingCycle === 'monthly' ? "/month" : "/year",
      description: "For fashion brands & agencies",
      priceId: billingCycle === 'monthly' ? "price_1TKxV7C44qztMoL6jybJkIjD" : "price_1TKxVYC44qztMoL6j0WTHw3Q", // ← your Creator price IDs
      features: [
        "Everything in Creator",
        "Custom AI model fine-tuning",
        "API access",
        "Team seats (up to 5)",
        "Private collections",
        "Dedicated account manager",
        "White-label showroom option",
      ],
      notIncluded: [],
      buttonText: "Contact Sales",
      buttonVariant: "secondary",
      popular: false,
    },
  ];

  const handleSubscribe = async (plan) => {
    if (!plan.priceId) {
      // Studio plan → contact page
      navigate('/contact');
      return;
    }

    setLoadingPlan(plan.name);

    try {
      const { url } = await createCheckoutSession(plan.priceId, plan.name);
      window.location.href = url; // redirect to Stripe Checkout
    } catch (err) {
      alert(err.message || 'Something went wrong');
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="bg-slate-950 text-white min-h-screen font-mono">
      {/* Header */}
      <div className="pt-24 pb-16 text-center px-4">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-slate-700 bg-slate-900/60 mb-6">
          <Zap className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-medium tracking-widest text-emerald-400">PRICING</span>
        </div>

        <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tighter mb-4">
          Simple, Transparent Pricing
        </h1>
        <p className="text-base sm:text-lg md:text-xl text-slate-400 max-w-2xl mx-auto">
          Choose the plan that fits your fashion journey.
          All plans include access to GIA's latest AI collections.
        </p>
      </div>

      {/* Billing Toggle */}
      <div className="flex justify-center mb-12">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-1 flex">
          <button
            onClick={() => setBillingCycle('monthly')}
            className={`px-8 py-3 rounded-xl text-sm font-medium transition-all ${
              billingCycle === 'monthly'
                ? 'bg-white text-black shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingCycle('yearly')}
            className={`px-8 py-3 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
              billingCycle === 'yearly'
                ? 'bg-white text-black shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Yearly
            <span className="text-emerald-400 text-xs font-bold">SAVE 20%</span>
          </button>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-24">
        <div className="grid md:grid-cols-3 gap-6 md:gap-8">
          {plans.map((plan, index) => (
            <div
              key={index}
              className={`relative rounded-3xl p-6 sm:p-8 border transition-all duration-300 ${
                plan.popular
                  ? 'border-violet-500 bg-gradient-to-b from-slate-900 to-slate-950 md:scale-105 shadow-2xl shadow-violet-950/50'
                  : 'border-slate-800 hover:border-slate-700 bg-slate-950'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-violet-600 text-white text-xs font-bold tracking-widest px-6 py-1.5 rounded-full flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  MOST POPULAR
                </div>
              )}

              <div className="flex items-center gap-4 mb-8">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
                  <plan.icon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-3xl font-semibold tracking-tight">{plan.name}</h3>
                  <p className="text-slate-400 text-sm mt-1">{plan.description}</p>
                </div>
              </div>

              <div className="mb-10">
                <span className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tighter">${plan.price}</span>
                <span className="text-slate-400 ml-2">{plan.period}</span>
              </div>

              <button
                onClick={() => handleSubscribe(plan)}
                disabled={loadingPlan === plan.name}
                className={`block w-full text-center py-4 rounded-2xl font-semibold text-lg transition-all mb-10 flex items-center justify-center gap-2 ${
                  plan.buttonVariant === 'primary'
                    ? 'bg-white text-black hover:bg-violet-400 hover:text-white'
                    : 'border border-slate-700 hover:border-white hover:bg-white hover:text-black'
                }`}
              >
                {loadingPlan === plan.name ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Redirecting...
                  </>
                ) : (
                  plan.buttonText
                )}
              </button>

              <div className="space-y-4">
                {plan.features.map((feature, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm">
                    <Check className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span className="text-slate-300">{feature}</span>
                  </div>
                ))}

                {plan.notIncluded?.length > 0 && (
                  <div className="pt-4 border-t border-slate-800 mt-6">
                    {plan.notIncluded.map((feature, i) => (
                      <div key={i} className="flex items-start gap-3 text-sm opacity-60">
                        <X className="w-5 h-5 text-slate-500 mt-0.5 flex-shrink-0" />
                        <span className="text-slate-400 line-through">{feature}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer note */}
      <div className="py-16">
        <div className="max-w-3xl mx-auto text-center px-6 text-slate-400">
          <p className="text-sm">
            All plans include access to new AI collections every season. 
            Cancel anytime. 14-day money-back guarantee on paid plans.
          </p>
        </div>
      </div>
    </div>
  );
}