import { useState, useEffect } from 'react';
import { CalendarBlank, CurrencyDollar, Star, CheckCircle } from '@phosphor-icons/react';
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

export default function DashboardTab() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState({});

  useEffect(() => {
    let cancelled = false;
    client.get('/api/therapy/therapist/dashboard')
      .then((res) => { if (!cancelled) setData(res.data); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function handleBookingAction(bookingId, action) {
    setActionBusy((b) => ({ ...b, [bookingId]: action }));
    try {
      await client.patch(`/api/therapy/bookings/${bookingId}/${action}`);
      // Refresh
      const res = await client.get('/api/therapy/therapist/dashboard');
      setData(res.data);
    } catch {
      // silently ignore
    } finally {
      setActionBusy((b) => ({ ...b, [bookingId]: null }));
    }
  }

  if (loading) return <div className="loading">Loading dashboard…</div>;

  const stats = data?.stats || {};
  const upcoming = data?.upcoming_sessions || [];
  const pending  = data?.pending_requests  || [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Your practice at a glance</p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="stat-grid">
        <div className="stat-card stat-card--review">
          <div className="stat-card__icon-wrap stat-card__icon-wrap--review">
            <CalendarBlank size={22} weight="fill" />
          </div>
          <div className="stat-card__value">{stats.upcoming_today ?? 0}</div>
          <div className="stat-card__label">Sessions Today</div>
        </div>
        <div className="stat-card stat-card--pending">
          <div className="stat-card__icon-wrap stat-card__icon-wrap--pending">
            <CurrencyDollar size={22} weight="fill" />
          </div>
          <div className="stat-card__value" style={{ fontSize: 32, letterSpacing: -1 }}>
            {stats.this_month_earnings_kes != null
              ? `KES ${Number(stats.this_month_earnings_kes).toLocaleString()}`
              : 'KES 0'}
          </div>
          <div className="stat-card__label">This Month Earnings</div>
        </div>
        <div className="stat-card stat-card--open">
          <div className="stat-card__icon-wrap stat-card__icon-wrap--open">
            <Star size={22} weight="fill" />
          </div>
          <div className="stat-card__value">
            {stats.avg_rating != null ? Number(stats.avg_rating).toFixed(1) : '—'}
          </div>
          <div className="stat-card__label">Avg Rating</div>
        </div>
        <div className="stat-card stat-card--resolved">
          <div className="stat-card__icon-wrap" style={{ background: 'rgba(143,175,154,0.12)', color: '#4a7a5e' }}>
            <CheckCircle size={22} weight="fill" />
          </div>
          <div className="stat-card__value">{stats.total_sessions ?? 0}</div>
          <div className="stat-card__label">Total Sessions</div>
        </div>
      </div>

      <div className="two-col" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {/* Upcoming sessions next 7 days */}
        <div className="card">
          <div className="card-header">
            <h2>Upcoming Sessions (Next 7 Days)</h2>
          </div>
          {upcoming.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">📅</div>
              <div className="empty-text">No upcoming sessions</div>
            </div>
          ) : (
            <div style={{ padding: '8px 0' }}>
              {upcoming.map((s) => (
                <div key={s.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 20px',
                  borderBottom: '1px solid rgba(194,164,138,0.08)',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>
                      {s.member_alias || 'Member'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      {formatEAT(s.scheduled_at)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <FormatBadge format={s.format} />
                    <StatusBadge status={s.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending booking requests */}
        <div className="card">
          <div className="card-header">
            <h2>Pending Requests</h2>
          </div>
          {pending.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">✅</div>
              <div className="empty-text">No pending requests</div>
            </div>
          ) : (
            <div style={{ padding: '8px 0' }}>
              {pending.map((p) => (
                <div key={p.id} style={{
                  padding: '14px 20px',
                  borderBottom: '1px solid rgba(194,164,138,0.08)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{p.member_alias || 'Member'}</span>
                    <FormatBadge format={p.format} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 10 }}>
                    {formatEAT(p.scheduled_at)}
                  </div>
                  <div className="btn-group">
                    <button
                      className="btn btn--success btn--sm"
                      disabled={!!actionBusy[p.id]}
                      onClick={() => handleBookingAction(p.id, 'confirm')}
                    >
                      {actionBusy[p.id] === 'confirm' ? 'Confirming…' : 'Confirm'}
                    </button>
                    <button
                      className="btn btn--ghost btn--sm"
                      disabled={!!actionBusy[p.id]}
                      onClick={() => handleBookingAction(p.id, 'decline')}
                    >
                      {actionBusy[p.id] === 'decline' ? 'Declining…' : 'Decline'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
