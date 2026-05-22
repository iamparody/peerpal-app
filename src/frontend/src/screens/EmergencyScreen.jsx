import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Siren, CheckCircle, Wind, ShieldCheck, Phone } from '@phosphor-icons/react';
import client from '../api/client';

const ESCALATE_MS = 5 * 60 * 1000; // 5 minutes with no ack → escalate hotline prompt
const POLL_MS = 8000;

export default function EmergencyScreen() {
  const navigate = useNavigate();
  const [triggered, setTriggered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ackStatus, setAckStatus] = useState(null); // null | 'acknowledged' | 'resolved'
  const [escalated, setEscalated] = useState(false);
  const logIdRef = useRef(null);
  const pollRef = useRef(null);
  const escalateTimerRef = useRef(null);
  const ackStatusRef = useRef(null); // mirrors ackStatus for use inside timers

  useEffect(() => {
    return () => {
      clearInterval(pollRef.current);
      clearTimeout(escalateTimerRef.current);
    };
  }, []);

  function startPolling() {
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await client.get('/api/emergency/status');
        if (!data.active) return;
        if (data.resolved_at && ackStatusRef.current !== 'resolved') {
          ackStatusRef.current = 'resolved';
          setAckStatus('resolved');
          clearInterval(pollRef.current);
          clearTimeout(escalateTimerRef.current);
        } else if (data.acknowledged_at && ackStatusRef.current === null) {
          ackStatusRef.current = 'acknowledged';
          setAckStatus('acknowledged');
          clearTimeout(escalateTimerRef.current);
        }
      } catch { /* non-fatal */ }
    }, POLL_MS);

    escalateTimerRef.current = setTimeout(() => {
      if (ackStatusRef.current === null) setEscalated(true);
    }, ESCALATE_MS);
  }

  async function handleTalkNow() {
    setLoading(true);
    try {
      const { data } = await client.post('/api/emergency/trigger');
      logIdRef.current = data.log_id;
      startPolling();
    } catch { /* still show resources on failure */ }
    setTriggered(true);
    setLoading(false);
  }

  /* CRITICAL: Zero animation delay — everything immediately visible (spec 8.5 + 9.4 #3) */
  return (
    <div
      className="screen screen--no-nav"
      style={{
        background: 'var(--color-bg-emergency)',
        display: 'flex',
        flexDirection: 'column',
        padding: 'var(--space-xl) var(--space-lg)',
        minHeight: '100dvh',
        gap: 'var(--space-lg)',
      }}
    >
      {/* Siren — only the icon has a brief fade-in, everything else static */}
      <div style={{ textAlign: 'center', paddingTop: 'var(--space-lg)' }}>
        <div
          style={{
            color: 'var(--color-danger)',
            marginBottom: 'var(--space-md)',
            animation: 'personaIn 200ms ease-out both',
          }}
        >
          <Siren size={48} weight="duotone" aria-hidden="true" />
        </div>

        <h1
          style={{
            fontFamily: 'var(--font-editorial)',
            fontSize: 22,
            fontWeight: 400,
            color: '#F5EDE4',
            marginBottom: 'var(--space-sm)',
          }}
        >
          You're not alone
        </h1>

        {/* Crisis lines — always first, always visible, no interaction required */}
        <a
          href="tel:0800723253"
          style={{ display: 'block', fontSize: 26, fontWeight: 600, color: 'var(--color-accent)', textDecoration: 'none', marginBottom: 2, fontFamily: 'var(--font-ui)' }}
          aria-label="Call Befrienders Kenya: 0800 723 253"
        >
          0800 723 253
        </a>
        <p style={{ fontSize: 'var(--text-caption)', color: 'rgba(245,237,228,0.60)', marginBottom: 'var(--space-sm)' }}>
          Befrienders Kenya · Free · 24/7
        </p>
        <a
          href="tel:0900620800"
          style={{ display: 'block', fontSize: 26, fontWeight: 600, color: 'var(--color-accent)', textDecoration: 'none', marginBottom: 2, fontFamily: 'var(--font-ui)' }}
          aria-label="Call Niskize: 0900 620 800"
        >
          0900 620 800
        </a>
        <p style={{ fontSize: 'var(--text-caption)', color: 'rgba(245,237,228,0.60)' }}>
          Niskize · Free · 24/7
        </p>
      </div>

      <div style={{ height: 1, background: 'rgba(245,237,228,0.12)' }} />

      {triggered ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>

          {/* Resolved state — gentle close prompt */}
          {ackStatus === 'resolved' && (
            <div style={{
              background: 'rgba(143,175,154,0.15)', border: '1px solid rgba(143,175,154,0.35)',
              borderRadius: 'var(--radius-md)', padding: '16px var(--space-md)',
              color: 'var(--color-calm)', textAlign: 'center',
            }}>
              <CheckCircle size={28} weight="duotone" style={{ marginBottom: 8 }} aria-hidden="true" />
              <p style={{ fontWeight: 600, marginBottom: 4 }}>The team has followed up on your alert.</p>
              <p style={{ fontSize: 13, opacity: 0.85 }}>Please reach out again if you need more support.</p>
            </div>
          )}

          {/* Acknowledged state — calm confirmation */}
          {ackStatus === 'acknowledged' && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              background: 'rgba(143,175,154,0.12)', border: '1px solid rgba(143,175,154,0.30)',
              borderRadius: 'var(--radius-md)', padding: '14px var(--space-md)',
              color: 'var(--color-calm)',
            }}>
              <CheckCircle size={22} weight="duotone" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
              <div>
                <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>Someone has seen this.</p>
                <p style={{ fontSize: 13, opacity: 0.85 }}>You are not alone. Stay on this screen.</p>
              </div>
            </div>
          )}

          {/* No-ack initial confirmation banner */}
          {ackStatus === null && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-sm)',
              background: 'var(--color-calm-bg)', border: '1px solid rgba(143,175,154,0.30)',
              borderRadius: 'var(--radius-md)', padding: '14px var(--space-md)',
              color: 'var(--color-calm)', fontSize: 14, fontWeight: 500,
            }}>
              <CheckCircle size={20} weight="duotone" aria-hidden="true" />
              <span>We've logged your request. Here's immediate support:</span>
            </div>
          )}

          {/* 5-min escalation — larger hotlines, bolder prompt */}
          {escalated && ackStatus === null && (
            <div style={{
              background: 'rgba(179,92,92,0.12)', border: '1px solid rgba(179,92,92,0.30)',
              borderRadius: 'var(--radius-md)', padding: '14px var(--space-md)',
            }}>
              <p style={{ fontWeight: 700, color: 'var(--color-danger)', fontSize: 14, marginBottom: 6 }}>
                No response yet — please call now.
              </p>
              <p style={{ fontSize: 13, color: 'rgba(245,237,228,0.75)', marginBottom: 12 }}>
                The line is free and available 24/7.
              </p>
              <a href="tel:0800723253" style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(245,237,228,0.08)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', textDecoration: 'none', marginBottom: 8 }}>
                <Phone size={20} weight="duotone" color="var(--color-accent)" />
                <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--color-accent)' }}>0800 723 253</span>
              </a>
              <a href="tel:0900620800" style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(245,237,228,0.08)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', textDecoration: 'none' }}>
                <Phone size={20} weight="duotone" color="var(--color-accent)" />
                <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--color-accent)' }}>0900 620 800</span>
              </a>
            </div>
          )}

          <button className="btn btn--primary" onClick={() => navigate('/ai-chat')}>
            Talk to AI right now
          </button>

          <button className="btn btn--primary" onClick={() => navigate('/breathing')}
            style={{ background: 'rgba(143,175,154,0.20)', borderColor: 'rgba(143,175,154,0.30)', color: 'var(--color-calm)' }}
          >
            <Wind size={20} weight="duotone" aria-hidden="true" />
            Try a breathing exercise
          </button>

          <button
            className="btn btn--ghost"
            onClick={() => navigate('/safety-plan')}
            style={{ color: '#F5EDE4', borderColor: 'rgba(245,237,228,0.25)' }}
          >
            <ShieldCheck size={20} weight="duotone" aria-hidden="true" />
            Open my Safety Plan
          </button>

          <button
            className="btn btn--muted"
            onClick={() => navigate('/dashboard')}
            style={{ color: '#F5EDE4', background: 'rgba(245,237,228,0.08)', borderColor: 'rgba(245,237,228,0.15)' }}
          >
            Back to home
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <button
            className="btn btn--danger"
            onClick={handleTalkNow}
            disabled={loading}
            style={{ fontSize: 'var(--text-body)' }}
          >
            <Siren size={20} weight="duotone" aria-hidden="true" />
            {loading ? 'Connecting…' : 'I need support right now'}
          </button>

          <button
            className="btn btn--ghost"
            onClick={() => navigate('/breathing')}
            style={{ color: '#F5EDE4', borderColor: 'rgba(245,237,228,0.25)' }}
          >
            <Wind size={20} weight="duotone" aria-hidden="true" />
            Try a breathing exercise first
          </button>

          <button
            style={{
              background: 'none', border: 'none', color: 'var(--color-accent)',
              fontSize: 14, fontWeight: 500, cursor: 'pointer', padding: 'var(--space-sm)',
              textDecoration: 'underline', textDecorationColor: 'rgba(194,164,138,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 'var(--space-xs)', minHeight: 'var(--touch-target-min)',
            }}
            onClick={() => navigate('/safety-plan')}
          >
            <ShieldCheck size={16} weight="duotone" aria-hidden="true" />
            Open my Safety Plan
          </button>
        </div>
      )}
    </div>
  );
}
