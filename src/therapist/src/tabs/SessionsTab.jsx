import { useState, useEffect, useCallback } from 'react';
import SessionRoom from '../components/SessionRoom';
import { X } from '@phosphor-icons/react';
import client from '../api/client';

function formatEAT(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-KE', {
      timeZone: 'Africa/Nairobi',
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function StatusBadge({ status }) {
  return <span className={`badge badge--${(status || 'pending').toLowerCase().replace(/ /g, '_')}`}>{status || 'pending'}</span>;
}

function FormatBadge({ format }) {
  return <span className={`badge badge--${(format || 'text').toLowerCase()}`}>{format || 'text'}</span>;
}

function NoteTypeBadge({ type }) {
  const map = { pre: 'Pre-session', session: 'Session', follow_up: 'Follow-up' };
  return <span className={`badge badge--note-${type}`}>{map[type] || type}</span>;
}

const NOTE_TYPE_OPTIONS = [
  { value: 'pre',       label: 'Pre-session' },
  { value: 'session',   label: 'Session' },
  { value: 'follow_up', label: 'Follow-up' },
];

const FILTER_TABS = [
  { id: 'upcoming',  label: 'Upcoming' },
  { id: 'pending',   label: 'Pending' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
];

function NotesPanel({ booking, onClose, onCountChange }) {
  const [notes, setNotes]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [text, setText]         = useState('');
  const [noteType, setNoteType] = useState('session');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    client.get('/api/therapy/session-notes', { params: { booking_id: booking.id } })
      .then((r) => { setNotes(r.data.notes || []); onCountChange(booking.id, (r.data.notes || []).length); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [booking.id]);

  async function handleSave() {
    if (!text.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await client.post('/api/therapy/session-notes', {
        booking_id: booking.id,
        content:    text.trim(),
        note_type:  noteType,
      });
      const newNote = { id: res.data.id, note_type: noteType, content: text.trim(), created_at: new Date().toISOString() };
      const updated = [...notes, newNote];
      setNotes(updated);
      onCountChange(booking.id, updated.length);
      setText('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save note.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="panel-overlay" onClick={onClose} />
      <div className="slide-panel">
        <div className="slide-panel__header">
          <span className="slide-panel__title">
            Notes{notes.length > 0 ? ` (${notes.length})` : ''}
          </span>
          <button className="btn btn--ghost btn--sm" onClick={onClose} style={{ padding: '4px 8px' }}>
            <X size={16} />
          </button>
        </div>
        <div className="slide-panel__body">
          <p className="text-sm text-muted mb-12">
            <strong>{booking.member_alias || 'Member'}</strong> — {formatEAT(booking.scheduled_at)}
          </p>
          <div className="private-notice mb-16">
            Private — not visible to client
          </div>

          {/* Existing notes */}
          {loading ? (
            <div className="text-sm text-muted mb-16">Loading notes…</div>
          ) : notes.length > 0 ? (
            <div className="flex-col gap-10 mb-20">
              {notes.map((n) => (
                <div key={n.id} className="note-card">
                  <div className="flex items-center gap-8 mb-6">
                    <NoteTypeBadge type={n.note_type} />
                    <span className="text-xs text-muted">{formatEAT(n.created_at)}</span>
                  </div>
                  <p className="text-sm pre-wrap" style={{ margin: 0 }}>{n.content}</p>
                </div>
              ))}
            </div>
          ) : null}

          {/* New note form */}
          <div className="form-group mb-10">
            <label className="form-label">Note type</label>
            <div className="flex gap-8">
              {NOTE_TYPE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  className={`btn btn--sm ${noteType === o.value ? 'btn--accent' : 'btn--ghost'}`}
                  onClick={() => setNoteType(o.value)}
                  type="button"
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Add note</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write your note here…"
              style={{ minHeight: 140 }}
            />
          </div>
          {error && <div className="error-text">{error}</div>}
        </div>
        <div className="slide-panel__footer">
          <button className="btn btn--ghost btn--sm" onClick={onClose}>Close</button>
          <button
            className="btn btn--primary btn--sm"
            disabled={saving || !text.trim()}
            onClick={handleSave}
          >
            {saving ? 'Saving…' : 'Save Note'}
          </button>
        </div>
      </div>
    </>
  );
}

export default function SessionsTab() {
  const [filter, setFilter]         = useState('upcoming');
  const [bookings, setBookings]     = useState([]);
  const [loading, setLoading]       = useState(false);
  const [page, setPage]             = useState(1);
  const [hasMore, setHasMore]       = useState(false);
  const [actionBusy, setActionBusy] = useState({});
  const [notesFor, setNotesFor]     = useState(null);
  const [noteCounts, setNoteCounts] = useState({});
  const [activeSession, setActiveSession] = useState(null);

  const load = useCallback(async (status, pg) => {
    setLoading(true);
    try {
      const res = await client.get('/api/therapy/therapist/bookings', {
        params: { status, page: pg, limit: 20 },
      });
      const list = res.data?.bookings || res.data || [];
      if (pg === 1) setBookings(list);
      else setBookings((prev) => [...prev, ...list]);
      setHasMore(list.length === 20);
    } catch {
      if (pg === 1) setBookings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
    setBookings([]);
    load(filter, 1);
  }, [filter, load]);

  function loadMore() {
    const next = page + 1;
    setPage(next);
    load(filter, next);
  }

  async function handleAction(bookingId, action) {
    setActionBusy((b) => ({ ...b, [bookingId]: action }));
    try {
      await client.patch(`/api/therapy/bookings/${bookingId}/${action}`);
      load(filter, 1);
      setPage(1);
    } catch {
      // ignore
    } finally {
      setActionBusy((b) => ({ ...b, [bookingId]: null }));
    }
  }

  async function startSession(booking) {
    try {
      const res = await client.post('/api/therapy/sessions/start', { booking_id: booking.id });
      setActiveSession({ booking, sessionData: res.data });
    } catch (err) {
      alert(err.response?.data?.error || 'Could not start session. Check the booking is confirmed and within 15 minutes of the scheduled time.');
    }
  }

  function notesLabel(bookingId) {
    const n = noteCounts[bookingId];
    return n != null ? `Notes (${n})` : 'Notes';
  }

  return (
    <div>
      {activeSession && (
        <SessionRoom
          booking={activeSession.booking}
          sessionData={activeSession.sessionData}
          onEnd={() => { setActiveSession(null); load(filter, 1); }}
        />
      )}
      {notesFor && (
        <NotesPanel
          booking={notesFor}
          onClose={() => setNotesFor(null)}
          onCountChange={(id, count) => setNoteCounts((c) => ({ ...c, [id]: count }))}
        />
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">Sessions</h1>
          <p className="page-subtitle">Manage all your therapy sessions</p>
        </div>
      </div>

      <div className="status-tabs mb-20">
        {FILTER_TABS.map((t) => (
          <button
            key={t.id}
            className={`status-tab${filter === t.id ? ' active' : ''}`}
            onClick={() => setFilter(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && bookings.length === 0 ? (
        <div className="loading">Loading sessions…</div>
      ) : bookings.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">📋</div>
          <div className="empty-text">No {filter} sessions</div>
        </div>
      ) : (
        <div className="flex-col gap-12">
          {bookings.map((b) => (
            <div key={b.id} className="card" style={{ padding: '16px 20px' }}>
              <div className="flex items-start gap-16 flex-wrap">
                <div className="flex-1">
                  <div className="flex items-center gap-8 mb-4">
                    <span className="fw-600" style={{ fontSize: 15 }}>{b.member_alias || 'Member'}</span>
                    {b.prior_sessions_count > 0 && (
                      <span className="badge badge--session-n">Session {b.prior_sessions_count + 1}</span>
                    )}
                    <FormatBadge format={b.session_format} />
                    <StatusBadge status={b.status} />
                  </div>
                  <div className="text-sm text-muted mb-4">
                    {formatEAT(b.scheduled_at)}
                    {b.duration_minutes ? ` · ${b.duration_minutes} min` : ''}
                  </div>
                  {b.member_notes && (
                    <div style={{
                      fontSize: 13,
                      color: 'var(--color-text-muted)',
                      background: 'var(--color-main-bg)',
                      borderRadius: 4,
                      padding: '6px 10px',
                      marginTop: 6,
                      fontStyle: 'italic',
                    }}>
                      "{b.member_notes}"
                    </div>
                  )}
                </div>
                <div className="btn-group shrink-0">
                  {b.status === 'pending' && (
                    <>
                      <button
                        className="btn btn--success btn--sm"
                        disabled={!!actionBusy[b.id]}
                        onClick={() => handleAction(b.id, 'confirm')}
                      >
                        {actionBusy[b.id] === 'confirm' ? 'Confirming…' : 'Confirm'}
                      </button>
                      <button
                        className="btn btn--ghost btn--sm"
                        disabled={!!actionBusy[b.id]}
                        onClick={() => handleAction(b.id, 'decline')}
                      >
                        {actionBusy[b.id] === 'decline' ? 'Declining…' : 'Decline'}
                      </button>
                    </>
                  )}
                  {(b.status === 'confirmed' || b.status === 'upcoming') && (
                    <>
                      <button className="btn btn--primary btn--sm" onClick={() => startSession(b)}>
                        Start Session
                      </button>
                      <button className="btn btn--accent btn--sm" onClick={() => setNotesFor(b)}>
                        {notesLabel(b.id)}
                      </button>
                    </>
                  )}
                  {b.status === 'completed' && (
                    <button className="btn btn--accent btn--sm" onClick={() => setNotesFor(b)}>
                      {notesLabel(b.id)}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {hasMore && (
            <div className="text-center" style={{ paddingTop: 8 }}>
              <button className="btn btn--ghost" onClick={loadMore} disabled={loading}>
                {loading ? 'Loading…' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
