import { useEffect, useState, useCallback } from 'react';
import client from '../api/client';

const ACTIONS = [
  { value: 'no_action',              label: 'No action — noted only' },
  { value: 'refresher_recommended',  label: 'Recommend a refresher' },
  { value: 'refresher_required',     label: 'Require refresher (suspends permission until complete)' },
  { value: 'temporary_suspension',   label: 'Temporary suspension' },
  { value: 'revocation',             label: 'Revoke permission permanently' },
];

const ACTION_BADGE = {
  no_action:             'badge--published',
  refresher_recommended: 'badge--archived',
  refresher_required:    'badge--archived',
  temporary_suspension:  'badge--high',
  revocation:            'badge--high',
};

function signalSummary(type, data) {
  if (!type) return '—';
  const base = type.replace(/_/g, ' ');
  if (!data) return base;
  try {
    const d = typeof data === 'string' ? JSON.parse(data) : data;
    const extra = Object.entries(d)
      .slice(0, 2)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    return extra ? `${base} — ${extra}` : base;
  } catch {
    return base;
  }
}

export default function PermissionFlagsTab({ onCountChange }) {
  const [items,         setItems]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [filter,        setFilter]        = useState('unresolved');
  const [page,          setPage]          = useState(1);
  const [totalPages,    setTotalPages]    = useState(1);
  const [resolveTarget, setResolveTarget] = useState(null);
  const [actionChoice,  setActionChoice]  = useState('no_action');
  const [submitting,    setSubmitting]    = useState(false);
  const [resolveError,  setResolveError]  = useState('');

  const load = useCallback(async (f = filter, p = page) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await client.get('/api/admin/permission-flags', {
        params: { resolved: f === 'resolved', page: p },
      });
      setItems(data.flags ?? []);
      setTotalPages(data.pages ?? 1);
      if (f === 'unresolved') onCountChange?.(data.total ?? 0);
    } catch {
      setError('Failed to load permission flags.');
    } finally {
      setLoading(false);
    }
  }, [filter, page, onCountChange]);

  useEffect(() => { load(filter, page); }, [filter, page]); // eslint-disable-line

  function switchFilter(f) {
    setFilter(f);
    setPage(1);
  }

  function openResolve(flag) {
    setResolveTarget(flag);
    setActionChoice('no_action');
    setResolveError('');
  }

  async function handleResolve() {
    if (!resolveTarget) return;
    setSubmitting(true);
    setResolveError('');
    try {
      await client.patch(`/api/admin/permission-flags/${resolveTarget.id}/resolve`, {
        action_taken: actionChoice,
      });
      setResolveTarget(null);
      load(filter, page);
    } catch (err) {
      setResolveError(err.response?.data?.error || 'Could not resolve. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Permission Flags</h1>
          <p className="page-subtitle">Peer conduct signals that require admin review</p>
        </div>
        <button className="refresh-btn" onClick={() => load(filter, page)} title="Refresh">↻</button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['unresolved', 'resolved'].map((f) => (
          <button
            key={f}
            className={`btn btn--sm${filter === f ? ' btn--primary' : ' btn--ghost'}`}
            onClick={() => switchFilter(f)}
            style={{ textTransform: 'capitalize' }}
          >
            {f}
          </button>
        ))}
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card">
        <div className="table-wrap">
          {loading ? (
            <div className="loading">Loading…</div>
          ) : items.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">🛡️</div>
              <p className="empty-text">
                {filter === 'unresolved' ? 'No unresolved permission flags' : 'No resolved flags yet'}
              </p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Peer</th>
                  <th>Permission</th>
                  <th>Signal</th>
                  <th>Flagged</th>
                  {filter === 'resolved' ? <th>Action taken</th> : <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((f) => (
                  <tr key={f.id}>
                    <td><span className="alias">{f.peer_alias}</span></td>
                    <td>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{f.permission_name}</span>
                      <br />
                      <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{f.permission_slug}</span>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', maxWidth: 260, display: 'block', whiteSpace: 'normal', lineHeight: 1.4 }}>
                        {signalSummary(f.signal_type, f.signal_data)}
                      </span>
                    </td>
                    <td>
                      <span className="elapsed">
                        {new Date(f.flagged_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </td>
                    {filter === 'resolved' ? (
                      <td>
                        <span className={`badge ${ACTION_BADGE[f.action_taken] ?? 'badge--published'}`}>
                          {ACTIONS.find((a) => a.value === f.action_taken)?.label ?? f.action_taken}
                        </span>
                        <br />
                        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                          {f.reviewed_at ? new Date(f.reviewed_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }) : ''}
                        </span>
                      </td>
                    ) : (
                      <td>
                        <button
                          className="btn btn--primary btn--sm"
                          onClick={() => openResolve(f)}
                        >
                          Review
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
          <button className="btn btn--ghost btn--sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)', alignSelf: 'center' }}>
            {page} / {totalPages}
          </span>
          <button className="btn btn--ghost btn--sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      )}

      {/* Resolve panel */}
      {resolveTarget && (
        <>
          <div className="panel-overlay" onClick={() => !submitting && setResolveTarget(null)} />
          <div className="slide-panel">
            <div className="slide-panel__header">
              <h2 className="slide-panel__title">Review Flag</h2>
              <button className="slide-panel__close" onClick={() => !submitting && setResolveTarget(null)}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '0 0 24px' }}>
              {/* Flag details */}
              <div className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Peer</span>
                  <span className="alias">{resolveTarget.peer_alias}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Permission</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{resolveTarget.permission_name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Signal</span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', textAlign: 'right', maxWidth: 200 }}>
                    {signalSummary(resolveTarget.signal_type, resolveTarget.signal_data)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Flagged</span>
                  <span style={{ fontSize: 12 }}>
                    {new Date(resolveTarget.flagged_at).toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              {/* Action picker */}
              <div className="form-group">
                <label className="form-label">Action</label>
                <select
                  className="form-select"
                  value={actionChoice}
                  onChange={(e) => setActionChoice(e.target.value)}
                >
                  {ACTIONS.map((a) => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </div>

              {resolveError && <p className="error-text">{resolveError}</p>}

              <button
                className="btn btn--primary"
                onClick={handleResolve}
                disabled={submitting}
              >
                {submitting ? 'Saving…' : 'Confirm & resolve'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
