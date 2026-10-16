import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';

function ErrorBox({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      background: 'rgba(179,92,92,0.08)',
      border: '1px solid rgba(179,92,92,0.25)',
      borderRadius: 6,
      padding: '9px 12px',
      fontSize: 13,
      color: 'var(--color-status-open)',
      marginBottom: 16,
    }}>
      {msg}
    </div>
  );
}

function ForgotPasswordView({ onBack }) {
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await client.post('/api/auth/recover', { email });
      setSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div style={{ textAlign: 'center', padding: '8px 0' }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>📬</div>
        <p style={{ fontSize: 14, color: 'var(--color-text-primary)', marginBottom: 6 }}>
          Check your inbox
        </p>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 24, lineHeight: 1.5 }}>
          If that email is registered, a password reset link has been sent. Check your spam folder if it doesn't arrive within a few minutes.
        </p>
        <button className="btn btn--ghost" onClick={onBack} style={{ fontSize: 13 }}>
          ← Back to sign in
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 20, lineHeight: 1.5 }}>
        Enter your email and we'll send a link to reset your password.
      </p>
      <div className="form-group" style={{ marginBottom: error ? 8 : 20 }}>
        <label className="form-label">Email address</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="therapist@example.com"
          required
          autoFocus
        />
      </div>
      <ErrorBox msg={error} />
      <button
        type="submit"
        className="btn btn--primary"
        disabled={loading}
        style={{ width: '100%', justifyContent: 'center', padding: '11px 14px', fontSize: 14 }}
      >
        {loading ? 'Sending…' : 'Send reset link'}
      </button>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={onBack}
        style={{ width: '100%', justifyContent: 'center', marginTop: 10, fontSize: 13 }}
      >
        ← Back to sign in
      </button>
    </form>
  );
}

export default function LoginScreen() {
  const { login }                   = useAuth();
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message || err.response?.data?.error || 'Login failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-box">
        <div className="login-brand">
          <div className="login-brand-icon">🩺</div>
          <div>
            <div className="login-title">PeerPal Therapist Portal</div>
            <div className="login-sub">
              {showForgot ? 'Password reset' : 'Professional access only'}
            </div>
          </div>
        </div>

        {showForgot ? (
          <ForgotPasswordView onBack={() => setShowForgot(false)} />
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="therapist@example.com"
                required
                autoFocus
              />
            </div>
            <div className="form-group" style={{ marginBottom: error ? 8 : 4 }}>
              <label className="form-label">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <div style={{ textAlign: 'right', marginBottom: 16 }}>
              <button
                type="button"
                onClick={() => setShowForgot(true)}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  fontSize: 12, color: 'var(--color-text-muted)',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Forgot password?
              </button>
            </div>

            <ErrorBox msg={error} />

            <button
              type="submit"
              className="btn btn--primary"
              disabled={loading}
              style={{ width: '100%', justifyContent: 'center', padding: '11px 14px', fontSize: 14 }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}

        <p style={{ marginTop: 20, fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center' }}>
          This portal is for registered PeerPal therapists only.
        </p>
      </div>
    </div>
  );
}
