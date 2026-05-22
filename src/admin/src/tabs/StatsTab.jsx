import { useEffect, useState, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import client from '../api/client';

const STAT_META = [
  { key: 'daily_active_users',      label: 'Daily Active Users',  icon: '👤' },
  { key: 'checkins_today',          label: 'Check-ins Today',     icon: '📝' },
  { key: 'peer_sessions_today',     label: 'Peer Sessions',       icon: '👥' },
  { key: 'ai_sessions_today',       label: 'AI Sessions',         icon: '🤖' },
  { key: 'credits_purchased_today', label: 'Credits Purchased',   icon: '💳' },
];

const SERIES_LINES = [
  { key: 'dau',           label: 'DAU',          color: '#6B9E8C' },
  { key: 'ai_sessions',   label: 'AI Sessions',  color: '#7BAEDC' },
  { key: 'peer_sessions', label: 'Peer Sessions', color: '#C2A48A' },
  { key: 'emergencies',   label: 'Emergencies',  color: '#B35C5C' },
  { key: 'new_users',     label: 'New Users',    color: '#9BB88A' },
];

const DAYS_OPTIONS = [7, 14, 30, 60];

function shortDate(str) {
  if (!str) return '';
  const d = new Date(str);
  return d.toLocaleDateString('en-KE', { month: 'short', day: 'numeric' });
}

export default function StatsTab() {
  const [stats,    setStats]    = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [series,   setSeries]   = useState([]);
  const [days,     setDays]     = useState(30);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  const load = useCallback(async () => {
    try {
      const [sr, fr, dr] = await Promise.all([
        client.get('/api/admin/stats'),
        client.get('/api/admin/feedback'),
        client.get(`/api/admin/stats/daily?days=${days}`),
      ]);
      setStats(sr.data);
      setFeedback(fr.data);
      setSeries(dr.data.series ?? []);
    } catch { setError('Failed to load stats.'); }
    finally   { setLoading(false); }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="loading">Loading…</div>;
  if (error)   return <p className="error-text">{error}</p>;

  const dateLabel = stats?.date
    ? new Date(stats.date).toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  const chartData = series.map((row) => ({ ...row, date: shortDate(row.date) }));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">System Stats</h1>
          {dateLabel && <p className="page-subtitle">{dateLabel}</p>}
        </div>
        <button className="refresh-btn" onClick={load} title="Refresh">↻</button>
      </div>

      {/* Daily stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 28 }}>
        {STAT_META.map(({ key, label, icon }) => (
          <div key={key} className="stat-card">
            <div className="stat-card__label">{icon} {label}</div>
            <div className="stat-card__value" style={{ fontSize: 28 }}>
              {stats?.[key] ?? 0}
            </div>
          </div>
        ))}
      </div>

      {/* Time-series chart */}
      <div className="card" style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
            Usage over time
          </h2>
          <div style={{ display: 'flex', gap: 6 }}>
            {DAYS_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                style={{
                  padding: '4px 12px', borderRadius: 20, border: '1px solid var(--color-border)',
                  background: days === d ? 'var(--color-primary)' : 'transparent',
                  color: days === d ? '#fff' : 'var(--color-text-secondary)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 4, right: 16, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
              tickLine={false}
              interval={Math.max(0, Math.floor(chartData.length / 8) - 1)}
            />
            <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ fontWeight: 600 }}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            {SERIES_LINES.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Session ratings */}
      {feedback && (
        <>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: 'var(--color-text-primary)' }}>
            Session Ratings
          </h2>

          {feedback.averages?.length > 0 ? (
            <div style={{ display: 'flex', gap: 14, marginBottom: 28, flexWrap: 'wrap' }}>
              {feedback.averages.map((row) => (
                <div key={row.type} className="card" style={{ padding: '18px 22px', minWidth: 160 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                    {row.type}
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 4 }}>
                    ⭐ {parseFloat(row.avg_rating).toFixed(1)}
                  </div>
                  <RatingBar value={parseFloat(row.avg_rating)} />
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 8 }}>
                    {row.count} response{row.count !== 1 ? 's' : ''}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginBottom: 24 }}>No ratings yet.</p>
          )}

          {feedback.recent_comments?.length > 0 && (
            <>
              <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: 'var(--color-text-primary)' }}>
                Recent Comments
              </h2>
              <div className="card">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Rating</th>
                        <th>Comment</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {feedback.recent_comments.map((c, i) => (
                        <tr key={i}>
                          <td>{c.type}</td>
                          <td>{'⭐'.repeat(c.rating ?? 0)}</td>
                          <td style={{ maxWidth: 340 }}>{c.comment}</td>
                          <td><span className="elapsed">{new Date(c.created_at).toLocaleDateString()}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function RatingBar({ value }) {
  const pct = Math.min(100, (value / 5) * 100);
  const color = value >= 4 ? 'var(--color-status-resolved)' : value >= 3 ? 'var(--color-status-pending)' : 'var(--color-status-open)';
  return (
    <div style={{ height: 5, background: 'var(--color-main-bg)', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.3s' }} />
    </div>
  );
}
