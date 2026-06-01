import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import client from '../../api/client';

export default function ResetPasswordScreen() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle'); // idle | submitting | success | expired

  useEffect(() => {
    if (!token) navigate('/recover', { replace: true });
  }, [token, navigate]);

  function validatePassword(val) {
    if (!val) return 'Password is required';
    if (val.length < 8) return 'Must be at least 8 characters';
    return '';
  }

  function validateConfirm(val, pw = newPassword) {
    if (!val) return 'Please confirm your password';
    if (val !== pw) return 'Passwords do not match';
    return '';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const pwErr = validatePassword(newPassword);
    const cfErr = validateConfirm(confirm);
    if (pwErr || cfErr) {
      setErrors({ password: pwErr, confirm: cfErr });
      return;
    }
    setErrors({});
    setStatus('submitting');

    try {
      await client.post('/api/auth/reset-password', { token, new_password: newPassword });
      setStatus('success');
      setTimeout(() => navigate('/login', { replace: true }), 2000);
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === 'TOKEN_EXPIRED' || code === 'INVALID_TOKEN') {
        setStatus('expired');
      } else {
        setErrors({ form: 'Something went wrong. Please try again.' });
        setStatus('idle');
      }
    }
  }

  if (status === 'success') {
    return (
      <div className="screen screen--no-nav" style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        alignItems: 'center', textAlign: 'center', padding: 'var(--space-xl)',
        minHeight: '100dvh', background: 'var(--color-bg-deep)', color: '#F5EDE4',
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'var(--color-calm)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 'var(--space-lg)',
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
            stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 style={{ marginBottom: 'var(--space-sm)', color: '#F5EDE4' }}>Password updated.</h1>
        <p style={{ color: 'rgba(245,237,228,0.65)' }}>Please log in with your new password.</p>
        <p style={{ marginTop: 'var(--space-sm)', fontSize: 13, color: 'rgba(245,237,228,0.50)' }}>
          Redirecting to login…
        </p>
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <div className="screen screen--no-nav" style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        alignItems: 'center', textAlign: 'center', padding: 'var(--space-xl)', minHeight: '100dvh',
      }}>
        <h1 style={{ marginBottom: 'var(--space-sm)' }}>Link expired</h1>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-xl)' }}>
          This link has expired. Request a new one.
        </p>
        <Link
          to="/recover"
          className="btn btn--primary"
          style={{ width: 'auto', padding: '0 var(--space-xl)', textDecoration: 'none', display: 'inline-block' }}
        >
          Request new link
        </Link>
      </div>
    );
  }

  return (
    <div className="screen screen--no-nav" style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: 'var(--space-xl) var(--space-lg)',
    }}>
      <div style={{ marginBottom: 'var(--space-xl)', textAlign: 'center' }}>
        <div className="wordmark" style={{ fontSize: 28, marginBottom: 'var(--space-sm)' }}>Melah</div>
        <h1 style={{ fontSize: 'var(--text-h2)', marginBottom: 'var(--space-xs)' }}>Set new password</h1>
        <p style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>Choose something strong and memorable.</p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        <div>
          <label className="label" htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            className="input"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            onBlur={() => setErrors((prev) => ({ ...prev, password: validatePassword(newPassword) }))}
            placeholder="Min. 8 characters"
            autoComplete="new-password"
          />
          {errors.password && (
            <p style={{ color: 'var(--color-error)', fontSize: 12, marginTop: 4 }}>{errors.password}</p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="confirm-password">Confirm password</label>
          <input
            id="confirm-password"
            type="password"
            className="input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onBlur={() => setErrors((prev) => ({ ...prev, confirm: validateConfirm(confirm) }))}
            placeholder="Repeat your password"
            autoComplete="new-password"
          />
          {errors.confirm && (
            <p style={{ color: 'var(--color-error)', fontSize: 12, marginTop: 4 }}>{errors.confirm}</p>
          )}
        </div>

        {errors.form && <div className="error-msg">{errors.form}</div>}

        <button
          type="submit"
          className="btn btn--primary"
          disabled={status === 'submitting' || !newPassword || !confirm}
        >
          {status === 'submitting' ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </div>
  );
}
