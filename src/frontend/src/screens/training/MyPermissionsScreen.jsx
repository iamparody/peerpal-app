import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';

const STATUS_LABELS = {
  active:    { text: 'Active',              color: '#8FAF9A' },
  inactive:  { text: 'Inactive — refresher needed', color: 'var(--color-warning)' },
  suspended: { text: 'Suspended',           color: 'var(--color-danger)' },
  revoked:   { text: 'Revoked',             color: 'var(--color-danger)' },
};

export default function MyPermissionsScreen() {
  const navigate = useNavigate();
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/api/training/my-permissions')
      .then(r => setPermissions(r.data.permissions ?? []))
      .catch(() => setError('Could not load permissions.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="screen">
      <div className="page-header">
        <button className="page-header__back" onClick={() => navigate(-1)}>‹</button>
        <h2 className="page-header__title">My Permissions</h2>
      </div>
      <div style={{ padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 'var(--radius-md)' }} />)}
      </div>
    </div>
  );

  return (
    <div className="screen">
      <div className="page-header">
        <button className="page-header__back" onClick={() => navigate(-1)} aria-label="Back">‹</button>
        <h2 className="page-header__title">My Permissions</h2>
      </div>

      <div style={{ padding: '0 var(--space-md) var(--space-xl)' }}>
        {error && <div className="error-msg" style={{ marginTop: 'var(--space-md)' }}>{error}</div>}

        {!error && permissions.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 16px' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎓</div>
            <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: 20 }}>
              No permissions yet. Complete your foundation training to earn your first peer support permission.
            </p>
            <button className="btn btn--primary" onClick={() => navigate('/training')}>
              Start Training
            </button>
          </div>
        )}

        {permissions.length > 0 && (
          <>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', lineHeight: 1.5, marginTop: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
              These permissions allow you to accept peer support requests. Stay active to maintain them — permissions lapse after {permissions[0]?.expires_if_inactive_days ?? 180} days without a session.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              {permissions.map(p => {
                const statusInfo = STATUS_LABELS[p.status] || { text: p.status, color: 'var(--color-text-muted)' };
                return (
                  <div key={p.id} className="card" style={{ borderLeft: `4px solid ${statusInfo.color}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, marginBottom: 3 }}>{p.name}</div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: statusInfo.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {statusInfo.text}
                        </div>
                      </div>
                      {p.granted_at && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', flexShrink: 0, marginTop: 2 }}>
                          Since {new Date(p.granted_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    {p.last_active_at && (
                      <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 6 }}>
                        Last session: {new Date(p.last_active_at).toLocaleDateString()}
                      </p>
                    )}

                    {p.disclaimer && (
                      <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', lineHeight: 1.55, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--color-divider)' }}>
                        {p.disclaimer}
                      </p>
                    )}

                    {p.status === 'inactive' && (
                      <button
                        className="btn btn--ghost btn--sm"
                        style={{ marginTop: 10, width: 'auto' }}
                        onClick={() => navigate('/training')}
                      >
                        Refresh a skill →
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
