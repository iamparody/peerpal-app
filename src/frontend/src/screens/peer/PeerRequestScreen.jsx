import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Handshake, ChatText, Microphone, Lock, Brain, Stethoscope, Coin, BellRinging, BellSlash } from '@phosphor-icons/react';
import client from '../../api/client';
import { trackEvent } from '../../utils/analytics';

const COST_INFO = {
  text:  { cost: 1, label: 'Text Chat',  desc: '1 credit · 30 min' },
  voice: { cost: 2, label: 'Voice Call', desc: '2 credits · 30 min' },
};

const TOPIC_CATEGORIES = [
  {
    label: 'Life pressure',
    slugs: ['overwhelmed_school_work', 'financial_stress', 'parenting', 'addiction'],
  },
  {
    label: 'Relationships',
    slugs: ['relationship', 'bullying', 'identity'],
  },
  {
    label: 'Trauma & safety',
    slugs: ['abuse_or_assault', 'sexual_harassment', 'domestic_violence'],
  },
  {
    label: 'Loss & grief',
    slugs: ['bereavement'],
  },
];

const QUIZ_STEPS = [
  {
    Icon: Brain,
    question: 'Are you in a safe, calm place right now where you can give someone your full attention?',
    confirm: "Yes, I'm ready",
  },
  {
    Icon: Stethoscope,
    question: 'I understand that as a peer supporter, I am not a therapist and will not give medical advice or diagnoses.',
    confirm: 'I understand',
  },
  {
    Icon: Lock,
    question: 'I will keep everything shared in peer sessions completely confidential.',
    confirm: 'I commit to this',
  },
];

function PeerQuizGate({ onComplete }) {
  const [step, setStep] = useState(0); // -1 = intro, 0-2 = questions, 3 = done
  const [phase, setPhase] = useState('intro'); // 'intro' | 'quiz' | 'submitting' | 'done'

  async function handleConfirm() {
    if (step < QUIZ_STEPS.length - 1) {
      setStep(s => s + 1);
      return;
    }
    setPhase('submitting');
    try {
      await client.post('/api/peer/quiz/complete');
      setPhase('done');
      setTimeout(onComplete, 1200);
    } catch {
      setPhase('quiz'); // let them retry
    }
  }

  if (phase === 'done') {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '24px 16px' }}>
        <CheckCircle size={40} weight="fill" color="var(--color-calm)" style={{ marginBottom: 8 }} />
        <p style={{ fontWeight: 600 }}>Readiness check complete!</p>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 4 }}>You can now accept peer requests.</p>
      </div>
    );
  }

  if (phase === 'intro') {
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '20px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Handshake size={28} weight="duotone" color="var(--color-calm)" />
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Ready to help someone?</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Complete a quick 3-step readiness check first</div>
          </div>
        </div>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          This only takes 30 seconds and ensures everyone gets the best possible support.
        </p>
        <button className="btn btn--primary" onClick={() => setPhase('quiz')}>
          Start readiness check
        </button>
      </div>
    );
  }

  const current = QUIZ_STEPS[step];
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '20px 16px' }}>
      {/* Progress dots */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
        {QUIZ_STEPS.map((_, i) => (
          <div key={i} style={{
            width: 8, height: 8, borderRadius: '50%',
            background: i <= step ? 'var(--color-accent)' : 'var(--color-border)',
            transition: 'background 200ms',
          }} />
        ))}
      </div>

      <div style={{ textAlign: 'center' }}>
        <div style={{ marginBottom: 12 }}><current.Icon size={40} weight="duotone" color="var(--color-accent)" /></div>
        <p style={{ fontSize: 15, lineHeight: 1.6, fontWeight: 500 }}>{current.question}</p>
      </div>

      <button
        className="btn btn--primary"
        onClick={handleConfirm}
        disabled={phase === 'submitting'}
      >
        {phase === 'submitting' ? 'Saving…' : current.confirm}
      </button>
    </div>
  );
}

// ── Confidence-to-accept overlay ─────────────────────────────────────────────
function ConfidenceOverlay({ request, topicLabel, onAccept, onDecline }) {
  const [secondsLeft, setSecondsLeft] = useState(90);
  const timerRef = useRef(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) { clearInterval(timerRef.current); onDecline(); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, []); // eslint-disable-line

  const pct = (secondsLeft / 90) * 100;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ background: 'var(--color-surface-card)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', padding: 'var(--space-lg)', width: '100%' }}>
        <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          {request.channel_preference === 'voice'
            ? <><Microphone size={18} weight="duotone" /> Voice</>
            : <><ChatText size={18} weight="duotone" /> Text</>
          } support needed
        </div>
        {topicLabel && (
          <div style={{ fontSize: '0.88rem', color: 'var(--color-accent)', marginBottom: 12 }}>
            Topic: <strong>{topicLabel}</strong>
          </div>
        )}
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', lineHeight: 1.5, marginBottom: 'var(--space-md)' }}>
          Do you feel ready to support someone with this right now?
        </p>

        {/* Countdown bar */}
        <div style={{ height: 4, background: 'var(--color-border)', borderRadius: 2, marginBottom: 'var(--space-md)', overflow: 'hidden' }}>
          <div style={{ height: '100%', background: secondsLeft > 30 ? '#8FAF9A' : 'var(--color-warning)', width: `${pct}%`, transition: 'width 1s linear, background 300ms' }} />
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textAlign: 'center', marginBottom: 'var(--space-md)' }}>
          Auto-declining in {secondsLeft}s
        </p>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn--primary" style={{ flex: 1 }} onClick={() => { clearInterval(timerRef.current); onAccept(); }}>
            Yes, I'm ready
          </button>
          <button className="btn btn--muted" style={{ flex: 1 }} onClick={() => { clearInterval(timerRef.current); onDecline(); }}>
            Not this time
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PeerRequestScreen() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('support');
  const [balance, setBalance] = useState(null);
  const [openRequests, setOpenRequests] = useState([]);
  const [topics, setTopics] = useState([]);
  const [quizDone, setQuizDone] = useState(true); // optimistic: hide gate until loaded
  const [channel, setChannel] = useState('text');
  const [topicSlug, setTopicSlug] = useState('');
  const [secondaryTopicSlug, setSecondaryTopicSlug] = useState('');
  const [topicOpen, setTopicOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confidenceRequest, setConfidenceRequest] = useState(null); // request pending confidence check
  const [availableUntil, setAvailableUntil] = useState(null); // ISO string or null
  const [availNow, setAvailNow] = useState('');    // live countdown string
  const [availToggling, setAvailToggling] = useState(false);

  // Leaderboard state
  const [stats, setStats] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [boardLoading, setBoardLoading] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [balRes, reqRes, quizRes, topicsRes, availRes] = await Promise.all([
          client.get('/api/credits/balance'),
          client.get('/api/peer/requests/open'),
          client.get('/api/peer/quiz/status'),
          client.get('/api/peer/topics'),
          client.get('/api/peer/availability'),
        ]);
        setBalance(balRes.data.balance ?? 0);
        setOpenRequests(reqRes.data.requests ?? reqRes.data ?? []);
        setQuizDone(quizRes.data.peer_quiz_done);
        setTopics(topicsRes.data.topics ?? []);
        if (availRes.data.available) setAvailableUntil(availRes.data.available_until);
      } catch {
        setError('Failed to load. Please try again.');
      } finally {
        setLoading(false);
      }
    }
    load();

    // Poll for new/closed requests so broadcasts appear without a page reload
    const poll = setInterval(async () => {
      try {
        const { data } = await client.get('/api/peer/requests/open');
        setOpenRequests(data.requests ?? data ?? []);
      } catch { /* non-fatal */ }
    }, 3000);

    return () => clearInterval(poll);
  }, []);

  // Auto-dismiss confidence overlay if the request was cancelled while the peer was deciding
  useEffect(() => {
    if (!confidenceRequest) return;
    const stillOpen = openRequests.some(r => r.id === confidenceRequest.id);
    if (!stillOpen) {
      setConfidenceRequest(null);
      setError('This request was just cancelled by the user.');
    }
  }, [openRequests, confidenceRequest]);

  // Live countdown for availability window
  useEffect(() => {
    if (!availableUntil) { setAvailNow(''); return; }
    function tick() {
      const diffMs = new Date(availableUntil) - Date.now();
      if (diffMs <= 0) { setAvailableUntil(null); setAvailNow(''); return; }
      const mins = Math.floor(diffMs / 60000);
      const secs = Math.floor((diffMs % 60000) / 1000);
      setAvailNow(`${mins}:${String(secs).padStart(2, '0')}`);
    }
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [availableUntil]);

  async function handleAvailToggle() {
    if (availToggling) return;
    setAvailToggling(true);
    try {
      if (availableUntil) {
        await client.delete('/api/peer/availability');
        setAvailableUntil(null);
      } else {
        const { data } = await client.post('/api/peer/availability', { hours: 2 });
        setAvailableUntil(data.available_until);
      }
    } catch { /* non-fatal */ }
    finally { setAvailToggling(false); }
  }

  async function loadLeaderboard() {
    if (stats) return;
    setBoardLoading(true);
    try {
      const [statsRes, boardRes] = await Promise.all([
        client.get('/api/peer/stats'),
        client.get('/api/peer/leaderboard'),
      ]);
      setStats(statsRes.data);
      setLeaderboard(boardRes.data.leaderboard ?? []);
    } catch { /* non-fatal */ }
    finally { setBoardLoading(false); }
  }

  function handleTabChange(t) {
    setTab(t);
    if (t === 'leaderboard') loadLeaderboard();
  }

  async function handleRequest() {
    if (!topicSlug) {
      setError('Please choose a topic before requesting support.');
      return;
    }
    const cost = COST_INFO[channel].cost;
    if (balance < cost) {
      setError(`You need ${cost} credit${cost > 1 ? 's' : ''} for a ${COST_INFO[channel].label.toLowerCase()}. Top up to continue.`);
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const { data } = await client.post('/api/peer/request', {
        channel_preference: channel,
        topic_slug: topicSlug,
        secondary_topic_slug: secondaryTopicSlug || undefined,
      });
      trackEvent('peer_request_created', { channel, topic_slug: topicSlug });
      navigate(`/peer/waiting/${data.request_id}`, { replace: true });
    } catch (err) {
      const status = err.response?.status;
      setError(status === 402
        ? 'Insufficient credits.'
        : err.response?.data?.error || 'Could not submit request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleAcceptIntent(request) {
    setConfidenceRequest(request);
  }

  async function confirmAccept(request) {
    setConfidenceRequest(null);
    setError('');
    try {
      const { data } = await client.patch(`/api/peer/request/${request.id}/accept`);
      const ch = data.channel || 'text';
      navigate(`/peer/session/${data.session_id}/${ch}`, { replace: true });
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === 'QUIZ_REQUIRED') {
        setQuizDone(false);
        return;
      }
      if (code === 'REQUEST_UNAVAILABLE') {
        // Remove the stale request from the list immediately
        setOpenRequests(prev => prev.filter(r => r.id !== request.id));
        setError('This request is no longer available — the user may have cancelled it.');
        return;
      }
      setError(err.response?.data?.error || 'Could not accept request. Please try again.');
    }
  }

  async function declineAccept(request) {
    setConfidenceRequest(null);
    // Fire-and-forget analytics — increment decline_count
    client.patch(`/api/peer/request/${request.id}/decline`).catch(() => {});
  }

  if (loading) return (
    <div className="screen">
      <div className="page-header">
        <button className="page-header__back" onClick={() => navigate(-1)} aria-label="Back">‹</button>
        <h2 className="page-header__title">Peer Support</h2>
      </div>
      <div style={{ padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        <div className="skeleton" style={{ height: 72, borderRadius: 'var(--radius-lg)' }} />
        <div className="skeleton" style={{ height: 100, borderRadius: 'var(--radius-lg)' }} />
        <div className="skeleton" style={{ height: 52, borderRadius: 'var(--radius-pill)' }} />
      </div>
    </div>
  );

  const balanceLow = balance !== null && balance < 2;

  return (
    <div className="screen" style={{ padding: 0, display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      <div className="page-header" style={{ flexShrink: 0 }}>
        <button className="page-header__back" onClick={() => navigate(-1)} aria-label="Back">‹</button>
        <h2 className="page-header__title">Peer Support</h2>
        {/* Credits badge inline in header */}
        <button
          onClick={() => navigate('/credits')}
          style={{
            marginLeft: 'auto', marginRight: 4,
            display: 'flex', alignItems: 'center', gap: 5,
            background: balanceLow ? 'rgba(220,60,60,0.12)' : 'rgba(194,164,138,0.15)',
            border: `1px solid ${balanceLow ? 'var(--color-danger)' : 'var(--color-border)'}`,
            borderRadius: 'var(--radius-pill)', padding: '4px 10px',
            fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
            color: balanceLow ? 'var(--color-danger)' : 'var(--color-text)',
          }}
        >
          <Coin size={14} weight="duotone" /> {balance ?? '—'}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
        {[['support', 'Support'], ['leaderboard', 'Leaderboard']].map(([val, label]) => (
          <button
            key={val}
            onClick={() => handleTabChange(val)}
            style={{
              flex: 1, padding: '10px 0', fontSize: 14, fontWeight: tab === val ? 600 : 400,
              color: tab === val ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: tab === val ? '2px solid var(--color-accent)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'support' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Scrollable body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', paddingBottom: 'calc(var(--bottom-nav-height, 64px) + env(safe-area-inset-bottom) + 16px)', display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* ── Availability toggle ── */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              border: `1.5px solid ${availableUntil ? 'rgba(143,175,154,0.6)' : 'var(--color-border)'}`,
              background: availableUntil ? 'rgba(143,175,154,0.08)' : 'var(--color-surface-card)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {availableUntil
                  ? <BellRinging size={18} weight="duotone" color="var(--color-calm)" />
                  : <BellSlash size={18} weight="duotone" color="var(--color-text-muted)" />}
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: availableUntil ? 'var(--color-calm)' : 'var(--color-text)' }}>
                    {availableUntil ? `Available for ${availNow}` : 'Be available to help'}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 1 }}>
                    {availableUntil ? 'You\'ll receive push alerts for new requests' : 'Get notified when someone needs support'}
                  </div>
                </div>
              </div>
              <button
                onClick={handleAvailToggle}
                disabled={availToggling}
                style={{
                  padding: '5px 12px', borderRadius: 'var(--radius-pill)',
                  border: 'none', cursor: availToggling ? 'default' : 'pointer',
                  fontSize: '0.75rem', fontWeight: 600,
                  background: availableUntil ? 'rgba(220,60,60,0.12)' : 'var(--color-calm)',
                  color: availableUntil ? 'var(--color-danger)' : '#fff',
                  opacity: availToggling ? 0.6 : 1,
                  transition: 'opacity 150ms',
                  whiteSpace: 'nowrap',
                }}
              >
                {availableUntil ? 'Stop' : '+ 2 hours'}
              </button>
            </div>

            {/* ── Accept card — always at top if requests exist ── */}
            {openRequests.length > 0 && (
              <div style={{
                background: 'rgba(143,175,154,0.1)',
                border: '1.5px solid rgba(143,175,154,0.45)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 14px',
              }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-calm)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>
                  Someone needs support now
                </div>
                {!quizDone ? (
                  <PeerQuizGate onComplete={() => setQuizDone(true)} />
                ) : (
                  openRequests.map((req) => {
                    const topicInfo = topics.find(t => t.slug === req.topic_slug);
                    return (
                      <div key={req.id} style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          {req.channel_preference === 'voice'
                            ? <Microphone size={15} weight="duotone" color="var(--color-calm)" />
                            : <ChatText size={15} weight="duotone" color="var(--color-calm)" />}
                          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                            {req.channel_preference === 'voice' ? 'Voice' : 'Text'} session
                          </span>
                          {topicInfo && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-calm)', marginLeft: 2 }}>· {topicInfo.label}</span>
                          )}
                        </div>
                        <button
                          onClick={() => handleAcceptIntent(req)}
                          className="btn btn--primary"
                          style={{ background: 'var(--color-calm)', borderColor: 'var(--color-calm)' }}
                        >
                          I'm here — accept session
                        </button>
                      </div>
                    );
                  })
                )}
                <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 4 }}>Earn 1 credit for completing a session.</p>
              </div>
            )}

            {/* Channel toggle */}
            <div style={{ display: 'flex', gap: 8 }}>
              {Object.entries(COST_INFO).map(([val, info]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setChannel(val)}
                  style={{
                    flex: 1, padding: '9px 8px',
                    borderRadius: 'var(--radius-sm)',
                    border: `2px solid ${channel === val ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    background: channel === val ? 'rgba(194,164,138,0.15)' : 'var(--color-surface-card)',
                    cursor: 'pointer', textAlign: 'center',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', color: channel === val ? 'var(--color-text)' : '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                    {val === 'text' ? <ChatText size={14} weight="duotone" /> : <Microphone size={14} weight="duotone" />} {info.label}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{info.desc}</div>
                </button>
              ))}
            </div>

            {/* Topic grid — always visible, no dropdown */}
            {topics.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                  What do you need support with? <span style={{ color: 'var(--color-danger)' }}>*</span>
                </div>

                {/* "Just listen" — full width */}
                {topics.filter(t => t.slug === 'general').map(t => (
                  <button key={t.slug} type="button"
                    onClick={() => navigate('/peer/connecting', { state: { topic: t.slug, channel, topicLabel: t.label } })}
                    style={{
                      width: '100%', padding: '11px 14px', textAlign: 'left',
                      borderRadius: 'var(--radius-sm)',
                      border: '2px solid var(--color-border)',
                      background: 'var(--color-surface-card)',
                      cursor: 'pointer', fontSize: '0.88rem', fontWeight: 400,
                      color: '#ffffff',
                    }}
                  >{t.label}</button>
                ))}

                {/* Categorised 2-column grid */}
                {TOPIC_CATEGORIES.map(cat => {
                  const catTopics = cat.slugs.map(s => topics.find(t => t.slug === s)).filter(Boolean);
                  if (!catTopics.length) return null;
                  return (
                    <div key={cat.label}>
                      <div style={{ fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 5 }}>{cat.label}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                        {catTopics.map(t => (
                          <button key={t.slug} type="button"
                            onClick={() => navigate('/peer/connecting', { state: { topic: t.slug, channel, topicLabel: t.label } })}
                            style={{
                              padding: '9px 8px', textAlign: 'left',
                              borderRadius: 'var(--radius-sm)',
                              border: '2px solid var(--color-border)',
                              background: 'var(--color-surface-card)',
                              cursor: 'pointer', fontSize: '0.78rem', lineHeight: 1.35,
                              color: '#ffffff',
                            }}
                          >{t.label}</button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {error && <div className="error-msg">{error}</div>}

            {balance < COST_INFO[channel].cost && (
              <p style={{ fontSize: '0.8rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                Not enough credits —{' '}
                <button onClick={() => navigate('/credits')} style={{ background: 'none', border: 'none', color: 'var(--color-accent)', fontWeight: 600, cursor: 'pointer', fontSize: 'inherit', padding: 0 }}>top up</button>
              </p>
            )}
          </div>

        </div>
      )}

      {/* Confidence overlay */}
      {confidenceRequest && (
        <ConfidenceOverlay
          request={confidenceRequest}
          topicLabel={topics.find(t => t.slug === confidenceRequest.topic_slug)?.label || null}
          onAccept={() => confirmAccept(confidenceRequest)}
          onDecline={() => declineAccept(confidenceRequest)}
        />
      )}

      {tab === 'leaderboard' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px', paddingBottom: 'calc(var(--bottom-nav-height, 64px) + env(safe-area-inset-bottom) + 16px)', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {boardLoading ? (
            <>
              <div className="skeleton" style={{ height: 80, borderRadius: 'var(--radius-lg)' }} />
              <div className="skeleton" style={{ height: 200, borderRadius: 'var(--radius-lg)' }} />
            </>
          ) : (
            <>
              {stats && (
                <div className="card" style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
                  {[
                    { label: 'Sessions', value: stats.sessions_completed },
                    { label: 'Credits earned', value: stats.credits_earned },
                    { label: 'Rank', value: `#${stats.rank}` },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-accent)' }}>{value}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>{label}</div>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <h3 style={{ marginBottom: 12 }}>Top Peers</h3>
                {leaderboard.length === 0 ? (
                  <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', textAlign: 'center', paddingTop: 16 }}>
                    No peer sessions completed yet. Be the first!
                  </p>
                ) : (
                  leaderboard.map((entry, i) => (
                    <div
                      key={entry.alias}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 0', borderBottom: i < leaderboard.length - 1 ? '1px solid var(--color-border)' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{
                          width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 13, fontWeight: 700,
                          background: i === 0 ? '#C8943A' : i === 1 ? '#9E9E9E' : i === 2 ? '#8D6E63' : 'var(--color-surface-secondary)',
                          color: i < 3 ? '#fff' : 'var(--color-text-secondary)',
                        }}>
                          {i + 1}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 500 }}>{entry.alias}</span>
                      </div>
                      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                        {entry.sessions_completed} session{entry.sessions_completed !== 1 ? 's' : ''}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
