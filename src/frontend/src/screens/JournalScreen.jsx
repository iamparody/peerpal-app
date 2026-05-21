import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Notebook, Microphone, Stop } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import client from '../api/client';
import PageHeader from '../components/PageHeader';

const MOODS = [
  { value: 'very_low', emoji: '😔', color: 'var(--color-danger)',  label: 'Very Low' },
  { value: 'low',      emoji: '😕', color: 'var(--color-warning)', label: 'Low' },
  { value: 'neutral',  emoji: '😐', color: 'var(--color-accent)',  label: 'Neutral' },
  { value: 'good',     emoji: '🙂', color: 'var(--color-calm)',    label: 'Good' },
  { value: 'great',    emoji: '😊', color: '#6BAF7A',              label: 'Great' },
];
const TAGS = ['Anxious', 'Hopeful', 'Overwhelmed', 'Calm', 'Lonely', 'Grateful', 'Angry', 'Numb'];

function JournalSkeleton() {
  return (
    <div style={{ padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
      {[1, 2, 3].map((i) => (
        <div key={i} className="skeleton" style={{ width: '100%', height: 80, borderRadius: 'var(--radius-lg)' }} />
      ))}
    </div>
  );
}

function EntryCard({ entry, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const mood = MOODS.find((m) => m.value === entry.mood_level);
  return (
    <div
      className="card card--interactive"
      style={{ marginBottom: 'var(--space-sm)' }}
      onClick={() => setExpanded((v) => !v)}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          {mood && <span style={{ fontSize: 20 }} aria-hidden="true">{mood.emoji}</span>}
          <span style={{ fontSize: 'var(--text-caption)', color: 'var(--color-text-muted)' }}>
            {new Date(entry.created_at).toLocaleDateString('en-KE', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4, minWidth: 'var(--touch-target-min)', minHeight: 'var(--touch-target-min)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)' }}
          aria-label="Delete entry"
        >
          🗑
        </button>
      </div>
      {entry.tags?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 'var(--space-sm)' }}>
          {entry.tags.map((t) => <span key={t} className="pill" style={{ fontSize: 10, padding: '2px 8px' }}>{t}</span>)}
        </div>
      )}
      {(entry.content_preview || entry.content) && (
        <p
          style={{ fontSize: 14, color: 'var(--color-text-primary)', lineHeight: 1.6, fontFamily: 'var(--font-editorial)', transition: 'max-height 250ms ease-out' }}
        >
          {expanded ? (entry.content || entry.content_preview) : (entry.content_preview || entry.content?.slice(0, 100)) + ((entry.content_preview?.length >= 100 || entry.content?.length > 100) ? '…' : '')}
        </p>
      )}
    </div>
  );
}

export default function JournalScreen() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [moodFilter, setMoodFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formMood, setFormMood] = useState(null);
  const [formTags, setFormTags] = useState([]);
  const [formContent, setFormContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const hasSpeech = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const recognizerRef = useRef(null);
  const baseContentRef = useRef('');
  const confirmedRef = useRef('');

  const queryKey = ['journals', search, moodFilter];
  const { data, isLoading: loading, isError } = useQuery({
    queryKey,
    queryFn: () => {
      const params = {};
      if (search) params.search = search;
      if (moodFilter) params.mood_level = moodFilter;
      return client.get('/api/journals', { params }).then(r => r.data);
    },
  });

  const entries = data?.entries ?? (Array.isArray(data) ? data : []);
  const error = isError ? "We couldn't connect. Check your internet and try again." : '';

  function toggleFormTag(tag) {
    setFormTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  }

  function startRecording() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognizer = new SR();
    recognizer.continuous = false;
    recognizer.interimResults = true;
    recognizer.lang = 'en-US';
    baseContentRef.current = formContent;
    confirmedRef.current = '';

    recognizer.onresult = (e) => {
      let interim = '';
      let finalChunk = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalChunk += text;
        else interim += text;
      }
      if (finalChunk) confirmedRef.current += finalChunk;
      const separator = baseContentRef.current && (confirmedRef.current || interim) ? ' ' : '';
      setFormContent(baseContentRef.current + separator + confirmedRef.current + interim);
    };

    recognizer.onend = () => {
      setIsRecording(false);
      recognizerRef.current = null;
      const separator = baseContentRef.current && confirmedRef.current ? ' ' : '';
      setFormContent(baseContentRef.current + separator + confirmedRef.current);
    };

    recognizerRef.current = recognizer;
    recognizer.start();
    setIsRecording(true);
  }

  function stopRecording() {
    recognizerRef.current?.stop();
  }

  async function handleSave() {
    setSaveError('');
    if (!formContent.trim()) { setSaveError('Write something — journal entries require text.'); return; }
    setSaving(true);
    try {
      await client.post('/api/journals', {
        content: formContent.trim(),
        mood_level: formMood || undefined,
        tags: formTags.length ? formTags.map((t) => t.toLowerCase()) : undefined,
      });
      setShowForm(false);
      setFormMood(null);
      setFormTags([]);
      setFormContent('');
      qc.invalidateQueries({ queryKey: ['journals'] });
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    qc.setQueryData(queryKey, (old) => {
      if (!old) return old;
      const prev = old.entries ?? (Array.isArray(old) ? old : []);
      const next = prev.filter((e) => e.id !== id);
      return old.entries !== undefined ? { ...old, entries: next } : next;
    });
    try {
      await client.delete(`/api/journals/${id}`);
    } catch {
      qc.invalidateQueries({ queryKey: ['journals'] });
    }
  }

  return (
    <div className="screen">
      <PageHeader
        title="Journal"
        right={
          <button onClick={() => setShowForm((v) => !v)} className="btn btn--primary btn--sm" style={{ width: 'auto' }}>
            + New
          </button>
        }
      />

      {showForm && (
        <div className="card" style={{ margin: 'var(--space-md) var(--space-md) 0' }}>
          <h3 style={{ marginBottom: 'var(--space-md)' }}>New entry</h3>
          <div style={{ marginBottom: 'var(--space-md)' }}>
            <label className="label">Mood <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
            <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 6 }}>
              {MOODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setFormMood(formMood === m.value ? null : m.value)}
                  style={{
                    fontSize: 24,
                    background: 'none',
                    border: `2px solid ${formMood === m.value ? m.color : 'var(--color-border)'}`,
                    borderRadius: 'var(--radius-sm)',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    minWidth: 44,
                    minHeight: 44,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  aria-label={m.label}
                  aria-pressed={formMood === m.value}
                >
                  {m.emoji}
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 'var(--space-md)' }}>
            <label className="label">Tags <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleFormTag(tag)}
                  className={`pill${formTags.includes(tag) ? ' pill--active' : ''}`}
                  style={{ cursor: 'pointer' }}
                  aria-pressed={formTags.includes(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 'var(--space-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <label className="label" htmlFor="content" style={{ marginBottom: 0 }}>Write freely…</label>
              {hasSpeech && (
                <button
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  aria-label="Record voice journal entry"
                  aria-description="Voice is never stored — transcription text only"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    background: isRecording ? 'rgba(220,53,69,0.12)' : 'none',
                    border: `1.5px solid ${isRecording ? 'var(--color-danger)' : 'var(--color-border)'}`,
                    borderRadius: 'var(--radius-sm)',
                    color: isRecording ? 'var(--color-danger)' : 'var(--color-text-muted)',
                    fontSize: 12,
                    cursor: 'pointer',
                    padding: '4px 10px',
                    minHeight: 32,
                    animation: isRecording ? 'micPulse 1.2s ease-in-out infinite' : 'none',
                  }}
                >
                  {isRecording
                    ? <><Stop size={14} weight="fill" /> Listening…</>
                    : <><Microphone size={14} weight="bold" /> Voice</>}
                </button>
              )}
            </div>
            <textarea
              id="content"
              className="textarea textarea--journal"
              rows={5}
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              placeholder="Write freely… no rules, just you."
              style={{ border: 'none', background: 'transparent', color: 'var(--color-text-dark)', padding: 0, resize: 'vertical', minHeight: 120 }}
            />
          </div>
          {saveError && <div className="error-msg" style={{ marginBottom: 'var(--space-sm)' }}>{saveError}</div>}
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <button className="btn btn--primary btn--sm" onClick={handleSave} disabled={saving} style={{ flex: 1 }}>{saving ? 'Saving…' : 'Save entry'}</button>
            <button className="btn btn--muted btn--sm" onClick={() => setShowForm(false)} style={{ flex: 1 }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ padding: 'var(--space-md) var(--space-md) var(--space-sm)', display: 'flex', gap: 'var(--space-sm)' }}>
        <input
          type="search"
          className="input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search entries…"
          style={{ flex: 1, minHeight: 44 }}
          aria-label="Search journal entries"
        />
        <select
          className="select"
          style={{ width: 'auto', minWidth: 120, minHeight: 44 }}
          value={moodFilter}
          onChange={(e) => setMoodFilter(e.target.value)}
          aria-label="Filter by mood"
        >
          <option value="">All moods</option>
          {MOODS.map((m) => <option key={m.value} value={m.value}>{m.emoji} {m.label}</option>)}
        </select>
      </div>

      <div style={{ padding: '0 var(--space-md)' }}>
        {error && <div className="error-msg" style={{ marginBottom: 'var(--space-md)' }}>{error}</div>}
        {loading ? (
          <JournalSkeleton />
        ) : entries.length === 0 ? (
          <div className="empty-state">
            <Notebook size={48} weight="duotone" color="var(--color-text-muted)" className="empty-state__icon" aria-hidden="true" />
            <div className="empty-state__title">Your journal is waiting</div>
            <div className="empty-state__body">Write your first entry — no rules, just you.</div>
            <button className="btn btn--ghost btn--sm" style={{ width: 'auto' }} onClick={() => setShowForm(true)}>Write something</button>
          </div>
        ) : (
          entries.map((e) => <EntryCard key={e.id} entry={e} onDelete={handleDelete} />)
        )}
      </div>
    </div>
  );
}
