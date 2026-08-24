import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Robot, Quotes, Wind, MusicNotes, Warning, Microphone, Stop } from '@phosphor-icons/react';
import client from '../api/client';

const MAX_VENT = 2000;
const MAX_RECORD_MS = 5 * 60 * 1000; // 5 minutes

export default function CalmSpaceScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { topicLabel, topicSlug } = location.state || {};

  // 'menu' | 'vent-choice' | 'vent-voice' | 'vent-text' | 'vent-done'
  const [view, setView] = useState('menu');

  // Text vent
  const [ventText, setVentText] = useState('');
  const [ventLoading, setVentLoading] = useState(false);
  const [ventId, setVentId] = useState(null);
  const [promoted, setPromoted] = useState(false);
  const [promoteLoading, setPromoteLoading] = useState(false);
  const textareaRef = useRef(null);

  // Voice vent
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState('');
  const [transcript, setTranscript] = useState('');
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const recordTimerRef = useRef(null);
  const autoStopRef = useRef(null);

  useEffect(() => () => {
    clearInterval(recordTimerRef.current);
    clearTimeout(autoStopRef.current);
    mediaRecorderRef.current?.stream?.getTracks().forEach(t => t.stop());
  }, []);

  function handleTalkToAI() {
    navigate('/ai-chat', {
      state: { peerContext: { context: 'peer_unavailable', topic_label: topicLabel || '' } },
    });
  }

  // ── Voice recording ─────────────────────────────────────────────────────────
  async function startRecording() {
    setTranscribeError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: getSupportedMimeType() });
      mediaRecorderRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start(200);
      setRecording(true);
      setRecordSeconds(0);

      recordTimerRef.current = setInterval(() => setRecordSeconds(s => s + 1), 1000);
      autoStopRef.current = setTimeout(() => stopRecording(), MAX_RECORD_MS);
    } catch {
      setTranscribeError('Microphone access is required. Please allow it and try again.');
    }
  }

  async function stopRecording() {
    clearInterval(recordTimerRef.current);
    clearTimeout(autoStopRef.current);
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state === 'inactive') return;

    await new Promise(resolve => {
      mr.onstop = resolve;
      mr.stop();
    });
    mr.stream.getTracks().forEach(t => t.stop());
    setRecording(false);
    await transcribeAudio();
  }

  async function transcribeAudio() {
    setTranscribing(true);
    setTranscribeError('');
    const mimeType = getSupportedMimeType();
    const blob = new Blob(chunksRef.current, { type: mimeType });

    const form = new FormData();
    form.append('audio', blob, `vent.${mimeType.split('/')[1]?.split(';')[0] || 'webm'}`);

    try {
      const { data } = await client.post('/api/vents/transcribe', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      });
      setTranscript(data.text || '');
      setView('vent-done');
    } catch {
      setTranscribeError('Transcription failed — your words are still here. Try again or type below.');
      setTranscribing(false);
    }
  }

  // ── Save vent (text or transcript) ─────────────────────────────────────────
  async function saveVent(text) {
    setVentLoading(true);
    try {
      const { data } = await client.post('/api/vents', { content: text.trim() });
      setVentId(data.vent_id);
    } catch {
      // saving failed — act of letting out was still the point
    } finally {
      setVentLoading(false);
    }
  }

  async function handleLetItGo() {
    await saveVent(transcript || ventText);
    setView('vent-done');
    setVentId(null); // discarded — not saved to journal
  }

  async function handleSaveToJournal() {
    const text = transcript || ventText;
    setVentLoading(true);
    try {
      const { data } = await client.post('/api/vents', { content: text.trim() });
      const vid = data.vent_id;
      if (vid) {
        setPromoteLoading(true);
        try { await client.post(`/api/vents/${vid}/promote`); setPromoted(true); } catch { setPromoted(true); }
        finally { setPromoteLoading(false); }
      }
    } catch { /* best-effort */ }
    finally { setVentLoading(false); }
  }

  async function handleTextVentSave() {
    if (!ventText.trim() || ventLoading) return;
    setVentLoading(true);
    try {
      const { data } = await client.post('/api/vents', { content: ventText.trim() });
      setVentId(data.vent_id);
    } catch { /* still show done */ }
    finally {
      setVentLoading(false);
      setView('vent-done');
    }
  }

  async function handlePromote() {
    if (!ventId || promoteLoading) return;
    setPromoteLoading(true);
    try { await client.post(`/api/vents/${ventId}/promote`); setPromoted(true); }
    catch { setPromoted(true); }
    finally { setPromoteLoading(false); }
  }

  function resetVent() {
    setView('menu');
    setVentText('');
    setVentId(null);
    setPromoted(false);
    setTranscript('');
    setTranscribing(false);
    setTranscribeError('');
    setRecordSeconds(0);
  }

  // ── Views ───────────────────────────────────────────────────────────────────

  // After voice transcription or text save
  if (view === 'vent-done') {
    const savedText = transcript || ventText;
    return (
      <div className="screen screen--no-nav" style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <div className="page-header" style={{ flexShrink: 0 }}>
          <button className="page-header__back" onClick={resetVent} aria-label="Back">‹</button>
          <h2 className="page-header__title">Let it out</h2>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 24px 40px', gap: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 48 }}>🌿</div>
          <div>
            <p style={{ fontFamily: 'var(--font-editorial)', fontSize: '1.1rem', marginBottom: 6 }}>
              You got it out.
            </p>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
              That took courage. You can move on whenever you're ready.
            </p>
          </div>

          {savedText.trim().length > 0 && (
            <div style={{ background: 'rgba(194,164,138,0.08)', borderRadius: 'var(--radius-md)', padding: '12px 16px', width: '100%', maxWidth: 340 }}>
              <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', lineHeight: 1.6, fontStyle: 'italic', textAlign: 'left' }}>
                "{savedText.trim().slice(0, 160)}{savedText.trim().length > 160 ? '…' : ''}"
              </p>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 340 }}>
            {!promoted && (
              <button
                onClick={handleSaveToJournal}
                disabled={ventLoading || promoteLoading}
                style={{
                  padding: '14px 20px', background: 'var(--color-surface-card)', border: 'none',
                  borderRadius: 'var(--radius-md)', cursor: 'pointer', width: '100%',
                  fontWeight: 700, fontSize: '0.95rem', color: '#F5EDE4',
                }}
              >
                {promoteLoading ? 'Saving…' : 'Save to journal'}
              </button>
            )}
            {promoted && (
              <p style={{ fontSize: '0.8rem', color: 'var(--color-calm)' }}>Saved to your journal.</p>
            )}
            <button
              onClick={resetVent}
              style={{
                padding: '14px 20px', background: 'none', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)', cursor: 'pointer', width: '100%',
                fontSize: '0.9rem', color: 'var(--color-text-muted)',
              }}
            >
              What's next?
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Voice recording screen
  if (view === 'vent-voice') {
    const mins = Math.floor(recordSeconds / 60);
    const secs = recordSeconds % 60;
    const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    return (
      <div className="screen screen--no-nav" style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <div className="page-header" style={{ flexShrink: 0 }}>
          <button className="page-header__back" onClick={() => { if (!recording && !transcribing) { mediaRecorderRef.current?.stream?.getTracks().forEach(t => t.stop()); setView('vent-choice'); } }} aria-label="Back">‹</button>
          <h2 className="page-header__title">Let it out</h2>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 24px 48px', gap: 28, textAlign: 'center' }}>
          {transcribing ? (
            <>
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(143,175,154,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', border: '3px solid var(--color-calm)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
              </div>
              <p style={{ fontSize: '1rem', fontFamily: 'var(--font-editorial)' }}>Transcribing your words…</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Usually takes 2–5 seconds.</p>
            </>
          ) : (
            <>
              <div>
                <p style={{ fontSize: '0.95rem', fontFamily: 'var(--font-editorial)', marginBottom: 4 }}>
                  {recording ? 'Speak freely. No one is listening.' : 'Press record when ready.'}
                </p>
                <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>Private — voice is not stored.</p>
              </div>

              {/* Record button */}
              <button
                onClick={recording ? stopRecording : startRecording}
                style={{
                  width: 96, height: 96, borderRadius: '50%',
                  background: recording ? 'var(--color-danger)' : 'var(--color-surface-card)',
                  border: recording ? 'none' : '3px solid var(--color-border-focus)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: recording ? '0 0 0 8px rgba(179,92,92,0.20)' : 'none',
                  transition: 'all 250ms ease',
                }}
                aria-label={recording ? 'Stop recording' : 'Start recording'}
              >
                {recording
                  ? <Stop size={36} weight="fill" color="#F5EDE4" />
                  : <Microphone size={36} weight="duotone" color="var(--color-accent)" />
                }
              </button>

              {recording && (
                <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-danger)', letterSpacing: 2 }}>
                  {timeStr}
                </div>
              )}

              {transcribeError && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 320 }}>
                  <p style={{ fontSize: '0.82rem', color: 'var(--color-danger)', lineHeight: 1.5 }}>{transcribeError}</p>
                  <button
                    onClick={() => setView('vent-text')}
                    style={{
                      padding: '12px 20px', background: 'none', border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)', cursor: 'pointer',
                      fontSize: '0.88rem', color: 'var(--color-text-secondary)',
                    }}
                  >
                    Type instead
                  </button>
                </div>
              )}

              {!transcribeError && !recording && (
                <button
                  onClick={() => setView('vent-choice')}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: '0.8rem', color: 'var(--color-text-muted)', textDecoration: 'underline',
                  }}
                >
                  Prefer typing?
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // Vent mode choice screen
  if (view === 'vent-choice') {
    return (
      <div className="screen screen--no-nav" style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
        <div className="page-header" style={{ flexShrink: 0 }}>
          <button className="page-header__back" onClick={() => setView('menu')} aria-label="Back">‹</button>
          <h2 className="page-header__title">Let it out</h2>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px 48px', gap: 32 }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '1rem', fontFamily: 'var(--font-editorial)', lineHeight: 1.5, marginBottom: 6 }}>
              How do you want to let it out?
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Private — no one will see it.</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 320 }}>
            <button
              onClick={() => setView('vent-voice')}
              style={{
                padding: '20px', background: 'var(--color-surface-card)', border: 'none',
                borderRadius: 'var(--radius-md)', cursor: 'pointer', width: '100%',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#F5EDE4', marginBottom: 4 }}>Voice</div>
              <div style={{ fontSize: '0.78rem', color: 'rgba(245,237,228,0.60)' }}>Record and speak freely</div>
            </button>
            <button
              onClick={() => setView('vent-text')}
              style={{
                padding: '20px', background: 'var(--color-surface-card)', border: 'none',
                borderRadius: 'var(--radius-md)', cursor: 'pointer', width: '100%',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#F5EDE4', marginBottom: 4 }}>Write</div>
              <div style={{ fontSize: '0.78rem', color: 'rgba(245,237,228,0.60)' }}>Type what's on your mind</div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Text vent screen
  if (view === 'vent-text') {
    return (
      <div className="screen screen--no-nav" style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
        <div className="page-header" style={{ flexShrink: 0 }}>
          <button className="page-header__back" onClick={() => setView('vent-choice')} aria-label="Back">‹</button>
          <h2 className="page-header__title">Let it out</h2>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
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
            style={{
              width: '100%',
              minHeight: 200,
              padding: '14px', borderRadius: 'var(--radius-md)',
              border: '1.5px solid var(--color-border)',
              background: 'var(--color-surface-card)',
              color: 'var(--color-text-primary)',
              fontSize: '0.9rem', lineHeight: 1.6,
              resize: 'vertical', fontFamily: 'inherit',
              outline: 'none', boxSizing: 'border-box',
            }}
            aria-label="Vent text"
          />
        </div>
        <div style={{
          flexShrink: 0, padding: '12px 20px calc(16px + env(safe-area-inset-bottom))',
          borderTop: '1px solid var(--color-divider)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'var(--color-bg-primary)',
        }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>{ventText.length}/{MAX_VENT}</span>
          <button
            className="btn btn--primary"
            onClick={handleTextVentSave}
            disabled={!ventText.trim() || ventLoading}
            style={{ width: 'auto', minWidth: 120 }}
          >
            {ventLoading ? 'Saving…' : 'Let it out'}
          </button>
        </div>
      </div>
    );
  }

  // ── Menu (default) ──────────────────────────────────────────────────────────
  const TILES = [
    { id: 'talk',    label: 'Talk',            desc: 'Your AI companion is here now',     action: handleTalkToAI },
    { id: 'vent',    label: 'Let it out',       desc: 'Private — no one will see it',      action: () => setView('vent-choice') },
    { id: 'breathe', label: 'Breathe',          desc: 'Guided breathing and grounding',    action: () => navigate('/breathing') },
    { id: 'sounds',  label: 'Something quiet',  desc: 'Calming sounds and ambient audio',  action: () => navigate('/sounds') },
  ];

  return (
    <div className="screen screen--no-nav" style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '48px 24px 0' }}>
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontFamily: 'var(--font-editorial)', fontSize: '1.3rem', lineHeight: 1.35, marginBottom: 8 }}>
            You don't have to handle this alone.
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            No peer was available right now — your credits have been refunded. What would help?
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {TILES.map(({ id, label, desc, action }) => (
            <button
              key={id}
              onClick={action}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                padding: '18px 20px',
                background: 'var(--color-surface-card)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer', textAlign: 'left', width: '100%',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: '1rem', color: '#F5EDE4', marginBottom: 3 }}>{label}</span>
              <span style={{ fontSize: '0.78rem', color: 'rgba(245,237,228,0.60)' }}>{desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '20px 24px 36px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
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

function getSupportedMimeType() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  return types.find(t => MediaRecorder.isTypeSupported(t)) || 'audio/webm';
}
