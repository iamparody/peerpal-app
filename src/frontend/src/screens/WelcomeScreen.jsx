import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';
import MoodBlob from '../components/MoodBlob';

const MOOD_POOLS = {
  first_visit: [
    "This is the beginning of something. We're glad you're here.",
    "You took the first step. That's the hardest one.",
    "Welcome. This space is entirely yours.",
    "Starting is enough. You've already done it.",
    "We're really glad you made it here.",
  ],
  high: [
    "Something's working. Stay with it.",
    "Good days are worth noting. You're having one.",
    "You're bringing real energy today. Keep it.",
    "It shows. Keep coming back.",
    "This is what showing up looks like.",
  ],
  mid: [
    "Not every day has to be remarkable. This one counts too.",
    "Steady is its own kind of strong.",
    "Being in the middle is still somewhere. You're here.",
    "Today doesn't have to be perfect.",
    "This is your space. No pressure.",
  ],
  low: [
    "Hard days are part of it. You came anyway.",
    "Coming back on a tough day takes courage.",
    "You don't have to have it together to be here.",
    "The fact that you opened this matters.",
    "We're here, no matter what kind of day it is.",
    "Even on hard days, you're here.",
  ],
  no_data: [
    "We're really glad you're here.",
    "This is your space. No pressure.",
    "One moment at a time — that's enough.",
    "You matter more than you know.",
    "Every check-in tells your story a little more.",
  ],
};

function pick3(pool) {
  const arr = [...pool];
  const out = [];
  for (let i = 0; i < Math.min(3, arr.length); i++) {
    const idx = Math.floor(Math.random() * arr.length);
    out.push(arr.splice(idx, 1)[0]);
  }
  return out;
}

function pickByContext(mood, isFirstVisit) {
  if (isFirstVisit)                               return pick3(MOOD_POOLS.first_visit);
  if (mood === 'good' || mood === 'great')         return pick3(MOOD_POOLS.high);
  if (mood === 'neutral')                          return pick3(MOOD_POOLS.mid);
  if (mood === 'low' || mood === 'very_low')       return pick3(MOOD_POOLS.low);
  return pick3(MOOD_POOLS.no_data);
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

  const [messages, setMessages] = useState(() => pick3(MOOD_POOLS.no_data));
  const [lastMood, setLastMood] = useState(null);
  const [welcomeSeen, setWelcomeSeen] = useState(true);
  const [msgIndex, setMsgIndex] = useState(0);
  const [msgVisible, setMsgVisible] = useState(false);
  const [greetingVisible, setGreetingVisible] = useState(false);

  const navTimer = useRef(null);
  const msgTimer = useRef(null);
  const navigated = useRef(false);
  // ref mirrors state so the setInterval closure always reads the current pool length
  const messagesRef = useRef(messages);

  useEffect(() => {
    // Fetch last mood and welcome_seen status in parallel
    Promise.all([
      client.get('/api/moods/history?limit=1').catch(() => ({ data: { entries: [] } })),
      client.get('/api/onboarding/status').catch(() => ({ data: { welcome_seen: true } })),
      client.get('/api/trial/status').catch(() => ({ data: { is_claimed: true } })),
    ]).then(([moodRes, statusRes, trialRes]) => {
      const entries = moodRes.data.entries ?? moodRes.data ?? [];
      const mood = entries.length > 0 ? entries[0].mood_level : null;
      if (mood) setLastMood(mood);
      const seen = statusRes.data.welcome_seen ?? true;
      setWelcomeSeen(seen);
      const next = pickByContext(mood, !seen);
      messagesRef.current = next;
      setMessages(next);
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
        currentIndex = (currentIndex + 1) % messagesRef.current.length;
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
