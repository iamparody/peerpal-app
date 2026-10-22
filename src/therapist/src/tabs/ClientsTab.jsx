import { useState, useEffect } from 'react';
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

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-KE', {
      timeZone: 'Africa/Nairobi',
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return iso; }
}

function NoteTypeBadge({ type }) {
  const map = { pre: 'Pre-session', session: 'Session', follow_up: 'Follow-up' };
  return <span className={`badge badge--note-${type}`}>{map[type] || type}</span>;
}

function StatusBadge({ status }) {
  return <span className={`badge badge--${(status || 'pending').toLowerCase()}`}>{status}</span>;
}

function FormatBadge({ format }) {
  return <span className={`badge badge--${(format || 'text').toLowerCase()}`}>{format || 'text'}</span>;
}

const NOTE_TYPE_OPTIONS = [
  { value: 'pre',       label: 'Pre-session' },
  { value: 'session',   label: 'Session' },
  { value: 'follow_up', label: 'Follow-up' },
];

function ClientDetailPanel({ memberUserId, onClose }) {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [editingNote, setEditingNote] = useState(null); // { id, content, note_type }
  const [editText, setEditText] = useState('');
  const [editType, setEditType] = useState('session');
  const [saving, setSaving]     = useState(false);
  const [addText, setAddText]   = useState('');
  const [addType, setAddType]   = useState('follow_up');
  const [addSaving, setAddSaving] = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    client.get(`/api/therapy/therapist/clients/${memberUserId}`)
      .then((r) => setData(r.data))
      .catch(() => setError('Failed to load client history.'))
      .finally(() => setLoading(false));
  }, [memberUserId]);

  const completedBookings = data?.bookings?.filter((b) => b.status === 'completed') || [];
  const lastCompleted = completedBookings[completedBookings.length - 1];
  const firstSession = data?.bookings?.[0];

  async function saveEdit() {
    if (!editText.trim()) return;
    setSaving(true);
    try {
      await client.patch(`/api/therapy/session-notes/${editingNote.id}`, {
        content: editText.trim(),
        note_type: editType,
      });
      setData((prev) => ({
        ...prev,
        bookings: prev.bookings.map((b) => ({
          ...b,
          notes: (b.notes || []).map((n) =>
            n.id === editingNote.id ? { ...n, content: editText.trim(), note_type: editType } : n
          ),
        })),
      }));
      setEditingNote(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  async function addNote() {
    if (!addText.trim() || !lastCompleted) return;
    setAddSaving(true);
    setError('');
    try {
      const res = await client.post('/api/therapy/session-notes', {
        booking_id: lastCompleted.id,
        content:    addText.trim(),
        note_type:  addType,
      });
      const newNote = { id: res.data.id, note_type: addType, content: addText.trim(), created_at: new Date().toISOString() };
      setData((prev) => ({
        ...prev,
        bookings: prev.bookings.map((b) =>
          b.id === lastCompleted.id ? { ...b, notes: [...(b.notes || []), newNote] } : b
        ),
      }));
      setAddText('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save note.');
    } finally {
      setAddSaving(false);
    }
  }

  const allNotes = (data?.bookings || []).flatMap((b) =>
    (b.notes || []).map((n) => ({ ...n, booking_date: b.scheduled_at }))
  ).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  return (
    <>
      <div className="panel-overlay" onClick={onClose} />
      <div className="slide-panel" style={{ width: 520 }}>
        <div className="slide-panel__header">
          <span className="slide-panel__title">
            {loading ? 'Loading…' : (data?.client?.alias || 'Client')}
          </span>
          <button className="btn btn--ghost btn--sm" onClick={onClose} style={{ padding: '4px 8px' }}>
            <X size={16} />
          </button>
        </div>

        <div className="slide-panel__body">
          {loading ? (
            <div style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Loading client history…</div>
          ) : error && !data ? (
            <div className="error-text">{error}</div>
          ) : (
            <>
              {/* Header stats */}
              <div className="stat-row">
                <div>
                  <div className="stat-row__item__label">First session</div>
                  <div className="stat-row__item__value">{formatDate(firstSession?.scheduled_at)}</div>
                </div>
                <div>
                  <div className="stat-row__item__label">Total sessions</div>
                  <div className="stat-row__item__value">{data?.bookings?.length || 0}</div>
                </div>
              </div>

              {/* Session timeline */}
              <div className="mb-24">
                <div className="uppercase-label mb-10">Session history</div>
                {(data?.bookings || []).length === 0 ? (
                  <div className="text-sm text-muted">No sessions yet.</div>
                ) : (
                  <div className="flex-col gap-8">
                    {(data?.bookings || []).map((b) => (
                      <div key={b.id} className="note-card flex items-center gap-10 text-sm">
                        <span className="text-muted" style={{ minWidth: 120 }}>{formatDate(b.scheduled_at)}</span>
                        <FormatBadge format={b.format} />
                        <StatusBadge status={b.status} />
                        {b.duration_minutes && <span className="text-muted">{b.duration_minutes} min</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes history */}
              <div className="mb-24">
                <div className="uppercase-label mb-10">Notes</div>
                {allNotes.length === 0 ? (
                  <div className="text-sm text-muted">No notes yet.</div>
                ) : (
                  <div className="flex-col gap-10">
                    {allNotes.map((n) => (
                      <div key={n.id} className="note-card">
                        {editingNote?.id === n.id ? (
                          <>
                            <div className="flex gap-6 mb-8">
                              {NOTE_TYPE_OPTIONS.map((o) => (
                                <button key={o.value} type="button"
                                  className={`btn btn--xs ${editType === o.value ? 'btn--accent' : 'btn--ghost'}`}
                                  onClick={() => setEditType(o.value)}
                                >{o.label}</button>
                              ))}
                            </div>
                            <textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              style={{ minHeight: 80, marginBottom: 8 }}
                            />
                            <div className="flex gap-8">
                              <button className="btn btn--primary btn--xs" disabled={saving} onClick={saveEdit}>
                                {saving ? 'Saving…' : 'Save'}
                              </button>
                              <button className="btn btn--ghost btn--xs" onClick={() => setEditingNote(null)}>Cancel</button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex items-center gap-8 mb-6">
                              <NoteTypeBadge type={n.note_type} />
                              <span className="text-xs text-muted">{formatEAT(n.created_at)}</span>
                              <button
                                className="btn btn--ghost btn--xs ml-auto"
                                onClick={() => { setEditingNote(n); setEditText(n.content); setEditType(n.note_type); }}
                              >Edit</button>
                            </div>
                            <p className="text-sm pre-wrap" style={{ margin: 0 }}>{n.content}</p>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add note (attaches to most recent completed booking) */}
              {lastCompleted && (
                <div>
                  <div className="uppercase-label mb-10">Add note</div>
                  <div className="flex gap-6 mb-10">
                    {NOTE_TYPE_OPTIONS.map((o) => (
                      <button key={o.value} type="button"
                        className={`btn btn--xs ${addType === o.value ? 'btn--accent' : 'btn--ghost'}`}
                        onClick={() => setAddType(o.value)}
                      >{o.label}</button>
                    ))}
                  </div>
                  <textarea
                    value={addText}
                    onChange={(e) => setAddText(e.target.value)}
                    placeholder="Write a note…"
                    style={{ minHeight: 100, marginBottom: 8 }}
                  />
                  {error && <div className="error-text mb-8">{error}</div>}
                  <button
                    className="btn btn--primary btn--sm"
                    disabled={addSaving || !addText.trim()}
                    onClick={addNote}
                  >
                    {addSaving ? 'Saving…' : 'Save Note'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default function ClientsTab() {
  const [clients, setClients]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    client.get('/api/therapy/therapist/clients')
      .then((r) => setClients(r.data.clients || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      {selected && (
        <ClientDetailPanel
          memberUserId={selected}
          onClose={() => setSelected(null)}
        />
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">Clients</h1>
          <p className="page-subtitle">Your full client history across all sessions</p>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading clients…</div>
      ) : clients.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">👥</div>
          <div className="empty-text">No completed sessions yet</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Sessions</th>
                <th>Last session</th>
                <th>Format</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.member_user_id} style={{ cursor: 'pointer' }} onClick={() => setSelected(c.member_user_id)}>
                  <td className="fw-500">{c.alias || 'Member'}</td>
                  <td>{c.total_sessions}</td>
                  <td className="text-muted">{formatDate(c.last_session_at)}</td>
                  <td><FormatBadge format={c.last_session_format} /></td>
                  <td className="text-muted">{c.note_count}</td>
                  <td>
                    <button className="btn btn--ghost btn--xs" onClick={(e) => { e.stopPropagation(); setSelected(c.member_user_id); }}>
                      View →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
