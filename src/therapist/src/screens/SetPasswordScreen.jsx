import { useState } from 'react';
import client from '../api/client';

export default function SetPasswordScreen({ token, onDone }) {
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      await client.post('/api/auth/reset-password', { token, new_password: password });
      setSuccess(true);
      // Clear the token from the URL without a page reload
      window.history.replaceState({}, '', window.location.pathname);
      setTimeout(onDone, 2000);
    } catch (err) {
      setError(err?.response?.data?.error || 'Link expired or invalid — ask an admin to resend the invite.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-sidebar-bg)',
      padding: 16,
    }}>
      <div style={{
        background: 'var(--color-card-bg)',
        borderRadius: 16,
        boxShadow: 'var(--shadow-modal)',
        padding: 'clamp(24px, 5vw, 40px)',
        width: '100%',
        maxWidth: 420,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🩺</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            PeerPal Therapist Portal
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>
            Set your password to activate your account
          </div>
        </div>

        {success ? (
          <div style={{
            textAlign: 'center',
            padding: '20px 0',
            color: 'var(--color-text-primary)',
            fontSize: 15,
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
            Password set! Redirecting to sign in…
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">New password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                autoFocus
              />
            </div>
            <div className="form-group" style={{ marginBottom: error ? 8 : 20 }}>
              <label className="form-label">Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat your password"
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
              {loading ? 'Setting password…' : 'Set password & sign in'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
