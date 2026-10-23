import { useEffect, useState, useCallback } from 'react';
import { ShieldCheck } from '@phosphor-icons/react';
import client from '../api/client';

const FILTER_TABS = [
  { key: '',         label: 'All' },
  { key: 'pending',  label: 'Pending' },
  { key: 'reviewed', label: 'Reviewed' },
];

export default function ReportsTab({ onCountChange }) {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [filter,  setFilter]  = useState('');
  const [acting,  setActing]  = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await client.get('/api/admin/reports');
      const list = data.reports ?? [];
      setItems(list);
      onCountChange?.(list.filter((r) => !r.reviewed_at).length);
    } catch { setError('Failed to load reports.'); }
    finally   { setLoading(false); }
  }, [onCountChange]);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === 'pending'
    ? items.filter((r) => !r.reviewed_at)
    : filter === 'reviewed'
    ? items.filter((r) =>  r.reviewed_at)
    : items;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Group Reports Queue</h1>
          <p className="page-subtitle">Flagged messages from group chats</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="status-tabs">
            {FILTER_TABS.map((t) => (
              <button
                key={t.key}
                className={`status-tab${filter === t.key ? ' active' : ''}`}
                onClick={() => setFilter(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button className="refresh-btn" onClick={load} title="Refresh">↻</button>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card">
        <div className="table-wrap">
          {loading ? (
            <div className="loading">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <ShieldCheck size={40} className="empty-state__icon" />
              <p className="empty-state__title">No reports</p>
              <p className="empty-state__sub">No reports match the current filter.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Reported</th>
                  <th>Reporter</th>
                  <th>Reason</th>
                  <th>Message</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td>{r.group_name}</td>
                    <td><span className="alias">{r.reported_alias}</span></td>
                    <td><span className="alias" style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>{r.reporter_alias}</span></td>
                    <td><span className="badge badge--pending">{r.reason}</span></td>
                    <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'italic', color: 'var(--color-text-muted)' }}>
                      "{r.message_preview}"
                    </td>
                    <td><span className="elapsed">{new Date(r.created_at).toLocaleDateString()}</span></td>
                    <td>
                      <div className="btn-group">
                        <button className="btn btn--ghost btn--sm"   onClick={() => setActing({ report: r, action: 'dismiss' })}>Dismiss</button>
                        <button className="btn btn--warning btn--sm" onClick={() => setActing({ report: r, action: 'warn' })}>Warn</button>
                        <button className="btn btn--danger btn--sm"  onClick={() => setActing({ report: r, action: 'ban' })}>Ban</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {acting && (
        <ActionModal
          report={acting.report}
          action={acting.action}
          onClose={() => setActing(null)}
          onDone={() => { setActing(null); load(); }}
        />
      )}
    </div>
  );
}

function ActionModal({ report, action, onClose, onDone }) {
  const [notes,  setNotes]  = useState('');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const labels   = { dismiss: 'Dismiss Report', warn: 'Warn User', ban: 'Ban User' };
  const btnClass = { dismiss: 'btn--ghost',      warn: 'btn--warning', ban: 'btn--danger' };

  async function handleConfirm() {
    setSaving(true);
    setError('');
    try {
      await client.patch(`/api/admin/reports/${report.id}/action`, {
        action,
        admin_notes: notes.trim() || undefined,
      });
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <p className="modal__title">{labels[action]}</p>
        <div className="modal__preview">
          <strong>Group:</strong> {report.group_name}<br />
          <strong>Reported user:</strong> <span className="alias">{report.reported_alias}</span><br />
          <strong>Reason:</strong> {report.reason}
          {report.message_preview && <><br /><strong>Message:</strong> <em>"{report.message_preview}"</em></>}
        </div>
        {action !== 'dismiss' && (
          <div className="form-group">
            <label className="form-label">
              {action === 'warn' ? 'Warning message (sent to user)' : 'Reason for ban'}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={action === 'warn' ? 'Warning message…' : 'Reason for ban…'}
              rows={3}
              autoFocus
            />
          </div>
        )}
        {error && <p className="error-text">{error}</p>}
        <div className="modal-footer">
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className={`btn ${btnClass[action]}`} onClick={handleConfirm} disabled={saving}>
            {saving ? 'Working…' : `Confirm ${labels[action]}`}
          </button>
        </div>
      </div>
    </div>
  );
}
