import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // null  = not logged in
  // object = { id, email, name }
  const [user, setUser] = useState(null);

  // true while we're waiting for /api/auth/me to respond on startup.
  // We must not render the app (or the login form) until we know whether
  // the user has an active session — otherwise there's a flash of the wrong UI.
  const [authLoading, setAuthLoading] = useState(true);

  // On mount, ask the server if we already have a valid session.
  // The browser automatically sends the session cookie with this request.
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => setUser(data.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));
  }, []);

  // login — posts credentials, stores the returned user in state.
  // Throws an Error if credentials are wrong so the LoginForm can catch it.
  const login = useCallback(async (email, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const body = await res.json();
      throw new Error(body.error || 'Login failed');
    }

    const loggedInUser = await res.json();
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  // logout — tells the server to destroy the session, then clears local state.
  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, authLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
