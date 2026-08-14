import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import client from '../api/client';
import { groupMeta } from '../utils/groupMeta';

export default function GroupDetailScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData]       = useState(null);
  const [feed, setFeed]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [detailRes, feedRes] = await Promise.allSettled([
          client.get(`/api/groups/${id}`),
          client.get(`/api/groups/${id}/feed?page=1`),
        ]);
        if (detailRes.status === 'fulfilled') setData(detailRes.value.data);
        if (feedRes.status === 'fulfilled')   setFeed(feedRes.value.data);
      } catch {
        setError('Failed to load group.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleLeave() {
    try {
      await client.post(`/api/groups/${id}/leave`);
      navigate('/groups', { replace: true });
    } catch {
      setError('Could not leave group. Please try again.');
    }
  }

  if (loading) return (
    <div className="screen">
      <div className="page-header">
        <button className="page-header__back" onClick={() => navigate('/groups')} aria-label="Back">‹</button>
        <h2 className="page-header__title">Group</h2>
      </div>
      <div style={{ padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        <div className="skeleton" style={{ height: 140, borderRadius: 'var(--radius-lg)' }} />
        <div className="skeleton" style={{ height: 52, borderRadius: 'var(--radius-pill)' }} />
      </div>
    </div>
  );

  if (!data) return (
    <div className="screen" style={{ padding: 24, textAlign: 'center' }}>
      <p>{error || 'Group not found.'}</p>
      <button className="btn btn--primary" style={{ marginTop: 16 }} onClick={() => navigate('/groups')}>
        Back to groups
      </button>
    </div>
  );

  const { group, is_member, membership_status } = data;
  const meta    = groupMeta(group.condition_category);
  const isBanned = membership_status === 'banned';

  // Current prompt preview (for non-members who can't fetch /feed — feed will 403)
  const activePrompt = feed?.prompt;

  return (
    <div className="screen" style={{ padding: '0 0 24px' }}>
      <div className="page-header">
        <button className="page-header__back" onClick={() => navigate('/groups')} aria-label="Back">‹</button>
        <h2 className="page-header__title">{group.name}</h2>
      </div>

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && <div className="error-msg">{error}</div>}

        {/* Group identity card */}
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-lg) var(--space-md)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 'var(--space-sm)', lineHeight: 1 }}>
            {meta.emoji}
          </div>
          <h2 style={{ marginBottom: 6 }}>{group.name}</h2>
          <span style={{
            display: 'inline-block',
            fontSize: '0.75rem', fontWeight: 600, padding: '3px 10px',
            borderRadius: 'var(--radius-full)',
            background: `${meta.color}22`, color: meta.color,
            border: `1px solid ${meta.color}44`,
          }}>
            {meta.label}
          </span>
          <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: 8 }}>
            {group.member_count ?? 0} {Number(group.member_count) === 1 ? 'member' : 'members'}
          </div>
          {group.description && (
            <p style={{ marginTop: 'var(--space-md)', fontSize: '0.88rem', lineHeight: 'var(--leading-relaxed)', textAlign: 'left' }}>
              {group.description}
            </p>
          )}
        </div>

        {/* Active prompt preview (non-members only — members go straight to chat) */}
        {!is_member && !isBanned && activePrompt && (
          <div style={{
            background: 'var(--color-surface-secondary)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-sm) var(--space-md)',
          }}>
            <div className="label" style={{ marginBottom: 6, fontSize: '0.7rem' }}>Current discussion</div>
            <p style={{
              fontFamily: 'var(--font-editorial)',
              fontSize: '0.92rem',
              lineHeight: 'var(--leading-relaxed)',
              margin: 0,
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              color: 'var(--color-text-primary)',
            }}>
              {activePrompt.content}
            </p>
            <p style={{ fontSize: '0.78rem', marginTop: 6, color: 'var(--color-accent)', marginBottom: 0 }}>
              Join to respond →
            </p>
          </div>
        )}

        {/* Actions */}
        {isBanned ? (
          <div className="info-banner info-banner--danger">
            <p style={{ fontWeight: 500, margin: 0 }}>You have been removed from this group.</p>
          </div>
        ) : is_member ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button className="btn btn--primary" onClick={() => navigate(`/groups/${id}/chat`)}>
              Open group
            </button>
            <button className="btn btn--muted" onClick={handleLeave}>Leave group</button>
          </div>
        ) : (
          <button className="btn btn--primary" onClick={() => navigate(`/groups/${id}/agree`)}>
            Join group
          </button>
        )}
      </div>
    </div>
  );
}
