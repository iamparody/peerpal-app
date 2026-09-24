import { useState, useEffect, useCallback } from 'react';
import { X } from '@phosphor-icons/react';
import client from '../api/client';

function formatEAT(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-KE', {
      timeZone: 'Africa/Nairobi',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function StatusBadge({ status }) {
  const cls = `badge badge--${(status || 'pending').toLowerCase().replace(/ /g, '_')}`;
  return <span className={cls}>{status || 'pending'}</span>;
}

function FormatBadge({ format }) {
  const cls = `badge badge--${(format || 'text').toLowerCase()}`;
  return <span className={cls}>{format || 'text'}</span>;
}

const FILTER_TABS = [
  { id: 'upcoming',  label: 'Upcoming' },
  { id: 'pending',   label: 'Pending' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
];

function NotesPanel({ booking, onClose }) {
  const [text, setText]     = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState('');

  async function handleSave() {
    if (!text.trim()) return;
    setSaving(true);
    setError('');
    try {
      await client.post('/api/therapy/session-notes', {
        booking_id: booking.id,
        note_text:  text.trim(),
      });
      setSaved(true);
      setTimeout(onClose, 900);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save notes.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="panel-overlay" onClick={onClose} />
      <div className="slide-panel">
        <div className="slide-panel__header">
          <span className="slide-panel__title">Session Notes</span>
          <button
            className="btn btn--ghost btn--sm"
            onClick={onClose}
            style={{ padding: '4px 8px' }}
          >
            <X size={16} />
          </button>
        </div>
        <div className="slide-panel__body">
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 12 }}>
            <strong>{booking.member_alias || 'Member'}</strong> — {formatEAT(booking.scheduled_at)}
          </p>
          <div style={{
            background: 'var(--color-warning-bg)',
            border: '1px solid rgba(217,164,65,0.25)',
            borderRadius: 6,
            padding: '8px 12px',
            fontSize: 12,
            color: 'var(--color-status-pending)',
            marginBottom: 14,
          }}>
            Private — not visible to client
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Add your session notes here…"
              style={{ minHeight: 180 }}
            />
          </div>
          {error && <div className="error-text">{error}</div>}
          {saved && <div style={{ color: 'var(--color-success)', fontSize: 13 }}>Saved!</div>}
        </div>
        <div className="slide-panel__footer">
          <button className="btn btn--ghost btn--sm" onClick={onClose}>Cancel</button>
          <button
            className="btn btn--primary btn--sm"
            disabled={saving || !text.trim()}
            onClick={handleSave}
          >
            {saving ? 'Saving…' : 'Save Notes'}
          </button>
        </div>
      </div>
    </>
  );
}

export default function SessionsTab() {
  const [filter, setFilter]       = useState('upcoming');
  const [bookings, setBookings]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [page, setPage]           = useState(1);
  const [hasMore, setHasMore]     = useState(false);
  const [actionBusy, setActionBusy] = useState({});
  const [notesFor, setNotesFor]   = useState(null);

  const load = useCallback(async (status, pg) => {
    setLoading(true);
    try {
      const res = await client.get('/api/therapy/therapist/bookings', {
        params: { status, page: pg, limit: 20 },
      });
      const list = res.data?.bookings || res.data || [];
      if (pg === 1) {
        setBookings(list);
      } else {
        setBookings((prev) => [...prev, ...list]);
      }
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

  return (
    <div>
      {notesFor && (
        <NotesPanel booking={notesFor} onClose={() => setNotesFor(null)} />
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">Sessions</h1>
          <p className="page-subtitle">Manage all your therapy sessions</p>
        </div>
      </div>

      <div className="status-tabs" style={{ marginBottom: 20 }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {bookings.map((b) => (
            <div key={b.id} className="card" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{b.member_alias || 'Member'}</span>
                    <FormatBadge format={b.format} />
                    <StatusBadge status={b.status} />
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 4 }}>
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
                <div className="btn-group" style={{ flexShrink: 0 }}>
                  {(b.status === 'pending') && (
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
                    <button className="btn btn--ghost btn--sm" disabled>
                      Session room coming soon
                    </button>
                  )}
                  {b.status === 'completed' && (
                    <button
                      className="btn btn--accent btn--sm"
                      onClick={() => setNotesFor(b)}
                    >
                      Add Notes
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {hasMore && (
            <div style={{ textAlign: 'center', paddingTop: 8 }}>
              <button
                className="btn btn--ghost"
                onClick={loadMore}
                disabled={loading}
              >
                {loading ? 'Loading…' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
