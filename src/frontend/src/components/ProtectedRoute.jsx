import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';

const ONBOARDING_STEPS = [
  { key: 'consent',            path: '/onboarding/consent' },
  { key: 'persona',            path: '/onboarding/persona' },
  { key: 'condition_selected', path: '/onboarding/condition' },
  { key: 'first_mood',         path: '/onboarding/first-mood' },
];

function AppSkeleton() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg-primary)', padding: 'var(--space-md)' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 'var(--top-bar-height)', marginBottom: 'var(--space-lg)' }}>
        <div className="skeleton" style={{ width: 100, height: 18, borderRadius: 6 }} />
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="skeleton" style={{ width: 52, height: 28, borderRadius: 20 }} />
          <div className="skeleton" style={{ width: 36, height: 36, borderRadius: '50%' }} />
        </div>
      </div>
      {/* Blob + greeting area */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 'var(--space-lg)' }}>
        <div className="skeleton" style={{ width: 80, height: 80, borderRadius: '50%' }} />
        <div className="skeleton" style={{ width: 160, height: 18, borderRadius: 6 }} />
        <div className="skeleton" style={{ width: 110, height: 13, borderRadius: 6 }} />
      </div>
      {/* Divider */}
      <div className="skeleton" style={{ height: 1, marginBottom: 'var(--space-lg)', borderRadius: 1 }} />
      {/* Label */}
      <div className="skeleton" style={{ width: 130, height: 11, borderRadius: 6, marginBottom: 'var(--space-sm)' }} />
      {/* Tile grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)' }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 80, borderRadius: 'var(--radius-lg)' }} />
        ))}
      </div>
    </div>
  );
}

export default function ProtectedRoute({ children }) {
  const { token, loading } = useAuth();
  const location = useLocation();
  const [onboardingCheck, setOnboardingCheck] = useState({ done: false, redirect: null });

  useEffect(() => {
    if (!token) return;
    const onboardingPaths = ONBOARDING_STEPS.map((s) => s.path);
    const currentlyOnboarding = onboardingPaths.includes(location.pathname);
    if (currentlyOnboarding) {
      setOnboardingCheck({ done: true, redirect: null });
      return;
    }
    client.get('/api/onboarding/status')
      .then(({ data }) => {
        const { consent, persona, condition_selected, first_mood } = data;
        if (!consent)            return setOnboardingCheck({ done: true, redirect: '/onboarding/consent' });
        if (!persona)            return setOnboardingCheck({ done: true, redirect: '/onboarding/persona' });
        if (!condition_selected) return setOnboardingCheck({ done: true, redirect: '/onboarding/condition' });
        if (!first_mood)         return setOnboardingCheck({ done: true, redirect: '/onboarding/first-mood' });
        setOnboardingCheck({ done: true, redirect: null });
      })
      .catch(() => setOnboardingCheck({ done: true, redirect: null }));
  }, [token, location.pathname]);

  if (loading || (token && !onboardingCheck.done)) return <AppSkeleton />;
  if (!token) return <Navigate to="/login" state={{ from: location }} replace />;
  if (onboardingCheck.redirect) return <Navigate to={onboardingCheck.redirect} replace />;

  return children;
}
