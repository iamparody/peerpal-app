import { createContext, useContext, useState, useEffect } from 'react';
import client from '../api/client';
import { trackEvent } from '../utils/analytics';
import { optInAnalytics, optOutAnalytics } from '../lib/analytics';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem('mb_token');
    const storedUser = localStorage.getItem('mb_user');
    if (storedToken && storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        setToken(storedToken);
        setUser(parsed);
        trackEvent('session_start');
        optInAnalytics(parsed.id, parsed.alias);
      } catch {
        localStorage.removeItem('mb_token');
        localStorage.removeItem('mb_user');
      }
    }
    setLoading(false);
  }, []);

  function login(newToken, newUser) {
    localStorage.setItem('mb_token', newToken);
    localStorage.setItem('mb_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    trackEvent('session_start');
    optInAnalytics(newUser.id, newUser.alias);
    // Logout releases this device's push token server-side; claim it for the new account.
    // Only when permission is already granted: never prompt on login.
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      import('../utils/firebase').then(m => m.registerFCMToken()).catch(() => {});
    }
  }

  function logout() {
    // Pass the token explicitly: axios request interceptors run async, so by the time the
    // interceptor reads localStorage below has already removed it and the call went out
    // unauthenticated (JWT never blacklisted, device push token never released).
    const current = localStorage.getItem('mb_token');
    client.post('/api/auth/logout', null, current ? { headers: { Authorization: `Bearer ${current}` } } : undefined)
      .catch(() => {});
    localStorage.removeItem('mb_token');
    localStorage.removeItem('mb_user');
    setToken(null);
    setUser(null);
    optOutAnalytics();
  }

  function updateUser(updates) {
    const updated = { ...user, ...updates };
    localStorage.setItem('mb_user', JSON.stringify(updated));
    setUser(updated);
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
