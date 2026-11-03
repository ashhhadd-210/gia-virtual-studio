'use client';
// AvatarPicker.jsx
// Drop this file next to UserDashboard.jsx.
// Usage:
//   import AvatarPicker from './AvatarPicker';
//   <AvatarPicker onClose={() => setShowPicker(false)} onSelect={handleAvatarSelect} currentAvatarId={avatarId} />

import { useState } from 'react';
import { X, Check } from 'lucide-react';
import { FEMALE_AVATARS, MALE_AVATARS } from './avatarData';

const TABS = ['female', 'male'];
const TAB_LABEL = { female: 'Women', male: 'Men' };

export default function AvatarPicker({ onClose, onSelect, currentAvatarId }) {
  const [tab, setTab]         = useState('female');
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(currentAvatarId ?? null);

  const avatars = tab === 'female' ? FEMALE_AVATARS : MALE_AVATARS;

  const handleConfirm = () => {
    if (selected) {
      const avatar = [...FEMALE_AVATARS, ...MALE_AVATARS].find(a => a.id === selected);
      onSelect(avatar);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-2xl animate-alertIn"
        style={{
          background: 'linear-gradient(160deg, rgba(15,23,42,0.99) 0%, rgba(2,6,23,0.99) 100%)',
          border: '1px solid rgba(236,72,153,0.3)',
          borderRadius: '28px',
          boxShadow: '0 0 80px rgba(236,72,153,0.1), 0 32px 100px rgba(0,0,0,0.8)',
          overflow: 'hidden',
        }}
      >
        {/* Top accent line */}
        <div style={{ height: '2px', background: 'linear-gradient(90deg, transparent 0%, #ec4899 40%, #f43f5e 60%, transparent 100%)' }} />

        <div className="p-8">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h3 className="text-2xl font-bold text-white tracking-tight">Choose Your Avatar</h3>
              <p className="text-slate-500 text-sm mt-1">Your profile personality, expressed through fashion</p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-colors"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tab switcher */}
          <div
            className="flex gap-1 mb-6 p-1 rounded-2xl w-fit"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-5 py-2 rounded-xl text-sm font-semibold transition-all duration-200"
                style={tab === t ? {
                  background: 'linear-gradient(135deg, #ec4899, #f43f5e)',
                  color: '#fff',
                  boxShadow: '0 4px 20px rgba(236,72,153,0.35)',
                } : {
                  color: '#64748b',
                }}
              >
                {TAB_LABEL[t]}
              </button>
            ))}
          </div>

          {/* Avatar grid */}
          <div className="grid grid-cols-5 gap-4 mb-7">
            {avatars.map(avatar => {
              const isSelected = selected === avatar.id;
              const isHov      = hovered  === avatar.id;

              return (
                <button
                  key={avatar.id}
                  onClick={() => setSelected(avatar.id)}
                  onMouseEnter={() => setHovered(avatar.id)}
                  onMouseLeave={() => setHovered(null)}
                  className="flex flex-col items-center gap-2.5 group"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  {/* Avatar ring */}
                  <div
                    className="relative transition-all duration-200"
                    style={{
                      padding: '3px',
                      borderRadius: '50%',
                      background: isSelected
                        ? 'linear-gradient(135deg, #ec4899, #f43f5e)'
                        : isHov
                        ? 'linear-gradient(135deg, rgba(236,72,153,0.5), rgba(244,63,94,0.5))'
                        : '1px solid rgba(255,255,255,0.1)',
                      boxShadow: isSelected
                        ? '0 0 24px rgba(236,72,153,0.5)'
                        : isHov
                        ? '0 0 16px rgba(236,72,153,0.2)'
                        : 'none',
                      transform: isHov ? 'scale(1.08)' : 'scale(1)',
                    }}
                  >
                    <div
                      style={{
                        width: 80,
                        height: 80,
                        borderRadius: '50%',
                        overflow: 'hidden',
                        background: 'rgba(0,0,0,0.3)',
                        border: isSelected ? '2px solid rgba(15,23,42,0.8)' : '2px solid transparent',
                      }}
                    >
                      <img
                        src={avatar.svg}
                        alt={avatar.name}
                        width={80}
                        height={80}
                        style={{ display: 'block', width: '100%', height: '100%' }}
                      />
                    </div>

                    {/* Check badge */}
                    {isSelected && (
                      <div
                        className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full flex items-center justify-center animate-fadeIn"
                        style={{ background: 'linear-gradient(135deg, #ec4899, #f43f5e)' }}
                      >
                        <Check className="w-3 h-3 text-white" strokeWidth={3} />
                      </div>
                    )}
                  </div>

                  {/* Name */}
                  <span
                    className="text-xs font-medium transition-colors"
                    style={{ color: isSelected ? '#f472b6' : isHov ? '#94a3b8' : '#475569' }}
                  >
                    {avatar.name}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Footer CTA */}
          <div className="flex gap-3 border-t border-slate-800/60 pt-6">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl text-sm font-medium text-slate-400 transition-all hover:text-slate-200"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selected}
              className="flex-2 px-8 py-3 rounded-2xl text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
              style={{
                flex: 2,
                background: selected
                  ? 'linear-gradient(135deg, #ec4899, #f43f5e)'
                  : 'rgba(255,255,255,0.06)',
                boxShadow: selected ? '0 8px 28px rgba(236,72,153,0.35)' : 'none',
              }}
            >
              {selected ? 'Save Avatar' : 'Select an Avatar'}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes alertIn {
          from { opacity: 0; transform: scale(0.94) translateY(10px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.5); }
          to   { opacity: 1; transform: scale(1); }
        }
        .animate-alertIn { animation: alertIn 0.28s cubic-bezier(0.34,1.56,0.64,1) both; }
        .animate-fadeIn  { animation: fadeIn 0.2s ease both; }
      `}</style>
    </div>
  );
}