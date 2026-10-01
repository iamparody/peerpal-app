import { useEffect, useRef, useState, useCallback } from 'react';
import { Microphone, MicrophoneSlash, VideoCamera, VideoCameraSlash, PhoneDisconnect } from '@phosphor-icons/react';
import client from '../api/client';

const _apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const WS_URL  = _apiUrl.replace(/^https/, 'wss').replace(/^http/, 'ws');

function ControlBtn({ onClick, active, label, children }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        width: 52, height: 52, borderRadius: '50%', border: 'none', cursor: 'pointer',
        background: active ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {children}
    </button>
  );
}

export default function SessionRoom({ booking, sessionData, onEnd }) {
  const localVideoRef   = useRef(null);
  const remoteVideoRef  = useRef(null);
  const pcRef           = useRef(null);
  const wsRef           = useRef(null);
  const localStreamRef  = useRef(null);
  const iceQueueRef     = useRef([]);
  const remoteDescSet   = useRef(false);
  const didSendOffer    = useRef(false);

  const [muted,     setMuted]     = useState(false);
  const [videoOff,  setVideoOff]  = useState(false);
  const [connState, setConnState] = useState('waiting'); // waiting | connecting | active | error
  const [elapsed,   setElapsed]   = useState(0);
  const timerRef = useRef(null);

  const isVideo = booking.session_format === 'video';

  const end = useCallback(async () => {
    clearInterval(timerRef.current);
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    pcRef.current?.close();
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'end' }));
      wsRef.current.close();
    }
    try {
      await client.post(`/api/therapy/sessions/${sessionData.session_id}/end`);
    } catch { /* server-side cron also closes stale sessions */ }
    onEnd();
  }, [sessionData.session_id, onEnd]);

  useEffect(() => {
    let pc;

    async function init() {
      const iceServers = sessionData.turn_credentials?.ice_servers?.length
        ? sessionData.turn_credentials.ice_servers
        : [{ urls: 'stun:stun.l.google.com:19302' }];
      console.log('[SessionRoom] ICE servers:', JSON.stringify(iceServers));

      const constraints = isVideo ? { audio: true, video: { facingMode: 'user' } } : { audio: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;

      if (isVideo && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        localVideoRef.current.play().catch(() => {});
      }

      pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      pc.ontrack = e => {
        if (isVideo && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = e.streams[0];
          remoteVideoRef.current.play().catch(() => {});
        }
        setConnState('active');
        timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
      };

      pc.onicecandidate = e => {
        if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'ice', candidate: e.candidate }));
        }
      };

      async function flushIce() {
        while (iceQueueRef.current.length) {
          await pc.addIceCandidate(new RTCIceCandidate(iceQueueRef.current.shift())).catch(() => {});
        }
        remoteDescSet.current = true;
      }

      async function sendOffer() {
        if (didSendOffer.current) return;
        didSendOffer.current = true;
        setConnState('connecting');
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        wsRef.current?.send(JSON.stringify({ type: 'offer', sdp: offer }));
      }

      const ws = new WebSocket(`${WS_URL}/ws/signal`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'join',
          session_id: `therapy:${booking.id}`,
          role: 'therapist',
        }));
      };

      ws.onmessage = async e => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'joined') {
          if (msg.other_connected) await sendOffer();
        } else if (msg.type === 'peer_joined') {
          await sendOffer();
        } else if (msg.type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          await flushIce();
        } else if (msg.type === 'ice') {
          if (remoteDescSet.current) {
            await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
          } else {
            iceQueueRef.current.push(msg.candidate);
          }
        } else if (msg.type === 'peer_left') {
          setConnState('waiting');
        } else if (msg.type === 'error') {
          setConnState('error');
        }
      };

      ws.onerror = () => setConnState('error');
    }

    init().catch(err => {
      console.error('[SessionRoom] init error', err);
      setConnState('error');
    });

    return () => {
      clearInterval(timerRef.current);
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      pcRef.current?.close();
      wsRef.current?.close();
    };
  }, []);

  function toggleMute() {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setMuted(m => !m);
  }

  function toggleVideo() {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setVideoOff(v => !v);
  }

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timerStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const stateLabel = {
    waiting:    'Waiting for member to join…',
    connecting: 'Connecting…',
    active:     null,
    error:      'Connection failed. Ask the member to rejoin.',
  }[connState];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', flexDirection: 'column', background: '#111' }}>
      {isVideo ? (
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <video ref={remoteVideoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} playsInline autoPlay />

          {stateLabel && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', gap: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', border: '3px solid #fff', borderTopColor: '#4ade80', animation: connState !== 'error' ? 'spin 1s linear infinite' : 'none' }} />
              <p style={{ color: '#fff', fontSize: '0.88rem', textAlign: 'center', maxWidth: 260 }}>{stateLabel}</p>
            </div>
          )}

          <video ref={localVideoRef} style={{ position: 'absolute', bottom: 80, right: 16, width: 90, height: 120, objectFit: 'cover', borderRadius: 8, border: '2px solid #fff' }} playsInline autoPlay muted />

          <div style={{ position: 'absolute', top: 16, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
            <div style={{ background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '4px 16px', borderRadius: 20, fontSize: '0.88rem', fontWeight: 700 }}>
              {timerStr}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#1a1a2e', gap: 24 }}>
          <div style={{ width: 96, height: 96, borderRadius: '50%', background: '#4ade80', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: connState === 'active' ? 'pulse 2s ease-in-out infinite' : 'none' }}>
            <svg width="40" height="32" viewBox="0 0 40 32" fill="none">
              {[4, 10, 16, 22, 28, 34].map((x, i) => (
                <rect key={i} x={x} y={16 - [6,10,14,14,10,6][i]} width="3" height={[12,20,28,28,20,12][i]} rx="2" fill="#fff" opacity="0.9" />
              ))}
            </svg>
          </div>
          {stateLabel
            ? <p style={{ color: '#fff', fontSize: '0.9rem' }}>{stateLabel}</p>
            : <p style={{ color: '#fff', fontWeight: 600 }}>In session · {timerStr}</p>
          }
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 24, padding: '16px 0 32px', background: isVideo ? 'rgba(0,0,0,0.85)' : '#0d0d1a' }}>
        <ControlBtn onClick={toggleMute} active={muted} label={muted ? 'Unmute' : 'Mute'}>
          {muted ? <MicrophoneSlash size={22} color="#fff" /> : <Microphone size={22} color="#fff" />}
        </ControlBtn>
        {isVideo && (
          <ControlBtn onClick={toggleVideo} active={videoOff} label={videoOff ? 'Show video' : 'Hide video'}>
            {videoOff ? <VideoCameraSlash size={22} color="#fff" /> : <VideoCamera size={22} color="#fff" />}
          </ControlBtn>
        )}
        <button
          onClick={end}
          aria-label="End session"
          style={{ width: 60, height: 60, borderRadius: '50%', background: '#c0392b', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <PhoneDisconnect size={26} color="#fff" />
        </button>
      </div>

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
      `}</style>
    </div>
  );
}
