import { useEffect, useState, useCallback } from 'react';
import client from '../api/client';

const ACTION_FILTERS = [
  { value: '',                   label: 'All actions' },
  { value: 'emergency',          label: 'Emergency' },
  { value: 'escalation',         label: 'Escalations' },
  { value: 'risk_flag',          label: 'Risk flags' },
  { value: 'referral',           label: 'Referrals' },
  { value: 'report',             label: 'Reports' },
  { value: 'permission_flag',    label: 'Peer flags' },
  { value: 'therapist',          label: 'Therapists' },
];

function actionLabel(action) {
  if (!action) return '—';
  return action.replace(/\./g, ' › ').replace(/_/g, ' ');
}

function targetLabel(row) {
  if (row.target_alias) return <span className="alias">{row.target_alias}</span>;
  if (row.target_id)    return <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{row.target_id}</span>;
  return <span style={{ color: 'var(--color-text-muted)' }}>—</span>;
}

function diffCell(before, after) {
  if (!before && !after) return <span style={{ color: 'var(--color-text-muted)' }}>—</span>;
  if (!before) return <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{after}</span>;
  if (!after)  return <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{before}</span>;
  return (
    <span style={{ fontSize: 12 }}>
      <span style={{ color: 'var(--color-text-muted)', textDecoration: 'line-through' }}>{before}</span>
      {' → '}
      <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{after}</span>
    </span>
  );
}

export default function AuditLogTab() {
  const [logs,       setLogs]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [page,       setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total,      setTotal]      = useState(0);
  const [actionFilter, setActionFilter] = useState('');

  const load = useCallback(async (action = actionFilter, p = page) => {
    setLoading(true);
    setError('');
    try {
      const params = { page: p };
      if (action) params.action = action;
      const { data } = await client.get('/api/admin/audit-log', { params });
      setLogs(data.logs ?? []);
      setTotalPages(data.pages ?? 1);
      setTotal(data.total ?? 0);
    } catch {
      setError('Failed to load audit log.');
    } finally {
      setLoading(false);
    }
  }, [actionFilter, page]);

  useEffect(() => { load(actionFilter, page); }, [actionFilter, page]); // eslint-disable-line

  function switchFilter(f) {
    setActionFilter(f);
    setPage(1);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Log</h1>
          <p className="page-subtitle">
            {total > 0 ? `${total} recorded action${total !== 1 ? 's' : ''}` : 'All admin actions are recorded here'}
          </p>
        </div>
        <button className="refresh-btn" onClick={() => load(actionFilter, page)} title="Refresh">↻</button>
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {ACTION_FILTERS.map(({ value, label }) => (
          <button
            key={value}
            className={`btn btn--sm${actionFilter === value ? ' btn--primary' : ' btn--ghost'}`}
            onClick={() => switchFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card">
        <div className="table-wrap">
          {loading ? (
            <div className="loading">Loading…</div>
          ) : logs.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">📋</div>
              <p className="empty-text">No audit entries yet</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Admin</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Before → After</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className="elapsed" style={{ whiteSpace: 'nowrap' }}>
                        {new Date(row.created_at).toLocaleString('en-KE', {
                          day: 'numeric', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </td>
                    <td><span className="alias">{row.admin_alias}</span></td>
                    <td>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', textTransform: 'capitalize' }}>
                        {actionLabel(row.action)}
                      </span>
                      {row.target_type && (
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{row.target_type}</div>
                      )}
                    </td>
                    <td>{targetLabel(row)}</td>
                    <td>{diffCell(row.before_value, row.after_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
          <button className="btn btn--ghost btn--sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)', alignSelf: 'center' }}>
            {page} / {totalPages}
          </span>
          <button className="btn btn--ghost btn--sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}
