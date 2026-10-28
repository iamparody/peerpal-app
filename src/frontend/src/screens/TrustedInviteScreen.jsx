import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { UserCirclePlus, CheckCircle } from '@phosphor-icons/react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

const STORAGE_KEY = 'trusted_invite_token';

export default function TrustedInviteScreen() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const token = searchParams.get('token');

  const [status, setStatus]   = useState('idle'); // idle | loading | accepted | declined | error
  const [message, setMessage] = useState('');

  // If not logged in, save token and redirect to register
  useEffect(() => {
    if (!user) {
      if (token) localStorage.setItem(STORAGE_KEY, token);
      navigate('/register', { state: { returnTo: `/trusted-invite?token=${token}` } });
    }
  }, [user, token, navigate]);

  // Resume after auth — check for stored token
  useEffect(() => {
    if (user && !token) {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) navigate(`/trusted-invite?token=${stored}`, { replace: true });
    }
  }, [user, token, navigate]);

  async function handleAccept() {
    setStatus('loading');
    try {
      await client.post('/api/safety-plan/trusted-contacts/accept', { token });
      localStorage.removeItem(STORAGE_KEY);
      setStatus('accepted');
    } catch (err) {
      setMessage(err.response?.data?.error || 'This invite link is no longer valid.');
      setStatus('error');
    }
  }

  async function handleDecline() {
    setStatus('declined');
    localStorage.removeItem(STORAGE_KEY);
  }

  if (!user || !token) return null;

  return (
    <div className="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', padding: 'var(--space-lg)' }}>
      <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 20, textAlign: 'center' }}>

        {status === 'idle' && (
          <>
            <UserCirclePlus size={48} weight="duotone" color="var(--color-primary)" style={{ alignSelf: 'center' }} />
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>You've been invited</h2>
            <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.6, margin: 0 }}>
              Someone on PeerPal wants you in their safety plan as a trusted contact. If you accept, they may choose to share alerts with you when they're having a hard time.
            </p>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>
              You'll only appear in their safety plan. You won't see their history or any other part of their account.
            </p>
            <button className="btn btn--primary" onClick={handleAccept}>Accept</button>
            <button className="btn btn--ghost" onClick={handleDecline} style={{ fontSize: 13 }}>Decline</button>
          </>
        )}

        {status === 'loading' && (
          <p style={{ color: 'var(--color-text-muted)' }}>Linking your accounts…</p>
        )}

        {status === 'accepted' && (
          <>
            <CheckCircle size={48} weight="fill" color="var(--color-success, #27ae60)" style={{ alignSelf: 'center' }} />
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>You're linked</h2>
            <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.6, margin: 0 }}>
              You're now a trusted contact in their safety plan. They'll be able to send you alerts if they choose to.
            </p>
            <button className="btn btn--primary" onClick={() => navigate('/dashboard')}>Go to home</button>
          </>
        )}

        {status === 'declined' && (
          <>
            <p style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>Invite declined.</p>
            <button className="btn btn--ghost" onClick={() => navigate('/dashboard')}>Go to home</button>
          </>
        )}

        {status === 'error' && (
          <>
            <p style={{ fontSize: 14, color: 'var(--color-danger, #e74c3c)' }}>{message}</p>
            <button className="btn btn--ghost" onClick={() => navigate('/dashboard')}>Go to home</button>
          </>
        )}

      </div>
    </div>
  );
}
