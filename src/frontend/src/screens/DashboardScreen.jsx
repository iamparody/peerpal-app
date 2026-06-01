import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Handshake, Robot, Stethoscope, Notebook, UsersThree, Siren, Bell, Coin } from '@phosphor-icons/react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import MoodBlob from '../components/MoodBlob';

const TILES = [
  { label: 'Peer Help',  Icon: Handshake,  to: '/peer',       desc: 'Talk to someone now' },
  { label: 'AI Chat',    Icon: Robot,       to: '/ai-chat',    desc: 'Your companion is here' },
  { label: 'Therapist',  Icon: Stethoscope, to: '/therapists', desc: 'Find the right fit' },
  { label: 'Journal',    Icon: Notebook,    to: '/journal',    desc: 'Write freely' },
  { label: 'Groups',     Icon: UsersThree,  to: '/groups',     desc: 'Peer communities' },
  { label: 'Emergency',  Icon: Siren,       to: '/emergency',  desc: 'Get help right now', emergency: true },
];

function timeGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatMoodTime(dateStr) {
  if (!dateStr) return '';
  const utcStr = dateStr.includes('Z') || dateStr.includes('+')
    ? dateStr : dateStr.replace(' ', 'T') + 'Z';
  const date = new Date(utcStr);
  const now   = new Date();
  const time  = date.toLocaleTimeString('en-KE', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (date.toDateString() === now.toDateString()) return `Today · ${time}`;
  return `${date.toLocaleDateString('en-KE', { weekday: 'short' })} · ${time}`;
}

const MOOD_LABELS = { very_low: 'Very Low', low: 'Low', neutral: 'Neutral', good: 'Good', great: 'Great' };

function DashboardSkeleton() {
  return (
    <div style={{ padding: 'var(--space-md)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 'var(--space-lg)', paddingTop: 'var(--space-lg)' }}>
        <div className="skeleton" style={{ width: 80, height: 80, borderRadius: '50%' }} />
        <div className="skeleton" style={{ width: 160, height: 18 }} />
        <div className="skeleton" style={{ width: 120, height: 13 }} />
      </div>
      <div className="skeleton" style={{ width: '100%', height: 1, marginBottom: 'var(--space-lg)' }} />
      <div className="skeleton" style={{ width: 100, height: 12, marginBottom: 'var(--space-md)' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)' }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 80, borderRadius: 'var(--radius-lg)' }} />
        ))}
      </div>
    </div>
  );
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const qc        = useQueryClient();
  const [moodDismissed, setMoodDismissed] = useState(false);

  // ── TanStack Query: cached, stale 5 min ─────────────────────────────────
  const { data: balanceData } = useQuery({
    queryKey: ['credits', 'balance'],
    queryFn:  () => client.get('/api/credits/balance').then(r => r.data),
  });
  const { data: notifsData } = useQuery({
    queryKey: ['notifications'],
    queryFn:  () => client.get('/api/notifications').then(r => r.data),
  });
  const { data: moodTodayData } = useQuery({
    queryKey: ['moods', 'today'],
    queryFn:  () => client.get('/api/moods/today').then(r => r.data),
  });
  const { data: moodHistData, isLoading } = useQuery({
    queryKey: ['moods', 'history', 1],
    queryFn:  () => client.get('/api/moods/history?limit=1').then(r => r.data),
  });

  if (isLoading && !moodHistData) return <DashboardSkeleton />;

  const balance  = balanceData?.balance ?? null;
  const balanceLow = balance !== null && balance <= 2;
  const notifs   = notifsData?.notifications ?? notifsData ?? [];
  const unread   = notifs.filter(n => !n.read_at).length;
  const entries  = moodHistData?.entries ?? [];
  const lastMood = entries[0]?.mood_level ?? null;
  const lastMoodTime = entries[0]?.created_at ?? null;
  const moodDone = !!moodTodayData?.entry;
  const alias    = user?.alias ?? '';

  return (
    <div className="screen">
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 'var(--top-bar-height)', padding: '0 var(--space-md)',
        background: 'var(--color-bg-primary)', borderBottom: '1px solid var(--color-border)',
        flexShrink: 0,
      }}>
        <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-editorial)' }}>
          Melah
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                onClick={() => navigate('/credits')}
                className={`credit-badge${balanceLow ? ' credit-badge--low' : ''}`}
                aria-label={`${balance} credits — tap to top up`}
                style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
              >
                <Coin size={16} weight="duotone" aria-hidden="true" />
                {balance !== null ? balance : '—'}
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content className="tooltip-content" sideOffset={6}>
                Credits · tap to top up
                <Tooltip.Arrow className="tooltip-arrow" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>

          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                onClick={() => navigate('/notifications')}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', position: 'relative',
                  width: 'var(--touch-target-min)', height: 'var(--touch-target-min)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--color-text-primary)', borderRadius: 'var(--radius-sm)',
                }}
                aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
              >
                <Bell size={24} weight="duotone" aria-hidden="true" />
                {unread > 0 && (
                  <span style={{
                    position: 'absolute', top: 6, right: 6,
                    background: 'var(--color-danger)', color: '#F5EDE4',
                    borderRadius: '50%', width: 16, height: 16,
                    fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
                  }}>
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content className="tooltip-content" sideOffset={6}>
                Notifications
                <Tooltip.Arrow className="tooltip-arrow" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </div>
      </div>

      {/* Top section — blob + greeting */}
      <div style={{
        background: 'var(--color-bg-primary)', display: 'flex', flexDirection: 'column',
        alignItems: 'center', paddingTop: 'var(--space-lg)', paddingBottom: 'var(--space-lg)', textAlign: 'center',
      }}>
        <div style={{ pointerEvents: 'none' }}>
          <MoodBlob mood={lastMood} size={80} />
        </div>
        <h2 style={{ fontSize: 'var(--text-h2)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-secondary)', marginTop: 'var(--space-sm)', marginBottom: 'var(--space-xs)' }}>
          {timeGreeting()}{alias ? `, ${alias}` : ''}.
        </h2>
        {lastMood ? (
          <>
            <p style={{ fontSize: 'var(--text-caption)', color: 'var(--color-text-muted)' }}>
              Last check-in: {MOOD_LABELS[lastMood] ?? lastMood} · {lastMoodTime ? formatMoodTime(lastMoodTime) : ''}
            </p>
            {moodDone && (
              <button
                onClick={() => navigate('/mood')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--color-text-muted)', opacity: 0.65, marginTop: 4, padding: '2px 6px', borderRadius: 'var(--radius-sm)' }}
              >
                + check in again
              </button>
            )}
          </>
        ) : (
          <p style={{ fontSize: 'var(--text-caption)', color: 'var(--color-text-muted)' }}>No check-in yet today</p>
        )}
      </div>

      <div style={{ height: 1, background: 'var(--color-divider)', margin: '0 var(--space-md)' }} />

      {/* Mood prompt banner */}
      {!moodDone && !moodDismissed && (
        <div style={{
          margin: 'var(--space-sm) var(--space-md)',
          background: 'var(--color-warning-bg)', borderLeft: '3px solid var(--color-warning)',
          borderRadius: 'var(--radius-md)', padding: '12px 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-sm)',
        }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-warning)' }}>How are you feeling today?</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>Daily check-in</div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', flexShrink: 0 }}>
            <button onClick={() => navigate('/mood')} className="btn btn--primary btn--sm" style={{ width: 'auto' }}>Check In</button>
            <button
              onClick={() => setMoodDismissed(true)}
              style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--color-text-muted)', width: 'var(--touch-target-min)', height: 'var(--touch-target-min)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              aria-label="Dismiss"
            >×</button>
          </div>
        </div>
      )}

      {/* Action tiles */}
      <div style={{ padding: 'var(--space-md) var(--space-md) 0' }}>
        <p style={{ fontSize: 'var(--text-label)', color: 'var(--color-text-muted)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', marginBottom: 'var(--space-sm)' }}>
          What would you like to do?
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)' }}>
          {TILES.map(({ label, Icon, to, desc, emergency }) => (
            <Link
              key={to}
              to={to}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 6, padding: '16px 12px',
                background: emergency ? 'var(--color-danger-bg)' : 'var(--color-surface-card)',
                border: `1px solid ${emergency ? 'rgba(179,92,92,0.40)' : 'var(--color-border)'}`,
                borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-card)',
                textDecoration: 'none', color: emergency ? 'var(--color-danger)' : '#F5EDE4',
                transition: 'transform var(--duration-fast), box-shadow var(--duration-fast)',
                minHeight: 80,
              }}
              onMouseDown={e => e.currentTarget.style.transform = 'scale(0.985)'}
              onMouseUp={e => e.currentTarget.style.transform = ''}
              onTouchStart={e => e.currentTarget.style.transform = 'scale(0.985)'}
              onTouchEnd={e => e.currentTarget.style.transform = ''}
            >
              <Icon size={28} weight="duotone" aria-hidden="true" color={emergency ? 'var(--color-danger)' : 'var(--color-accent)'} />
              <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>
              <span style={{ fontSize: 11, color: emergency ? 'rgba(179,92,92,0.80)' : 'rgba(245,237,228,0.55)', textAlign: 'center', lineHeight: 1.3 }}>{desc}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Quick links */}
      <div style={{ display: 'flex', gap: 'var(--space-sm)', padding: 'var(--space-md) var(--space-md) 0', flexWrap: 'wrap' }}>
        <Link to="/analytics" className="pill" style={{ cursor: 'pointer' }}>My insights</Link>
        <Link to="/safety-plan" className="pill" style={{ cursor: 'pointer' }}>Safety plan</Link>
        <Link to="/breathing" className="pill" style={{ cursor: 'pointer' }}>Breathing</Link>
      </div>
    </div>
  );
}
