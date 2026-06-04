import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PaperPlaneRight, Robot } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import client from '../api/client';
import { trackEvent } from '../utils/analytics';

function AIChatSkeleton() {
  return (
    <div style={{ flex: 1, padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      {[80, 60, 90, 55, 70].map((w, i) => (
        <div
          key={i}
          className="skeleton"
          style={{
            width: `${w}%`,
            height: 48,
            borderRadius: i % 2 === 0 ? '20px 20px 20px 4px' : '20px 20px 4px 20px',
            alignSelf: i % 2 === 0 ? 'flex-start' : 'flex-end',
          }}
        />
      ))}
    </div>
  );
}

export default function AIChatScreen() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [sessionId, setSessionId] = useState(null);
  const [personaName, setPersonaName] = useState('Your companion');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(true);
  const [startError, setStartError] = useState('');
  const [sendError, setSendError] = useState('');
  const [showEnd, setShowEnd] = useState(false);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [ending, setEnding] = useState(false);
  const bottomRef = useRef(null);

  const startSession = useCallback(async () => {
    setStarting(true);
    setStartError('');
    try {
      const { data } = await client.post('/api/ai/session/start');
      setSessionId(data.session_id);
      setPersonaName(data.persona_name || 'Your companion');
      setMessages([{ role: 'assistant', content: data.greeting || `Hello. I'm ${data.persona_name || 'your companion'}. How are you feeling today?` }]);
    } catch (err) {
      setStartError(err.response?.data?.error || 'I\'m having trouble responding right now. Try again in a moment.');
    } finally {
      setStarting(false);
    }
  }, []);

  useEffect(() => { startSession(); }, [startSession]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function handleSend() {
    if (!input.trim() || loading || !sessionId) return;
    const text = input.trim();
    setInput('');
    setSendError('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setLoading(true);
    try {
      const { data } = await client.post(`/api/ai/session/${sessionId}/message`, { input_text: text });
      if (data.action === 'emergency') {
        navigate('/emergency', { replace: true });
        return;
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: data.response_text }]);
    } catch (err) {
      setSendError(err.response?.data?.error || 'I\'m having trouble responding right now. Try again in a moment.');
      setMessages((prev) => prev.slice(0, -1));
      setInput(text);
    } finally {
      setLoading(false);
    }
  }

  async function handleEnd() {
    if (!sessionId || ending) return;
    setEnding(true);
    try {
      await client.post(`/api/ai/session/${sessionId}/end`, { rating: rating || undefined, feedback: feedback.trim() || undefined });
    } catch { /* non-fatal */ }
    qc.invalidateQueries({ queryKey: ['credits', 'balance'] });
    trackEvent('ai_session_completed');
    navigate('/dashboard', { replace: true });
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  if (starting) {
    return (
      <div className="screen screen--no-nav" style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 'var(--top-bar-height)', padding: '0 var(--space-md)', background: 'var(--color-bg-primary)', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
          <div className="skeleton" style={{ width: 160, height: 18, borderRadius: 'var(--radius-sm)' }} />
          <div className="skeleton" style={{ width: 60, height: 32, borderRadius: 'var(--radius-pill)' }} />
        </div>
        <AIChatSkeleton />
        <div style={{ height: 72, background: 'var(--color-bg-deep)', borderTop: '1px solid var(--color-border)', flexShrink: 0 }} />
      </div>
    );
  }

  if (startError) {
    return (
      <div className="screen screen--no-nav" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 'var(--space-lg)', textAlign: 'center' }}>
        <p style={{ marginBottom: 'var(--space-md)' }}>{startError}</p>
        <button className="btn btn--primary" onClick={startSession}>Try Again</button>
        <button className="btn btn--muted" style={{ marginTop: 'var(--space-sm)' }} onClick={() => navigate('/dashboard')}>Back</button>
      </div>
    );
  }

  if (showEnd) {
    return (
      <div className="screen screen--no-nav" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 'var(--space-xl) var(--space-lg)' }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-lg)' }}>
          <div style={{ fontSize: 40, marginBottom: 'var(--space-sm)' }}>💙</div>
          <h2 style={{ marginBottom: 'var(--space-xs)' }}>How did that feel?</h2>
          <p style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>Your companion will remember this conversation to offer better support next time.</p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setRating(s)}
              style={{ fontSize: 32, background: 'none', border: 'none', cursor: 'pointer', opacity: s <= rating ? 1 : 0.3, minWidth: 44, minHeight: 44 }}
              aria-label={`Rate ${s} stars`}
            >
              ⭐
            </button>
          ))}
        </div>
        <textarea
          className="textarea"
          rows={3}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Anything you'd like to share? (optional)"
          style={{ marginBottom: 'var(--space-md)' }}
        />
        <button className="btn btn--primary" onClick={handleEnd} disabled={ending}>{ending ? 'Ending…' : 'Done'}</button>
        <button className="btn btn--muted" style={{ marginTop: 'var(--space-sm)' }} onClick={handleEnd} disabled={ending}>Skip</button>
      </div>
    );
  }

  return (
    <div className="screen screen--no-nav" style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 'var(--top-bar-height)',
          padding: '0 var(--space-md)',
          background: 'var(--color-bg-primary)',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <Robot size={24} weight="duotone" color="var(--color-accent)" aria-hidden="true" />
          <div>
            <div style={{ fontWeight: 500, fontSize: 16, color: 'var(--color-text-primary)' }}>{personaName}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>AI Companion</div>
          </div>
        </div>
        <button
          onClick={() => setShowEnd(true)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--color-danger)',
            padding: '0 var(--space-sm)',
            minHeight: 'var(--touch-target-min)',
            minWidth: 'var(--touch-target-min)',
          }}
        >
          End
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.map((msg, i) => (
          <div key={i} className={`bubble bubble--${msg.role === 'user' ? 'user' : 'ai'}`}>
            {msg.content}
          </div>
        ))}
        {loading && (
          <div className="typing-indicator">
            <div className="typing-dot" />
            <div className="typing-dot" />
            <div className="typing-dot" />
          </div>
        )}
        {sendError && <div className="error-msg">{sendError}</div>}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div
        style={{
          padding: '12px var(--space-md)',
          background: 'var(--color-bg-deep)',
          borderTop: '1px solid var(--color-border)',
          display: 'flex',
          gap: 'var(--space-sm)',
          flexShrink: 0,
          alignItems: 'flex-end',
        }}
      >
        <textarea
          className="textarea"
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          disabled={loading}
          style={{ resize: 'none', flex: 1, minHeight: 44, maxHeight: 96, borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-ui)' }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: input.trim() && !loading ? 'var(--color-accent)' : 'rgba(194,164,138,0.20)',
            border: 'none',
            cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background var(--duration-fast), transform var(--duration-fast)',
            flexShrink: 0,
            color: 'var(--color-text-dark)',
          }}
          aria-label="Send message"
        >
          <PaperPlaneRight size={20} weight="duotone" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
