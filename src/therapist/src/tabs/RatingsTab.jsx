import { useState, useEffect } from 'react';
import { Star } from '@phosphor-icons/react';
import client from '../api/client';

function StarRow({ rating, max = 5 }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          size={14}
          weight={i < rating ? 'fill' : 'regular'}
          style={{ color: i < rating ? '#D9A441' : 'rgba(47,38,34,0.2)' }}
        />
      ))}
    </span>
  );
}

function DistributionBar({ star, count, total }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <span style={{ fontSize: 13, width: 14, textAlign: 'right', flexShrink: 0 }}>{star}</span>
      <Star size={12} weight="fill" style={{ color: '#D9A441', flexShrink: 0 }} />
      <div style={{
        flex: 1,
        height: 8,
        background: 'rgba(194,164,138,0.15)',
        borderRadius: 4,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: '#D9A441',
          borderRadius: 4,
          transition: 'width 0.4s ease',
        }} />
      </div>
      <span style={{ fontSize: 12, color: 'var(--color-text-muted)', width: 28, flexShrink: 0 }}>
        {count}
      </span>
    </div>
  );
}

export default function RatingsTab() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.get('/api/therapy/therapist/ratings')
      .then((res) => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading ratings…</div>;

  if (!data) {
    return (
      <div>
        <div className="page-header">
          <div>
            <h1 className="page-title">Ratings</h1>
            <p className="page-subtitle">Member feedback on your sessions</p>
          </div>
        </div>
        <div className="empty">
          <div className="empty-icon">⭐</div>
          <div className="empty-text">No ratings data available yet</div>
        </div>
      </div>
    );
  }

  const avg     = Number(data.average_rating || 0);
  const total   = data.total_count || 0;
  const dist    = data.distribution || {};
  const reviews = data.reviews || data.comments || [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Ratings</h1>
          <p className="page-subtitle">Member feedback on your sessions</p>
        </div>
      </div>

      {total < 5 && (
        <div style={{
          background: 'var(--color-warning-bg)',
          border: '1px solid rgba(217,164,65,0.25)',
          borderRadius: 8,
          padding: '12px 16px',
          fontSize: 14,
          color: 'var(--color-status-pending)',
          marginBottom: 20,
        }}>
          Your rating appears publicly once you have 5 or more reviews. You currently have {total}.
        </div>
      )}

      <div className="two-col" style={{ gridTemplateColumns: '1fr 2fr', gap: 20 }}>
        {/* Left: overview */}
        <div className="card" style={{ padding: '28px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 64, fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1, letterSpacing: -2 }}>
            {avg.toFixed(1)}
          </div>
          <div style={{ margin: '10px 0 6px', display: 'flex', justifyContent: 'center' }}>
            <StarRow rating={Math.round(avg)} />
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            {total} {total === 1 ? 'review' : 'reviews'}
          </div>

          <div style={{ marginTop: 24, textAlign: 'left' }}>
            {[5, 4, 3, 2, 1].map((s) => (
              <DistributionBar key={s} star={s} count={dist[s] || 0} total={total} />
            ))}
          </div>
        </div>

        {/* Right: anonymous comments */}
        <div className="card">
          <div className="card-header">
            <h2>Member Reviews</h2>
          </div>
          {reviews.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">💬</div>
              <div className="empty-text">No written reviews yet</div>
            </div>
          ) : (
            <div style={{ padding: '8px 0' }}>
              {reviews.map((r, i) => (
                <div key={i} style={{
                  padding: '14px 20px',
                  borderBottom: i < reviews.length - 1 ? '1px solid rgba(194,164,138,0.08)' : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <StarRow rating={r.rating} />
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      {r.month_year || (r.created_at
                        ? new Date(r.created_at).toLocaleString('en-KE', { month: 'long', year: 'numeric' })
                        : '')}
                    </span>
                  </div>
                  {r.comment && (
                    <p style={{ fontSize: 14, color: 'var(--color-text-primary)', lineHeight: 1.6 }}>
                      {r.comment}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
