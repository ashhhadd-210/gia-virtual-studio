import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const BASE_URL = import.meta.env.VITE_BACKEND_API_URL;

// ─── Context ─────────────────────────────────────────────────────────────────
const AuthContext = createContext(null);

// ─── Token helpers ────────────────────────────────────────────────────────────
const TOKEN_KEY = 'gia_token';
const USER_KEY  = 'gia_user';

function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function loadSession() {
  const token = localStorage.getItem(TOKEN_KEY);
  const raw   = localStorage.getItem(USER_KEY);
  if (!token || !raw) return { token: null, user: null };
  try {
    return { token, user: JSON.parse(raw) };
  } catch {
    return { token: null, user: null };
  }
}

// ─── Provider ────────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [token, setToken]   = useState(() => loadSession().token);
  const [user,  setUser]    = useState(() => loadSession().user);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  // Derived flags
  const isLoggedIn = Boolean(token && user);
  const isAdmin    = Boolean(user?.isAdmin);

  // ── API call helper ────────────────────────────────────────────────────────
  async function authFetch(endpoint, body) {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.detail || data?.message || `Error ${res.status}`);
    }
    return data;
  }

  // ── Signup ────────────────────────────────────────────────────────────────
  const signup = useCallback(async ({ firstName, lastName, email, password }) => {
    setLoading(true);
    setError(null);
    try {
      const data = await authFetch('/auth/signup', { firstName, lastName, email, password });
      saveSession(data.access_token, data.user);
      setToken(data.access_token);
      setUser(data.user);
      return { success: true, user: data.user };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Login ─────────────────────────────────────────────────────────────────
  const login = useCallback(async ({ email, password }) => {
    setLoading(true);
    setError(null);
    try {
      const data = await authFetch('/auth/login', { email, password });
      saveSession(data.access_token, data.user);
      setToken(data.access_token);
      setUser(data.user);
      return { success: true, user: data.user };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    clearSession();
    setToken(null);
    setUser(null);
    setError(null);
  }, []);

  // ── Verify token on mount (optional — keeps user fresh) ───────────────────
  useEffect(() => {
    if (!token) return;
    fetch(`${BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
      .then((r) => {
        if (!r.ok) throw new Error('Session expired');
        return r.json();
      })
      .then((freshUser) => {
        setUser(freshUser);
        localStorage.setItem(USER_KEY, JSON.stringify(freshUser));
      })
      .catch(() => {
        // Token is stale — force logout
        clearSession();
        setToken(null);
        setUser(null);
      });
  }, []); // run once on mount

  // ── Authenticated fetch helper (for protected endpoints) ──────────────────
  const authGet = useCallback(
    (endpoint) =>
      fetch(`${BASE_URL}${endpoint}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      }).then((r) => r.json()),
    [token]
  );

  const value = {
    user,
    token,
    isLoggedIn,
    isAdmin,
    loading,
    error,
    signup,
    login,
    logout,
    authGet,
    clearError: () => setError(null),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export default AuthContext;