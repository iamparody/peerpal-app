import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { trackEvent } from '../../utils/analytics';

const COST_INFO = {
  text:  { cost: 1, label: 'Text Chat',  desc: '1 credit · 30 min' },
  voice: { cost: 2, label: 'Voice Call', desc: '2 credits · 30 min' },
};

const QUIZ_STEPS = [
  {
    emoji: '🧘',
    question: 'Are you in a safe, calm place right now where you can give someone your full attention?',
    confirm: "Yes, I'm ready",
  },
  {
    emoji: '🩺',
    question: 'I understand that as a peer supporter, I am not a therapist and will not give medical advice or diagnoses.',
    confirm: 'I understand',
  },
  {
    emoji: '🔒',
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
        <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
        <p style={{ fontWeight: 600 }}>Readiness check complete!</p>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 4 }}>You can now accept peer requests.</p>
      </div>
    );
  }

  if (phase === 'intro') {
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '20px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 28 }}>🤝</span>
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
        <div style={{ fontSize: 40, marginBottom: 12 }}>{current.emoji}</div>
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
        <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6 }}>
          {request.channel_preference === 'voice' ? '🎙️ Voice' : '💬 Text'} support needed
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
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confidenceRequest, setConfidenceRequest] = useState(null); // request pending confidence check

  // Leaderboard state
  const [stats, setStats] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [boardLoading, setBoardLoading] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [balRes, reqRes, quizRes, topicsRes] = await Promise.all([
          client.get('/api/credits/balance'),
          client.get('/api/peer/requests/open'),
          client.get('/api/peer/quiz/status'),
          client.get('/api/peer/topics'),
        ]);
        setBalance(balRes.data.balance ?? 0);
        setOpenRequests(reqRes.data.requests ?? reqRes.data ?? []);
        setQuizDone(quizRes.data.peer_quiz_done);
        setTopics(topicsRes.data.topics ?? []);
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
    }, 10000);

    return () => clearInterval(poll);
  }, []);

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
      const status = err.response?.status;
      setError(status === 409
        ? 'This request was already accepted by someone else.'
        : err.response?.data?.error || 'Could not accept request. Please try again.');
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
    <div className="screen" style={{ padding: '0 0 16px' }}>
      <div className="page-header">
        <button className="page-header__back" onClick={() => navigate(-1)} aria-label="Back">‹</button>
        <h2 className="page-header__title">Peer Support</h2>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', marginBottom: 4 }}>
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
        <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Credit balance */}
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Your credits</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: balanceLow ? 'var(--color-emergency)' : 'var(--color-text)' }}>{balance ?? '—'}</div>
            </div>
            {balanceLow && (
              <button onClick={() => navigate('/credits')} className="btn btn--ghost btn--sm" style={{ width: 'auto' }}>Top Up</button>
            )}
          </div>

          {/* Request help */}
          <div>
            <h3 style={{ marginBottom: 12 }}>Need support?</h3>

            {/* Channel selector */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {Object.entries(COST_INFO).map(([val, info]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setChannel(val)}
                  style={{
                    flex: 1, padding: 14,
                    borderRadius: 'var(--radius-sm)',
                    border: `2px solid ${channel === val ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    background: channel === val ? 'rgba(194,164,138,0.15)' : 'var(--color-surface-card)',
                    cursor: 'pointer', textAlign: 'center',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-text)' }}>{val === 'text' ? '💬' : '🎙️'} {info.label}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4 }}>{info.desc}</div>
                </button>
              ))}
            </div>

            {/* Topic picker */}
            {topics.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 8, color: 'var(--color-text-secondary)' }}>
                  What would you like support with? <span style={{ color: 'var(--color-danger)' }}>*</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto', paddingRight: 2 }}>
                  {topics.map(t => (
                    <button
                      key={t.slug}
                      type="button"
                      onClick={() => {
                        if (topicSlug === t.slug) { setTopicSlug(''); }
                        else { setTopicSlug(t.slug); if (secondaryTopicSlug === t.slug) setSecondaryTopicSlug(''); }
                      }}
                      style={{
                        padding: '10px 12px', textAlign: 'left',
                        borderRadius: 'var(--radius-sm)',
                        border: `2px solid ${topicSlug === t.slug ? 'var(--color-calm)' : 'var(--color-border)'}`,
                        background: topicSlug === t.slug ? 'var(--color-calm-bg)' : 'var(--color-surface-card)',
                        cursor: 'pointer', fontSize: '0.88rem', fontWeight: topicSlug === t.slug ? 600 : 400,
                        color: topicSlug === t.slug ? 'var(--color-calm)' : 'var(--color-text)',
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Secondary topic */}
                {topicSlug && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: 6 }}>
                      Anything else (optional):
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {topics.filter(t => t.slug !== topicSlug).map(t => (
                        <button
                          key={t.slug}
                          type="button"
                          onClick={() => setSecondaryTopicSlug(prev => prev === t.slug ? '' : t.slug)}
                          style={{
                            padding: '5px 10px', fontSize: '0.78rem',
                            borderRadius: 'var(--radius-pill)',
                            border: `1px solid ${secondaryTopicSlug === t.slug ? 'var(--color-accent)' : 'var(--color-border)'}`,
                            background: secondaryTopicSlug === t.slug ? 'rgba(194,164,138,0.2)' : 'none',
                            cursor: 'pointer',
                            color: secondaryTopicSlug === t.slug ? 'var(--color-accent)' : 'var(--color-text-muted)',
                          }}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Confidence copy */}
                {topicSlug && (() => {
                  const selected = topics.find(t => t.slug === topicSlug);
                  if (!selected?.required_permission_name) return null;
                  return (
                    <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', lineHeight: 1.55, marginTop: 10, padding: '8px 10px', background: 'var(--color-calm-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-calm)' }}>
                      You'll be connected with a peer who has completed <strong>{selected.required_permission_name}</strong> awareness training.
                    </p>
                  );
                })()}
              </div>
            )}

            {error && <div className="error-msg" style={{ marginBottom: 12 }}>{error}</div>}

            <button
              className="btn btn--primary"
              onClick={handleRequest}
              disabled={submitting || balance < COST_INFO[channel].cost || !topicSlug}
            >
              {submitting ? 'Requesting…' : 'Request Help'}
            </button>
            {!topicSlug && topics.length > 0 && (
              <p style={{ marginTop: 6, fontSize: '0.78rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                Select a topic above to continue
              </p>
            )}
            {balance < COST_INFO[channel].cost && (
              <p style={{ marginTop: 8, fontSize: '0.8rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                Not enough credits —{' '}
                <button
                  onClick={() => navigate('/credits')}
                  style={{ background: 'none', border: 'none', color: 'var(--color-accent)', fontWeight: 600, cursor: 'pointer', fontSize: 'inherit', padding: 0 }}
                >
                  top up
                </button>
              </p>
            )}
          </div>

          {/* Open requests — gated by quiz */}
          {openRequests.length > 0 && (
            <div>
              <h3 style={{ marginBottom: 12 }}>Someone needs support now</h3>

              {!quizDone ? (
                <PeerQuizGate onComplete={() => setQuizDone(true)} />
              ) : (
                <>
                  <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
                    Complete a session to earn 1 credit.
                  </p>
                  {openRequests.map((req) => {
                    const topicInfo = topics.find(t => t.slug === req.topic_slug);
                    return (
                      <div key={req.id} className="card" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{req.channel_preference === 'voice' ? '🎙️ Voice' : '💬 Text'} session</div>
                          {topicInfo && <div style={{ fontSize: '0.75rem', color: 'var(--color-accent)', marginTop: 2 }}>{topicInfo.label}</div>}
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 1 }}>{new Date(req.created_at).toLocaleTimeString()}</div>
                        </div>
                        <button onClick={() => handleAcceptIntent(req)} className="btn btn--success btn--sm" style={{ width: 'auto', flexShrink: 0 }}>
                          I'm here
                        </button>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
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
        <div style={{ padding: '16px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
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
