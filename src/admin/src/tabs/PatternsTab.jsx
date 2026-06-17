import { useEffect, useState, useCallback } from 'react';
import client from '../api/client';
import MessageModal from '../components/MessageModal';

function PatternChips({ row }) {
  const chips = [];
  if (row.emergency_count >= 3)
    chips.push({ label: `${row.emergency_count} emergencies`, color: '#B35C5C', bg: 'rgba(179,92,92,0.15)' });
  if (row.open_referrals >= 2)
    chips.push({ label: `${row.open_referrals} open referrals`, color: '#C2A48A', bg: 'rgba(194,164,138,0.15)' });
  if (row.peer_sessions_7d >= 5)
    chips.push({ label: `peer ×${row.peer_sessions_7d} this week`, color: '#E88B3F', bg: 'rgba(232,139,63,0.15)' });
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {chips.map((c) => (
        <span key={c.label} style={{
          padding: '2px 9px', borderRadius: 12, fontSize: 11, fontWeight: 600,
          color: c.color, background: c.bg, border: `1px solid ${c.color}40`,
        }}>
          {c.label}
        </span>
      ))}
    </div>
  );
}

function lastSeen(str) {
  if (!str) return 'Never';
  const d = new Date(str);
  return d.toLocaleDateString('en-KE', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function PatternsTab() {
  const [patterns,   setPatterns]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [msgTarget,  setMsgTarget]  = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/api/admin/users/patterns');
      setPatterns(data.patterns ?? []);
    } catch { setError('Failed to load patterns.'); }
    finally   { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Usage Patterns</h1>
          <p className="page-subtitle">Users with high-frequency or distress signals — alias only, no PII</p>
        </div>
        <button className="refresh-btn" onClick={load} title="Refresh">↻</button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card">
        <div className="table-wrap">
          {loading ? (
            <div className="loading">Loading…</div>
          ) : patterns.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">✅</div>
              <p className="empty-text">No high-utilisation patterns detected</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Alias</th>
                  <th>Flags</th>
                  <th>Last Active</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {patterns.map((row) => (
                  <tr key={row.alias}>
                    <td><span className="alias">{row.alias}</span></td>
                    <td><PatternChips row={row} /></td>
                    <td><span className="elapsed">{lastSeen(row.last_checkin_at)}</span></td>
                    <td>
                      <button className="btn btn--ghost btn--sm" onClick={() => setMsgTarget(row.alias)}>
                        Message
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
