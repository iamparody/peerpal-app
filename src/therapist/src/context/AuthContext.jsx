import { createContext, useContext, useState, useEffect } from 'react';
import client from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [therapist, setTherapist] = useState(null);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('pt_token');
    const user  = localStorage.getItem('pt_user');
    if (token && user) {
      try { setTherapist(JSON.parse(user)); } catch { /* ignore */ }
    }
    setLoading(false);
  }, []);

  async function login(email, password) {
    const { data } = await client.post('/api/auth/login', { email, password });
    if (data.role !== 'therapist') {
      throw new Error('This account does not have therapist access.');
    }
    const userData = {
      id:          data.userId || data.id,
      alias:       data.alias,
      role:        data.role,
      suspended:   data.suspended || false,
      display_name: data.display_name || data.alias,
    };
    localStorage.setItem('pt_token', data.token);
    localStorage.setItem('pt_user', JSON.stringify(userData));
    setTherapist(userData);
  }

  async function logout() {
    client.post('/api/auth/logout').catch(() => {});
    localStorage.removeItem('pt_token');
    localStorage.removeItem('pt_user');
    setTherapist(null);
  }

  return (
    <AuthContext.Provider value={{ therapist, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
