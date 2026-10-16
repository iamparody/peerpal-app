import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Microphone, MicrophoneSlash,
  VideoCamera, VideoCameraSlash,
  PhoneDisconnect,
  SpeakerHigh, SpeakerLow, SpeakerSlash,
  CaretDown,
  NotePencil,
  Trash,
  ArrowsOut,
  WifiHigh, WifiMedium, WifiLow, WifiX,
} from '@phosphor-icons/react';
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

function DeviceSelector({ devices, current, onChange, label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function close(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (!devices.length) return <div style={{ height: 20 }} />;

  return (
    <div ref={ref} style={{ position: 'relative', height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={label}
        style={{
          width: 20, height: 20, borderRadius: 4, border: 'none', cursor: 'pointer',
          background: 'rgba(255,255,255,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 0,
        }}
      >
        <CaretDown size={11} color="#fff" />
      </button>
      {open && (
        <div style={{
          position: 'fixed', bottom: 110, left: 'auto',
          background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
          minWidth: 220, zIndex: 700, overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
        }}>
          {devices.map(d => (
            <button
              key={d.deviceId}
              onClick={() => { onChange(d.deviceId); setOpen(false); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '10px 14px', border: 'none', cursor: 'pointer',
                background: d.deviceId === current ? 'rgba(74,222,128,0.15)' : 'transparent',
                color: d.deviceId === current ? '#4ade80' : '#e5e7eb',
                fontSize: '0.82rem', lineHeight: 1.3,
              }}
            >
              {d.label || `Device ${d.deviceId.slice(0, 8)}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const NET_COLOR = { good: '#4ade80', fair: '#fbbf24', poor: '#f87171', unknown: 'rgba(255,255,255,0.3)' };

function NetIcon({ quality }) {
  const color = NET_COLOR[quality];
  if (quality === 'poor')    return <WifiLow    size={14} color={color} />;
  if (quality === 'fair')    return <WifiMedium size={14} color={color} />;
  if (quality === 'unknown') return <WifiX      size={14} color={color} />;
  return <WifiHigh size={14} color={color} />;
}

export default function SessionRoom({ booking, sessionData, onEnd }) {
  const localVideoRef     = useRef(null);
  const remoteVideoRef    = useRef(null);
  const pcRef             = useRef(null);
  const wsRef             = useRef(null);
  const localStreamRef    = useRef(null);
  const iceQueueRef       = useRef([]);
  const remoteDescSet     = useRef(false);
  const didSendOffer      = useRef(false);
  const audioCtxRef       = useRef(null);
  const speakingRafRef    = useRef(null);
  const notesDebRef       = useRef(null);
  const netPollRef        = useRef(null);
  const timerRef          = useRef(null);
  const reconnectTimerRef = useRef(null);
  const warnShownRef      = useRef(false);
  const notesTextRef      = useRef('');

  const [muted,        setMuted]        = useState(false);
  const [videoOff,     setVideoOff]     = useState(false);
  const [connState,    setConnState]    = useState('waiting');
  const [elapsed,      setElapsed]      = useState(0);
  const [quickReply,   setQuickReply]   = useState('');
  const [showWarn,     setShowWarn]     = useState(false);

  const [micDevices,      setMicDevices]      = useState([]);
  const [camDevices,      setCamDevices]      = useState([]);
  const [speakerDevices,  setSpeakerDevices]  = useState([]);
  const [activeMic,       setActiveMic]       = useState('');
  const [activeCam,       setActiveCam]       = useState('');
  const [activeSpeaker,   setActiveSpeaker]   = useState('');
  const [volume,          setVolume]          = useState(1);
  const [remoteMuted,     setRemoteMuted]     = useState(false);
  const [speaking,        setSpeaking]        = useState(false);
  const [sinkIdSupported, setSinkIdSupported] = useState(false);
  const [netQuality,      setNetQuality]      = useState('unknown');

  const [notesOpen,   setNotesOpen]   = useState(false);
  const [notesText,   setNotesText]   = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved,  setNotesSaved]  = useState(false);

  const isVideo    = booking.session_format === 'video';
  const storageKey = `session_notes_${booking.id}`;

  useEffect(() => {
    setSinkIdSupported(typeof HTMLMediaElement.prototype.setSinkId === 'function');
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) { setNotesText(saved); notesTextRef.current = saved; }
  }, [storageKey]);

  useEffect(() => {
    function onKey(e) {
      if (e.altKey && e.key === 'n') { e.preventDefault(); setNotesOpen(o => !o); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  async function loadDevices() {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setMicDevices(list.filter(d => d.kind === 'audioinput'));
      setCamDevices(list.filter(d => d.kind === 'videoinput'));
      setSpeakerDevices(list.filter(d => d.kind === 'audiooutput'));
    } catch {}
  }

  function setupSpeakingDetector(stream) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = ctx;
      const src     = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      function tick() {
        analyser.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        setSpeaking(avg > 15);
        speakingRafRef.current = requestAnimationFrame(tick);
      }
      speakingRafRef.current = requestAnimationFrame(tick);
    } catch {}
  }

  function startNetPoll(pc) {
    netPollRef.current = setInterval(async () => {
      try {
        const stats = await pc.getStats();
        let rtt = null, loss = null;
        stats.forEach(r => {
          if (r.type === 'remote-inbound-rtp' && r.kind === 'audio') {
            if (r.roundTripTime != null) rtt = r.roundTripTime;
            if (r.fractionLost  != null) loss = r.fractionLost;
          }
        });
        if (rtt !== null) {
          if (rtt > 0.3 || loss > 0.05)       setNetQuality('poor');
          else if (rtt > 0.15 || loss > 0.02) setNetQuality('fair');
          else                                 setNetQuality('good');
        }
      } catch {}
    }, 5000);
  }

  const end = useCallback(async () => {
    clearInterval(timerRef.current);
    clearTimeout(reconnectTimerRef.current);
    clearInterval(netPollRef.current);
    cancelAnimationFrame(speakingRafRef.current);
    clearTimeout(notesDebRef.current);
    // flush any unsaved keystroke before closing
    if (notesTextRef.current) localStorage.setItem(storageKey, notesTextRef.current);
    audioCtxRef.current?.close().catch(() => {});
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    pcRef.current?.close();
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'end' }));
      wsRef.current.close();
    }
    try {
      await client.post(`/api/therapy/sessions/${sessionData.session_id}/end`);
    } catch {}
    onEnd();
  }, [sessionData.session_id, storageKey, onEnd]);

  useEffect(() => {
    async function init() {
      const iceServers = sessionData.turn_credentials?.ice_servers?.length
        ? sessionData.turn_credentials.ice_servers
        : [{ urls: 'stun:stun.l.google.com:19302' }];

      const constraints = isVideo
        ? { audio: true, video: { facingMode: 'user' } }
        : { audio: true };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;

      // enumerate after permission grant so labels are populated
      await loadDevices();

      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) setActiveMic(audioTrack.getSettings().deviceId || '');
      if (isVideo) {
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) setActiveCam(videoTrack.getSettings().deviceId || '');
      }

      if (isVideo && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        localVideoRef.current.play().catch(() => {});
      }

      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      startNetPoll(pc);

      const connStateRef = { current: 'waiting' };
      function setConnStateTracked(val) {
        connStateRef.current = typeof val === 'function' ? val(connStateRef.current) : val;
        setConnState(val);
      }

      pc.ontrack = e => {
        const remoteStream = e.streams[0];
        if (!remoteStream) return;

        // guard: only attach and start timer once (ontrack fires per-track)
        if (!remoteVideoRef.current?.srcObject) {
          remoteVideoRef.current.srcObject = remoteStream;
          remoteVideoRef.current.play().catch(() => {});
          setupSpeakingDetector(remoteStream);

          timerRef.current = setInterval(() => {
            setElapsed(s => {
              const next = s + 1;
              const warnAt = booking.duration_minutes * 60 - 300;
              if (next === warnAt && !warnShownRef.current) {
                warnShownRef.current = true;
                setShowWarn(true);
                setTimeout(() => setShowWarn(false), 8000);
                try {
                  const ctx = new (window.AudioContext || window.webkitAudioContext)();
                  const beep = (t, f, d) => {
                    const o = ctx.createOscillator(), g = ctx.createGain();
                    o.connect(g); g.connect(ctx.destination);
                    o.frequency.value = f;
                    g.gain.setValueAtTime(0.25, t);
                    g.gain.exponentialRampToValueAtTime(0.001, t + d);
                    o.start(t); o.stop(t + d);
                  };
                  beep(ctx.currentTime, 660, 0.2);
                  beep(ctx.currentTime + 0.28, 880, 0.2);
                } catch {}
              }
              return next;
            });
          }, 1000);
        }

        setConnStateTracked('active');
        clearTimeout(reconnectTimerRef.current);
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
        ws.send(JSON.stringify({ type: 'join', session_id: `therapy:${booking.id}`, role: 'therapist' }));
      };

      ws.onmessage = async e => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'joined') {
          if (msg.other_connected) await sendOffer();
        } else if (msg.type === 'peer_joined') {
          clearTimeout(reconnectTimerRef.current);
          if (connStateRef.current === 'reconnecting') setConnStateTracked('connecting');
          else await sendOffer();
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
          if (connStateRef.current === 'active') {
            setConnStateTracked('reconnecting');
            reconnectTimerRef.current = setTimeout(() => setConnStateTracked('waiting'), 15000);
          } else {
            setConnStateTracked('waiting');
          }
        } else if (msg.type === 'quick_reply') {
          setQuickReply(msg.text);
          setTimeout(() => setQuickReply(''), 12000);
        } else if (msg.type === 'error') {
          setConnState('error');
        }
      };

      ws.onerror = () => setConnStateTracked('error');
    }

    init().catch(err => {
      console.error('[SessionRoom] init error', err);
      setConnState('error');
    });

    return () => {
      clearInterval(timerRef.current);
      clearTimeout(reconnectTimerRef.current);
      clearInterval(netPollRef.current);
      cancelAnimationFrame(speakingRafRef.current);
      clearTimeout(notesDebRef.current);
      audioCtxRef.current?.close().catch(() => {});
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      pcRef.current?.close();
      wsRef.current?.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleMute() {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setMuted(m => !m);
  }

  function toggleVideo() {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setVideoOff(v => !v);
  }

  function toggleRemoteMute() {
    if (remoteVideoRef.current) {
      const next = !remoteMuted;
      remoteVideoRef.current.muted = next;
      setRemoteMuted(next);
    }
  }

  async function changeMicDevice(deviceId) {
    try {
      const next = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
      const newTrack = next.getAudioTracks()[0];
      const sender = pcRef.current?.getSenders().find(s => s.track?.kind === 'audio');
      if (sender) await sender.replaceTrack(newTrack);
      localStreamRef.current?.getAudioTracks().forEach(t => t.stop());
      const videoTracks = localStreamRef.current?.getVideoTracks() ?? [];
      localStreamRef.current = new MediaStream([newTrack, ...videoTracks]);
      newTrack.enabled = !muted;
      setActiveMic(deviceId);
    } catch (e) {
      console.error('[SessionRoom] mic change', e);
    }
  }

  async function changeCamDevice(deviceId) {
    try {
      const next = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } } });
      const newTrack = next.getVideoTracks()[0];
      const sender = pcRef.current?.getSenders().find(s => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(newTrack);
      localStreamRef.current?.getVideoTracks().forEach(t => t.stop());
      const audioTracks = localStreamRef.current?.getAudioTracks() ?? [];
      const combined = new MediaStream([...audioTracks, newTrack]);
      localStreamRef.current = combined;
      if (localVideoRef.current) localVideoRef.current.srcObject = combined;
      newTrack.enabled = !videoOff;
      setActiveCam(deviceId);
    } catch (e) {
      console.error('[SessionRoom] cam change', e);
    }
  }

  async function changeSpeakerDevice(deviceId) {
    try {
      if (remoteVideoRef.current?.setSinkId) {
        await remoteVideoRef.current.setSinkId(deviceId);
        setActiveSpeaker(deviceId);
      }
    } catch (e) {
      console.error('[SessionRoom] speaker change', e);
    }
  }

  function handleVolumeChange(e) {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (remoteVideoRef.current) remoteVideoRef.current.volume = v;
  }

  function handleNotesChange(e) {
    const val = e.target.value;
    setNotesText(val);
    notesTextRef.current = val;
    clearTimeout(notesDebRef.current);
    notesDebRef.current = setTimeout(() => localStorage.setItem(storageKey, val), 500);
    setNotesSaved(false);
  }

  function clearNotes() {
    setNotesText('');
    notesTextRef.current = '';
    localStorage.removeItem(storageKey);
    setNotesSaved(false);
  }

  async function saveNotesToRecord() {
    if (!notesText.trim()) return;
    setNotesSaving(true);
    try {
      await client.post('/api/therapy/session-notes', { booking_id: booking.id, content: notesText.trim() });
      setNotesSaved(true);
    } catch (e) {
      console.error('[SessionRoom] save notes', e);
    } finally {
      setNotesSaving(false);
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  const mins     = Math.floor(elapsed / 60);
  const secs     = elapsed % 60;
  const timerStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const stateLabel = {
    waiting:      'Waiting for member to join…',
    connecting:   'Connecting…',
    reconnecting: 'Member disconnected — reconnecting…',
    active:       null,
    error:        'Connection failed. Ask the member to rejoin.',
  }[connState];

  const VolumeIcon = remoteMuted ? SpeakerSlash : volume < 0.5 ? SpeakerLow : SpeakerHigh;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', background: '#111' }}>

      {/* ── Main session area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {isVideo ? (
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <video
              ref={remoteVideoRef}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              playsInline autoPlay
            />

            {speaking && connState === 'active' && (
              <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                boxShadow: 'inset 0 0 0 3px #4ade80',
                animation: 'speakPulse 0.9s ease-in-out infinite',
              }} />
            )}

            {stateLabel && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', gap: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', border: '3px solid #fff', borderTopColor: '#4ade80', animation: connState !== 'error' ? 'spin 1s linear infinite' : 'none' }} />
                <p style={{ color: '#fff', fontSize: '0.88rem', textAlign: 'center', maxWidth: 260 }}>{stateLabel}</p>
              </div>
            )}

            <video
              ref={localVideoRef}
              style={{ position: 'absolute', bottom: 80, right: 16, width: 90, height: 120, objectFit: 'cover', borderRadius: 8, border: '2px solid #fff' }}
              playsInline autoPlay muted
            />

            {/* Top bar — timer + member name + net quality */}
            <div style={{ position: 'absolute', top: 16, left: 16, right: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '4px 14px', borderRadius: 20, fontSize: '0.88rem', fontWeight: 700 }}>
                  {timerStr}
                </div>
                {booking.member_alias && (
                  <div style={{ background: 'rgba(0,0,0,0.55)', color: 'rgba(255,255,255,0.85)', padding: '4px 12px', borderRadius: 20, fontSize: '0.8rem' }}>
                    {booking.member_alias}
                  </div>
                )}
              </div>
              <div style={{ background: 'rgba(0,0,0,0.55)', padding: '4px 10px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 5 }}>
                <NetIcon quality={netQuality} />
                <span style={{ color: NET_COLOR[netQuality], fontSize: '0.72rem', fontWeight: 600 }}>{netQuality}</span>
              </div>
            </div>

            {quickReply && (
              <div style={{ position: 'absolute', top: 56, left: 16, right: 16, background: 'rgba(30,120,60,0.93)', color: '#fff', borderRadius: 10, padding: '8px 16px', fontSize: '0.84rem', fontWeight: 500 }}>
                Member: "{quickReply}"
              </div>
            )}
            {showWarn && (
              <div style={{ position: 'absolute', top: quickReply ? 100 : 56, left: 16, right: 16, background: 'rgba(192,57,43,0.92)', color: '#fff', borderRadius: 10, padding: '8px 16px', textAlign: 'center', fontWeight: 600, fontSize: '0.86rem' }}>
                5 minutes remaining
              </div>
            )}
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#1a1a2e', gap: 16, position: 'relative' }}>
            {/* Hidden element to play remote audio in audio-only mode */}
            <video ref={remoteVideoRef} style={{ display: 'none' }} playsInline autoPlay />

            {/* Net + member name */}
            <div style={{ position: 'absolute', top: 16, left: 16, right: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {booking.member_alias
                ? <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.82rem' }}>{booking.member_alias}</span>
                : <span />
              }
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <NetIcon quality={netQuality} />
                <span style={{ color: NET_COLOR[netQuality], fontSize: '0.72rem' }}>{netQuality}</span>
              </div>
            </div>

            <div style={{
              width: 96, height: 96, borderRadius: '50%',
              background: speaking && connState === 'active' ? '#22c55e' : '#4ade80',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: connState === 'active' ? 'pulse 2s ease-in-out infinite' : 'none',
              transition: 'background 0.25s',
            }}>
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

        {/* ── Control bar ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 0 28px', background: isVideo ? 'rgba(0,0,0,0.85)' : '#0d0d1a' }}>

          {/* Volume row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <VolumeIcon size={16} color="rgba(255,255,255,0.55)" />
            <input
              type="range" min="0" max="1" step="0.02" value={volume}
              onChange={handleVolumeChange}
              aria-label="Speaker volume"
              style={{ width: 110, accentColor: '#4ade80', cursor: 'pointer' }}
            />
            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.72rem', width: 30 }}>
              {Math.round(volume * 100)}%
            </span>
          </div>

          {/* Buttons row */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 16 }}>

            {/* Mic */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <DeviceSelector devices={micDevices} current={activeMic} onChange={changeMicDevice} label="Select microphone" />
              <ControlBtn onClick={toggleMute} active={muted} label={muted ? 'Unmute' : 'Mute'}>
                {muted ? <MicrophoneSlash size={22} color="#ff6b6b" /> : <Microphone size={22} color="#fff" />}
              </ControlBtn>
            </div>

            {/* Camera (video only) */}
            {isVideo && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <DeviceSelector devices={camDevices} current={activeCam} onChange={changeCamDevice} label="Select camera" />
                <ControlBtn onClick={toggleVideo} active={videoOff} label={videoOff ? 'Show video' : 'Hide video'}>
                  {videoOff ? <VideoCameraSlash size={22} color="#ff6b6b" /> : <VideoCamera size={22} color="#fff" />}
                </ControlBtn>
              </div>
            )}

            {/* Speaker — click to mute/unmute remote audio */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              {sinkIdSupported
                ? <DeviceSelector devices={speakerDevices} current={activeSpeaker} onChange={changeSpeakerDevice} label="Select speaker output" />
                : <div style={{ height: 20 }} />
              }
              <ControlBtn onClick={toggleRemoteMute} active={remoteMuted} label={remoteMuted ? 'Unmute speaker' : 'Mute speaker'}>
                {remoteMuted ? <SpeakerSlash size={22} color="#ff6b6b" /> : <SpeakerHigh size={22} color="#fff" />}
              </ControlBtn>
            </div>

            {/* Notes */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ height: 20 }} />
              <ControlBtn onClick={() => setNotesOpen(o => !o)} active={notesOpen} label="Session notes (Alt+N)">
                <NotePencil size={22} color={notesOpen ? '#fbbf24' : '#fff'} />
              </ControlBtn>
            </div>

            {/* Fullscreen */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ height: 20 }} />
              <ControlBtn onClick={toggleFullscreen} active={false} label="Toggle fullscreen">
                <ArrowsOut size={22} color="#fff" />
              </ControlBtn>
            </div>

            {/* End call */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ height: 20 }} />
              <button
                onClick={end}
                aria-label="End session"
                style={{ width: 60, height: 60, borderRadius: '50%', background: '#c0392b', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <PhoneDisconnect size={26} color="#fff" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Notes panel ── */}
      {notesOpen && (
        <div style={{
          width: 320, flexShrink: 0,
          background: '#1a1a2e', borderLeft: '1px solid rgba(255,255,255,0.1)',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '12px 14px 10px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            flexShrink: 0,
          }}>
            <span style={{ color: '#e5e7eb', fontSize: '0.8rem', fontWeight: 600 }}>
              Session notes · visible only to you
            </span>
            <button
              onClick={clearNotes}
              aria-label="Clear notes"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.73rem' }}
            >
              <Trash size={13} /> Clear
            </button>
          </div>

          <textarea
            value={notesText}
            onChange={handleNotesChange}
            placeholder="Type your session notes here…"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              resize: 'none', color: '#e5e7eb', fontSize: '0.875rem', lineHeight: 1.6,
              padding: '14px 16px', fontFamily: 'inherit',
            }}
          />

          {/* Save to permanent record */}
          <div style={{
            padding: '10px 14px 14px', borderTop: '1px solid rgba(255,255,255,0.08)',
            flexShrink: 0,
          }}>
            <button
              onClick={saveNotesToRecord}
              disabled={notesSaving || !notesText.trim() || notesSaved}
              style={{
                width: '100%', padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: notesSaved ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.1)',
                color: notesSaved ? '#4ade80' : '#e5e7eb',
                fontSize: '0.8rem', fontWeight: 600,
                opacity: (notesSaving || !notesText.trim()) ? 0.5 : 1,
              }}
            >
              {notesSaving ? 'Saving…' : notesSaved ? '✓ Saved to session record' : 'Save to session record'}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin       { to { transform: rotate(360deg); } }
        @keyframes pulse      { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
        @keyframes speakPulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
      `}</style>
    </div>
  );
}
