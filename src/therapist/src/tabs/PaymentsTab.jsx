import { useState, useEffect, useCallback } from 'react';
import client from '../api/client';

function formatEAT(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-KE', {
      timeZone: 'Africa/Nairobi',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function PayoutBadge({ status }) {
  const map = {
    pending:    'badge--pending',
    processing: 'badge--processing',
    completed:  'badge--completed',
    paid:       'badge--paid',
    failed:     'badge--failed',
  };
  const cls = `badge ${map[status] || 'badge--pending'}`;
  return <span className={cls}>{status || 'pending'}</span>;
}

function downloadCSV(rows) {
  const headers = ['Date', 'Member', 'Format', 'Duration (min)', 'Session Rate (KES)', 'Therapist Payout (KES)', 'Status'];
  const lines = [
    headers.join(','),
    ...rows.map((r) => [
      formatEAT(r.session_date || r.created_at),
      r.member_alias || '',
      r.format || '',
      r.duration_minutes || '',
      r.session_rate_kes || '',
      r.therapist_payout_kes || '',
      r.payout_status || r.status || '',
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'peerpal-payments.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function PaymentsTab() {
  const [summary, setSummary]     = useState(null);
  const [payments, setPayments]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [page, setPage]           = useState(1);
  const [hasMore, setHasMore]     = useState(false);

  const load = useCallback(async (pg) => {
    setLoading(true);
    try {
      const res = await client.get('/api/therapy/therapist/payments', {
        params: { page: pg, limit: 20 },
      });
      const s   = res.data?.summary || res.data?.stats || null;
      const list= res.data?.payments || res.data?.rows || res.data || [];
      if (pg === 1) {
        setSummary(s);
        setPayments(Array.isArray(list) ? list : []);
      } else {
        setPayments((prev) => [...prev, ...(Array.isArray(list) ? list : [])]);
      }
      setHasMore(Array.isArray(list) && list.length === 20);
    } catch {
      if (pg === 1) { setSummary(null); setPayments([]); }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(1); }, [load]);

  function loadMore() {
    const next = page + 1;
    setPage(next);
    load(next);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="page-subtitle">Your earnings and payout history</p>
        </div>
        {payments.length > 0 && (
          <button className="btn btn--ghost" onClick={() => downloadCSV(payments)}>
            Export CSV
          </button>
        )}
      </div>

      {/* Summary row */}
      {summary && (
        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 24 }}>
          <div className="stat-card stat-card--pending">
            <div className="stat-card__value" style={{ fontSize: 26, letterSpacing: -0.5 }}>
              KES {Number(summary.this_month_kes || 0).toLocaleString()}
            </div>
            <div className="stat-card__label">This Month</div>
          </div>
          <div className="stat-card stat-card--review">
            <div className="stat-card__value" style={{ fontSize: 26, letterSpacing: -0.5 }}>
              KES {Number(summary.lifetime_kes || 0).toLocaleString()}
            </div>
            <div className="stat-card__label">Lifetime</div>
          </div>
          <div className="stat-card stat-card--open">
            <div className="stat-card__value" style={{ fontSize: 26, letterSpacing: -0.5 }}>
              KES {Number(summary.pending_payout_kes || 0).toLocaleString()}
            </div>
            <div className="stat-card__label">Pending Payouts</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__value" style={{ fontSize: 26, letterSpacing: -0.5 }}>
              KES {Number(summary.completed_payout_kes || 0).toLocaleString()}
            </div>
            <div className="stat-card__label">Completed Payouts</div>
          </div>
        </div>
      )}

      <div style={{
        background: 'var(--color-success-bg)',
        border: '1px solid rgba(143,175,154,0.30)',
        borderRadius: 8,
        padding: '10px 16px',
        fontSize: 13,
        color: '#4a7a5e',
        marginBottom: 20,
      }}>
        Sessions are paid out 24 hours after completion, pending any disputes.
      </div>

      <div className="card">
        {loading && payments.length === 0 ? (
          <div className="loading">Loading payments…</div>
        ) : payments.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">💳</div>
            <div className="empty-text">No payment records yet</div>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Member</th>
                    <th>Format</th>
                    <th>Duration</th>
                    <th>Session Rate</th>
                    <th>Your Payout</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p, i) => (
                    <tr key={p.id || i}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatEAT(p.session_date || p.created_at)}</td>
                      <td>{p.member_alias || '—'}</td>
                      <td>
                        <span className={`badge badge--${(p.format || 'text').toLowerCase()}`}>
                          {p.format || '—'}
                        </span>
                      </td>
                      <td>{p.duration_minutes ? `${p.duration_minutes} min` : '—'}</td>
                      <td>KES {Number(p.session_rate_kes || 0).toLocaleString()}</td>
                      <td style={{ fontWeight: 600 }}>KES {Number(p.therapist_payout_kes || 0).toLocaleString()}</td>
                      <td><PayoutBadge status={p.payout_status || p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hasMore && (
              <div style={{ padding: '16px 20px', textAlign: 'center' }}>
                <button className="btn btn--ghost" onClick={loadMore} disabled={loading}>
                  {loading ? 'Loading…' : 'Load More'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
