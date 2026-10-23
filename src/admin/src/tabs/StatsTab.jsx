import { useEffect, useState, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  UserCircle, Users, Robot, CreditCard, Note, CalendarBlank, Handshake,
  CheckCircle, Warning, XCircle, Star,
} from '@phosphor-icons/react';
import client from '../api/client';

const STAT_META = [
  { key: 'daily_active_users',      label: 'Daily Active Users',  Icon: UserCircle },
  { key: 'checkins_today',          label: 'Check-ins Today',     Icon: Note },
  { key: 'peer_sessions_today',     label: 'Peer Sessions',       Icon: Users },
  { key: 'ai_sessions_today',       label: 'AI Sessions',         Icon: Robot },
  { key: 'credits_purchased_today', label: 'Credits Purchased',   Icon: CreditCard },
];

const GROWTH_META = [
  { key: 'total_users',            label: 'Total Users',       Icon: UserCircle,   sub: null },
  { key: 'mau',                    label: 'MAU (30d)',         Icon: CalendarBlank, sub: null },
  { key: 'conversion_rate',        label: 'Conversion',        Icon: CreditCard,   subKey: (g) => `${g.paid_users} paid of ${g.total_users}`, suffix: '%' },
  { key: 'peer_fulfillment_rate',  label: 'Peer Match Rate',   Icon: Handshake,    sub: 'last 30 days', nullable: true },
  { key: 'ai_cost_30d_ksh',        label: 'AI Cost (30d)',     Icon: Robot,        subKey: (g) => `KSh ${g.ai_cost_per_mau_ksh}/user`, prefix: 'KSh ' },
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
  return new Date(str).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' });
}

function scaleSignal(totalUsers) {
  if (totalUsers < 100)  return { level: 'ok',    Icon: CheckCircle, color: 'var(--color-success)',  label: 'Comfortable',  note: 'Free tiers are fine. Keep an eye past 100 users.' };
  if (totalUsers < 300)  return { level: 'watch',  Icon: Warning,    color: 'var(--color-warning)', label: 'Watch',        note: 'Monitor DB connections and Render response times.' };
  return                        { level: 'scale',  Icon: XCircle,    color: 'var(--color-danger)',  label: 'Scale soon',   note: 'Upgrade Render and Supabase before performance drops.' };
}

export default function StatsTab() {
  const [stats,    setStats]    = useState(null);
  const [growth,   setGrowth]   = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [series,   setSeries]   = useState([]);
  const [days,     setDays]     = useState(30);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sr, gr, fr, dr] = await Promise.all([
        client.get('/api/admin/stats'),
        client.get('/api/admin/stats/growth'),
        client.get('/api/admin/feedback'),
        client.get(`/api/admin/stats/daily?days=${days}`),
      ]);
      setStats(sr.data);
      setGrowth(gr.data);
      setFeedback(fr.data);
      setSeries(dr.data.series ?? []);
    } catch { setError('Failed to load stats.'); }
    finally   { setLoading(false); }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">System Stats</h1>
        </div>
      </div>
      <div className="skeleton-grid-5">
        {[...Array(5)].map((_, i) => <div key={i} className="skeleton skeleton-card" />)}
      </div>
      <div className="skeleton-grid-5" style={{ marginBottom: 16 }}>
        {[...Array(5)].map((_, i) => <div key={i} className="skeleton skeleton-card" />)}
      </div>
      <div className="skeleton skeleton-card" style={{ height: 300, marginBottom: 28 }} />
    </div>
  );

  if (error) return <p className="error-text">{error}</p>;

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

      {/* Daily stats */}
      <div className="daily-stats-grid">
        {STAT_META.map(({ key, label, Icon }) => (
          <div key={key} className="stat-card">
            <div className="stat-icon"><Icon size={24} weight="duotone" /></div>
            <div className="stat-card__value">{stats?.[key] ?? 0}</div>
            <div className="stat-card__label">{label}</div>
          </div>
        ))}
      </div>

      {/* Growth stats */}
      {growth && (() => {
        const sig = scaleSignal(growth.total_users);
        const SigIcon = sig.Icon;
        return (
          <>
            <div className="growth-stats-grid">
              {GROWTH_META.map(({ key, label, Icon, subKey, sub, suffix, prefix, nullable }) => {
                const raw = growth[key];
                const val = nullable && raw === null ? '—' : `${prefix ?? ''}${raw}${suffix ?? ''}`;
                const note = subKey ? subKey(growth) : sub;
                return (
                  <div key={key} className="stat-card">
                    <div className="stat-icon"><Icon size={24} weight="duotone" /></div>
                    <div className="stat-card__value">{val}</div>
                    <div className="stat-card__label">{label}</div>
                    {note && <div className="stat-card__note">{note}</div>}
                  </div>
                );
              })}
            </div>

            <div className="card scale-callout" style={{ borderLeft: `4px solid ${sig.color}` }}>
              <SigIcon size={22} style={{ color: sig.color, flexShrink: 0 }} weight="fill" />
              <div>
                <div className="scale-callout__label" style={{ color: sig.color }}>
                  Infrastructure: {sig.label}
                </div>
                <div className="scale-callout__note">{sig.note}</div>
              </div>
              <div className="scale-callout__counts">
                <div>{growth.total_users} registered</div>
                <div>{growth.mau} active / 30d</div>
              </div>
            </div>
          </>
        );
      })()}

      {/* Time-series chart */}
      <div className="card chart-card">
        <div className="chart-header">
          <h2>Usage over time</h2>
          <div className="chart-day-btns">
            {DAYS_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`chart-day-btn${days === d ? ' chart-day-btn--active' : ''}`}
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
              contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }}
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
          <h2 className="section-title">Session Ratings</h2>

          {feedback.averages?.length > 0 ? (
            <div className="ratings-row">
              {feedback.averages.map((row) => (
                <div key={row.type} className="card rating-card">
                  <div className="rating-card__type">{row.type}</div>
                  <div className="rating-card__value">
                    <Star size={18} weight="fill" style={{ color: 'var(--color-warning)' }} />
                    {parseFloat(row.avg_rating).toFixed(1)}
                  </div>
                  <RatingBar value={parseFloat(row.avg_rating)} />
                  <div className="rating-card__count">
                    {row.count} response{row.count !== 1 ? 's' : ''}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted" style={{ fontSize: 13, marginBottom: 24 }}>No ratings yet.</p>
          )}

          {feedback.recent_comments?.length > 0 && (
            <>
              <h2 className="section-title">Recent Comments</h2>
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
  const pct   = Math.min(100, (value / 5) * 100);
  const color = value >= 4 ? 'var(--color-success)' : value >= 3 ? 'var(--color-warning)' : 'var(--color-danger)';
  return (
    <div className="rating-bar">
      <div className="rating-bar__fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
