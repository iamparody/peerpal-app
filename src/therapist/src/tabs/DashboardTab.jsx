import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { CalendarBlank, CurrencyDollar, Star, CheckCircle } from '@phosphor-icons/react';
import { useAuth } from '../context/AuthContext';
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

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function DashboardTab() {
  const { therapist } = useAuth();
  const firstName = (therapist?.display_name || therapist?.alias || 'Doctor').split(' ')[0];
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

  // API returns top-level fields, not nested under stats
  const stats = {
    upcoming_today:        data?.upcoming_today        ?? null,
    this_month_earnings_kes: data?.earnings_this_month_kes ?? null,
    avg_rating:            data?.average_rating        ?? null,
    total_sessions:        data?.total_sessions        ?? null,
  };
  const upcoming = data?.upcoming_sessions || [];
  const pending  = data?.pending_requests  || [];

  return (
    <div>
      <div className="dashboard-hero">
        <div>
          <div className="dashboard-hero__greeting">{greeting()}, {firstName} 👋</div>
          <div className="dashboard-hero__sub">Here's what's happening in your practice today</div>
        </div>
        <div className="dashboard-hero__date">
          {new Date().toLocaleDateString('en-KE', { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* Stat cards */}
      <div className="stat-grid">
        {[
          { mod: 'sessions', icon: <CalendarBlank size={22} weight="fill" />, value: stats.upcoming_today ?? 0, label: 'Sessions Today' },
          { mod: 'earnings', icon: <CurrencyDollar size={22} weight="fill" />, value: stats.this_month_earnings_kes != null ? `KES ${Number(stats.this_month_earnings_kes).toLocaleString()}` : 'KES 0', label: 'This Month Earnings', lg: true },
          { mod: 'rating',   icon: <Star size={22} weight="fill" />, value: stats.avg_rating != null ? Number(stats.avg_rating).toFixed(1) : '—', label: 'Avg Rating' },
          { mod: 'total',    icon: <CheckCircle size={22} weight="fill" />, value: stats.total_sessions ?? 0, label: 'Total Sessions' },
        ].map(({ mod, icon, value, label, lg }, i) => (
          <motion.div
            key={mod}
            className={`stat-card stat-card--${mod}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.07, type: 'spring', stiffness: 280, damping: 26 }}
          >
            <div className={`stat-card__icon-wrap stat-card__icon-wrap--${mod}`}>
              {icon}
            </div>
            <div className={`stat-card__value${lg ? ' stat-card__value--lg' : ''}`}>{value}</div>
            <div className="stat-card__label">{label}</div>
          </motion.div>
        ))}
      </div>

      <div className="two-col">
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
                <div key={s.id} className="row-item">
                  <div className="flex-1">
                    <div className="flex items-center gap-8 mb-2">
                      <span className="fw-600 text-base">{s.member_alias || 'Member'}</span>
                      {s.prior_sessions_count > 0 && (
                        <span className="badge badge--session-n">Session {s.prior_sessions_count + 1}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted">{formatEAT(s.scheduled_at)}</div>
                  </div>
                  <div className="flex gap-6 items-center">
                    <FormatBadge format={s.session_format} />
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
                <div key={p.id} className="row-item--lg" style={{ display: 'block', padding: '14px 20px', borderBottom: '1px solid rgba(194,164,138,0.08)' }}>
                  <div className="flex items-center gap-8 mb-8">
                    <span className="fw-600 text-base">{p.member_alias || 'Member'}</span>
                    <FormatBadge format={p.session_format} />
                  </div>
                  <div className="text-xs text-muted mb-10">{formatEAT(p.scheduled_at)}</div>
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
