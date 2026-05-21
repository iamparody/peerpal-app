import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Robot, Handshake, Siren } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import client from '../api/client';
import MoodBlob from '../components/MoodBlob';

const MOODS = [
  { value: 'very_low', label: 'Very Low', emoji: '😔', color: 'var(--color-danger)' },
  { value: 'low',      label: 'Low',      emoji: '😕', color: 'var(--color-warning)' },
  { value: 'neutral',  label: 'Neutral',  emoji: '😐', color: 'var(--color-accent)' },
  { value: 'good',     label: 'Good',     emoji: '🙂', color: 'var(--color-calm)' },
  { value: 'great',    label: 'Great',    emoji: '😊', color: '#6BAF7A' },
];

const TAGS = ['Anxious', 'Hopeful', 'Overwhelmed', 'Calm', 'Lonely', 'Grateful', 'Angry', 'Numb'];

export default function MoodCheckinScreen() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mood, setMood] = useState(null);
  const [note, setNote] = useState('');
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showLowPrompt, setShowLowPrompt] = useState(false);
  const [saved, setSaved] = useState(false);

  function toggleTag(tag) {
    setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  }

  async function handleSubmit() {
    if (!mood) { setError('Please select how you are feeling.'); return; }
    setError('');
    setLoading(true);
    try {
      await client.post('/api/moods', { mood_level: mood, note: note.trim() || undefined, tags: tags.map((t) => t.toLowerCase()) });
      qc.invalidateQueries({ queryKey: ['moods'] });
      if (mood === 'very_low') {
        setShowLowPrompt(true);
      } else {
        setSaved(true);
      }
    } catch {
      setError('Something went wrong saving your mood. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (saved) {
    return (
      <div className="screen" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 'var(--space-xl) var(--space-lg)' }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-xl)' }}>
          <div style={{ fontSize: 48, marginBottom: 'var(--space-md)' }}>✓</div>
          <h1 style={{ fontSize: 'var(--text-h2)', marginBottom: 'var(--space-sm)' }}>Mood saved</h1>
          <p style={{ color: 'var(--color-text-muted)' }}>You can log another whenever you need to.</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          <button className="btn btn--primary" onClick={() => { setMood(null); setNote(''); setTags([]); setSaved(false); }}>
            Log another
          </button>
          <button className="btn btn--ghost" onClick={() => navigate('/journal')}>
            Write about it
          </button>
          <button className="btn btn--muted" onClick={() => navigate('/dashboard')}>
            Back to home
          </button>
        </div>
      </div>
    );
  }

  if (showLowPrompt) {
    return (
      <div className="screen" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 'var(--space-xl) var(--space-lg)' }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-xl)' }}>
          <div style={{ fontSize: 48, marginBottom: 'var(--space-md)' }}>💙</div>
          <h1 style={{ fontSize: 'var(--text-h2)', marginBottom: 'var(--space-sm)' }}>We noticed you're having a hard day</h1>
          <p>You don't have to go through this alone.</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          <button className="btn btn--primary" onClick={() => navigate('/ai-chat', { replace: true })}>
            <Robot size={20} weight="duotone" aria-hidden="true" /> Talk to your AI companion
          </button>
          <button className="btn btn--ghost" onClick={() => navigate('/peer', { replace: true })}>
            <Handshake size={20} weight="duotone" aria-hidden="true" /> Connect with a peer
          </button>
          <button className="btn btn--danger" onClick={() => navigate('/emergency', { replace: true })}>
            <Siren size={20} weight="duotone" aria-hidden="true" /> Emergency help
          </button>
          <button className="btn btn--muted" onClick={() => navigate('/dashboard', { replace: true })}>Not now</button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="page-header">
        <button className="page-header__back" onClick={() => navigate(-1)} aria-label="Back">‹</button>
        <h2 className="page-header__title">How Are You Feeling?</h2>
      </div>

      <div style={{ padding: 'var(--space-sm) var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
        <MoodBlob mood={mood} />

        <div>
          <label className="label">How are you feeling right now?</label>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)' }}>
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
                <span style={{ fontSize: 28 }} aria-hidden="true">{m.emoji}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: mood === m.value ? m.color : 'var(--color-text-muted)', textAlign: 'center', lineHeight: 1.2 }}>{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="note">What's on your mind? <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
          <textarea
            id="note"
            className="textarea textarea--journal"
            rows={3}
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Write freely…"
          />
          <div className={`char-counter${note.length > 190 ? ' char-counter--over' : ''}`}>{note.length}/200</div>
        </div>

        <div>
          <label className="label">How would you describe this feeling? <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)' }}>
            {TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={`pill${tags.includes(tag) ? ' pill--active' : ''}`}
                style={{ cursor: 'pointer' }}
                aria-pressed={tags.includes(tag)}
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
