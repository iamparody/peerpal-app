import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const REDIRECT_SECONDS = 5;

export default function EmailSentScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const email = location.state?.email || '';
  const navigateRef = useRef(navigate);

  const [redirectIn, setRedirectIn] = useState(REDIRECT_SECONDS);

  // Keep navigateRef current without re-running the timer effect
  useEffect(() => { navigateRef.current = navigate; });

  // Run once on mount — one redirect timer, one display tick, both cleaned up on unmount
  useEffect(() => {
    const redirect = setTimeout(() => navigateRef.current('/login', { replace: true }), REDIRECT_SECONDS * 1000);
    const tick = setInterval(() => setRedirectIn((n) => Math.max(0, n - 1)), 1000);
    return () => { clearTimeout(redirect); clearInterval(tick); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="screen screen--no-nav"
      style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        alignItems: 'center', textAlign: 'center',
        padding: 'var(--space-xl) var(--space-lg)', minHeight: '100dvh',
        background: 'var(--color-bg-deep)',
        color: '#F5EDE4',
      }}
    >
      {/* Envelope */}
      <svg
        width="64" height="64" viewBox="0 0 256 256"
        style={{ marginBottom: 'var(--space-lg)', color: 'rgba(245,237,228,0.70)' }}
        aria-hidden="true"
      >
        <rect width="200" height="152" x="28" y="52" rx="8" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16" />
        <path d="M28 76l100 72 100-72" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16" />
      </svg>

      <h1 style={{ fontSize: 'var(--text-h1)', marginBottom: 'var(--space-sm)', color: '#F5EDE4' }}>Check your email</h1>

      <p style={{
        fontSize: 'var(--text-body)', color: 'rgba(245,237,228,0.65)',
        marginBottom: 'var(--space-md)', maxWidth: 300, lineHeight: 1.6,
      }}>
        We sent a verification link to{' '}
        {email
          ? <strong style={{ color: '#F5EDE4' }}>{email}</strong>
          : 'your email address'
        }.
        {' '}Click it to activate your account.
      </p>

      <p style={{
        fontSize: 13, color: 'rgba(245,237,228,0.45)',
        marginBottom: 'var(--space-2xl)',
      }}>
        Redirecting to login in {redirectIn}s…
      </p>

      <button
        onClick={() => { navigate('/login', { replace: true }); }}
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          fontSize: 14, color: 'rgba(245,237,228,0.70)', textDecoration: 'underline',
          marginBottom: 'var(--space-md)', padding: 0,
        }}
      >
        Already verified? Return to login
      </button>

      <Link
        to="/emergency-public"
        style={{ fontSize: 13, color: 'rgba(245,237,228,0.50)', textDecoration: 'none' }}
      >
        Need help right now?
      </Link>
    </div>
  );
}
