import { memo, useEffect, useRef, useState } from 'react';
import { MOOD_STATES as STATES, resolveMoodKey } from './moodBlobStates';

const ARIA_LABELS = {
  idle:     'Mood blob — idle',
  very_low: 'Mood blob — very low',
  low:      'Mood blob — low',
  neutral:  'Mood blob — neutral',
  good:     'Mood blob — good',
  great:    'Mood blob — great',
};

function MoodBlob({ mood, size = 200 }) {
  const key = resolveMoodKey(mood);
  const s = STATES[key];

  const [bouncing, setBouncing] = useState(false);
  const [blink, setBlink] = useState(false);
  const blinkTimer = useRef(null);

  // Bounce once on "great"
  useEffect(() => {
    if (mood === 'great') {
      setBouncing(true);
      const t = setTimeout(() => setBouncing(false), 400);
      return () => clearTimeout(t);
    }
  }, [mood]);

  // Blink every 4–6s; purely schedules a setState toggle — no render loop
  useEffect(() => {
    function schedule() {
      const delay = 4000 + Math.random() * 2000;
      blinkTimer.current = setTimeout(() => {
        setBlink(true);
        blinkTimer.current = setTimeout(() => {
          setBlink(false);
          schedule();
        }, 150);
      }, delay);
    }
    schedule();
    return () => clearTimeout(blinkTimer.current);
  }, []);

  const isIdle = !mood;

  // CSS animation string — no JS animation, purely CSS keyframes
  let animation = 'none';
  if (bouncing) animation = 'blobBounce 350ms var(--easing-spring) both';
  else if (isIdle) animation = 'blobFloat 3s ease-in-out infinite, blobBreathe 4s ease-in-out infinite';

  return (
    // SVG width/height = size; viewBox stays 200×200 so content scales via SVG viewport
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      role="img"
      aria-label={ARIA_LABELS[key]}
      style={{ display: 'block', animation, transformOrigin: 'center', overflow: 'visible' }}
    >
      <ellipse
        cx="100" cy="100"
        rx={s.rx} ry={s.ry}
        fill={s.fill}
        style={{ transition: 'rx 400ms ease-in-out, ry 400ms ease-in-out, fill 400ms ease-in-out' }}
      />

      <ellipse cx="78" cy="76" rx="28" ry="16" fill="rgba(255,255,255,0.18)" />

      {/* Left eye */}
      <ellipse cx="76" cy="92" rx={8} ry={blink ? 0.5 : 7} fill="#2A2020"
        style={{ transition: 'ry 80ms ease-in-out' }} />
      <circle cx="79" cy="89" r="2.5" fill="rgba(255,255,255,0.55)"
        style={{ opacity: blink || key === 'very_low' ? 0 : 1, transition: 'opacity 80ms' }} />

      {/* Right eye */}
      <ellipse cx="124" cy="92" rx={8} ry={blink ? 0.5 : 7} fill="#2A2020"
        style={{ transition: 'ry 80ms ease-in-out' }} />
      <circle cx="127" cy="89" r="2.5" fill="rgba(255,255,255,0.55)"
        style={{ opacity: blink || key === 'very_low' ? 0 : 1, transition: 'opacity 80ms' }} />

      {/* Great sparkles */}
      <circle cx="82" cy="87" r="3" fill="rgba(255,255,255,0.70)"
        style={{ opacity: key === 'great' && !blink ? 1 : 0, transition: 'opacity 400ms' }} />
      <circle cx="130" cy="87" r="3" fill="rgba(255,255,255,0.70)"
        style={{ opacity: key === 'great' && !blink ? 1 : 0, transition: 'opacity 400ms' }} />

      {/* very_low brows */}
      <path d="M 68,76 Q 76,80 84,78" stroke="#2A2020" strokeWidth="2" fill="none" strokeLinecap="round"
        style={{ opacity: key === 'very_low' ? 0.6 : 0, transition: 'opacity 400ms' }} />
      <path d="M 116,78 Q 124,80 132,76" stroke="#2A2020" strokeWidth="2" fill="none" strokeLinecap="round"
        style={{ opacity: key === 'very_low' ? 0.6 : 0, transition: 'opacity 400ms' }} />

      {/* low eyelids */}
      <path d="M 68,88 Q 76,83 84,88" stroke="#2A2020" strokeWidth="2.5" fill="none" strokeLinecap="round"
        style={{ opacity: key === 'low' ? 0.6 : 0, transition: 'opacity 400ms' }} />
      <path d="M 116,88 Q 124,83 132,88" stroke="#2A2020" strokeWidth="2.5" fill="none" strokeLinecap="round"
        style={{ opacity: key === 'low' ? 0.6 : 0, transition: 'opacity 400ms' }} />

      {/* Mouths */}
      <path d="M 76,122 Q 100,108 124,122" stroke="#2A2020" strokeWidth="3" fill="none" strokeLinecap="round"
        style={{ opacity: s.mouthKey === 'very_low' ? 1 : 0, transition: 'opacity 300ms ease-in-out' }} />
      <path d="M 78,119 Q 100,112 122,119" stroke="#2A2020" strokeWidth="2.5" fill="none" strokeLinecap="round"
        style={{ opacity: s.mouthKey === 'low' ? 1 : 0, transition: 'opacity 300ms ease-in-out' }} />
      <path d="M 80,118 Q 100,118 120,118" stroke="#2A2020" strokeWidth="2.5" fill="none" strokeLinecap="round"
        style={{ opacity: s.mouthKey === 'neutral' ? 1 : 0, transition: 'opacity 300ms ease-in-out' }} />
      <path d="M 78,118 Q 100,128 122,118" stroke="#2A2020" strokeWidth="2.5" fill="none" strokeLinecap="round"
        style={{ opacity: s.mouthKey === 'good' ? 1 : 0, transition: 'opacity 300ms ease-in-out' }} />
      <path d="M 74,115 Q 100,136 126,115" stroke="#2A2020" strokeWidth="3" fill="none" strokeLinecap="round"
        style={{ opacity: s.mouthKey === 'great' ? 1 : 0, transition: 'opacity 300ms ease-in-out' }} />
      <path d="M 74,115 Q 100,136 126,115 Q 112,126 88,126 Z" fill="rgba(42,32,32,0.12)"
        style={{ opacity: s.mouthKey === 'great' ? 1 : 0, transition: 'opacity 300ms ease-in-out' }} />
    </svg>
  );
}

export default memo(MoodBlob);
