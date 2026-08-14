import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Heart, MagnifyingGlass } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import client from '../../api/client';

const ESCALATE_SECONDS = 90;
const HOTLINE_SECONDS = 300; // 5 minutes from start

const HOTLINES = [
  { name: 'Befrienders Kenya', number: '0800 723 253', tel: '0800723253', note: 'Free · 24/7' },
  { name: 'Niskize', number: '0900 620 800', tel: '0900620800', note: 'Free · 24/7' },
];

export default function PeerWaitingScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [countdown, setCountdown] = useState(ESCALATE_SECONDS);
  const [phase, setPhase] = useState('searching'); // 'searching' | 'escalated' | 'hotlines'
  const [error, setError] = useState('');
  const [visible, setVisible] = useState(false);
  const elapsedRef = useRef(0);
  const timerRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setCountdown((s) => Math.max(0, s - 1));
      setPhase(() => {
        if (elapsedRef.current >= HOTLINE_SECONDS) return 'hotlines';
        if (elapsedRef.current >= ESCALATE_SECONDS) return 'escalated';
        return 'searching';
      });
    }, 1000);

    // Poll for peer acceptance — continues across all phases
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await client.get(`/api/peer/request/${id}/status`).catch(() => ({ data: null }));
        if (data?.status === 'active' && data?.session_id) {
          clearInterval(pollRef.current);
          clearInterval(timerRef.current);
          qc.invalidateQueries({ queryKey: ['credits', 'balance'] });
          navigate(`/peer/session/${data.session_id}/${data.channel_preference || 'text'}`, { replace: true });
        }
        // If request is stuck 'locked' for >10s due to a failed accept, reset it server-side
        // by letting it time out — nothing to do on the client, just keep waiting
      } catch { /* non-fatal */ }
    }, 3000);

    setTimeout(() => setVisible(true), 120);

    return () => {
      clearInterval(timerRef.current);
      clearInterval(pollRef.current);
    };
  }, [id, navigate]);

  async function handleCancel() {
    try { await client.patch(`/api/peer/request/${id}/close`); } catch { /* best-effort */ }
    navigate('/peer', { replace: true });
  }

  if (error) {
    return (
      <div className="screen screen--no-nav" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <p style={{ marginBottom: 16 }}>{error}</p>
        <button className="btn btn--primary" onClick={() => navigate('/peer', { replace: true })}>Back</button>
      </div>
    );
  }

  // Phase 3 — 5 minutes elapsed, no peer found
  if (phase === 'hotlines') {
    return (
      <div className="screen screen--no-nav" style={{ display: 'flex', flexDirection: 'column', padding: '32px 24px', gap: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <Heart size={48} weight="fill" color="var(--color-calm)" style={{ marginBottom: 12 }} />
          <h2 style={{ marginBottom: 6 }}>We're still looking</h2>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
            No peer is available right now. Here's immediate support — no waiting required.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {HOTLINES.map((h) => (
            <a
              key={h.tel}
              href={`tel:${h.tel}`}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                background: 'var(--color-surface-secondary)', border: '1.5px solid var(--color-border)',
                borderRadius: 'var(--radius-md)', padding: '14px 16px',
                textDecoration: 'none', gap: 2,
              }}
            >
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{h.name}</span>
              <span style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-accent)', letterSpacing: 1 }}>{h.number}</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{h.note}</span>
            </a>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button className="btn btn--primary" onClick={() => navigate('/ai-chat')}>Talk to AI while you wait</button>
          <button className="btn btn--danger" onClick={() => navigate('/emergency')}>Emergency help</button>
          <button className="btn btn--muted" onClick={handleCancel}>Stop waiting</button>
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--color-text-secondary)' }}>
          We'll still connect you if a peer becomes available.
        </p>
      </div>
    );
  }

  // Phase 2 — 90s elapsed, admin notified silently, show soft options
  if (phase === 'escalated') {
    return (
      <div className="screen screen--no-nav" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '32px 24px', textAlign: 'center', gap: 16 }}>
        <MagnifyingGlass size={48} weight="duotone" color="var(--color-accent)" />
        <h2>Still searching…</h2>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
          Taking a bit longer than usual. We'll keep looking.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          <button className="btn btn--primary" onClick={() => navigate('/ai-chat')}>Talk to AI while you wait</button>
          <button className="btn btn--danger" onClick={() => navigate('/emergency')}>Emergency help</button>
          <button className="btn btn--muted" onClick={handleCancel}>Stop waiting</button>
        </div>
      </div>
    );
  }

  // Phase 1 — 0–90s countdown
  const pct = (countdown / ESCALATE_SECONDS) * 100;
  const r = 44;
  const circumference = 2 * Math.PI * r;
  const dash = (pct / 100) * circumference;
  const timerColor = pct > 60 ? 'var(--color-calm)' : pct > 30 ? 'var(--color-warning)' : 'var(--color-danger)';

  if (!visible) {
    return (
      <div className="screen screen--no-nav" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', gap: 16 }}>
        <div className="skeleton" style={{ width: 100, height: 100, borderRadius: '50%' }} />
        <div className="skeleton" style={{ width: 160, height: 22, borderRadius: 8 }} />
        <div className="skeleton" style={{ width: 240, height: 16, borderRadius: 8 }} />
      </div>
    );
  }

  return (
    <div className="screen screen--no-nav" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '32px 24px', textAlign: 'center', opacity: visible ? 1 : 0, transition: 'opacity 300ms ease' }}>
      <div style={{ marginBottom: 32 }}>
        <svg width={100} height={100} viewBox="0 0 100 100">
          <circle cx={50} cy={50} r={r} fill="none" stroke="var(--color-border)" strokeWidth={6} />
          <circle
            cx={50} cy={50} r={r} fill="none"
            stroke={timerColor} strokeWidth={6}
            strokeDasharray={`${dash} ${circumference}`}
            strokeLinecap="round"
            transform="rotate(-90 50 50)"
            style={{ transition: 'stroke-dasharray 1s linear, stroke 0.5s ease' }}
          />
          <text x={50} y={56} textAnchor="middle" fontSize={22} fontWeight={700} fill="var(--color-text-primary)">{countdown}</text>
        </svg>
      </div>

      <h2 style={{ marginBottom: 8 }}>Looking for someone…</h2>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>Hold tight. A peer is being matched to you right now.</p>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 12, marginTop: 4 }}>Sessions are 30 minutes · you can extend if needed</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', marginTop: 32 }}>
        <button className="btn btn--ghost" onClick={() => navigate('/ai-chat')}>Chat with AI instead</button>
        <button className="btn btn--muted" onClick={handleCancel}>Cancel</button>
      </div>
    </div>
  );
}
