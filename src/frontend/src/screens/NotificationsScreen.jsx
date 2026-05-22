import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import client from '../api/client';

const LANES = [
  { key: 'activity', label: 'Activity',  types: ['milestone', 'peer_broadcast', 'journal_prompt'] },
  { key: 'support',  label: 'Support',   types: ['therapist_update', 'referral_status', 'admin_message'] },
  { key: 'payments', label: 'Payments',  types: ['credit_low', 'payment_confirmed'] },
  { key: 'system',   label: 'System',    types: ['account_notice', 'generic'] },
];

const TYPE_META = {
  milestone:         { icon: '🏆', label: 'Milestone',         route: '/analytics' },
  peer_broadcast:    { icon: '🤝', label: 'Peer update',        route: '/peer' },
  journal_prompt:    { icon: '📓', label: 'Journal prompt',     route: '/journal' },
  therapist_update:  { icon: '🩺', label: 'Therapist update',   route: '/therapists/status' },
  referral_status:   { icon: '📋', label: 'Referral update',    route: '/referral' },
  admin_message:     { icon: '💬', label: 'Message from admin', route: null },
  credit_low:        { icon: '⚠️', label: 'Low balance',        route: '/profile' },
  payment_confirmed: { icon: '✅', label: 'Payment confirmed',  route: '/profile' },
  account_notice:    { icon: 'ℹ️', label: 'Account notice',     route: '/profile' },
  generic:           { icon: '🔔', label: 'Notification',       route: null },
};

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const utc = dateStr.includes('Z') || dateStr.includes('+') ? dateStr : dateStr.replace(' ', 'T') + 'Z';
  const diff = Math.floor((Date.now() - new Date(utc).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function NotifRow({ notif, onRead }) {
  const navigate = useNavigate();
  const meta = TYPE_META[notif.type] ?? TYPE_META.generic;
  const body = notif.payload?.message ?? notif.payload?.body ?? notif.payload?.text ?? '';
  const unread = !notif.read_at;

  async function handleTap() {
    if (unread) await onRead(notif.id);
    if (meta.route) navigate(meta.route);
  }

  return (
    <div
      onClick={handleTap}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '12px 16px',
        background: unread ? 'rgba(143,175,154,0.08)' : 'transparent',
        borderBottom: '1px solid var(--color-border)',
        cursor: meta.route ? 'pointer' : 'default',
        transition: 'background 150ms ease',
      }}
    >
      <span style={{ fontSize: 22, flexShrink: 0, marginTop: 1 }}>{meta.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontWeight: unread ? 700 : 500, fontSize: '0.88rem', color: 'var(--color-text-primary)' }}>
            {meta.label}
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', flexShrink: 0 }}>
            {timeAgo(notif.created_at)}
          </span>
        </div>
        {body ? (
          <p style={{ margin: '3px 0 0', fontSize: '0.82rem', color: 'var(--color-text-secondary)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {body}
          </p>
        ) : null}
      </div>
      {unread && (
        <span style={{
          flexShrink: 0, width: 8, height: 8, borderRadius: '50%',
          background: 'var(--color-calm)', marginTop: 6,
        }} />
      )}
    </div>
  );
}

export default function NotificationsScreen() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState('activity');

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => client.get('/api/notifications?limit=50').then(r => r.data),
  });

  const allNotifs = data?.notifications ?? (Array.isArray(data) ? data : []);
  const activeLane = LANES.find(l => l.key === tab);
  const visible = allNotifs.filter(n => activeLane.types.includes(n.type));
  const totalUnread = allNotifs.filter(n => !n.read_at).length;

  function laneUnread(lane) {
    return allNotifs.filter(n => lane.types.includes(n.type) && !n.read_at).length;
  }

  async function handleRead(id) {
    qc.setQueryData(['notifications'], (old) => {
      const now = new Date().toISOString();
      const list = old?.notifications ?? (Array.isArray(old) ? old : []);
      const updated = list.map(n => n.id === id ? { ...n, read_at: now } : n);
      return Array.isArray(old) ? updated : { ...old, notifications: updated };
    });
    try { await client.patch(`/api/notifications/${id}/read`); } catch { /* best-effort */ }
  }

  async function handleReadAll() {
    qc.setQueryData(['notifications'], (old) => {
      const now = new Date().toISOString();
      const list = old?.notifications ?? (Array.isArray(old) ? old : []);
      const updated = list.map(n => n.read_at ? n : { ...n, read_at: now });
      return Array.isArray(old) ? updated : { ...old, notifications: updated };
    });
    try { await client.patch('/api/notifications/read-all'); } catch {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    }
  }

  return (
    <div className="screen screen--no-nav" style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', background: 'var(--color-surface-card)',
        borderBottom: '1px solid var(--color-border)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="page-header__back" onClick={() => navigate(-1)} aria-label="Back">‹</button>
          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
            Notifications{totalUnread > 0 ? ` · ${totalUnread > 9 ? '9+' : totalUnread}` : ''}
          </span>
        </div>
        {totalUnread > 0 && (
          <button
            onClick={handleReadAll}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--color-calm)', fontWeight: 600, padding: '4px 0' }}
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Lane tabs */}
      <div style={{
        display: 'flex', gap: 6, padding: '10px 14px',
        background: 'var(--color-surface-card)', borderBottom: '1px solid var(--color-border)',
        flexShrink: 0, overflowX: 'auto',
      }}>
        {LANES.map(lane => {
          const badge = laneUnread(lane);
          const active = tab === lane.key;
          return (
            <button
              key={lane.key}
              onClick={() => setTab(lane.key)}
              style={{
                flexShrink: 0, padding: '5px 12px', borderRadius: 'var(--radius-pill)',
                border: active ? 'none' : '1px solid var(--color-border)',
                background: active ? 'var(--color-calm)' : 'transparent',
                color: active ? '#fff' : 'rgba(245,237,228,0.7)',
                fontSize: '0.8rem', fontWeight: active ? 700 : 500, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              {lane.label}
              {badge > 0 && (
                <span style={{
                  background: active ? 'rgba(255,255,255,0.3)' : 'var(--color-danger)',
                  color: '#fff', borderRadius: '50%',
                  width: 16, height: 16, fontSize: 9, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
                <div className="skeleton" style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0 }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="skeleton" style={{ width: '40%', height: 12, borderRadius: 4 }} />
                  <div className="skeleton" style={{ width: '70%', height: 10, borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', gap: 10, textAlign: 'center' }}>
            <span style={{ fontSize: 36 }}>🔕</span>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>No {activeLane.label.toLowerCase()} notifications yet.</p>
          </div>
        ) : (
          visible.map(n => <NotifRow key={n.id} notif={n} onRead={handleRead} />)
        )}
      </div>
    </div>
  );
}
