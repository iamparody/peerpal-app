import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen() {
  const { login }                   = useAuth();
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);

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
            <div className="login-sub">Professional access only</div>
          </div>
        </div>

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
          <div className="form-group" style={{ marginBottom: error ? 8 : 20 }}>
            <label className="form-label">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(179,92,92,0.08)',
              border: '1px solid rgba(179,92,92,0.25)',
              borderRadius: 6,
              padding: '9px 12px',
              fontSize: 13,
              color: 'var(--color-status-open)',
              marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn--primary"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', padding: '11px 14px', fontSize: 14 }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p style={{ marginTop: 20, fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center' }}>
          This portal is for registered PeerPal therapists only.
        </p>
      </div>
    </div>
  );
}
