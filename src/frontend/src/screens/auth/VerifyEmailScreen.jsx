import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import client from '../../api/client';

export default function VerifyEmailScreen() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const [status, setStatus] = useState('verifying'); // verifying | success | error
  const [resendStatus, setResendStatus] = useState('idle'); // idle | sending | sent | error
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      return;
    }

    client.get(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(() => {
        if (user) updateUser({ email_verified: true });
        setStatus('success');

        if (user) {
          client.get('/api/onboarding/status')
            .then(({ data: s }) => {
              setTimeout(() => {
                if (!s.consent) navigate('/onboarding/consent', { replace: true });
                else if (!s.persona) navigate('/onboarding/persona', { replace: true });
                else if (!s.first_mood) navigate('/onboarding/first-mood', { replace: true });
                else navigate('/dashboard', { replace: true });
              }, 2000);
            })
            .catch(() => {
              setTimeout(() => navigate('/onboarding/consent', { replace: true }), 2000);
            });
        } else {
          setTimeout(() => navigate('/login', { replace: true }), 2000);
        }
      })
      .catch(() => setStatus('error'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleResend() {
    if (resendStatus === 'sending' || resendStatus === 'sent') return;
    setResendStatus('sending');
    try {
      await client.post('/api/auth/resend-verification');
      setResendStatus('sent');
    } catch (err) {
      if (err.response?.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      setResendStatus('error');
    }
  }

  if (status === 'verifying') {
    return (
      <div className="screen screen--no-nav" style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        alignItems: 'center', minHeight: '100dvh',
      }}>
        <div
          style={{
            width: 40, height: 40, borderRadius: '50%',
            border: '3px solid var(--color-accent)', borderTopColor: 'transparent',
            animation: 'spin 800ms linear infinite', marginBottom: 'var(--space-md)',
          }}
          aria-label="Verifying…"
        />
        <p style={{ color: 'var(--color-text-muted)' }}>Verifying your email…</p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="screen screen--no-nav" style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        alignItems: 'center', textAlign: 'center', padding: 'var(--space-xl)',
        minHeight: '100dvh', background: 'var(--color-bg-deep)',
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'var(--color-success, #4CAF50)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 'var(--space-lg)',
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
            stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 style={{ marginBottom: 'var(--space-sm)' }}>You're verified.</h1>
        <p style={{ color: 'var(--color-text-muted)' }}>Welcome to Melah.</p>
        <p style={{ marginTop: 'var(--space-sm)', fontSize: 13, color: 'var(--color-text-muted)' }}>
          Redirecting you now…
        </p>
      </div>
    );
  }

  // Error state
  return (
    <div className="screen screen--no-nav" style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      alignItems: 'center', textAlign: 'center', padding: 'var(--space-xl)', minHeight: '100dvh',
    }}>
      <h1 style={{ marginBottom: 'var(--space-sm)' }}>Link expired</h1>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-xl)' }}>
        This link has expired or already been used.
      </p>

      <button
        className="btn btn--primary"
        style={{ width: 'auto', padding: '0 var(--space-xl)', marginBottom: 'var(--space-md)' }}
        onClick={handleResend}
        disabled={resendStatus === 'sending' || resendStatus === 'sent'}
      >
        {resendStatus === 'sending' ? 'Sending…'
          : resendStatus === 'sent' ? 'Email sent!'
          : 'Resend verification email'}
      </button>

      {resendStatus === 'error' && (
        <p style={{ color: 'var(--color-error)', fontSize: 13, marginBottom: 'var(--space-md)' }}>
          Something went wrong.{' '}
          <Link to="/login" style={{ color: 'var(--color-accent)' }}>Log in</Link> to try again.
        </p>
      )}

      <Link to="/login" style={{ fontSize: 13, color: 'var(--color-text-muted)', textDecoration: 'none' }}>
        Back to sign in
      </Link>
    </div>
  );
}
