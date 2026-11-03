import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye, EyeOff, Loader2, ArrowLeft, RefreshCw, CheckCircle2,
  Mail, Lock, User, Sparkles
} from 'lucide-react';
import { useAuth } from '../Context/AuthContext';

const BASE_URL = import.meta.env.VITE_BACKEND_API_URL;

const STEP = {
  AUTH: 'auth',
  OTP:  'otp',
  DONE: 'done',
};

// ── Static class string ────────────────────────────────────────────────────────
const inputCls = [
  'w-full bg-white/[0.04] border border-white/10 rounded-2xl',
  'pl-11 pr-5 py-4',
  'focus:outline-none focus:border-indigo-500/60 focus:bg-white/[0.07]',
  'focus:shadow-[0_0_0_3px_rgba(99,102,241,0.12)]',
  'text-white placeholder-slate-500',
  'disabled:opacity-40 transition-all duration-200',
  'text-sm font-mono',
].join(' ');

// ── Sub-components defined OUTSIDE Auth so they are stable references ──────────

function PageWrap({ children }) {
  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center px-4 pt-24 pb-12 font-mono relative overflow-hidden selection:bg-indigo-500/30">
      <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] bg-indigo-700/10 blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-[500px] h-[500px] bg-violet-700/10 blur-[140px] pointer-events-none" />
      <div
        className="absolute inset-0 opacity-[0.025] pointer-events-none"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")",
        }}
      />
      {children}
    </div>
  );
}

function Card({ children }) {
  return (
    <div className="relative w-full max-w-md">
      <div className="absolute -inset-px rounded-[2rem] bg-gradient-to-br from-indigo-500/20 via-transparent to-violet-500/20 pointer-events-none" />
      <div className="relative bg-[#080e1f]/90 backdrop-blur-2xl rounded-[2rem] border border-white/[0.08] shadow-2xl shadow-black/60 p-8 md:p-10 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />
        {children}
      </div>
    </div>
  );
}

function InputField({ icon: Icon, children }) {
  return (
    <div className="relative group">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors pointer-events-none z-10">
        <Icon size={16} />
      </div>
      {children}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Auth() {
  const [isLogin, setIsLogin]               = useState(true);
  const [step, setStep]                     = useState(STEP.AUTH);
  const [showPassword, setShowPassword]     = useState(false);
  const [formError, setFormError]           = useState('');
  const [successMsg, setSuccessMsg]         = useState('');
  const [pendingEmail, setPendingEmail]     = useState('');

  const [otp, setOtp]                       = useState(['', '', '', '', '', '']);
  const [resendCooldown, setResendCooldown] = useState(0);
  const otpRefs = useRef([]);

  const [formData, setFormData] = useState({
    firstName: '', lastName: '', email: '', password: '',
  });

  const navigate = useNavigate();
  const { login, loading, error, clearError } = useAuth();
  const [localLoading, setLocalLoading] = useState(false);
  const isLoading = loading || localLoading;

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown(c => c - 1), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  const clearErrors = () => { setFormError(''); clearError(); };

  const handleTabSwitch = (toLogin) => {
    setIsLogin(toLogin);
    setStep(STEP.AUTH);
    clearErrors();
    setFormData({ firstName: '', lastName: '', email: '', password: '' });
    setOtp(['', '', '', '', '', '']);
  };

  const handleInputChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    clearErrors();
  };

  const handleOtpChange = (index, value) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next  = [...otp];
    next[index] = digit;
    setOtp(next);
    clearErrors();
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (otp[index]) {
        const next = [...otp]; next[index] = ''; setOtp(next);
      } else if (index > 0) {
        otpRefs.current[index - 1]?.focus();
      }
    }
    if (e.key === 'ArrowLeft'  && index > 0) otpRefs.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpPaste = (e) => {
    const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!paste) return;
    const next = [...otp];
    paste.split('').forEach((d, i) => { next[i] = d; });
    setOtp(next);
    otpRefs.current[Math.min(paste.length, 5)]?.focus();
    e.preventDefault();
  };

  const otpValue = otp.join('');

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    clearErrors();
    const { email, password } = formData;
    if (!email.trim() || !password.trim()) {
      setFormError('Please fill in all required fields.');
      return;
    }
    const result = await login({ email: email.trim(), password });
    if (!result.success) { setFormError(result.error || 'Something went wrong.'); return; }
    if (result.user?.isAdmin) navigate('/admin/dashboard');
    else navigate('/');
  };

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    clearErrors();
    const { firstName, lastName, email, password } = formData;
    if (!firstName.trim() || !lastName.trim()) {
      setFormError('Please enter your first and last name.'); return;
    }
    if (!email.trim()) { setFormError('Please enter your email.'); return; }
    if (password.length < 6) {
      setFormError('Password must be at least 6 characters.'); return;
    }
    setLocalLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(), lastName: lastName.trim(),
          email: email.trim(), password,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.detail || 'Failed to send OTP.'); return; }
      setPendingEmail(email.trim());
      setStep(STEP.OTP);
      setResendCooldown(60);
      setSuccessMsg('');
    } catch { setFormError('Network error. Please try again.'); }
    finally { setLocalLoading(false); }
  };

  const handleVerifyOtp = async (e) => {
    e?.preventDefault();
    clearErrors();
    if (otpValue.length < 6) { setFormError('Please enter the full 6-digit code.'); return; }
    setLocalLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail, otp_code: otpValue }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.detail || 'Invalid or expired code.');
        setOtp(['', '', '', '', '', '']);
        otpRefs.current[0]?.focus();
        return;
      }
      setStep(STEP.DONE);
      setTimeout(() => {
        login({ email: pendingEmail, password: formData.password }).then((result) => {
          if (result?.user?.isAdmin) navigate('/admin/dashboard');
          else navigate('/');
        });
      }, 1200);
    } catch { setFormError('Network error. Please try again.'); }
    finally { setLocalLoading(false); }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || isLoading) return;
    clearErrors();
    setLocalLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/auth/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.detail || 'Failed to resend code.'); return; }
      setOtp(['', '', '', '', '', '']);
      setResendCooldown(60);
      setSuccessMsg('New code sent!');
      setTimeout(() => setSuccessMsg(''), 3000);
      otpRefs.current[0]?.focus();
    } catch { setFormError('Network error. Please try again.'); }
    finally { setLocalLoading(false); }
  };

  const displayError = formError || error || '';

  // ── Success screen ────────────────────────────────────────────────────────────
  if (step === STEP.DONE) {
    return (
      <PageWrap>
        <Card>
          <div className="flex flex-col items-center gap-5 py-6 text-center">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-xl animate-pulse" />
              <div className="relative w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                <CheckCircle2 size={38} className="text-emerald-400" />
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">Account Created!</h2>
              <p className="text-slate-400 text-sm mt-2">Signing you in to GIA…</p>
            </div>
            <Loader2 size={20} className="animate-spin text-indigo-400" />
          </div>
        </Card>
      </PageWrap>
    );
  }

  // ── OTP screen ────────────────────────────────────────────────────────────────
  if (step === STEP.OTP) {
    return (
      <PageWrap>
        <Card>
          <button
            type="button"
            onClick={() => { setStep(STEP.AUTH); clearErrors(); setOtp(['','','','','','']); }}
            className="flex items-center gap-2 text-slate-500 hover:text-white text-xs tracking-widest uppercase mb-8 transition-colors group"
          >
            <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
            Back
          </button>

          <div className="text-center mb-8">
            <div className="relative inline-block mb-5">
              <div className="absolute inset-0 rounded-2xl bg-indigo-500/20 blur-lg" />
              <div className="relative w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center mx-auto">
                <Mail size={24} className="text-indigo-400" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Check your inbox</h2>
            <p className="text-slate-400 text-sm mt-2 leading-relaxed">
              We sent a 6-digit code to<br />
              <span className="text-indigo-300 font-semibold">{pendingEmail}</span>
            </p>
          </div>

          {successMsg && (
            <div className="mb-5 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs text-center tracking-wide">
              {successMsg}
            </div>
          )}
          {displayError && (
            <div className="mb-5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-xs text-center tracking-wide">
              {displayError}
            </div>
          )}

          <form onSubmit={handleVerifyOtp} noValidate>
            <div className="flex gap-3 justify-center mb-8" onPaste={handleOtpPaste}>
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={el => otpRefs.current[i] = el}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handleOtpChange(i, e.target.value)}
                  onKeyDown={e => handleOtpKeyDown(i, e)}
                  disabled={isLoading}
                  className={[
                    'w-12 h-14 text-center text-xl font-bold rounded-xl border',
                    'bg-white/[0.04] text-white transition-all outline-none',
                    'disabled:opacity-40 font-mono',
                    digit
                      ? 'border-indigo-500/70 shadow-[0_0_0_3px_rgba(99,102,241,0.18),0_0_16px_rgba(99,102,241,0.12)] text-indigo-300'
                      : 'border-white/10 focus:border-indigo-500/60 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.13)]',
                  ].join(' ')}
                  aria-label={`OTP digit ${i + 1}`}
                  autoFocus={i === 0}
                  autoComplete="one-time-code"
                />
              ))}
            </div>

            <button
              type="submit"
              disabled={isLoading || otpValue.length < 6}
              className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:from-slate-800 disabled:to-slate-800 disabled:cursor-not-allowed py-4 rounded-2xl font-bold text-sm tracking-widest uppercase transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/40"
            >
              {isLoading
                ? <><Loader2 size={18} className="animate-spin" /> Verifying…</>
                : <><Sparkles size={16} /> Verify & Create Account</>}
            </button>
          </form>

          <div className="flex items-center justify-center gap-2 mt-6 text-xs">
            <span className="text-slate-600">Didn't receive it?</span>
            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0 || isLoading}
              className="flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors font-semibold tracking-wide"
            >
              <RefreshCw size={12} />
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
            </button>
          </div>

          <p className="text-center text-slate-700 text-xs mt-5 tracking-wide">
            Code expires in 10 minutes
          </p>
        </Card>
      </PageWrap>
    );
  }

  // ── Login / Signup form ────────────────────────────────────────────────────────
  return (
    <PageWrap>
      <Card>
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="relative">
              <div className="absolute inset-0 rounded-xl bg-indigo-500/30 blur-md" />
              <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg">
                <Sparkles size={18} className="text-white" />
              </div>
            </div>
            <span className="text-3xl font-bold tracking-tighter text-white">GIA</span>
          </div>
          <p className="text-[11px] font-bold tracking-[0.3em] text-indigo-400 uppercase">
            AI Fashion Platform
          </p>
        </div>

        {/* Tab toggle */}
        <div className="flex bg-white/[0.04] border border-white/[0.07] rounded-2xl p-1 mb-8">
          {[
            { label: 'Sign In',        active: isLogin,  fn: () => handleTabSwitch(true) },
            { label: 'Create Account', active: !isLogin, fn: () => handleTabSwitch(false) },
          ].map(({ label, active, fn }) => (
            <button
              key={label}
              type="button"
              onClick={fn}
              className={`flex-1 py-3 rounded-xl text-xs font-bold tracking-widest uppercase transition-all duration-300 ${
                active
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-900/40'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Error banner */}
        {displayError && (
          <div className="mb-5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center tracking-wide">
            {displayError}
          </div>
        )}

        <form onSubmit={isLogin ? handleLoginSubmit : handleSignupSubmit} className="space-y-3" noValidate>

          {/* Name fields — signup only */}
          {!isLogin && (
            <div className="grid grid-cols-2 gap-3">
              <InputField icon={User}>
                <input
                  type="text"
                  name="firstName"
                  placeholder="First Name"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  disabled={isLoading}
                  className={inputCls}
                  required
                  autoComplete="given-name"
                />
              </InputField>
              <InputField icon={User}>
                <input
                  type="text"
                  name="lastName"
                  placeholder="Last Name"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  disabled={isLoading}
                  className={inputCls}
                  required
                  autoComplete="family-name"
                />
              </InputField>
            </div>
          )}

          {/* Email */}
          <InputField icon={Mail}>
            <input
              type="email"
              name="email"
              placeholder="Email Address"
              value={formData.email}
              onChange={handleInputChange}
              disabled={isLoading}
              className={inputCls}
              required
              autoComplete="email"
            />
          </InputField>

          {/* Password */}
          <InputField icon={Lock}>
            <input
              type={showPassword ? 'text' : 'password'}
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleInputChange}
              disabled={isLoading}
              className={inputCls + ' pr-12'}
              required
              autoComplete={isLogin ? 'current-password' : 'new-password'}
            />
            <button
              type="button"
              onClick={() => setShowPassword(p => !p)}
              tabIndex={-1}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </InputField>

          {/* Signup note */}
          {!isLogin && (
            <p className="text-slate-600 text-xs px-1 tracking-wide leading-relaxed">
              We'll email a verification code to confirm your address.
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:from-slate-800 disabled:to-slate-800 disabled:cursor-not-allowed py-4 rounded-2xl font-bold text-sm tracking-widest uppercase transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/40 hover:shadow-indigo-700/40 hover:scale-[1.01] active:scale-[0.99]"
          >
            {isLoading
              ? <><Loader2 size={18} className="animate-spin" /> {isLogin ? 'Signing In…' : 'Sending Code…'}</>
              : <><Sparkles size={16} /> {isLogin ? 'Sign In' : 'Send Verification Code'}</>}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 h-px bg-white/[0.06]" />
          <span className="text-slate-700 text-[10px] tracking-widest uppercase">GIA</span>
          <div className="flex-1 h-px bg-white/[0.06]" />
        </div>

        {/* Terms */}
        <p className="text-center text-slate-700 text-xs tracking-wide leading-relaxed">
          By continuing you agree to our{' '}
          <span className="text-slate-500 hover:text-slate-300 cursor-pointer transition-colors">Terms</span>
          {' '}and{' '}
          <span className="text-slate-500 hover:text-slate-300 cursor-pointer transition-colors">Privacy Policy</span>
        </p>
      </Card>
    </PageWrap>
  );
}
