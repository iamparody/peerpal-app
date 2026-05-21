import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { X, NotePencil, Smiley } from '@phosphor-icons/react';
import client from '../api/client';

const MOOD_META = {
  very_low: { label: 'Very Low', emoji: '😔', color: 'var(--color-danger)' },
  low:      { label: 'Low',      emoji: '😕', color: 'var(--color-warning)' },
  neutral:  { label: 'Neutral',  emoji: '😐', color: 'var(--color-accent)' },
  good:     { label: 'Good',     emoji: '🙂', color: 'var(--color-calm)' },
  great:    { label: 'Great',    emoji: '😊', color: '#6BAF7A' },
};

function formatTime(ts) {
  const d = new Date(ts.includes('Z') || ts.includes('+') ? ts : ts.replace(' ', 'T') + 'Z');
  return d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatSheetDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-KE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function MoodEntryRow({ entry }) {
  const meta = MOOD_META[entry.mood_level] ?? { label: entry.mood_level, emoji: '•', color: 'var(--color-text-muted)' };
  return (
    <div style={{ paddingBottom: 'var(--space-md)', borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 6 }}>
        <span style={{ fontSize: 22 }} aria-hidden="true">{meta.emoji}</span>
        <div>
          <span style={{ fontWeight: 600, fontSize: 14, color: meta.color }}>{meta.label}</span>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)', marginLeft: 8 }}>
            {formatTime(entry.created_at)}
          </span>
        </div>
      </div>
      {entry.tags?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: entry.note ? 8 : 0 }}>
          {entry.tags.map(tag => (
            <span key={tag} className="pill" style={{ fontSize: 11, padding: '2px 8px' }}>{tag}</span>
          ))}
        </div>
      )}
      {entry.note && (
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5 }}>
          {entry.note}
        </p>
      )}
    </div>
  );
}

function JournalEntryRow({ entry, onReadFull }) {
  const preview = entry.content.length > 300
    ? entry.content.slice(0, 300) + '…'
    : entry.content;
  return (
    <div style={{ paddingBottom: 'var(--space-md)', borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <NotePencil size={14} color="var(--color-text-muted)" aria-hidden="true" />
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          Journal · {formatTime(entry.created_at)}
        </span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 8px', lineHeight: 1.6 }}>
        {preview}
      </p>
      {entry.content.length > 300 && (
        <button
          onClick={() => onReadFull(entry.id)}
          style={{ fontSize: 12, color: 'var(--color-accent)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          Read full entry →
        </button>
      )}
    </div>
  );
}

export default function DayDetailSheet({ date, onClose }) {
  const navigate = useNavigate();
  const sheetRef = useRef(null);

  const { data, isLoading } = useQuery({
    queryKey: ['moods', 'day', date],
    queryFn:  () => client.get(`/api/moods/day?date=${date}`).then(r => r.data),
    enabled:  !!date,
    staleTime: 60 * 1000,
  });

  // Close on backdrop tap
  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose();
  }

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Trap focus inside sheet
  useEffect(() => {
    sheetRef.current?.focus();
  }, []);

  const moods    = data?.moods    ?? [];
  const journals = data?.journals ?? [];
  const hasLowMood = moods.some(m => m.mood_level === 'very_low' || m.mood_level === 'low');
  const isEmpty  = !isLoading && moods.length === 0 && journals.length === 0;

  return (
    <div
      onClick={handleBackdrop}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'flex-end',
      }}
    >
      <div
        ref={sheetRef}
        tabIndex={-1}
        style={{
          width: '100%',
          maxHeight: '80vh',
          background: 'var(--color-bg-primary)',
          borderRadius: '16px 16px 0 0',
          display: 'flex',
          flexDirection: 'column',
          outline: 'none',
          animation: 'slideUp 280ms ease-out',
        }}
      >
        {/* Handle bar */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--color-border)' }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px var(--space-md) var(--space-sm)',
          borderBottom: '1px solid var(--color-border)',
        }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Looking back
            </div>
            <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--color-text-primary)', marginTop: 2 }}>
              {formatSheetDate(date)}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--color-text-muted)' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          {isLoading ? (
            <>
              <div className="skeleton" style={{ height: 60, borderRadius: 'var(--radius-md)' }} />
              <div className="skeleton" style={{ height: 80, borderRadius: 'var(--radius-md)' }} />
            </>
          ) : isEmpty ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-xl) 0', color: 'var(--color-text-muted)' }}>
              <Smiley size={36} weight="duotone" aria-hidden="true" style={{ marginBottom: 8, opacity: 0.4 }} />
              <div style={{ fontSize: 14 }}>Nothing logged on this day</div>
            </div>
          ) : (
            <>
              {/* Mood entries */}
              {moods.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--space-sm)' }}>
                    {moods.length === 1 ? '1 mood logged' : `${moods.length} moods logged`}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                    {moods.map(m => <MoodEntryRow key={m.id} entry={m} />)}
                  </div>
                </div>
              )}

              {/* Journal entries */}
              {journals.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--space-sm)' }}>
                    {journals.length === 1 ? '1 journal entry' : `${journals.length} journal entries`}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                    {journals.map(j => (
                      <JournalEntryRow
                        key={j.id}
                        entry={j}
                        onReadFull={() => { onClose(); navigate('/journal'); }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Safety framing — quiet, not alarming */}
              {hasLowMood && (
                <div style={{
                  background: 'var(--color-surface-secondary)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-md)',
                  borderLeft: '3px solid var(--color-accent)',
                }}>
                  <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 10px', lineHeight: 1.5 }}>
                    Noticing patterns in difficult days can help. If you'd like to talk through what was happening, a conversation might help you understand it better.
                  </p>
                  <button
                    onClick={() => { onClose(); navigate('/ai-chat'); }}
                    style={{
                      fontSize: 13, fontWeight: 600,
                      color: 'var(--color-accent)',
                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    }}
                  >
                    Start a conversation →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
