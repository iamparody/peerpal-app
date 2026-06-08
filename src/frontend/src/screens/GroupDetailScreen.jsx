import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import client from '../api/client';
import { groupMeta } from '../utils/groupMeta';

export default function GroupDetailScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const { data: res } = await client.get(`/api/groups/${id}`);
        setData(res);
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

  if (!data) {
    return (
      <div className="screen" style={{ padding: 24, textAlign: 'center' }}>
        <p>{error || 'Group not found.'}</p>
        <button className="btn btn--primary" style={{ marginTop: 16 }} onClick={() => navigate('/groups')}>Back to groups</button>
      </div>
    );
  }

  const { group, is_member, membership_status } = data;
  const meta = groupMeta(group.condition_category);
  const isBanned = membership_status === 'banned';

  return (
    <div className="screen" style={{ padding: '0 0 24px' }}>
      <div className="page-header">
        <button className="page-header__back" onClick={() => navigate('/groups')} aria-label="Back">‹</button>
        <h2 className="page-header__title">{group.name}</h2>
      </div>

      {/* Group profile header */}
      <div style={{
        margin: '0 16px 16px',
        borderRadius: 'var(--radius-lg)',
        background: meta.bg,
        border: `1.5px solid ${meta.color}33`,
        padding: '20px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}>
        {/* Category icon */}
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: `${meta.color}22`,
          border: `2px solid ${meta.color}55`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 32, flexShrink: 0,
        }}>
          {meta.emoji}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4, lineHeight: 1.2 }}>{group.name}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
              background: `${meta.color}22`, color: meta.color, border: `1px solid ${meta.color}44`,
            }}>
              {meta.label}
            </span>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
              👥 {group.member_count ?? 0} {Number(group.member_count) === 1 ? 'member' : 'members'}
            </span>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && <div className="error-msg">{error}</div>}

        {group.description && (
          <div className="card" style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
            {group.description}
          </div>
        )}

        {/* Admin-only posting notice */}
        <div style={{
          fontSize: 12, color: 'var(--color-text-secondary)',
          background: 'var(--color-surface-secondary)',
          borderRadius: 'var(--radius-sm)', padding: '8px 12px',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span>📢</span>
          <span>This group is a read-only community feed. Posts come from the PeerPal team.</span>
        </div>

        {isBanned ? (
          <div className="card" style={{ textAlign: 'center', padding: '20px 16px' }}>
            <p style={{ color: 'var(--color-danger)', fontWeight: 500 }}>You have been removed from this group.</p>
          </div>
        ) : is_member ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button className="btn btn--primary" onClick={() => navigate(`/groups/${id}/chat`)}>
              Open Group Feed
            </button>
            <button className="btn btn--muted" onClick={handleLeave}>Leave Group</button>
          </div>
        ) : (
          <button className="btn btn--primary" onClick={() => navigate(`/groups/${id}/agree`)}>
            Join Group
          </button>
        )}
      </div>
    </div>
  );
}
