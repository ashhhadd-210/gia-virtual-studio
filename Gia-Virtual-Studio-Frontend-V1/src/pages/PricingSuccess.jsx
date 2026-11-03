import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { confirmSubscription } from '../Api/api';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

export default function PricingSuccess() {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const [status, setStatus] = useState('confirming'); // 'confirming' | 'done' | 'error'
  const [plan,   setPlan]   = useState('');
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    const session_id = searchParams.get('session_id');
    if (!session_id) { navigate('/pricing'); return; }

    confirmSubscription(session_id)
      .then(data => {
        if (data.success) {
          setPlan(data.plan || 'Premium');
          setStatus('done');
          setTimeout(() => navigate('/user/dashboard'), 3000);
        } else {
          setErrMsg('Subscription could not be confirmed.');
          setStatus('error');
        }
      })
      .catch(err => {
        setErrMsg(err.message || 'Something went wrong.');
        setStatus('error');
      });
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 max-w-md w-full text-center">

        {status === 'confirming' && (
          <>
            <Loader2 className="w-12 h-12 text-pink-400 animate-spin mx-auto mb-6" />
            <h2 className="text-2xl font-bold mb-2">Confirming your subscription…</h2>
            <p className="text-slate-400 text-sm">Please wait while we activate your plan.</p>
          </>
        )}

        {status === 'done' && (
          <>
            <CheckCircle className="w-14 h-14 text-emerald-400 mx-auto mb-6" />
            <h2 className="text-2xl font-bold mb-2">You're all set! 🎉</h2>
            <p className="text-slate-300 text-sm mb-1">
              <span className="text-pink-400 font-semibold">{plan}</span> is now active on your account.
            </p>
            <p className="text-slate-500 text-xs mt-4">Redirecting to your dashboard in 3 seconds…</p>
            <button
              onClick={() => navigate('/user/dashboard')}
              className="mt-6 bg-white text-black px-8 py-3 rounded-2xl font-semibold hover:bg-pink-500 hover:text-white transition-all text-sm"
            >
              Go to Dashboard
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="w-14 h-14 text-red-400 mx-auto mb-6" />
            <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
            <p className="text-slate-400 text-sm mb-1">{errMsg}</p>
            <p className="text-slate-500 text-xs mt-2">
              Your payment may have gone through. Contact support if the issue persists.
            </p>
            <div className="flex gap-3 mt-6 justify-center">
              <button
                onClick={() => navigate('/pricing')}
                className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-2.5 rounded-2xl text-sm font-medium transition-all"
              >
                Back to Pricing
              </button>
              <button
                onClick={() => navigate('/user/dashboard')}
                className="bg-pink-500 hover:bg-pink-600 text-white px-6 py-2.5 rounded-2xl text-sm font-medium transition-all"
              >
                Go to Dashboard
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}


















// // PricingSuccess.jsx  (your success page)
// import { useEffect, useState } from 'react';
// import { useSearchParams, useNavigate } from 'react-router-dom';

// const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// export default function PricingSuccess() {
//   const [searchParams] = useSearchParams();
//   const navigate = useNavigate();
//   const [status, setStatus] = useState('confirming'); // 'confirming' | 'done' | 'error'

//   useEffect(() => {
//     const session_id = searchParams.get('session_id');
//     if (!session_id) { navigate('/pricing'); return; }

//     const token = localStorage.getItem('gia_token');

//     fetch(`${API_BASE}/payment/confirm-subscription`, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//         'Authorization': `Bearer ${token}`,
//       },
//       body: JSON.stringify({ session_id }),
//     })
//       .then(r => r.json())
//       .then(data => {
//         if (data.success) {
//           setStatus('done');
//           // Redirect to dashboard after 2s
//           setTimeout(() => navigate('/dashboard'), 2000);
//         } else {
//           setStatus('error');
//         }
//       })
//       .catch(() => setStatus('error'));
//   }, []);

//   return (
//     <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
//       {status === 'confirming' && <p className="text-slate-400">Confirming your subscription…</p>}
//       {status === 'done'       && <p className="text-emerald-400 text-xl font-bold">🎉 Subscription activated! Redirecting…</p>}
//       {status === 'error'      && <p className="text-red-400">Something went wrong. Contact support.</p>}
//     </div>
//   );
// }