import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import MoodBlob from '../components/MoodBlob';
import client from '../api/client';
import { track } from '../lib/analytics';

export default function TrialWelcomeScreen() {
  const navigate = useNavigate();
  const [claiming, setClaiming] = useState(false);

  useEffect(() => { track('trial_claim_viewed'); }, []);

  async function claimAndGo(path) {
    if (claiming) return;
    setClaiming(true);
    try {
      await client.post('/api/trial/claim');
      track('trial_claimed', { cta: path === '/peer' ? 'talk_to_someone' : 'explore_first' });
    } catch (err) {
      // 409 = already claimed, proceed regardless
      if (err?.response?.status !== 409) {
        console.error('[TrialWelcome] claim failed:', err.message);
      }
    }
    navigate(path, { replace: true });
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--color-bg-deep)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-xl) var(--space-lg)',
        textAlign: 'center',
      }}
    >
      <div style={{ marginBottom: 'var(--space-lg)' }}>
        <MoodBlob mood="great" size={160} />
      </div>

      <h1
        style={{
          fontFamily: 'var(--font-editorial)',
          fontSize: 24,
          fontWeight: 400,
          color: '#F5EDE4',
          marginBottom: 'var(--space-md)',
        }}
      >
        You're all set.
      </h1>

      <p
        style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 16,
          color: 'rgba(245,237,228,0.65)',
          maxWidth: 280,
          lineHeight: 1.6,
          marginBottom: 'var(--space-sm)',
        }}
      >
        Your first peer session is ready when you are.
      </p>

      <p
        style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 13,
          color: 'rgba(245,237,228,0.45)',
          maxWidth: 260,
          lineHeight: 1.5,
          marginBottom: 'var(--space-xl)',
        }}
      >
        Your first 2 credits arrive tomorrow morning.
      </p>

      <button
        className="btn btn--primary"
        style={{ width: '100%', maxWidth: 320, marginBottom: 'var(--space-md)' }}
        onClick={() => claimAndGo('/peer')}
        disabled={claiming}
      >
        {claiming ? 'Starting...' : 'Talk to someone'}
      </button>

      <button
        style={{
          background: 'none',
          border: 'none',
          fontFamily: 'var(--font-ui)',
          fontSize: 14,
          color: 'rgba(245,237,228,0.5)',
          cursor: 'pointer',
          padding: '8px 16px',
          minHeight: 'var(--touch-target-min)',
        }}
        onClick={() => claimAndGo('/dashboard')}
        disabled={claiming}
      >
        Explore first
      </button>
    </div>
  );
}
