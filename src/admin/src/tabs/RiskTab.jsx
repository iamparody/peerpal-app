import { useEffect, useState, useCallback } from 'react';
import client from '../api/client';
import MessageModal from '../components/MessageModal';

export default function RiskTab({ onCountChange }) {
  const [items,      setItems]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [msgTarget,  setMsgTarget]  = useState(null);
  const [dismissing, setDismissing] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await client.get('/api/admin/risk-flags');
      const list = data.flagged_users ?? [];
      setItems(list);
      onCountChange?.(list.length);
    } catch { setError('Failed to load risk flags.'); }
    finally   { setLoading(false); }
  }, [onCountChange]);

  useEffect(() => { load(); }, [load]);

  async function handleDismiss(alias) {
    setDismissing(alias);
    try {
      await client.patch(`/api/admin/risk-flags/${alias}/dismiss`);
      const updated = items.filter((u) => u.alias !== alias);
      setItems(updated);
      onCountChange?.(updated.length);
    } catch {
      setError('Could not dismiss flag. Try again.');
    } finally {
      setDismissing(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Risk Flags</h1>
          <p className="page-subtitle">Users with high or critical risk level — updated nightly. Dismiss once reviewed.</p>
        </div>
        <button className="refresh-btn" onClick={load} title="Refresh">↻</button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card">
        <div className="table-wrap">
          {loading ? (
            <div className="loading">Loading…</div>
          ) : items.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">🟢</div>
              <p className="empty-text">No high-risk users currently flagged</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Alias</th>
                  <th>Risk Level</th>
                  <th>Last Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((u) => (
                  <tr key={u.alias}>
                    <td><span className="alias">{u.alias}</span></td>
                    <td>
                      <span className={`badge badge--${u.risk_level}`}>
                        {u.risk_level === 'critical' ? '🔴 critical' : '🟠 high'}
                      </span>
                    </td>
                    <td><span className="elapsed">{new Date(u.updated_at).toLocaleString()}</span></td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn--ghost btn--sm" onClick={() => setMsgTarget(u.alias)}>
                        Send Care Message
                      </button>
                      <button
                        className="btn btn--primary btn--sm"
                        disabled={dismissing === u.alias}
                        onClick={() => handleDismiss(u.alias)}
                      >
                        {dismissing === u.alias ? '…' : 'Dismiss'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {msgTarget && <MessageModal alias={msgTarget} onClose={() => setMsgTarget(null)} />}
    </div>
  );
}
