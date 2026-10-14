import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { track } from '../../lib/analytics';

const MOODS = [
  { value: 'very_low', label: 'Very Low', emoji: '😔', color: 'var(--mood-very-low)' },
  { value: 'low',      label: 'Low',      emoji: '😕', color: 'var(--mood-low)' },
  { value: 'neutral',  label: 'Neutral',  emoji: '😐', color: 'var(--mood-neutral)' },
  { value: 'good',     label: 'Good',     emoji: '🙂', color: 'var(--mood-good)' },
  { value: 'great',    label: 'Great',    emoji: '😊', color: 'var(--mood-great)' },
];

const TAGS = ['Anxious', 'Hopeful', 'Overwhelmed', 'Calm', 'Lonely', 'Grateful', 'Angry', 'Numb'];

export default function FirstMoodScreen() {
  const navigate = useNavigate();
  const [mood, setMood] = useState(null);
  const [note, setNote] = useState('');
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showBonus, setShowBonus] = useState(false);

  function toggleTag(tag) {
    setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  }

  async function handleSubmit() {
    if (!mood) { setError('Please select how you are feeling.'); return; }
    setError('');
    setLoading(true);
    try {
      await client.post('/api/moods', { mood_level: mood, note: note.trim() || undefined, tags: tags.map((t) => t.toLowerCase()) });
      track('onboarding_completed', { first_mood: mood });
      setShowBonus(true);
      setTimeout(() => navigate('/welcome', { replace: true }), 2800);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (showBonus) {
    return (
      <div className="screen screen--no-nav" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🎁</div>
        <h1 style={{ marginBottom: 8 }}>You've got 2 free credits!</h1>
        <p>Use them to connect with a peer supporter.</p>
        <p style={{ marginTop: 8, fontSize: '0.875rem' }}>Taking you to your dashboard…</p>
      </div>
    );
  }

  return (
    <div className="screen screen--no-nav" style={{ padding: '32px 24px' }}>
      <div style={{ marginBottom: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🌅</div>
        <h1 style={{ fontSize: '1.5rem' }}>Your first check-in</h1>
        <p style={{ marginTop: 4 }}>We check in with you every day — let's start now</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <label className="label">How are you feeling right now?</label>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
            {MOODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMood(m.value)}
                className={`mood-btn${mood === m.value ? ' mood-btn--selected' : mood ? ' mood-btn--unselected' : ''}`}
                style={{
                  borderColor: mood === m.value ? m.color : 'var(--color-border)',
                  background: mood === m.value ? `${m.color}20` : 'var(--color-bg-primary)',
                }}
                aria-pressed={mood === m.value}
                aria-label={m.label}
              >
                <span style={{ fontSize: 24 }} aria-hidden="true">{m.emoji}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: mood === m.value ? m.color : 'var(--color-text-muted)', textAlign: 'center', lineHeight: 1.2 }}>{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="note">What's on your mind? <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(optional)</span></label>
          <textarea
            id="note"
            className="textarea"
            rows={3}
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What's on your mind?"
          />
          <div className={`char-counter${note.length > 190 ? ' char-counter--over' : ''}`}>{note.length}/200</div>
        </div>

        <div>
          <label className="label">How would you describe this feeling? <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(optional)</span></label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={`pill${tags.includes(tag) ? ' pill--active' : ''}`}
                style={{ cursor: 'pointer', border: 'none' }}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="error-msg">{error}</div>}

        <button
          className="btn btn--primary"
          onClick={handleSubmit}
          disabled={loading || !mood}
        >
          {loading ? 'Saving…' : 'Submit Check-In'}
        </button>
      </div>
    </div>
  );
}
