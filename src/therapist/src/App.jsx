import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginScreen  from './components/LoginScreen';
import DashboardTab from './tabs/DashboardTab';
import SessionsTab  from './tabs/SessionsTab';
import ScheduleTab  from './tabs/ScheduleTab';
import PaymentsTab  from './tabs/PaymentsTab';
import RatingsTab   from './tabs/RatingsTab';
import ProfileTab   from './tabs/ProfileTab';
import {
  House,
  CalendarBlank,
  Clock,
  CurrencyDollar,
  Star,
  UserCircle,
  CaretLeft,
  CaretRight,
} from '@phosphor-icons/react';

const TABS = [
  { id: 'sessions',   label: 'Sessions',   Icon: CalendarBlank },
  { id: 'dashboard',  label: 'Dashboard',  Icon: House },
  { id: 'schedule',   label: 'Schedule',   Icon: Clock },
  { id: 'payments',   label: 'Payments',   Icon: CurrencyDollar },
  { id: 'ratings',    label: 'Ratings',    Icon: Star },
  { id: 'profile',    label: 'Profile',    Icon: UserCircle },
];

// Bottom nav shows first 5 tabs (omit one if > 5 items)
const BOTTOM_NAV_TABS = TABS.slice(0, 5);

function TherapistShell() {
  const { therapist, logout } = useAuth();
  const [activeTab,  setActiveTab]  = useState('sessions');
  const [collapsed,  setCollapsed]  = useState(false);

  // Suspension notice
  if (therapist?.suspended) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-main-bg)',
        padding: 24,
      }}>
        <div className="card" style={{ padding: '48px 44px', maxWidth: 480, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 10, color: 'var(--color-status-open)' }}>
            Account Suspended
          </h1>
          <p style={{ fontSize: 15, color: 'var(--color-text-muted)', lineHeight: 1.6, marginBottom: 24 }}>
            Your therapist account has been suspended. Please contact PeerPal support to resolve this issue.
          </p>
          <button className="btn btn--ghost" onClick={logout}>Sign out</button>
        </div>
      </div>
    );
  }

  const active   = TABS.find((t) => t.id === activeTab);
  const initials = therapist?.alias
    ? therapist.alias.slice(0, 2).toUpperCase()
    : therapist?.display_name?.slice(0, 2).toUpperCase() || 'TH';

  function renderTab() {
    switch (activeTab) {
      case 'sessions':   return <SessionsTab />;
      case 'dashboard':  return <DashboardTab />;
      case 'schedule':   return <ScheduleTab />;
      case 'payments':   return <PaymentsTab />;
      case 'ratings':    return <RatingsTab />;
      case 'profile':    return <ProfileTab />;
      default:           return null;
    }
  }

  return (
    <div className="portal-layout">
      {/* ── Sidebar (desktop ≥ 769px) ──────────────────────────── */}
      <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>
        <div className="sidebar__brand">
          <div className="sidebar__brand-icon">🩺</div>
          {!collapsed && (
            <div className="sidebar__brand-text">
              <div className="sidebar__brand-title">PeerPal</div>
              <div className="sidebar__brand-sub">Therapist Portal</div>
            </div>
          )}
        </div>

        <nav className="sidebar__nav">
          {TABS.map(({ id, label, Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                title={collapsed ? label : undefined}
                className={`sidebar__item${isActive ? ' active' : ''}`}
                onClick={() => setActiveTab(id)}
              >
                <Icon
                  size={18}
                  weight={isActive ? 'fill' : 'regular'}
                  className="sidebar__item-icon"
                />
                {!collapsed && <span className="sidebar__item-label">{label}</span>}
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
          {!collapsed && (
            <span className="sidebar__alias">
              {therapist?.display_name || therapist?.alias}
            </span>
          )}
          <button className="sidebar__logout" onClick={logout} title={collapsed ? 'Sign out' : undefined}>
            {collapsed ? '→' : 'Sign out'}
          </button>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────── */}
      <div className="main">
        <header className="topbar">
          <div className="topbar__breadcrumb">
            <span>PeerPal</span>
            <span style={{ color: 'var(--color-card-border)', margin: '0 2px' }}>›</span>
            <span className="topbar__breadcrumb-current">{active?.label}</span>
          </div>
          <div className="topbar__right">
            <div className="topbar__alias-chip">
              <div className="topbar__avatar">{initials}</div>
              {therapist?.display_name || therapist?.alias}
            </div>
          </div>
        </header>

        <main className="content">
          <div className="content-inner">
            {renderTab()}
          </div>
        </main>
      </div>

      {/* ── Bottom nav (mobile ≤ 768px) ─────────────────────── */}
      <nav className="bottom-nav">
        <div className="bottom-nav__inner">
          {BOTTOM_NAV_TABS.map(({ id, label, Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                className={`bottom-nav__item${isActive ? ' active' : ''}`}
                onClick={() => setActiveTab(id)}
              >
                <Icon
                  size={20}
                  weight={isActive ? 'fill' : 'regular'}
                  className="bottom-nav__icon"
                />
                <span className="bottom-nav__label">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function AppInner() {
  const { therapist, loading } = useAuth();
  if (loading) return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      color: 'var(--color-text-muted)',
      fontSize: 14,
    }}>
      Loading…
    </div>
  );
  return therapist ? <TherapistShell /> : <LoginScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
