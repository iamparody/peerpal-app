import { useState, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginScreen    from './components/LoginScreen';
import OverviewTab    from './tabs/OverviewTab';
import EmergencyTab   from './tabs/EmergencyTab';
import EscalationsTab from './tabs/EscalationsTab';
import ReferralsTab   from './tabs/ReferralsTab';
import ReportsTab     from './tabs/ReportsTab';
import RiskTab        from './tabs/RiskTab';
import ContentTab      from './tabs/ContentTab';
import StatsTab        from './tabs/StatsTab';
import TherapistsTab   from './tabs/TherapistsTab';
import PatternsTab     from './tabs/PatternsTab';
import {
  House, Siren, Handshake, Stethoscope,
  Flag, Warning, BookOpen, ChartBar, UserCircle,
  CaretLeft, CaretRight, List, ChartLineUp,
} from '@phosphor-icons/react';

const TABS = [
  { id: 'overview',    label: 'Overview',    Icon: House },
  { id: 'emergency',   label: 'Emergency',   Icon: Siren,       badgeKey: 'emergency' },
  { id: 'escalations', label: 'Escalations', Icon: Handshake,   badgeKey: 'escalations' },
  { id: 'referrals',   label: 'Referrals',   Icon: Stethoscope },
  { id: 'reports',     label: 'Reports',     Icon: Flag,        badgeKey: 'reports' },
  { id: 'risk',        label: 'Risk Flags',  Icon: Warning,     badgeKey: 'risk' },
  { id: 'content',     label: 'Content',     Icon: BookOpen },
  { id: 'therapists',  label: 'Therapists',  Icon: UserCircle },
  { id: 'stats',       label: 'Stats',       Icon: ChartBar },
  { id: 'patterns',    label: 'Patterns',    Icon: ChartLineUp },
];

function AdminShell() {
  const { admin, logout } = useAuth();
  const [activeTab,      setActiveTab]      = useState('overview');
  const [collapsed,      setCollapsed]      = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [badges, setBadges] = useState({ emergency: 0, escalations: 0, reports: 0, risk: 0 });

  const setBadge = useCallback(
    (key) => (count) => setBadges((prev) => ({ ...prev, [key]: count })),
    [],
  );

  const updateAllBadges = useCallback(
    (next) => setBadges((prev) => ({ ...prev, ...next })),
    [],
  );

  const renderTab = () => {
    switch (activeTab) {
      case 'overview':    return <OverviewTab onNavigate={setActiveTab} onBadgesUpdate={updateAllBadges} />;
      case 'emergency':   return <EmergencyTab   onCountChange={setBadge('emergency')} />;
      case 'escalations': return <EscalationsTab onCountChange={setBadge('escalations')} />;
      case 'referrals':   return <ReferralsTab />;
      case 'reports':     return <ReportsTab     onCountChange={setBadge('reports')} />;
      case 'risk':        return <RiskTab        onCountChange={setBadge('risk')} />;
      case 'content':     return <ContentTab />;
      case 'therapists':  return <TherapistsTab />;
      case 'stats':       return <StatsTab />;
      case 'patterns':    return <PatternsTab />;
      default:            return null;
    }
  };

  const active   = TABS.find((t) => t.id === activeTab);
  const initials = admin?.alias ? admin.alias.slice(0, 2).toUpperCase() : 'AD';

  return (
    <div className="admin-layout">
      {/* ── Mobile backdrop ─────────────────────────────────────── */}
      {mobileMenuOpen && (
        <div className="mobile-backdrop" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}${mobileMenuOpen ? ' sidebar--mobile-open' : ''}`}>
        <div className="sidebar__brand">
          <div className="sidebar__brand-icon">🧠</div>
          {!collapsed && (
            <div className="sidebar__brand-text">
              <div className="sidebar__brand-title">Melah</div>
              <div className="sidebar__brand-sub">Admin Panel</div>
            </div>
          )}
        </div>

        <nav className="sidebar__nav">
          {TABS.map(({ id, label, Icon, badgeKey }) => {
            const count    = badgeKey ? badges[badgeKey] : 0;
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                title={collapsed ? label : undefined}
                className={`sidebar__item${isActive ? ' active' : ''}`}
                onClick={() => { setActiveTab(id); setMobileMenuOpen(false); }}
              >
                <Icon
                  size={18}
                  weight={isActive ? 'fill' : 'regular'}
                  className="sidebar__item-icon"
                />
                {!collapsed && <span className="sidebar__item-label">{label}</span>}
                {count > 0 && (
                  <span className={`sidebar__item-badge${badgeKey === 'escalations' ? ' sidebar__item-badge--warn' : ''}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}

          <button
            className="sidebar__collapse-btn"
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed
              ? <CaretRight size={15} weight="bold" />
              : <><CaretLeft size={15} weight="bold" /><span className="sidebar__item-label" style={{ fontSize: 13 }}>Collapse</span></>
            }
          </button>
        </nav>

        <div className="sidebar__footer">
          {!collapsed && <span className="sidebar__alias">{admin?.alias}</span>}
          <button className="sidebar__logout" onClick={logout} title={collapsed ? 'Sign out' : undefined}>
            {collapsed ? '→' : 'Sign out'}
          </button>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────── */}
      <div className="main">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              className="mobile-menu-btn"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
            >
              <List size={22} />
            </button>
            <div className="topbar__breadcrumb">
              <span>Melah</span>
              <span style={{ color: 'var(--color-card-border)', margin: '0 2px' }}>›</span>
              <span className="topbar__breadcrumb-current">{active?.label}</span>
            </div>
          </div>
          <div className="topbar__right">
            <div className="topbar__alias-chip">
              <div className="topbar__avatar">{initials}</div>
              {admin?.alias}
            </div>
          </div>
        </header>

        <main className="content">
          <div className="content-inner">
            {renderTab()}
          </div>
        </main>
      </div>
    </div>
  );
}

function AppInner() {
  const { admin, loading } = useAuth();
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--color-text-muted)', fontSize: 14 }}>
      Loading…
    </div>
  );
  return admin ? <AdminShell /> : <LoginScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
