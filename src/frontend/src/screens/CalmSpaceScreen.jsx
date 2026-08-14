import { useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Robot, Quotes, Wind, MusicNotes, Warning } from '@phosphor-icons/react';
import client from '../api/client';

const MAX_VENT = 2000;

export default function CalmSpaceScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { topicLabel, topicSlug } = location.state || {};

  const [view, setView] = useState('menu'); // 'menu' | 'vent'
  const [ventText, setVentText] = useState('');
  const [ventLoading, setVentLoading] = useState(false);
  const [ventId, setVentId] = useState(null);
  const [ventSaved, setVentSaved] = useState(false);
  const [promoted, setPromoted] = useState(false);
  const [promoteLoading, setPromoteLoading] = useState(false);
  const textareaRef = useRef(null);

  async function handleVentSave() {
    if (!ventText.trim() || ventLoading) return;
    setVentLoading(true);
    try {
      const { data } = await client.post('/api/vents', { content: ventText.trim() });
      setVentId(data.vent_id);
      setVentSaved(true);
    } catch {
      // still clear the field — the act of writing was the point
      setVentSaved(true);
    } finally {
      setVentLoading(false);
    }
  }

  async function handlePromote() {
    if (!ventId || promoteLoading) return;
    setPromoteLoading(true);
    try {
      await client.post(`/api/vents/${ventId}/promote`);
      setPromoted(true);
    } catch {
      setPromoted(true);
    } finally {
      setPromoteLoading(false);
    }
  }

  function handleTalkToAI() {
    navigate('/ai-chat', {
      state: { peerContext: { context: 'peer_unavailable', topic_label: topicLabel || '' } },
    });
  }

  const TILES = [
    {
      id: 'talk',
      icon: Robot,
      label: 'Talk',
      desc: 'Your AI companion is here now',
      action: handleTalkToAI,
    },
    {
      id: 'vent',
      icon: Quotes,
      label: 'Let it out',
      desc: 'Private — no one will see it',
      action: () => { setView('vent'); setTimeout(() => textareaRef.current?.focus(), 80); },
    },
    {
      id: 'breathe',
      icon: Wind,
      label: 'Breathe',
      desc: 'Guided breathing and grounding',
      action: () => navigate('/breathing'),
    },
    {
      id: 'sounds',
      icon: MusicNotes,
      label: 'Something quiet',
      desc: 'Calming sounds and ambient audio',
      action: () => navigate('/sounds'),
    },
  ];

  if (view === 'vent') {
    return (
      <div className="screen screen--no-nav" style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <div className="page-header" style={{ flexShrink: 0 }}>
          <button className="page-header__back" onClick={() => { setView('menu'); setVentText(''); setVentSaved(false); setPromoted(false); setVentId(null); }} aria-label="Back">‹</button>
          <h2 className="page-header__title">Let it out</h2>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px 20px 32px', gap: 16 }}>
          {!ventSaved ? (
            <>
              <div>
                <p style={{ fontSize: '0.95rem', fontFamily: 'var(--font-editorial)', lineHeight: 1.5, marginBottom: 4 }}>
                  Just say what's on your mind.
                </p>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  This is private. No one will see it.
                </p>
              </div>

              <textarea
                ref={textareaRef}
                value={ventText}
                onChange={e => setVentText(e.target.value.slice(0, MAX_VENT))}
                placeholder="I'm feeling…"
                rows={10}
                style={{
                  width: '100%', flex: 1,
                  padding: '14px', borderRadius: 'var(--radius-md)',
                  border: '1.5px solid var(--color-border)',
                  background: 'var(--color-surface-card)',
                  color: 'var(--color-text-primary)',
                  fontSize: '0.9rem', lineHeight: 1.6,
                  resize: 'none', fontFamily: 'inherit',
                  outline: 'none', boxSizing: 'border-box',
                }}
                aria-label="Vent text"
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                  {ventText.length}/{MAX_VENT}
                </span>
                <button
                  className="btn btn--primary"
                  onClick={handleVentSave}
                  disabled={!ventText.trim() || ventLoading}
                  style={{ minWidth: 120 }}
                >
                  {ventLoading ? 'Saving…' : 'Let it out'}
                </button>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, textAlign: 'center' }}>
              <div style={{ fontSize: 48 }}>🌿</div>
              <div>
                <p style={{ fontFamily: 'var(--font-editorial)', fontSize: '1.1rem', marginBottom: 6 }}>
                  You got it out.
                </p>
                <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                  That took courage. You can move on whenever you're ready.
                </p>
              </div>

              {!promoted && ventId && (
                <button
                  onClick={handlePromote}
                  disabled={promoteLoading}
                  style={{
                    background: 'none', border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)', padding: '8px 16px',
                    fontSize: '0.82rem', color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  {promoteLoading ? 'Saving…' : 'Save this to my journal'}
                </button>
              )}
              {promoted && (
                <p style={{ fontSize: '0.8rem', color: 'var(--color-calm)' }}>Saved to your journal.</p>
              )}

              <button className="btn btn--primary" onClick={() => setView('menu')} style={{ marginTop: 8 }}>
                What's next?
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="screen screen--no-nav" style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <div className="page-header" style={{ flexShrink: 0 }}>
        <button className="page-header__back" onClick={() => navigate('/peer', { replace: true })} aria-label="Back">‹</button>
        <h2 className="page-header__title">Your calm space</h2>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px 20px 0' }}>
        {/* Heading */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontFamily: 'var(--font-editorial)', fontSize: '1.3rem', lineHeight: 1.35, marginBottom: 6 }}>
            You don't have to handle this alone.
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            No peer was available right now — your credits have been refunded. What would help?
          </p>
        </div>

        {/* 4 option tiles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {TILES.map(({ id, icon: Icon, label, desc, action }) => (
            <button
              key={id}
              onClick={action}
              style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '16px 18px',
                background: 'var(--color-surface-card)',
                border: '1.5px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                cursor: 'pointer', textAlign: 'left', width: '100%',
                transition: 'border-color 150ms ease, background 150ms ease',
              }}
            >
              <Icon size={28} weight="duotone" color="var(--color-calm)" style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-text-primary)', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Persistent footer */}
      <div style={{
        padding: '16px 20px 32px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
      }}>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate('/peer', { state: topicSlug ? { prefillTopic: topicSlug, prefillTopicLabel: topicLabel } : undefined })}
            style={{ background: 'none', border: 'none', fontSize: '0.8rem', color: 'var(--color-text-muted)', cursor: 'pointer', textDecoration: 'underline', padding: '2px 0' }}
          >
            Try peer support again
          </button>
          <span style={{ color: 'var(--color-border)', fontSize: '0.8rem' }}>·</span>
          <button
            onClick={() => navigate('/dashboard')}
            style={{ background: 'none', border: 'none', fontSize: '0.8rem', color: 'var(--color-text-muted)', cursor: 'pointer', textDecoration: 'underline', padding: '2px 0' }}
          >
            Go to dashboard
          </button>
        </div>
        <button
          onClick={() => navigate('/emergency')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '0.78rem', color: 'var(--color-warning)', padding: '2px 0',
          }}
        >
          <Warning size={13} weight="fill" />
          Need immediate help?
        </button>
      </div>
    </div>
  );
}
