import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import client from '../../api/client';

export default function RegisterScreen() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [alias, setAlias] = useState('');
  const [revealPhase, setRevealPhase] = useState(0);
  const timerIds = useRef([]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!email || !password || !confirm) { setError('All fields are required.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      const { data } = await client.post('/api/auth/register', { email, password });
      login(data.token, { id: data.userId, alias: data.alias, role: data.role, email_verified: false });
      setAlias(data.alias);
      setRevealPhase(1);
      const delay = 600 + data.alias.length * 80;
      timerIds.current = [
        setTimeout(() => setRevealPhase(2), 300),
        setTimeout(() => setRevealPhase(3), 600),
        setTimeout(() => setRevealPhase(4), delay + 400),
        setTimeout(() => setRevealPhase(5), delay + 1200),
        setTimeout(() => navigate('/email-sent', { state: { email }, replace: true }), delay + 2500),
      ];
    } catch (err) {
      const code = err.response?.data?.code;
      if (err.response?.status === 429) {
        setError('Too many attempts. Please wait a few minutes and try again.');
      } else if (code === 'PENDING_VERIFICATION') {
        setError('This email is registered but not yet verified. Check your inbox or go to login to resend the link.');
      } else if (code === 'EMAIL_TAKEN') {
        setError('An account with that email already exists.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  /* ── Alias reveal sequence (spec 8.1 / 9.4 #1) ── */
  if (alias) {
    return (
      <div
        className="screen screen--no-nav"
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 'var(--space-xl) var(--space-lg)',
          textAlign: 'center',
          background: revealPhase >= 1 ? 'var(--color-bg-deep)' : 'var(--color-bg-primary)',
          transition: 'background 300ms ease',
          minHeight: '100dvh',
        }}
      >
        <p
          style={{
            fontSize: 'var(--text-body)',
            fontWeight: 'var(--weight-regular)',
            color: 'var(--color-text-muted)',
            marginBottom: 'var(--space-sm)',
            opacity: revealPhase >= 2 ? 1 : 0,
            transition: 'opacity 250ms ease',
          }}
        >
          You are now known as
        </p>

        <div
          style={{
            display: 'flex',
            gap: 1,
            justifyContent: 'center',
            marginBottom: 'var(--space-lg)',
            fontSize: 32,
            fontWeight: 600,
            fontFamily: 'var(--font-ui)',
            color: 'var(--color-accent)',
            letterSpacing: '0.04em',
          }}
          aria-label={alias}
        >
          {revealPhase >= 3 && alias.split('').map((char, i) => (
            <span
              key={i}
              style={{
                display: 'inline-block',
                animation: `charReveal 300ms ease-out both`,
                animationDelay: `${i * 80}ms`,
              }}
            >
              {char}
            </span>
          ))}
        </div>

        <p
          style={{
            fontFamily: 'var(--font-editorial)',
            fontSize: 18,
            fontWeight: 400,
            color: 'var(--color-text-muted)',
            opacity: revealPhase >= 4 ? 1 : 0,
            transition: 'opacity 400ms ease',
            marginBottom: 'var(--space-2xl)',
          }}
        >
          Welcome.
        </p>

        <button
          className="btn btn--ghost"
          style={{
            width: 'auto',
            padding: '0 var(--space-xl)',
            opacity: revealPhase >= 5 ? 1 : 0,
            transition: 'opacity 300ms ease',
          }}
          onClick={() => {
            timerIds.current.forEach(clearTimeout);
            navigate('/email-sent', { state: { email }, replace: true });
          }}
        >
          Continue
        </button>
      </div>
    );
  }

  return (
    <div className="screen screen--no-nav" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 'var(--space-xl) var(--space-lg)' }}>
      <div style={{ marginBottom: 'var(--space-xl)', textAlign: 'center' }}>
        <div className="wordmark" style={{ fontSize: 28, marginBottom: 'var(--space-sm)' }}>PeerPal</div>
        <h1 style={{ fontSize: 'var(--text-h2)', marginBottom: 'var(--space-xs)' }}>Create account</h1>
        <p style={{ fontSize: 14 }}>Anonymous. Private. Yours.</p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        <div>
          <label className="label" htmlFor="email">Email <span style={{ color: 'var(--color-accent)' }}>*</span></label>
          <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" autoComplete="email" />
          <p style={{ fontSize: 'var(--text-caption)', marginTop: 'var(--space-xs)', color: 'var(--color-text-muted)' }}>Used only for account recovery — never shown to anyone.</p>
        </div>
        <div style={{ position: 'relative' }}>
          <label className="label" htmlFor="password">Password <span style={{ color: 'var(--color-accent)' }}>*</span></label>
          <input id="password" type={showPw ? 'text' : 'password'} className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" autoComplete="new-password" style={{ paddingRight: 44 }} />
          <button type="button" onClick={() => setShowPw(v => !v)} style={{ position: 'absolute', right: 12, bottom: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--color-text-muted)' }} aria-label={showPw ? 'Hide password' : 'Show password'}>
            {showPw
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            }
          </button>
        </div>
        <div style={{ position: 'relative' }}>
          <label className="label" htmlFor="confirm">Confirm password <span style={{ color: 'var(--color-accent)' }}>*</span></label>
          <input id="confirm" type={showConfirm ? 'text' : 'password'} className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat your password" autoComplete="new-password" style={{ paddingRight: 44 }} />
          <button type="button" onClick={() => setShowConfirm(v => !v)} style={{ position: 'absolute', right: 12, bottom: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--color-text-muted)' }} aria-label={showConfirm ? 'Hide password' : 'Show password'}>
            {showConfirm
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            }
          </button>
        </div>
        {error && <div className="error-msg">{error}</div>}
        <button type="submit" className="btn btn--primary" disabled={loading || !email || !password || !confirm}>
          {loading ? 'Creating account…' : 'Create Account'}
        </button>
      </form>

      <div style={{ marginTop: 'var(--space-lg)', textAlign: 'center' }}>
        <p style={{ fontSize: 14 }}>Already have an account? <Link to="/login" style={{ color: 'var(--color-accent)', fontWeight: 600, textDecoration: 'none' }}>Sign in</Link></p>
      </div>
    </div>
  );
}
