import { useEffect, useState, useRef } from 'react';
import client from '../api/client';
import { Siren, Handshake, Flag, Warning, ArrowRight, CheckCircle } from '@phosphor-icons/react';

/* ── Animated counter ────────────────────────────────────────────────── */
function AnimatedNumber({ value, duration = 900 }) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (value === 0) { setDisplay(0); return; }

    const start = performance.now();
    const from  = 0;

    function step(now) {
      const t = Math.min((now - start) / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    }

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  return display;
}

/* ── Helpers ─────────────────────────────────────────────────────────── */
function elapsed(ts) {
  const s = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const ICON_MAP = {
  emergency:  { cls: 'activity-icon--emergency', Icon: Siren },
  escalation: { cls: 'activity-icon--escalation', Icon: Handshake },
  report:     { cls: 'activity-icon--report',    Icon: Flag },
  risk:       { cls: 'activity-icon--risk',      Icon: Warning },
};

/* ── Component ───────────────────────────────────────────────────────── */
export default function OverviewTab({ onNavigate, onBadgesUpdate }) {
  const [counts,   setCounts]   = useState({ emergency: 0, escalations: 0, reports: 0, risk: 0 });
  const [activity, setActivity] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      const [em, es, rp, ri] = await Promise.allSettled([
        client.get('/api/admin/emergency-queue'),
        client.get('/api/admin/escalations'),
        client.get('/api/admin/reports'),
        client.get('/api/admin/risk-flags'),
      ]);
      if (!active) return;

      const queue       = em.value?.data?.queue         ?? [];
      const escalations = es.value?.data?.escalations   ?? [];
      const reports     = rp.value?.data?.reports       ?? [];
      const flagged     = ri.value?.data?.flagged_users ?? [];

      const newCounts = {
        emergency:   queue.length,
        escalations: escalations.length,
        reports:     reports.length,
        risk:        flagged.length,
      };
      setCounts(newCounts);
      onBadgesUpdate?.(newCounts);

      const items = [
        ...queue.slice(0, 3).map((e) => ({
          type: 'emergency',
          desc: `Emergency triggered by ${e.alias}`,
          ts:   e.triggered_at,
        })),
        ...escalations.slice(0, 3).map((e) => ({
          type: 'escalation',
          desc: `Peer escalation — ${e.alias} waiting (${e.channel_preference})`,
          ts:   e.escalated_at,
        })),
        ...reports.slice(0, 3).map((r) => ({
          type: 'report',
          desc: `Report: ${r.reported_alias} in ${r.group_name}`,
          ts:   r.created_at,
        })),
        ...flagged.slice(0, 3).map((u) => ({
          type: 'risk',
          desc: `Risk flag — ${u.alias} (${u.risk_level})`,
          ts:   u.updated_at,
        })),
      ];
      items.sort((a, b) => new Date(b.ts) - new Date(a.ts));
      setActivity(items.slice(0, 12));
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [onBadgesUpdate]);

  const statCards = [
    { label: 'Open Emergencies', value: counts.emergency,   mod: 'open',    Icon: Siren,     nav: 'emergency' },
    { label: 'Peer Escalations', value: counts.escalations, mod: 'pending', Icon: Handshake, nav: 'escalations' },
    { label: 'Pending Reports',  value: counts.reports,     mod: 'review',  Icon: Flag,      nav: 'reports' },
    { label: 'Risk Flags',       value: counts.risk,        mod: 'risk',    Icon: Warning,   nav: 'risk' },
  ];

  const quickActions = [
    { label: 'Emergency Queue',  sub: 'View active emergencies',    Icon: Siren,     nav: 'emergency',   mod: 'emergency' },
    { label: 'Peer Escalations', sub: 'Unanswered peer requests',   Icon: Handshake, nav: 'escalations', mod: 'escalation' },
    { label: 'Group Reports',    sub: 'Review flagged content',     Icon: Flag,      nav: 'reports',     mod: 'report' },
    { label: 'Risk Flags',       sub: 'High / critical risk users', Icon: Warning,   nav: 'risk',        mod: 'risk' },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Overview</h1>
          <p className="page-subtitle">Live platform status and recent activity</p>
        </div>
      </div>

      {/* ── Stat cards ─────────────────────────────────────────── */}
      <div className="stat-grid">
        {statCards.map(({ label, value, mod, Icon, nav }) => {
          const hasAlert = value > 0 && mod === 'open';
          const hasWarn  = value > 0 && mod !== 'open';
          return (
            <div
              key={label}
              className={`stat-card stat-card--${mod} stat-card--clickable`}
              onClick={() => onNavigate(nav)}
            >
              <div className={`stat-card__icon-wrap stat-card__icon-wrap--${mod}`}>
                <Icon size={24} weight="fill" />
              </div>

              <div className={`stat-card__value${hasAlert ? ' stat-card__value--alert' : hasWarn ? ' stat-card__value--warn' : ''}`}>
                <AnimatedNumber value={value} />
              </div>

              <div className="stat-card__label">{label}</div>

              <div className={`stat-card__trend${value === 0 ? ' stat-card__trend--ok' : hasAlert ? ' stat-card__trend--alert' : ' stat-card__trend--warn'}`}>
                {value === 0 ? '✓ All clear' : `${value} item${value === 1 ? '' : 's'} need attention`}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Two-column: activity + quick actions ───────────────── */}
      <div className="two-col">
        <div className="card">
          <div className="card-header">
            <h2>Recent Activity</h2>
          </div>
          <div className="activity-feed">
            {loading ? (
              <div className="skeleton-list">
                {[...Array(5)].map((_, i) => <div key={i} className="skeleton skeleton-row" />)}
              </div>
            ) : activity.length === 0 ? (
              <div className="empty-state">
                <CheckCircle size={40} className="empty-state__icon empty-state__icon--success" weight="fill" />
                <p className="empty-state__title">All clear</p>
                <p className="empty-state__sub">No recent activity to show.</p>
              </div>
            ) : activity.map((item, i) => {
              const { cls, Icon } = ICON_MAP[item.type] ?? ICON_MAP.report;
              return (
                <div key={i} className="activity-item">
                  <div className={`activity-icon ${cls}`}>
                    <Icon size={16} weight="fill" />
                  </div>
                  <div className="activity-body">
                    <div className="activity-desc">{item.desc}</div>
                    <div className="activity-time">{elapsed(item.ts)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Quick Actions</h2>
          </div>
          {quickActions.map(({ label, sub, Icon, nav, mod }) => (
            <button key={nav} className="quick-action" onClick={() => onNavigate(nav)}>
              <div className={`quick-action__icon quick-action__icon--${mod}`}>
                <Icon size={20} weight="fill" />
              </div>
              <div className="quick-action__body">
                <div className="quick-action__label">{label}</div>
                <div className="quick-action__sub">{sub}</div>
              </div>
              <ArrowRight size={18} className="quick-action__arrow" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
