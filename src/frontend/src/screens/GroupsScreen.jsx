import { useNavigate } from 'react-router-dom';
import { UsersThree } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import client from '../api/client';
import { groupMeta } from '../utils/groupMeta';
import PageHeader from '../components/PageHeader';

function GroupsSkeleton() {
  return (
    <div style={{ padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-md)', background: 'var(--color-surface-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
          <div className="skeleton" style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="skeleton" style={{ width: '60%', height: 16 }} />
            <div className="skeleton" style={{ width: '80%', height: 13 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function GroupsScreen() {
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['groups'],
    queryFn: () => client.get('/api/groups').then(r => r.data),
    staleTime: 30_000,
  });

  const groups = data?.groups ?? (Array.isArray(data) ? data : []);
  const error  = isError ? "We couldn't connect. Check your internet and try again." : '';

  if (isLoading) return (
    <div className="screen">
      <PageHeader title="Groups" />
      <GroupsSkeleton />
    </div>
  );

  return (
    <div className="screen">
      <PageHeader title="Groups" />

      <div style={{ padding: 'var(--space-sm) var(--space-md)' }}>
        {error && <div className="error-msg" style={{ marginBottom: 'var(--space-md)' }}>{error}</div>}

        {groups.length === 0 ? (
          <div className="empty-state">
            <UsersThree size={48} weight="duotone" color="var(--color-text-muted)" aria-hidden="true" />
            <div className="empty-state__title">Find your people</div>
            <div className="empty-state__body">Join a group to connect with others who understand.</div>
          </div>
        ) : (
          groups.map((g) => {
            const meta = groupMeta(g.condition_category);
            return (
              <div
                key={g.id}
                className="card card--interactive"
                style={{ marginBottom: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: 14 }}
                onClick={() => navigate(`/groups/${g.id}`)}
              >
                {/* Category icon */}
                <div style={{
                  width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                  background: meta.bg,
                  border: `1.5px solid ${meta.color}44`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22,
                }}>
                  {meta.emoji}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <h3 style={{ fontSize: 15, lineHeight: 1.2 }}>{g.name}</h3>
                    {g.is_member && (
                      <span className="pill pill--active" style={{ fontSize: 10, padding: '2px 7px' }}>Joined</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {meta.label} · {g.member_count ?? 0} {Number(g.member_count) === 1 ? 'member' : 'members'}
                  </div>
                </div>

                {/* Join shortcut for non-members */}
                {!g.is_member ? (
                  <button
                    className="btn btn--sm btn--secondary"
                    style={{ flexShrink: 0 }}
                    onClick={(e) => { e.stopPropagation(); navigate(`/groups/${g.id}/agree`); }}
                  >
                    Join
                  </button>
                ) : (
                  <span style={{ color: 'var(--color-text-muted)', fontSize: 18, flexShrink: 0 }}>›</span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
