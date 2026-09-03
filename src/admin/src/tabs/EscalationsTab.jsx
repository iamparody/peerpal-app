import { useEffect, useState, useCallback } from 'react';
import client from '../api/client';
import MessageModal from '../components/MessageModal';

function elapsed(ts) {
  const s = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

export default function EscalationsTab({ onCountChange }) {
  const [items,     setItems]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [msgTarget, setMsgTarget] = useState(null);
  const [resolving, setResolving] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await client.get('/api/admin/escalations');
      const list = data.escalations ?? [];
      setItems(list);
      onCountChange?.(list.length);
    } catch { setError('Failed to load escalations.'); }
    finally   { setLoading(false); }
  }, [onCountChange]);

  useEffect(() => { load(); }, [load]);

  async function handleResolve(id) {
    setResolving(id);
    try {
      await client.patch(`/api/admin/escalations/${id}/resolve`);
      const updated = items.filter((e) => e.id !== id);
      setItems(updated);
      onCountChange?.(updated.length);
    } catch {
      setError('Could not resolve escalation. Try again.');
    } finally {
      setResolving(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Peer Escalations</h1>
          <p className="page-subtitle">Peer requests not accepted within 90 seconds</p>
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
              <div className="empty-icon">👥</div>
              <p className="empty-text">No escalated peer requests</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Alias</th>
                  <th>Channel</th>
                  <th>Requested</th>
                  <th>Escalated</th>
                  <th>Waiting</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((e) => (
                  <tr key={e.id}>
                    <td><span className="alias">{e.alias}</span></td>
                    <td>
                      <span className={`badge badge--${e.channel_preference}`}>
                        {e.channel_preference}
                      </span>
                    </td>
                    <td><span className="elapsed">{new Date(e.created_at).toLocaleTimeString()}</span></td>
                    <td><span className="elapsed">{new Date(e.escalated_at).toLocaleTimeString()}</span></td>
                    <td>
                      <span className="elapsed elapsed--urgent">{elapsed(e.escalated_at)}</span>
                    </td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn--ghost btn--sm" onClick={() => setMsgTarget(e.alias)}>
                        Message
                      </button>
                      <button
                        className="btn btn--primary btn--sm"
                        disabled={resolving === e.id}
                        onClick={() => handleResolve(e.id)}
                      >
                        {resolving === e.id ? '…' : 'Resolve'}
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
