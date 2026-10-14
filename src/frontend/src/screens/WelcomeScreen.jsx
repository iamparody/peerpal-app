import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';
import MoodBlob from '../components/MoodBlob';

const ALL_MESSAGES = [
  "You showed up. That's everything.",
  "Take it one breath at a time.",
  "We're really glad you're here.",
  "Every day you open this is a win.",
  "You don't have to have it together.",
  "Small steps still move you forward.",
  "This is your space. No pressure.",
  "You matter more than you know.",
  "Rest is also progress.",
  "Being here takes courage.",
  "You're doing better than you think.",
  "One moment at a time — that's enough.",
  "You are not alone in this.",
  "Healing isn't linear. That's okay.",
  "Today doesn't have to be perfect.",
  "Showing up for yourself counts.",
  "You're allowed to take up space.",
  "Kindness starts with yourself.",
  "Even on hard days, you're here.",
  "We see you. We're glad you came.",
];

// Pick 3 random distinct messages — called inside component so it re-runs on every mount
function pickMessages() {
  const pool = [...ALL_MESSAGES];
  const picked = [];
  for (let i = 0; i < 3; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

function timeGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function WelcomeScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [messages] = useState(() => pickMessages());
  const [lastMood, setLastMood] = useState(null);
  const [welcomeSeen, setWelcomeSeen] = useState(true);
  const [msgIndex, setMsgIndex] = useState(0);
  const [msgVisible, setMsgVisible] = useState(false);
  const [greetingVisible, setGreetingVisible] = useState(false);

  const navTimer = useRef(null);
  const msgTimer = useRef(null);
  const navigated = useRef(false);

  useEffect(() => {
    // Fetch last mood and welcome_seen status in parallel
    Promise.all([
      client.get('/api/moods/history?limit=1').catch(() => ({ data: { entries: [] } })),
      client.get('/api/onboarding/status').catch(() => ({ data: { welcome_seen: true } })),
      client.get('/api/trial/status').catch(() => ({ data: { is_claimed: true } })),
    ]).then(([moodRes, statusRes, trialRes]) => {
      const entries = moodRes.data.entries ?? moodRes.data ?? [];
      if (entries.length > 0) setLastMood(entries[0].mood_level);
      const seen = statusRes.data.welcome_seen ?? true;
      setWelcomeSeen(seen);
      // First-time user with unclaimed trial: redirect to trial welcome screen
      if (!seen && !trialRes.data.is_claimed) {
        navigate('/trial-welcome', { replace: true });
      }
    });

    // Fade greeting in after 200ms
    const greetTimer = setTimeout(() => setGreetingVisible(true), 200);

    // Fade first message in after 600ms
    const firstMsgTimer = setTimeout(() => setMsgVisible(true), 600);

    // Cycle messages every 3s: fade out → swap → fade in
    let currentIndex = 0;
    msgTimer.current = setInterval(() => {
      setMsgVisible(false);
      setTimeout(() => {
        currentIndex = (currentIndex + 1) % messages.length;
        setMsgIndex(currentIndex);
        setMsgVisible(true);
      }, 350);
    }, 3000);

    // Auto-navigate after 3 full message cycles (9s)
    navTimer.current = setTimeout(() => goToDashboard(), 9000);

    return () => {
      clearTimeout(greetTimer);
      clearTimeout(firstMsgTimer);
      clearInterval(msgTimer.current);
      clearTimeout(navTimer.current);
    };
  }, []);

  function goToDashboard() {
    if (navigated.current) return;
    navigated.current = true;
    clearInterval(msgTimer.current);
    clearTimeout(navTimer.current);
    // Mark welcome_seen on first visit — fire and forget, don't block navigation
    if (!welcomeSeen) {
      client.patch('/api/onboarding/welcome-seen').catch(() => {});
    }
    navigate('/dashboard', { replace: true });
  }

  return (
    <div
      onClick={goToDashboard}
      style={{
        minHeight: '100dvh',
        background: 'var(--color-bg-deep)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-xl) var(--space-lg)',
        textAlign: 'center',
        cursor: 'default',
        position: 'relative',
      }}
    >
      {/* Skip button — only for returning users */}
      {welcomeSeen && (
        <button
          onClick={(e) => { e.stopPropagation(); goToDashboard(); }}
          style={{
            position: 'absolute',
            top: 'var(--space-lg)',
            right: 'var(--space-lg)',
            background: 'none',
            border: 'none',
            color: 'rgba(245,237,228,0.45)',
            fontSize: 'var(--text-caption)',
            cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
            letterSpacing: '0.05em',
            padding: '8px 12px',
            minHeight: 'var(--touch-target-min)',
          }}
          aria-label="Skip to dashboard"
        >
          Skip ›
        </button>
      )}

      {/* Mood blob */}
      <div style={{ marginBottom: 'var(--space-lg)' }}>
        <MoodBlob mood={lastMood} />
      </div>

      {/* Greeting */}
      <div
        style={{
          opacity: greetingVisible ? 1 : 0,
          transform: greetingVisible ? 'translateY(0)' : 'translateY(8px)',
          transition: 'opacity 500ms ease, transform 500ms ease',
          marginBottom: 'var(--space-md)',
        }}
      >
        <h1
          style={{
            fontSize: 'var(--text-h2)',
            fontWeight: 'var(--weight-semibold)',
            color: '#F5EDE4',
            marginBottom: 4,
          }}
        >
          {timeGreeting()}{user?.alias ? `, ${user.alias}` : ''}.
        </h1>
      </div>

      {/* Rotating message */}
      <p
        style={{
          fontFamily: 'var(--font-editorial)',
          fontSize: 18,
          fontWeight: 400,
          color: 'rgba(245,237,228,0.65)',
          lineHeight: 1.6,
          maxWidth: 280,
          opacity: msgVisible ? 1 : 0,
          transition: 'opacity 350ms ease',
          minHeight: '2.4em',
        }}
      >
        {messages[msgIndex]}
      </p>
    </div>
  );
}
