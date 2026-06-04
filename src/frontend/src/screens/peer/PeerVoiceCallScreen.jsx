import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import client from '../../api/client';
import { trackEvent } from '../../utils/analytics';

function ReportModal({ sessionId, onClose }) {
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (description.trim().length < 10) { setError('Please describe what happened (at least 10 characters).'); return; }
    setSubmitting(true);
    setError('');
    try {
      await client.post('/api/peer/report', { session_id: sessionId, channel: 'voice', description: description.trim() });
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not submit report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ background: 'var(--color-surface-card)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', padding: 'var(--space-lg)', width: '100%', maxHeight: '80vh', overflowY: 'auto' }}>
        {submitted ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-lg) 0' }}>
            <div style={{ fontSize: 36, marginBottom: 'var(--space-sm)' }}>✅</div>
            <h3 style={{ marginBottom: 'var(--space-xs)' }}>Report submitted</h3>
            <p style={{ fontSize: 14, color: 'var(--color-text-muted)', marginBottom: 'var(--space-lg)' }}>Our team will review it. Thank you for keeping this space safe.</p>
            <button className="btn btn--primary" onClick={onClose}>Done</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h3 style={{ marginBottom: 'var(--space-xs)' }}>Report this call</h3>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 'var(--space-md)' }}>
              Describe what happened during the call. Include as much detail as you remember.
            </p>
            <textarea
              className="textarea"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what the peer said or did that violated the community guidelines…"
              style={{ marginBottom: 'var(--space-sm)' }}
            />
            {error && <p style={{ fontSize: 13, color: 'var(--color-danger)', marginBottom: 'var(--space-sm)' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <button type="submit" className="btn btn--danger" style={{ flex: 1, animation: 'none' }} disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit Report'}
              </button>
              <button type="button" className="btn btn--muted" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
const SESSION_SECONDS = 30 * 60;

function formatTime(seconds) {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.max(0, seconds) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function PeerVoiceCallScreen() {
  const { id: sessionId } = useParams();
  const navigate = useNavigate();
  const [callState, setCallState] = useState('connecting');
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(SESSION_SECONDS);
  const [showExtendPrompt, setShowExtendPrompt] = useState(false);
  const [extending, setExtending] = useState(false);
  const [extendError, setExtendError] = useState('');
  const [sessionEnded, setSessionEnded] = useState(false);
  const [showReport, setShowReport] = useState(false);

  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const isInitiator = useRef(false);
  const requestIdRef = useRef(null);
  const endTimeRef = useRef(null);
  const timerRef = useRef(null);
  const promptShownRef = useRef(false);

  const endCall = useCallback(async (reason = 'manual') => {
    clearInterval(timerRef.current);
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    pcRef.current?.close();
    wsRef.current?.close();
    const reqId = requestIdRef.current;
    if (reqId && reason === 'manual') {
      try { await client.patch(`/api/peer/request/${reqId}/close`); } catch { /* best-effort */ }
    }
    trackEvent('peer_session_completed', { channel: 'voice', reason });
    if (reason === 'time_limit') {
      setSessionEnded(true);
    } else {
      navigate('/peer', { replace: true });
    }
  }, [navigate]);

  function startTimer(endTime) {
    endTimeRef.current = endTime;
    promptShownRef.current = false;
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const secs = Math.round((endTimeRef.current - Date.now()) / 1000);
      setSecondsLeft(secs);
      if (secs <= 300 && !promptShownRef.current) {
        promptShownRef.current = true;
        setShowExtendPrompt(true);
      }
      if (secs <= 0) {
        clearInterval(timerRef.current);
        endCall('time_limit');
      }
    }, 1000);
  }

  useEffect(() => {
    let pc;
    async function init() {
      try {
        const { data } = await client.get(`/api/peer/session/${sessionId}`);
        requestIdRef.current = data.session?.request_id ?? null;

        const startedAt = data.session?.started_at ? new Date(data.session.started_at) : new Date();
        startTimer(startedAt.getTime() + SESSION_SECONDS * 1000);

        const iceServers = data.ice_servers || [{ urls: 'stun:stun.l.google.com:19302' }];
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;

        pc = new RTCPeerConnection({ iceServers });
        pcRef.current = pc;
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));

        pc.ontrack = (e) => {
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = e.streams[0];
            remoteAudioRef.current.play().catch(() => {});
          }
          setCallState('active');
        };

        const ws = new WebSocket(`${WS_URL}/ws/signal?session=${sessionId}`);
        wsRef.current = ws;

        ws.onopen = () => { ws.send(JSON.stringify({ type: 'join', session_id: sessionId })); };

        ws.onmessage = async (e) => {
          const msg = JSON.parse(e.data);
          if (msg.type === 'peer_joined') {
            isInitiator.current = true;
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            ws.send(JSON.stringify({ type: 'offer', sdp: offer, session_id: sessionId }));
          } else if (msg.type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            ws.send(JSON.stringify({ type: 'answer', sdp: answer, session_id: sessionId }));
          } else if (msg.type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          } else if (msg.type === 'ice') {
            await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
          } else if (msg.type === 'peer_left') {
            setCallState('ended');
          }
        };

        pc.onicecandidate = (e) => {
          if (e.candidate && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ice', candidate: e.candidate, session_id: sessionId }));
          }
        };
      } catch (err) {
        if (err.name === 'NotAllowedError') {
          setError('Microphone permission is required for voice calls.');
        } else {
          setError('Could not establish voice call. Please try again.');
        }
      }
    }

    init();
    return () => {
      clearInterval(timerRef.current);
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      pc?.close();
      wsRef.current?.close();
    };
  }, [sessionId]);

  async function handleExtend() {
    setExtendError('');
    setExtending(true);
    try {
      const { data } = await client.post(`/api/peer/request/${requestIdRef.current}/extend`);
      setShowExtendPrompt(false);
      startTimer(new Date(data.new_end_time).getTime());
    } catch (err) {
      setExtendError(err.response?.data?.error || 'Could not extend session.');
    } finally {
      setExtending(false);
    }
  }

  function toggleMute() {
    if (!localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = muted; });
    setMuted((m) => !m);
  }

  if (sessionEnded) {
    return (
      <div className="screen screen--no-nav" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 32, textAlign: 'center', gap: 16 }}>
        <div style={{ fontSize: 40 }}>🕐</div>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Call time ended</h2>
        <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', maxWidth: 280, lineHeight: 1.6 }}>
          Your 30-minute voice call has ended. You can start a new session any time.
        </p>
        <div style={{ padding: '14px 16px', background: 'var(--color-calm-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-calm)', width: '100%', maxWidth: 320 }}>
          <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-calm)', marginBottom: 4 }}>Need immediate support?</p>
          <p style={{ fontSize: '0.85rem' }}>Befrienders Kenya</p>
          <a href="tel:0800723253" style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-accent)', textDecoration: 'none' }}>0800 723 253</a>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4 }}>Free · 24/7</p>
        </div>
        <button className="btn btn--primary" style={{ maxWidth: 320, width: '100%' }} onClick={() => navigate('/peer', { replace: true })}>
          Back to Peer Support
        </button>
        <button className="btn btn--secondary" style={{ maxWidth: 320, width: '100%' }} onClick={() => navigate('/emergency')}>
          Emergency SOS
        </button>
        <button
          className="btn btn--muted"
          style={{ maxWidth: 320, width: '100%', fontSize: 13 }}
          onClick={() => setShowReport(true)}
        >
          Report this session
        </button>
      </div>
      {showReport && <ReportModal sessionId={sessionId} onClose={() => setShowReport(false)} />}
    );
  }

  if (error) {
    return (
      <div className="screen screen--no-nav" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <p style={{ marginBottom: 16 }}>{error}</p>
        <button className="btn btn--primary" onClick={() => navigate('/peer')}>Back</button>
      </div>
    );
  }

  const isLow = secondsLeft <= 300;

  return (
    <div className="screen screen--no-nav" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'var(--color-bg-deep)', minHeight: '100dvh', padding: 'var(--space-xl)' }}>
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />

      {/* Timer */}
      <div style={{
        position: 'absolute', top: 20, right: 20,
        fontSize: '1.1rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
        color: isLow ? 'var(--color-danger)' : 'rgba(245,237,228,0.70)',
        transition: 'color 300ms',
      }}>
        {formatTime(secondsLeft)}
      </div>

      {/* Extension prompt */}
      {showExtendPrompt && (
        <div style={{
          position: 'absolute', top: 60, left: 16, right: 16,
          padding: '14px 16px',
          background: isLow ? 'rgba(179,92,92,0.15)' : 'rgba(217,164,65,0.15)',
          border: `1px solid ${isLow ? 'var(--color-danger)' : 'var(--color-warning)'}`,
          borderRadius: 'var(--radius-md)',
        }}>
          <p style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8, color: isLow ? 'var(--color-danger)' : 'var(--color-warning)' }}>
            Call ending in {Math.ceil(secondsLeft / 60)} min — extend for 2 credits?
          </p>
          {extendError && <p style={{ fontSize: '0.78rem', color: 'var(--color-danger)', marginBottom: 6 }}>{extendError}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleExtend} disabled={extending} className="btn btn--success btn--sm" style={{ flex: 1 }}>
              {extending ? '…' : 'Extend (+30 min)'}
            </button>
            <button onClick={() => setShowExtendPrompt(false)} className="btn btn--secondary btn--sm" style={{ flex: 1 }}>
              No thanks
            </button>
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center', marginBottom: 'var(--space-2xl)' }}>
        <div style={{ fontSize: 64, marginBottom: 'var(--space-md)' }}>🎙️</div>
        <h2 style={{ marginBottom: 'var(--space-sm)' }}>
          {callState === 'connecting' ? 'Connecting…' : callState === 'active' ? 'Voice Call' : 'Call Ended'}
        </h2>
        <p style={{ fontSize: '0.9rem' }}>
          {callState === 'active' ? 'Anonymous · Peer' : callState === 'connecting' ? 'Establishing connection…' : 'Your peer has left the call'}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-lg)' }}>
        <button
          onClick={toggleMute}
          style={{
            width: 64, height: 64, borderRadius: '50%',
            background: muted ? 'rgba(194,164,138,0.10)' : 'rgba(194,164,138,0.20)',
            border: '2px solid var(--color-border-focus)',
            color: 'var(--color-text-primary)', fontSize: 28, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? '🔇' : '🎙️'}
        </button>
        <button
          onClick={() => endCall('manual')}
          style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'var(--color-danger)', border: 'none',
            color: 'var(--color-text-primary)', fontSize: 28, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(179,92,92,0.45)',
          }}
          aria-label="End call"
        >
          📵
        </button>
      </div>

      {callState === 'ended' && (
        <button className="btn btn--ghost" style={{ marginTop: 'var(--space-xl)', width: 'auto', padding: '10px 24px' }} onClick={() => navigate('/peer')}>
          Back
        </button>
      )}
    </div>
  );
}
