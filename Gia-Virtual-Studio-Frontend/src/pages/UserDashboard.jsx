'use client';

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Heart, MessageCircle, Crown,
  Activity, Vote, Loader2, RefreshCw,
  ChevronRight, Zap, Bot, ShieldAlert, Sparkles,
  CalendarCheck, CalendarX, ShieldCheck, Camera,
} from 'lucide-react';
import {
  fetchMyStats, fetchMyActivity, fetchProxyStatus,
  toggleProxyVoting, fetchMySubscription, cancelSubscription,
  fetchMyCollection,
} from '../Api/api';
import AvatarPicker from '../components/avatar/AvatarPicker';
import { getAvatarById } from '../components/avatar/avatarData';

// ── helpers ───────────────────────────────────────────────────────────────────
function relTime(isoStr) {
  if (!isoStr) return '';
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDate(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}

// New helper: Clean date without time for "Member Since"
function fmtMemberSince(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

function daysLeft(endsAtIso) {
  if (!endsAtIso) return null;
  return Math.max(0, Math.ceil((new Date(endsAtIso).getTime() - Date.now()) / 86_400_000));
}

// ── activity types ────────────────────────────────────────────────────────────
const TYPE_META = {
  vote:    { Icon: Vote,          ring: 'border-amber-500/40',  bg: 'bg-amber-500/10',  text: 'text-amber-400',  badge: 'Voted'   },
  comment: { Icon: MessageCircle, ring: 'border-blue-500/40',   bg: 'bg-blue-500/10',   text: 'text-blue-400',   badge: 'Comment' },
  like:    { Icon: Heart,         ring: 'border-pink-500/40',   bg: 'bg-pink-500/10',   text: 'text-pink-400',   badge: 'Liked'   },
};

function ActivityItem({ item, index }) {
  const meta = TYPE_META[item.type] ?? TYPE_META.vote;
  const { Icon } = meta;

  return (
    <div
      className="group flex items-start gap-4 py-4 border-b border-slate-800/60 last:border-0 animate-fadeIn"
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: 'both' }}
    >
      <div className={`shrink-0 w-10 h-10 rounded-2xl border ${meta.ring} ${meta.bg} flex items-center justify-center`}>
        <Icon className={`w-4 h-4 ${meta.text}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200 leading-snug pr-2">{item.label}</p>
        {item.sublabel && (
          <p className="text-xs text-slate-500 mt-0.5 italic">{item.sublabel}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className={`text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full ${meta.bg} ${meta.text}`}>
            {meta.badge}
          </span>
          <span className="text-[11px] text-slate-500">{item.time || relTime(item.ts)}</span>
        </div>
      </div>
      {item.article_id && (
        <Link
          to={`/blog/${item.article_id}`}
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-white mt-1"
        >
          <ChevronRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  );
}

function EmptyActivity() {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="w-14 h-14 rounded-3xl bg-slate-800 flex items-center justify-center mb-4">
        <Zap className="w-6 h-6 text-slate-600" />
      </div>
      <p className="text-slate-400 text-sm font-medium">No activity yet</p>
      <p className="text-slate-600 text-xs mt-1 px-4">
        Vote on products, like articles, or leave a comment to get started.
      </p>
    </div>
  );
}

// ── No-votes Alert ────────────────────────────────────────────────────────────
function NoVotesAlert({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-sm animate-alertIn"
        style={{
          background: 'linear-gradient(145deg, rgba(15,23,42,0.98) 0%, rgba(2,6,23,0.98) 100%)',
          border: '1px solid rgba(239,68,68,0.35)',
          borderRadius: '24px',
          boxShadow: '0 0 60px rgba(239,68,68,0.12), 0 24px 80px rgba(0,0,0,0.7)',
          overflow: 'hidden',
        }}
      >
        <div style={{ height: '2px', background: 'linear-gradient(90deg, transparent, #ef4444, transparent)' }} />
        <div className="p-8">
          <div className="flex justify-center mb-5">
            <div className="w-[72px] h-[72px] rounded-2xl bg-red-500/10 border border-red-500/25 flex items-center justify-center">
              <ShieldAlert className="w-8 h-8 text-red-400" />
            </div>
          </div>
          <h3 className="text-center text-xl font-bold text-white mb-2 tracking-tight">Cast a Vote First</h3>
          <p className="text-center text-slate-400 text-sm leading-relaxed mb-6">
            The Proxy Voting Agent needs to learn your taste before it can vote on your behalf.
            <span className="block mt-2 text-slate-300 font-medium">Vote on at least one product to unlock this feature.</span>
          </p>
          <div className="space-y-3 mb-7">
            {[
              { num: '01', text: 'Browse the Collections page' },
              { num: '02', text: 'Vote on a product you love' },
              { num: '03', text: 'Return here to enable the agent' }
            ].map(s => (
              <div key={s.num} className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-xs font-bold text-red-400">
                  {s.num}
                </span>
                <p className="text-sm text-slate-300">{s.text}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl text-sm font-medium text-slate-400 transition-all border border-slate-700"
            >
              Dismiss
            </button>
            <Link
              to="/collections"
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white text-center flex items-center justify-center gap-2 transition-all hover:brightness-110"
              style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}
            >
              <Vote className="w-4 h-4" /> Go Vote
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Proxy Voting Card ─────────────────────────────────────────────────────────
function ProxyVotingCard({ stats, onShowNoVotesAlert }) {
  const [isProxyEnabled, setIsProxyEnabled] = useState(false);
  const [proxyLoading, setProxyLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    fetchProxyStatus()
      .then(d => setIsProxyEnabled(d.enabled ?? false))
      .catch(() => {})
      .finally(() => setProxyLoading(false));
  }, []);

  const handleToggle = async () => {
    if (!isProxyEnabled && (stats.votesCast ?? 0) < 1) {
      onShowNoVotesAlert();
      return;
    }
    setToggling(true);
    try {
      const data = await toggleProxyVoting(!isProxyEnabled);
      setIsProxyEnabled(data.enabled ?? !isProxyEnabled);
    } catch (err) {
      alert(err.message || 'Failed to update proxy setting.');
    } finally {
      setToggling(false);
    }
  };

  const canEnable = (stats.votesCast ?? 0) >= 1;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 relative overflow-hidden">
      {isProxyEnabled && (
        <div className="absolute inset-0 pointer-events-none" 
             style={{ background: 'radial-gradient(ellipse at top right, rgba(16,185,129,0.05) 0%, transparent 65%)' }} 
        />
      )}

      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-300
            ${isProxyEnabled ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-slate-800 border border-slate-700'}`}>
            <Bot className={`w-5 h-5 ${isProxyEnabled ? 'text-emerald-400' : 'text-slate-500'}`} />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-white">Proxy Voting</h3>
            {!canEnable && (
              <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-500/80 flex items-center gap-1 mt-0.5">
                <ShieldAlert className="w-3 h-3" /> Requires 1 vote
              </span>
            )}
          </div>
        </div>
        {!proxyLoading && (
          <span className={`text-xs font-semibold px-3 py-1 rounded-full border transition-all
            ${isProxyEnabled 
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
              : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
            {isProxyEnabled ? '● Active' : '○ Off'}
          </span>
        )}
      </div>

      <p className="text-slate-400 text-sm mb-6 leading-relaxed">
        Let the AI agent vote once per day on collections that match your taste.
      </p>

      <div className="rounded-2xl p-4 mb-6 bg-slate-950/50 border border-slate-800">
        <div className="flex gap-3">
          <Sparkles className="w-5 h-5 text-slate-500 mt-0.5 shrink-0" />
          <p className="text-xs text-slate-400 leading-relaxed">
            The agent analyses your vote history and automatically casts one vote per day on a collection you haven't seen yet.
            {!canEnable && <span className="block mt-2 text-amber-500">Cast at least 1 manual vote to enable.</span>}
          </p>
        </div>
      </div>

      <button
        onClick={handleToggle}
        disabled={toggling || proxyLoading}
        className="w-full py-3.5 text-sm font-semibold rounded-2xl transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        style={
          isProxyEnabled
            ? { background: 'linear-gradient(135deg, #ec4899, #ef4444)', color: '#fff' }
            : canEnable
            ? { background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff' }
            : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#64748b' }
        }
      >
        {toggling || proxyLoading ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            {proxyLoading ? 'Loading…' : isProxyEnabled ? 'Disabling…' : 'Enabling…'}
          </span>
        ) : isProxyEnabled ? (
          'Disable Proxy Agent'
        ) : canEnable ? (
          'Enable Proxy Agent'
        ) : (
          <span className="flex items-center justify-center gap-2">
            <ShieldAlert className="w-4 h-4" /> Vote First to Unlock
          </span>
        )}
      </button>

      {isProxyEnabled && (
        <p className="text-xs text-center text-emerald-500/70 mt-4">✓ Agent is active — casting 1 vote per day</p>
      )}
    </div>
  );
}

// ── Subscription Card ─────────────────────────────────────────────────────────
function SubscriptionCard({ subscription }) {
  const isActive = subscription.subscribed;
  const left = daysLeft(subscription.ends_at);
  const urgencyColor = left === null ? 'text-slate-400' : left <= 5 ? 'text-red-400' : left <= 10 ? 'text-amber-400' : 'text-emerald-400';

  let totalDays = 30, usedDays = 0, progressPct = 0, isYearly = false;
  if (isActive && subscription.since && subscription.ends_at) {
    const periodMs = new Date(subscription.ends_at) - new Date(subscription.since);
    const usedMs = Date.now() - new Date(subscription.since);
    totalDays = Math.round(periodMs / 86_400_000);
    usedDays = Math.min(totalDays, Math.max(0, Math.round(usedMs / 86_400_000)));
    progressPct = Math.min(100, (usedMs / periodMs) * 100);
    isYearly = totalDays > 200;
  }

  const handleCancel = async () => {
    if (!confirm('Cancel subscription at the end of the billing period?')) return;
    try {
      await cancelSubscription();
      alert('Subscription cancelled.');
      window.location.reload();
    } catch (err) {
      alert(err.message || 'Failed to cancel');
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8">
      <h3 className="text-xl font-semibold mb-6">Subscription Details</h3>

      <div className="flex items-center gap-4 mb-6">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isActive ? 'bg-gradient-to-br from-pink-500 to-red-500' : 'bg-slate-700'}`}>
          <Crown className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Current Plan</p>
          <p className="text-xl font-bold mt-0.5">
            {isActive ? (subscription.plan || 'Premium') : 'Free'}
            {isActive && <span className="text-sm font-medium text-pink-400 ml-2">({isYearly ? 'Yearly' : 'Monthly'})</span>}
          </p>
        </div>
        {isActive && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
            <ShieldCheck className="w-3.5 h-3.5" /> Active
          </span>
        )}
      </div>

      <div className="space-y-3 mb-6">
        <div className="flex items-center justify-between bg-slate-950 rounded-2xl px-5 py-4 border border-slate-800">
          <div className="flex items-center gap-2.5 text-slate-400 text-sm"><CalendarCheck className="w-4 h-4 text-pink-400" /> Started</div>
          <span className="text-sm font-medium text-slate-200">{isActive ? fmtDate(subscription.since) : '—'}</span>
        </div>
        <div className="flex items-center justify-between bg-slate-950 rounded-2xl px-5 py-4 border border-slate-800">
          <div className="flex items-center gap-2.5 text-slate-400 text-sm"><CalendarX className="w-4 h-4 text-red-400" /> Renews / Ends</div>
          <span className="text-sm font-medium text-slate-200">{isActive ? fmtDate(subscription.ends_at) : '—'}</span>
        </div>
        {isActive && left !== null && (
          <div className="flex items-center justify-between bg-slate-950 rounded-2xl px-5 py-4 border border-slate-800">
            <span className="text-slate-400 text-sm">Days remaining</span>
            <span className={`text-sm font-bold ${urgencyColor}`}>
              {left === 0 ? 'Expires today' : `${left} day${left !== 1 ? 's' : ''}`}
            </span>
          </div>
        )}
      </div>

      {isActive && (
        <div className="mb-6">
          <div className="flex justify-between text-xs text-slate-500 mb-2">
            <span>Billing cycle ({isYearly ? 'Yearly' : 'Monthly'})</span>
            <span>{usedDays} / {totalDays} days</span>
          </div>
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-pink-500 to-red-500 transition-all duration-700"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-6">
        {isActive ? (
          <button
            onClick={handleCancel}
            className="w-full py-3.5 bg-red-600/10 hover:bg-red-600/20 border border-red-500/30 text-red-400 rounded-2xl text-sm font-semibold transition-all"
          >
            Cancel Subscription
          </button>
        ) : (
          <Link
            to="/pricing"
            className="block text-center py-3.5 rounded-2xl text-sm font-semibold bg-gradient-to-r from-pink-500 to-red-500 hover:from-pink-600 hover:to-red-600 text-white"
          >
            ✦ Upgrade to Premium
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Collection Modal ──────────────────────────────────────────────────────────
function CollectionModal({ models, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl max-h-[92vh] bg-slate-950 border border-cyan-500/30 rounded-3xl overflow-hidden shadow-2xl">
        <div className="sticky top-0 z-10 bg-slate-950 border-b border-slate-800 px-6 py-5 flex items-center justify-between">
          <h3 className="text-2xl font-bold text-white tracking-tight">Your Collection</h3>
          <button onClick={onClose} className="text-3xl text-slate-400 hover:text-white transition-colors">✕</button>
        </div>

        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(92vh - 80px)' }}>
          {models.length === 0 ? (
            <EmptyActivity />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {models.map((model, i) => (
                <div
                  key={model.item_id || i}
                  className="bg-slate-900 border border-slate-700 rounded-3xl overflow-hidden group hover:border-cyan-400/40 transition-all"
                >
                  <div className="aspect-square relative overflow-hidden">
                    <img
                      src={model.image_url || 'https://via.placeholder.com/400x400/1e2937/00f8ff?text=No+Image'}
                      alt={model.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                  <div className="p-4">
                    <p className="font-semibold text-white line-clamp-2 text-base leading-tight">
                      {model.title}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Profile Header ────────────────────────────────────────────────────────────
function ProfileHeader({ user, stats, avatarId, onEditAvatar }) {
  const avatar = avatarId ? getAvatarById(avatarId) : null;
  const initials = user
    ? `${(user.firstName || user.first_name || 'G')[0]}${(user.lastName || user.last_name || 'A')[0]}`.toUpperCase()
    : 'GIA';

  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
      <div className="flex items-center gap-5">
        <div className="relative group" style={{ flexShrink: 0 }}>
          <div
            className="w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden border-2 border-pink-500/40 shadow-xl"
            style={{
              background: avatar ? 'transparent' : 'linear-gradient(135deg, #ec4899, #f43f5e)',
            }}
          >
            {avatar ? (
              <img src={avatar.svg} alt={avatar.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-white">
                {initials}
              </div>
            )}
          </div>

          <button
            onClick={onEditAvatar}
            className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-br from-pink-500 to-rose-500 border-2 border-slate-950 hover:scale-110 transition-all"
            title="Change avatar"
          >
            <Camera className="w-4 h-4 text-white" />
          </button>
        </div>

        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white leading-none">
            Welcome back,{' '}
            <span className="bg-gradient-to-r from-pink-300 to-rose-400 bg-clip-text text-transparent">
              {user?.firstName || user?.first_name || 'Fashionista'}
            </span>
          </h1>
          <p className="text-slate-400 mt-2 text-sm md:text-base flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Member since {fmtMemberSince(stats.member_since)}</span>
            <span className="hidden md:inline text-slate-700">·</span>
            <span>Your personal GIA Fashion hub</span>
            {/* {avatar && (
              <>
                <span className="hidden md:inline text-slate-700">·</span>
                <span className="text-pink-400 text-xs font-medium">{avatar.name}</span>
              </>
            )} */}
          </p>

          <button
            onClick={onEditAvatar}
            className="mt-3 text-xs text-slate-500 hover:text-pink-400 transition-colors flex items-center gap-1.5"
          >
            <Camera className="w-3.5 h-3.5" /> Change avatar
          </button>
        </div>
      </div>
    </div>
  );
}

{/* // ── Main Dashboard Component ────────────────────────────────────────────────── */}
export default function UserDashboard() {
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState({ subscribed: false, plan: null, since: null, ends_at: null });
  const [stats, setStats] = useState({
    activity: 0,
    votesCast: 0,
    blogComments: 0,
    articlesLiked: 0,
    member_since: '—',
    modelsInCollection: 0,
  });
  const [feed, setFeed] = useState([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showNoVotesAlert, setShowNoVotesAlert] = useState(false);
  const [collectionModels, setCollectionModels] = useState([]);
  const [showCollectionModal, setShowCollectionModal] = useState(false);

  // Avatar
  const [avatarId, setAvatarId] = useState(() => localStorage.getItem('gia_avatar_id') ?? null);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  const handleAvatarSelect = (avatar) => {
    setAvatarId(avatar.id);
    localStorage.setItem('gia_avatar_id', avatar.id);
  };

  // Load user from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('gia_user');
    if (stored) {
      try { setUser(JSON.parse(stored)); } catch (e) {}
    }
  }, []);

  const openCollectionModal = async () => {
    try {
      const data = await fetchMyCollection();
      setCollectionModels(data.models ?? []);
    } catch (err) {
      setCollectionModels([]);
    }
    setShowCollectionModal(true);
  };

  const loadData = async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const [statsData, activityData, subData] = await Promise.all([
        fetchMyStats(),
        fetchMyActivity(),
        fetchMySubscription().catch(() => ({ subscribed: false, plan: null, since: null, ends_at: null })),
      ]);

      setStats({
        activity: statsData.activity ?? 0,
        votesCast: statsData.votes_cast ?? 0,
        blogComments: statsData.comments_made ?? 0,
        articlesLiked: statsData.articles_liked ?? 0,
        member_since: statsData.member_since ?? '—',
        modelsInCollection: statsData.models_in_collection ?? 0,
      });

      setFeed(activityData.feed ?? []);
      setSubscription(subData);
      setFeedError(null);
    } catch (err) {
      setFeedError('Could not load activity. Please try again.');
    } finally {
      setFeedLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const statCards = [
    { label: 'Activity', value: stats.activity, Icon: Activity, color: 'emerald' },
    { label: 'Votes Cast', value: stats.votesCast, Icon: Vote, color: 'amber' },
    { label: 'Article Comments', value: stats.blogComments, Icon: MessageCircle, color: 'blue' },
    { label: 'Articles Liked', value: stats.articlesLiked, Icon: Heart, color: 'pink' },
    { label: 'Models in Collection', value: stats.modelsInCollection ?? 0, Icon: Sparkles, color: 'violet', onClick: openCollectionModal },
  ];

  const colorMap = {
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
    amber:   { bg: 'bg-amber-500/10',   text: 'text-amber-400'   },
    blue:    { bg: 'bg-blue-500/10',    text: 'text-blue-400'    },
    pink:    { bg: 'bg-pink-500/10',    text: 'text-pink-400'    },
    violet:  { bg: 'bg-violet-500/10',  text: 'text-violet-400'  },
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white pt-26 pb-16 font-mono">
      <style>{`
        @keyframes fadeIn  { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes alertIn { from { opacity: 0; transform: scale(0.92) translateY(12px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .animate-fadeIn  { animation: fadeIn  0.35s ease both; }
        .animate-alertIn { animation: alertIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both; }
      `}</style>

      {/* Modals */}
      {showNoVotesAlert && <NoVotesAlert onClose={() => setShowNoVotesAlert(false)} />}
      {showCollectionModal && <CollectionModal models={collectionModels} onClose={() => setShowCollectionModal(false)} />}
      {showAvatarPicker && (
        <AvatarPicker
          currentAvatarId={avatarId}
          onSelect={handleAvatarSelect}
          onClose={() => setShowAvatarPicker(false)}
        />
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Profile Header */}
        <ProfileHeader
          user={user}
          stats={stats}
          avatarId={avatarId}
          onEditAvatar={() => setShowAvatarPicker(true)}
        />

        {/* Stats Grid - Fully Responsive */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-5 mb-12">
          {statCards.map(({ label, value, Icon, color, onClick }, i) => {
            const c = colorMap[color];
            return (
              <div
                key={i}
                onClick={onClick}
                className={`bg-slate-900/70 border border-slate-800 rounded-3xl p-5 md:p-6 hover:border-slate-700 transition-all animate-fadeIn ${onClick ? 'cursor-pointer active:scale-95' : ''}`}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className={`w-10 h-10 rounded-2xl ${c.bg} flex items-center justify-center mb-4`}>
                  <Icon className={`w-5 h-5 ${c.text}`} />
                </div>
                <p className="text-3xl md:text-4xl font-bold mb-1">{value}</p>
                <p className="text-slate-400 text-sm md:text-base">{label}</p>
              </div>
            );
          })}
        </div>

        {/* Activity + Subscription */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Activity Feed */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold">Your Activity</h3>
              <button
                onClick={() => loadData(true)}
                disabled={refreshing}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-white transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {feed.length > 0 && (
              <div className="flex gap-2 mb-5 flex-wrap">
                {['vote', 'comment', 'like'].map(type => {
                  const meta = TYPE_META[type];
                  const count = feed.filter(f => f.type === type).length;
                  if (!count) return null;
                  return (
                    <span
                      key={type}
                      className={`text-[10px] font-semibold uppercase tracking-widest px-2.5 py-1 rounded-full ${meta.bg} ${meta.text}`}
                    >
                      {meta.badge} · {count}
                    </span>
                  );
                })}
              </div>
            )}

            {feedLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-7 h-7 text-slate-500 animate-spin" />
              </div>
            ) : feedError ? (
              <div className="flex flex-col items-center py-12 text-center gap-3">
                <p className="text-red-400">{feedError}</p>
                <button onClick={() => loadData()} className="text-xs underline text-slate-400 hover:text-white">
                  Try again
                </button>
              </div>
            ) : feed.length === 0 ? (
              <EmptyActivity />
            ) : (
              <div className="overflow-y-auto pr-2" style={{ maxHeight: '380px', scrollbarWidth: 'thin', scrollbarColor: '#334155 transparent' }}>
                {feed.map((item, i) => (
                  <ActivityItem key={`${item.type}-${i}`} item={item} index={i} />
                ))}
              </div>
            )}
          </div>

          {/* Subscription Card */}
          <SubscriptionCard subscription={subscription} />
        </div>

        {/* Proxy Voting Card */}
        <ProxyVotingCard stats={stats} onShowNoVotesAlert={() => setShowNoVotesAlert(true)} />
      </div>
    </div>
  );
}


















{/* // 'use client';

// import { useState, useEffect } from 'react';
// import { Link } from 'react-router-dom';
// import {
//   Heart, MessageCircle, Crown, LogOut,
//   Activity, Vote, Loader2, RefreshCw,
//   ChevronRight, Zap, Bot, ShieldAlert, X, Sparkles,
//   CalendarCheck, CalendarX, ShieldCheck,
// } from 'lucide-react';
// import { fetchMyStats, fetchMyActivity, fetchProxyStatus, toggleProxyVoting, fetchMySubscription, cancelSubscription, fetchMyCollection } from '../Api/api';

// // ── tiny relative-time helper ──────────────────────────────────────────────────
// function relTime(isoStr) {
//   if (!isoStr) return '';
//   const diff = Date.now() - new Date(isoStr).getTime();
//   const mins  = Math.floor(diff / 60_000);
//   const hours = Math.floor(diff / 3_600_000);
//   const days  = Math.floor(diff / 86_400_000);
//   if (mins  <  1) return 'Just now';
//   if (mins  < 60) return `${mins}m ago`;
//   if (hours < 24) return `${hours}h ago`;
//   if (days  <  7) return `${days}d ago`;
//   return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
// }

// function fmtDate(isoStr) {
//   if (!isoStr) return '—';
//   return new Date(isoStr).toLocaleDateString('en-US', {
//     day: 'numeric', month: 'long', year: 'numeric',
//   });
// }

// function daysLeft(endsAtIso) {
//   if (!endsAtIso) return null;
//   return Math.max(0, Math.ceil((new Date(endsAtIso).getTime() - Date.now()) / 86_400_000));
// }

// // ── icon + color per activity type ────────────────────────────────────────────
// const TYPE_META = {
//   vote:    { Icon: Vote,          ring: 'border-amber-500/40',   bg: 'bg-amber-500/10',   text: 'text-amber-400',   badge: 'Voted'    },
//   comment: { Icon: MessageCircle, ring: 'border-blue-500/40',    bg: 'bg-blue-500/10',    text: 'text-blue-400',    badge: 'Comment'  },
//   like:    { Icon: Heart,         ring: 'border-pink-500/40',    bg: 'bg-pink-500/10',    text: 'text-pink-400',    badge: 'Liked'    },
// };

// function ActivityItem({ item, index }) {
//   const meta = TYPE_META[item.type] ?? TYPE_META.vote;
//   const { Icon } = meta;
//   return (
//     <div
//       className="group flex items-start gap-4 py-4 border-b border-slate-800/60 last:border-0 animate-fadeIn"
//       style={{ animationDelay: `${index * 60}ms`, animationFillMode: 'both' }}
//     >
//       <div className={`shrink-0 w-10 h-10 rounded-2xl border ${meta.ring} ${meta.bg} flex items-center justify-center`}>
//         <Icon className={`w-4 h-4 ${meta.text}`} />
//       </div>
//       <div className="flex-1 min-w-0">
//         <p className="text-sm text-slate-200 leading-snug truncate">{item.label}</p>
//         {item.sublabel && (
//           <p className="text-xs text-slate-500 mt-0.5 italic truncate">{item.sublabel}</p>
//         )}
//         <div className="flex items-center gap-2 mt-1.5">
//           <span className={`text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full ${meta.bg} ${meta.text}`}>
//             {meta.badge}
//           </span>
//           <span className="text-[11px] text-slate-500">{item.time || relTime(item.ts)}</span>
//         </div>
//       </div>
//       {item.article_id && (
//         <Link
//           to={`/blog/${item.article_id}`}
//           className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-white mt-1"
//           title="View article"
//         >
//           <ChevronRight className="w-4 h-4" />
//         </Link>
//       )}
//     </div>
//   );
// }

// function EmptyActivity() {
//   return (
//     <div className="flex flex-col items-center justify-center py-14 text-center">
//       <div className="w-14 h-14 rounded-3xl bg-slate-800 flex items-center justify-center mb-4">
//         <Zap className="w-6 h-6 text-slate-600" />
//       </div>
//       <p className="text-slate-400 text-sm font-medium">No activity yet</p>
//       <p className="text-slate-600 text-xs mt-1">Vote on products, like articles, or leave a comment to get started.</p>
//     </div>
//   );
// }

// // ── No-votes Alert Modal ──────────────────────────────────────────────────────
// function NoVotesAlert({ onClose }) {
//   return (
//     <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
//       <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
//       <div
//         className="relative w-full max-w-sm animate-alertIn"
//         style={{
//           background: 'linear-gradient(145deg, rgba(15,23,42,0.98) 0%, rgba(2,6,23,0.98) 100%)',
//           border: '1px solid rgba(239,68,68,0.35)',
//           borderRadius: '24px',
//           boxShadow: '0 0 60px rgba(239,68,68,0.12), 0 24px 80px rgba(0,0,0,0.7)',
//           overflow: 'hidden',
//         }}
//       >
//         <div style={{ height: '2px', background: 'linear-gradient(90deg, transparent, #ef4444, transparent)' }} />
//         <div className="p-8">
//           <div className="flex justify-center mb-5">
//             <div style={{
//               width: 72, height: 72, borderRadius: 20,
//               background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
//               display: 'flex', alignItems: 'center', justifyContent: 'center',
//             }}>
//               <ShieldAlert className="w-8 h-8 text-red-400" />
//             </div>
//           </div>
//           <h3 className="text-center text-xl font-bold text-white mb-2 tracking-tight">Cast a Vote First</h3>
//           <p className="text-center text-slate-400 text-sm leading-relaxed mb-6">
//             The Proxy Voting Agent needs to learn your taste before it can vote on your behalf.
//             <span className="block mt-2 text-slate-300 font-medium">
//               Vote on at least one product to unlock this feature.
//             </span>
//           </p>
//           <div className="border-t border-slate-800 mb-5" />
//           <div className="space-y-3 mb-7">
//             {[
//               { num: '01', text: 'Browse the Collections page' },
//               { num: '02', text: 'Vote on a product you love' },
//               { num: '03', text: 'Return here to enable the agent' },
//             ].map(s => (
//               <div key={s.num} className="flex items-center gap-3">
//                 <span style={{
//                   width: 28, height: 28, borderRadius: 8, flexShrink: 0,
//                   background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
//                   display: 'flex', alignItems: 'center', justifyContent: 'center',
//                   fontSize: 10, fontWeight: 700, color: '#f87171', letterSpacing: 1,
//                 }}>
//                   {s.num}
//                 </span>
//                 <p className="text-sm text-slate-300">{s.text}</p>
//               </div>
//             ))}
//           </div>
//           <div className="flex gap-3">
//             <button
//               onClick={onClose}
//               className="flex-1 py-3 rounded-2xl text-sm font-medium text-slate-400 transition-all"
//               style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
//             >
//               Dismiss
//             </button>
//             <Link
//               to="/collections"
//               onClick={onClose}
//               className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white text-center flex items-center justify-center gap-2 transition-all hover:brightness-110"
//               style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}
//             >
//               <Vote className="w-4 h-4" />
//               Go Vote
//             </Link>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }

// // ── Proxy Card ────────────────────────────────────────────────────────────────
// function ProxyVotingCard({ stats, onShowNoVotesAlert }) {
//   const [isProxyEnabled, setIsProxyEnabled] = useState(false);
//   const [proxyLoading,   setProxyLoading]   = useState(true);
//   const [toggling,       setToggling]       = useState(false);

//   useEffect(() => {
//     const load = async () => {
//       try {
//         const data = await fetchProxyStatus();
//         setIsProxyEnabled(data.enabled ?? false);
//       } catch {
//         setIsProxyEnabled(false);
//       } finally {
//         setProxyLoading(false);
//       }
//     };
//     load();
//   }, []);

//   const handleToggle = async () => {
//     if (!isProxyEnabled && (stats.votesCast ?? 0) < 1) {
//       onShowNoVotesAlert();
//       return;
//     }
//     setToggling(true);
//     try {
//       const data = await toggleProxyVoting(!isProxyEnabled);
//       setIsProxyEnabled(data.enabled ?? !isProxyEnabled);
//     } catch (err) {
//       console.error('[PROXY] Toggle failed:', err);
//       alert(err.message || 'Failed to update proxy setting. Please try again.');
//     } finally {
//       setToggling(false);
//     }
//   };

//   const canEnable = (stats.votesCast ?? 0) >= 1;

//   return (
//     <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 relative overflow-hidden">
//       {isProxyEnabled && (
//         <div
//           className="absolute inset-0 pointer-events-none"
//           style={{ background: 'radial-gradient(ellipse at top right, rgba(16,185,129,0.05) 0%, transparent 65%)' }}
//         />
//       )}
//       <div className="flex items-start justify-between mb-2">
//         <div className="flex items-center gap-3">
//           <div style={{
//             width: 40, height: 40, borderRadius: 12,
//             background: isProxyEnabled ? 'rgba(16,185,129,0.1)' : 'rgba(100,116,139,0.1)',
//             border: `1px solid ${isProxyEnabled ? 'rgba(16,185,129,0.3)' : 'rgba(100,116,139,0.2)'}`,
//             display: 'flex', alignItems: 'center', justifyContent: 'center',
//             transition: 'all 0.4s ease',
//           }}>
//             <Bot className={`w-5 h-5 transition-colors duration-300 ${isProxyEnabled ? 'text-emerald-400' : 'text-slate-500'}`} />
//           </div>
//           <div>
//             <h3 className="text-xl font-semibold text-white">Proxy Voting</h3>
//             {!canEnable && (
//               <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-500/80 flex items-center gap-1 mt-0.5">
//                 <ShieldAlert className="w-3 h-3" /> Requires 1 vote
//               </span>
//             )}
//           </div>
//         </div>
//         {!proxyLoading && (
//           <span className={`text-xs font-semibold px-3 py-1 rounded-full transition-all duration-300 ${
//             isProxyEnabled
//               ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
//               : 'bg-slate-800 text-slate-500 border border-slate-700'
//           }`}>
//             {isProxyEnabled ? '● Active' : '○ Off'}
//           </span>
//         )}
//       </div>
//       <p className="text-slate-400 text-sm mb-6 leading-relaxed">
//         Let the AI agent vote once per day on collections that match your taste.
//       </p>
//       <div className="rounded-2xl p-4 mb-5 flex items-start gap-3"
//         style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
//       >
//         <Sparkles className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
//         <div className="space-y-1">
//           <p className="text-xs text-slate-400">
//             <span className="text-slate-200 font-medium">How it works:</span> The agent analyses your vote history and automatically casts one vote per day on a collection you haven't seen yet.
//           </p>
//           {!canEnable && (
//             <p className="text-xs text-amber-500/80">
//               You need to cast at least <span className="font-semibold">1 manual vote</span> before enabling.
//             </p>
//           )}
//         </div>
//       </div>
//       <button
//         onClick={handleToggle}
//         disabled={toggling || proxyLoading}
//         className="w-full py-3.5 text-center font-semibold rounded-2xl transition-all text-sm relative overflow-hidden disabled:opacity-60 disabled:cursor-not-allowed"
//         style={
//           isProxyEnabled
//             ? { background: 'linear-gradient(135deg, #ec4899, #ef4444)', color: '#fff' }
//             : canEnable
//             ? { background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff' }
//             : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b' }
//         }
//       >
//         {toggling || proxyLoading ? (
//           <span className="flex items-center justify-center gap-2">
//             <Loader2 className="w-4 h-4 animate-spin" />
//             {proxyLoading ? 'Loading…' : isProxyEnabled ? 'Disabling…' : 'Enabling…'}
//           </span>
//         ) : isProxyEnabled ? (
//           'Disable Proxy Agent'
//         ) : canEnable ? (
//           'Enable Proxy Agent'
//         ) : (
//           <span className="flex items-center justify-center gap-2">
//             <ShieldAlert className="w-4 h-4" />
//             Vote First to Unlock
//           </span>
//         )}
//       </button>
//       {isProxyEnabled && (
//         <p className="text-xs text-center text-emerald-500/70 mt-3 animate-fadeIn">
//           ✓ Agent is active — casting 1 vote per day on your behalf
//         </p>
//       )}
//     </div>
//   );
// }

// // ── Subscription Card (from old dashboard) ────────────────────────────────────
// function SubscriptionCard({ subscription }) {
//   const isActive = subscription.subscribed;
//   const left = daysLeft(subscription.ends_at);

//   const urgencyColor =
//     left === null  ? 'text-slate-400' :
//     left <= 5      ? 'text-red-400'   :
//     left <= 10     ? 'text-amber-400' :
//                      'text-emerald-400';

//   let totalDays = 30;
//   let usedDays = 0;
//   let progressPct = 0;
//   let isYearly = false;
//   let billingLabel = 'Monthly';

//   if (isActive && subscription.since && subscription.ends_at) {
//     const periodMs = new Date(subscription.ends_at) - new Date(subscription.since);
//     const usedMs   = Date.now() - new Date(subscription.since);
//     totalDays  = Math.round(periodMs / 86_400_000);
//     usedDays   = Math.min(totalDays, Math.max(0, Math.round(usedMs / 86_400_000)));
//     progressPct = Math.min(100, (usedMs / periodMs) * 100);
//     isYearly   = totalDays > 200;
//     billingLabel = isYearly ? 'Yearly' : 'Monthly';
//   }

//   const handleCancel = async () => {
//     if (!confirm('Cancel subscription at the end of the billing period? You will keep access until then.')) return;
//     try {
//       await cancelSubscription();
//       alert('Subscription cancelled successfully.');
//       window.location.reload();
//     } catch (err) {
//       alert(err.message || 'Failed to cancel');
//     }
//   };

//   return (
//     <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
//       <h3 className="text-xl font-semibold mb-6">Subscription Details</h3>

//       {/* Plan badge row */}
//       <div className="flex items-center gap-3 mb-6">
//         <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
//           isActive ? 'bg-gradient-to-br from-pink-500 to-red-500' : 'bg-slate-700'
//         }`}>
//           <Crown className="w-6 h-6 text-white" />
//         </div>
//         <div>
//           <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Current Plan</p>
//           <p className="text-xl font-bold mt-0.5 flex items-center gap-2">
//             {isActive ? (subscription.plan || 'Premium') : 'Free'}
//             {isActive && (
//               <span className="text-sm font-medium text-pink-400">({billingLabel})</span>
//             )}
//           </p>
//         </div>
//         {isActive && (
//           <span className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-full">
//             <ShieldCheck className="w-3.5 h-3.5" /> Active
//           </span>
//         )}
//       </div>

//       {/* Date rows */}
//       <div className="space-y-3 mb-5">
//         <div className="flex items-center justify-between bg-slate-950 rounded-2xl px-5 py-3.5 border border-slate-800">
//           <div className="flex items-center gap-2.5 text-slate-400 text-sm">
//             <CalendarCheck className="w-4 h-4 text-pink-400" />
//             Started
//           </div>
//           <span className="text-sm font-medium text-slate-200">
//             {isActive ? fmtDate(subscription.since) : '—'}
//           </span>
//         </div>

//         <div className="flex items-center justify-between bg-slate-950 rounded-2xl px-5 py-3.5 border border-slate-800">
//           <div className="flex items-center gap-2.5 text-slate-400 text-sm">
//             <CalendarX className="w-4 h-4 text-red-400" />
//             Renews / Ends
//           </div>
//           <span className="text-sm font-medium text-slate-200">
//             {isActive ? fmtDate(subscription.ends_at) : '—'}
//           </span>
//         </div>

//         {isActive && left !== null && (
//           <div className="flex items-center justify-between bg-slate-950 rounded-2xl px-5 py-3.5 border border-slate-800">
//             <span className="text-slate-400 text-sm">Days remaining</span>
//             <span className={`text-sm font-bold ${urgencyColor}`}>
//               {left === 0 ? 'Expires today' : `${left} day${left !== 1 ? 's' : ''}`}
//             </span>
//           </div>
//         )}
//       </div>

//       {/* Progress bar */}
//       {isActive && (
//         <div className="mb-6">
//           <div className="flex justify-between text-xs text-slate-500 mb-1.5">
//             <span>Billing cycle ({billingLabel})</span>
//             <span>{usedDays} / {totalDays} days used</span>
//           </div>
//           <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
//             <div
//               className="h-full rounded-full bg-gradient-to-r from-pink-500 to-red-500 transition-all duration-700"
//               style={{ width: `${progressPct}%` }}
//             />
//           </div>
//         </div>
//       )}

//       {/* CTA */}
//       <div className="mt-8 space-y-3">
//         {isActive ? (
//           <button
//             onClick={handleCancel}
//             className="w-full py-3 bg-red-600/10 hover:bg-red-600/20 border border-red-500/30 text-red-400 rounded-2xl text-sm font-semibold transition-all"
//           >
//             Cancel Subscription
//           </button>
//         ) : (
//           <Link
//             to="/pricing"
//             className="block text-center py-3 rounded-2xl text-sm font-semibold bg-gradient-to-r from-pink-500 to-red-500 hover:from-pink-600 hover:to-red-600 text-white"
//           >
//             ✦ Upgrade to Premium
//           </Link>
//         )}
//       </div>
//     </div>
//   );
// }



// function CollectionModal({ models, onClose }) {
//   return (
//     <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
//       <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
//       <div
//         className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden animate-alertIn"
//         style={{
//           background: 'linear-gradient(145deg, rgba(15,23,42,0.98) 0%, rgba(2,6,23,0.98) 100%)',
//           border: '1px solid rgba(0,248,255,0.35)',
//           borderRadius: '24px',
//           boxShadow: '0 0 60px rgba(0,248,255,0.12), 0 24px 80px rgba(0,0,0,0.7)',
//         }}
//       >
//         <div style={{ height: '2px', background: 'linear-gradient(90deg, transparent, #00f8ff, transparent)' }} />
//         <div className="p-8">
//           <div className="flex justify-between items-center mb-6">
//             <h3 className="text-2xl font-bold text-white tracking-tight">Your Collection</h3>
//             <button
//               onClick={onClose}
//               className="text-slate-400 hover:text-white text-2xl leading-none"
//             >
//               ✕
//             </button>
//           </div>

//           {models.length === 0 ? (
//             <EmptyActivity />   // reuses the nice empty state you already have
//           ) : (
//             <div className="grid grid-cols-2 md:grid-cols-3 gap-6 overflow-y-auto max-h-[60vh] pr-2">
//               {models.map((model, i) => (
//                 <div
//                   key={model.item_id || i}
//                   className="bg-slate-900 border border-slate-700 rounded-3xl overflow-hidden group hover:border-[#00f8ff]/40 transition-all"
//                 >
//                   <div className="aspect-square relative">
//                     <img
//                       src={model.image_url || 'https://via.placeholder.com/400x400/1e2937/00f8ff?text=No+Image'}
//                       alt={model.title}
//                       className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
//                     />
//                   </div>
//                   <div className="p-4">
//                     <p className="font-semibold text-white line-clamp-2 text-base">{model.title}</p>
//                   </div>
//                 </div>
//               ))}
//             </div>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// }



// // ── main component ─────────────────────────────────────────────────────────────
// export default function UserDashboard() {
//   const [user,             setUser]             = useState(null);
//   const [subscription,     setSubscription]     = useState({ subscribed: false, plan: null, since: null, ends_at: null });
//   const [stats,            setStats]            = useState({ activity: 0, votesCast: 0, blogComments: 0, articlesLiked: 0, member_since: '—' });
//   const [feed,             setFeed]             = useState([]);
//   const [feedLoading,      setFeedLoading]      = useState(true);
//   const [feedError,        setFeedError]        = useState(null);
//   const [refreshing,       setRefreshing]       = useState(false);
//   const [showNoVotesAlert, setShowNoVotesAlert] = useState(false);

//   const [collectionModels, setCollectionModels] = useState([]);
//   const [showCollectionModal, setShowCollectionModal] = useState(false);

//   const openCollectionModal = async () => {
//     try {
//       const data = await fetchMyCollection();
//       setCollectionModels(data.models ?? []);
//     } catch (err) {
//       console.error(err);
//       setCollectionModels([]);
//     }
//     setShowCollectionModal(true);
//   };

//   useEffect(() => {
//     const stored = localStorage.getItem('gia_user');
//     if (stored) {
//       try { setUser(JSON.parse(stored)); } catch {}
//     }
//   }, []);

//   const loadData = async (showRefreshing = false) => {
//     if (showRefreshing) setRefreshing(true);
//     try {
//       const [statsData, activityData, subData] = await Promise.all([
//         fetchMyStats(),
//         fetchMyActivity(),
//         fetchMySubscription().catch(() => ({ subscribed: false, plan: null, since: null, ends_at: null })),
//       ]);
//       setStats({
//         activity:      statsData.activity       ?? 0,
//         votesCast:     statsData.votes_cast     ?? 0,
//         blogComments:  statsData.comments_made  ?? 0,
//         articlesLiked: statsData.articles_liked ?? 0,
//         member_since:  statsData.member_since   ?? '—',
//         modelsInCollection: statsData.models_in_collection ?? 0,   // ← ADD THIS LINE
//       });
//       setFeed(activityData.feed ?? []);
//       setSubscription(subData);
//       setFeedError(null);
//     } catch (err) {
//       console.error('[Dashboard] Failed to load data:', err);
//       setFeedError('Could not load activity. Please try again.');
//     } finally {
//       setFeedLoading(false);
//       setRefreshing(false);
//     }
//   };

//   useEffect(() => { loadData(); }, []);

//   const handleLogout = () => {
//     ['isLoggedIn', 'isAdmin', 'gia_token', 'gia_user'].forEach(k => localStorage.removeItem(k));
//     window.location.href = '/auth';
//   };

//   const statCards = [
//     { label: 'Activity',          value: stats.activity,      Icon: Activity,       color: 'emerald' },
//     { label: 'Votes Cast',        value: stats.votesCast,     Icon: Vote,           color: 'amber'   },
//     { label: 'Article Comments',  value: stats.blogComments,  Icon: MessageCircle,  color: 'blue'    },
//     { label: 'Articles Liked',    value: stats.articlesLiked, Icon: Heart,          color: 'pink'    },
//     {
//       label: 'Models in Collection',
//       value: stats.modelsInCollection ?? 0,
//       Icon: Sparkles,
//       color: 'violet',
//       onClick: openCollectionModal,
//     },
//   ];

//   const colorMap = {
//     emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
//     amber:   { bg: 'bg-amber-500/10',   text: 'text-amber-400'   },
//     blue:    { bg: 'bg-blue-500/10',    text: 'text-blue-400'    },
//     pink:    { bg: 'bg-pink-500/10',    text: 'text-pink-400'    },
//     violet: { bg: 'bg-violet-500/10', text: 'text-violet-400' },
//   };

//   return (
//     <div className="min-h-screen bg-slate-950 text-white pt-20 pb-16 font-mono">
//       <style>{`
//         @keyframes fadeIn {
//           from { opacity: 0; transform: translateY(8px); }
//           to   { opacity: 1; transform: translateY(0);   }
//         }
//         @keyframes alertIn {
//           from { opacity: 0; transform: scale(0.92) translateY(12px); }
//           to   { opacity: 1; transform: scale(1)    translateY(0);    }
//         }
//         .animate-fadeIn  { animation: fadeIn  0.35s ease both; }
//         .animate-alertIn { animation: alertIn 0.3s  cubic-bezier(0.34,1.56,0.64,1) both; }
//       `}</style>

//       {/* No-votes alert */}
//       {showNoVotesAlert && (
//         <NoVotesAlert onClose={() => setShowNoVotesAlert(false)} />
//       )}

//       {showCollectionModal && (
//         <CollectionModal
//           models={collectionModels}
//           onClose={() => setShowCollectionModal(false)}
//         />
//       )}

//       <div className="max-w-7xl mx-auto px-6">

//         {/* Header */}
//         <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10">
//           <div>
//             <h1 className="text-4xl font-bold tracking-tight">
//               Welcome back, {user?.firstName || user?.first_name || 'Fashionista'}
//             </h1>
//             <p className="text-slate-400 mt-2 text-sm">
//               Member since {stats.member_since} · Your personal GIA Fashion hub
//             </p>
//           </div>
//         </div>

//         {/* Stats grid */}
//         <div className="grid grid-cols-2 md:grid-cols-5 gap-5 mb-12">
//         {statCards.map(({ label, value, Icon, color, onClick }, i) => {
//           const c = colorMap[color];
//           return (
//             <div
//               key={i}
//               onClick={onClick}
//               className={`bg-slate-900/70 border border-slate-800 rounded-3xl p-6 hover:border-slate-700 transition-all animate-fadeIn ${onClick ? 'cursor-pointer hover:scale-[1.02]' : ''}`}
//               style={{ animationDelay: `${i * 80}ms`, animationFillMode: 'both' }}
//             >
//               <div className={`w-10 h-10 rounded-2xl ${c.bg} flex items-center justify-center mb-4`}>
//                 <Icon className={`w-5 h-5 ${c.text}`} />
//               </div>
//               <p className="text-4xl font-bold mb-1">{value}</p>
//               <p className="text-slate-400 text-sm">{label}</p>
//             </div>
//           );
//         })}
//       </div>

//         {/* Bottom grid: Activity + Subscription */}
//         <div className="grid md:grid-cols-2 gap-6 items-start mb-6">

//           {/* Activity Feed */}
//           <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
//             <div className="flex items-center justify-between mb-6">
//               <h3 className="text-xl font-semibold">Your Activity</h3>
//               <button
//                 onClick={() => loadData(true)}
//                 disabled={refreshing}
//                 className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-white transition-colors disabled:opacity-40"
//               >
//                 <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
//                 Refresh
//               </button>
//             </div>

//             {feed.length > 0 && (
//               <div className="flex gap-2 mb-5 flex-wrap">
//                 {['vote', 'comment', 'like'].map(type => {
//                   const meta  = TYPE_META[type];
//                   const count = feed.filter(f => f.type === type).length;
//                   if (!count) return null;
//                   return (
//                     <span
//                       key={type}
//                       className={`text-[10px] font-semibold uppercase tracking-widest px-2.5 py-1 rounded-full ${meta.bg} ${meta.text}`}
//                     >
//                       {meta.badge} · {count}
//                     </span>
//                   );
//                 })}
//               </div>
//             )}

//             {feedLoading ? (
//               <div className="flex items-center justify-center py-12">
//                 <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
//               </div>
//             ) : feedError ? (
//               <div className="flex flex-col items-center py-10 text-center gap-3">
//                 <p className="text-sm text-red-400">{feedError}</p>
//                 <button onClick={() => loadData()} className="text-xs text-slate-400 hover:text-white underline">
//                   Try again
//                 </button>
//               </div>
//             ) : feed.length === 0 ? (
//               <EmptyActivity />
//             ) : (
//               <div
//                 className="overflow-y-auto pr-1"
//                 style={{ maxHeight: '340px', scrollbarWidth: 'thin', scrollbarColor: '#334155 transparent' }}
//               >
//                 {feed.map((item, i) => (
//                   <ActivityItem key={`${item.type}-${i}`} item={item} index={i} />
//                 ))}
//                 {feed.length >= 10 && (
//                   <p className="text-center text-xs text-slate-600 pt-3 pb-1">
//                     Showing latest {feed.length} activities
//                   </p>
//                 )}
//               </div>
//             )}
//           </div>

//           {/* Subscription Details */}
//           <SubscriptionCard subscription={subscription} />

//         </div>

//         {/* Proxy Voting Card */}
//         <ProxyVotingCard
//           stats={stats}
//           onShowNoVotesAlert={() => setShowNoVotesAlert(true)}
//         />

//       </div>
//     </div>
//   );
// } */}




