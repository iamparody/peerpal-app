import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Coin, SignOut } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import client from '../api/client';

const PACKAGES = [
  { id: 'starter',  label: 'Starter',  price: 50,  credits: 3 },
  { id: 'standard', label: 'Standard', price: 100, credits: 7 },
  { id: 'plus',     label: 'Plus',     price: 200, credits: 15 },
  { id: 'support',  label: 'Support',  price: 500, credits: 40 },
];

function ProfileSkeleton() {
  return (
    <div style={{ padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="skeleton" style={{ width: '100%', height: 80, borderRadius: 'var(--radius-lg)' }} />
      ))}
    </div>
  );
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [notifPrefs, setNotifPrefs] = useState(null);
  const [error, setError] = useState('');
  const [purchasing, setPurchasing] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackType, setFeedbackType] = useState('general');
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => client.get('/api/profile').then(r => r.data),
  });
  const { data: balanceData } = useQuery({
    queryKey: ['credits', 'balance'],
    queryFn: () => client.get('/api/credits/balance').then(r => r.data),
  });
  const { data: txData } = useQuery({
    queryKey: ['credits', 'transactions'],
    queryFn: () => client.get('/api/credits/transactions').then(r => r.data),
  });
  const { data: notifsData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => client.get('/api/notifications').then(r => r.data),
  });

  useEffect(() => {
    if (profile && notifPrefs === null) {
      setNotifPrefs({
        peer_broadcast:   profile.notif_peer_broadcast ?? true,
        checkin_reminder: profile.notif_checkin_reminder ?? true,
        group_messages:   profile.notif_group_messages ?? true,
        credit_low:       profile.notif_credit_low ?? true,
      });
    }
  }, [profile, notifPrefs]);

  async function handlePurchase(pkg) {
    setPurchasing(pkg.id);
    try {
      const { data } = await client.post('/api/credits/purchase', { package: pkg.id });
      if (data.payment_url) window.location.href = data.payment_url;
    } catch (err) {
      setError(err.response?.data?.error || 'Your payment didn\'t go through. Please try a different method.');
    } finally {
      setPurchasing(null);
    }
  }

  async function updateNotifPref(key, value) {
    setNotifPrefs((p) => ({ ...p, [key]: value }));
    try {
      await client.patch('/api/notifications/preferences', { [key]: value });
    } catch {
      setNotifPrefs((p) => ({ ...p, [key]: !value }));
    }
  }

  async function handleDeleteData() {
    setDeleting(true);
    try {
      await client.post('/api/profile/delete-data');
      logout();
      navigate('/login', { replace: true });
    } catch {
      setError('Something went wrong on our end. We\'re on it.');
    } finally {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  }

  async function handleClearJournal() {
    if (!window.confirm('Delete all journal entries permanently? This cannot be undone.')) return;
    try {
      await client.delete('/api/journals');
      qc.invalidateQueries({ queryKey: ['journals'] });
    } catch {
      setError('Something went wrong. Please try again.');
    }
  }

  async function handleFeedbackSubmit() {
    setSendingFeedback(true);
    try {
      await client.post('/api/feedback', { type: feedbackType, rating: feedbackRating || undefined, comment: feedbackComment.trim() || undefined });
      setFeedbackSent(true);
      setTimeout(() => { setFeedbackOpen(false); setFeedbackSent(false); setFeedbackRating(0); setFeedbackComment(''); }, 2000);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSendingFeedback(false);
    }
  }

  async function handleLogout() {
    try { await client.post('/api/auth/logout'); } catch { /* best-effort */ }
    logout();
    navigate('/login', { replace: true });
  }

  const loading = isLoading;
  const balance = balanceData?.balance ?? null;
  const transactions = txData?.transactions ?? (Array.isArray(txData) ? txData : []);
  const notifications = notifsData?.notifications ?? (Array.isArray(notifsData) ? notifsData : []);

  if (loading) {
    return (
      <div className="screen">
        <div className="page-header">
          <h2 className="page-header__title">Profile</h2>
        </div>
        <ProfileSkeleton />
      </div>
    );
  }

  const balanceLow = balance !== null && balance <= 2;
  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="screen">
      <div className="page-header">
        <h2 className="page-header__title">Profile</h2>
        {unreadCount > 0 && (
          <span style={{ marginLeft: 'auto', background: 'var(--color-danger)', color: 'var(--color-text-primary)', borderRadius: 'var(--radius-pill)', padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>
            {unreadCount} new
          </span>
        )}
      </div>

      <div style={{ padding: '0 var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
        {error && <div className="error-msg">{error}</div>}

        {/* Identity */}
        <div className="card">
          <h3 style={{ marginBottom: 'var(--space-md)' }}>My Account</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Alias</span>
              <span style={{ fontWeight: 600, color: 'var(--color-accent)', fontSize: 16 }}>{user?.alias || profile?.alias}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Email</span>
              <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{profile?.email || '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Streak</span>
              <span style={{ fontWeight: 600, color: 'var(--color-warning)' }}>{profile?.streak_count ?? 0} 🔥</span>
            </div>
          </div>
        </div>

        {/* AI Companion */}
        {profile?.persona && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
              <h3>My AI Companion</h3>
              <button
                onClick={() => navigate('/persona/edit')}
                style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-pill)', padding: '4px 14px', fontSize: 12, color: 'var(--color-text-secondary)', cursor: 'pointer' }}
              >
                Edit
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Name</span>
                <span style={{ fontWeight: 600, fontFamily: 'var(--font-editorial)', color: 'var(--color-accent)' }}>{profile.persona.persona_name}</span>
              </div>
              {[
                { label: 'Tone',      value: profile.persona.tone },
                { label: 'Style',     value: profile.persona.response_style },
                { label: 'Formality', value: profile.persona.formality },
                { label: 'Language',  value: profile.persona.language || 'english' },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{label}</span>
                  <span style={{ fontSize: 13, color: 'var(--color-text-primary)', textTransform: 'capitalize' }}>{value}</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, marginTop: 'var(--space-sm)', color: 'var(--color-text-muted)' }}>Name is permanent. Tone, style, formality, and language can be updated anytime.</p>
          </div>
        )}

        {/* Credits */}
        <div className="card">
          <h3 style={{ marginBottom: 'var(--space-md)' }}>Credits</h3>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-lg)' }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 4 }}>Balance</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <Coin size={24} weight="duotone" color={balanceLow ? 'var(--color-danger)' : 'var(--color-accent)'} aria-hidden="true" />
                <span style={{ fontSize: 32, fontWeight: 600, color: balanceLow ? 'var(--color-danger)' : 'var(--color-text-primary)' }}>{balance ?? '—'}</span>
              </div>
              {balanceLow && <div style={{ fontSize: 12, color: 'var(--color-danger)', marginTop: 4 }}>You need more credits for this. Top up to continue.</div>}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
            {PACKAGES.map((pkg) => (
              <button
                key={pkg.id}
                onClick={() => handlePurchase(pkg)}
                disabled={!!purchasing}
                style={{
                  padding: '10px 8px',
                  borderRadius: 'var(--radius-md)',
                  border: `1.5px solid ${purchasing === pkg.id ? 'var(--color-border-focus)' : 'var(--color-border)'}`,
                  background: 'var(--color-surface-card)',
                  cursor: 'pointer',
                  textAlign: 'center',
                  opacity: purchasing && purchasing !== pkg.id ? 0.5 : 1,
                  transition: 'opacity var(--duration-fast)',
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--color-accent)', fontSize: 15 }}>{pkg.credits} cr</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>KSh {pkg.price}</div>
                {purchasing === pkg.id && <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Loading…</div>}
              </button>
            ))}
          </div>
          {transactions.slice(0, 5).map((tx) => (
            <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--color-divider)' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>{new Date(tx.created_at).toLocaleDateString()}</span>
              <span style={{ textTransform: 'capitalize', color: 'var(--color-text-muted)' }}>{tx.type}</span>
              <span style={{ fontWeight: 600, color: tx.type === 'debit' ? 'var(--color-danger)' : 'var(--color-calm)' }}>
                {tx.type === 'debit' ? '-' : '+'}{tx.amount} cr
              </span>
            </div>
          ))}
        </div>

        {/* Privacy & Data */}
        <div className="card">
          <h3 style={{ marginBottom: 'var(--space-md)' }}>Privacy & Data</h3>
          {profile?.consent_version && (
            <p style={{ fontSize: 13, marginBottom: 'var(--space-md)', color: 'var(--color-text-muted)' }}>
              Consent v{profile.consent_version} accepted {profile.consented_at ? new Date(profile.consented_at).toLocaleDateString() : ''}
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            <button className="btn btn--muted btn--sm" onClick={handleClearJournal}>Clear My Journal</button>
            {deleteConfirm ? (
              <div>
                <p style={{ fontSize: 13, marginBottom: 'var(--space-sm)', color: 'var(--color-danger)' }}>
                  This will delete all your data within 24 hours. Are you sure?
                </p>
                <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                  <button className="btn btn--danger btn--sm" onClick={handleDeleteData} disabled={deleting} style={{ flex: 1, animation: 'none' }}>
                    {deleting ? 'Deleting…' : 'Yes, delete everything'}
                  </button>
                  <button className="btn btn--muted btn--sm" onClick={() => setDeleteConfirm(false)} style={{ flex: 1 }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button className="btn btn--danger btn--sm" onClick={() => setDeleteConfirm(true)} style={{ animation: 'none' }}>Delete My Data</button>
            )}
          </div>
        </div>

        {/* Notifications */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
            <h3>Notifications</h3>
            <button
              onClick={() => navigate('/notifications')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--color-calm)', fontWeight: 600, padding: '4px 0' }}
            >
              {unreadCount > 0 ? `View (${unreadCount > 9 ? '9+' : unreadCount} unread)` : 'View all'}
            </button>
          </div>
          {[
            { key: 'peer_broadcast',   label: 'Peer request broadcasts' },
            { key: 'checkin_reminder', label: 'Daily check-in reminder' },
            { key: 'group_messages',   label: 'Group messages' },
            { key: 'credit_low',       label: 'Low balance alerts' },
          ].map(({ key, label }) => (
            <label key={key} className="toggle-row" style={{ cursor: 'pointer' }}>
              <span className="toggle-label">{label}</span>
              <input
                type="checkbox"
                checked={(notifPrefs ?? {})[key] ?? true}
                onChange={(e) => updateNotifPref(key, e.target.checked)}
                style={{ width: 20, height: 20, accentColor: 'var(--color-accent)', cursor: 'pointer' }}
              />
            </label>
          ))}
        </div>

        {/* Safety Plan */}
        <button className="btn btn--ghost" onClick={() => navigate('/safety-plan')}>My Safety Plan</button>

        {/* Feedback */}
        <div className="card">
          <h3 style={{ marginBottom: 'var(--space-md)' }}>App Feedback</h3>
          {feedbackOpen ? (
            feedbackSent ? (
              <p style={{ textAlign: 'center', color: 'var(--color-calm)' }}>Thank you for your feedback!</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                <select className="select" value={feedbackType} onChange={(e) => setFeedbackType(e.target.value)}>
                  <option value="general">General</option>
                  <option value="peer_session">Peer Session</option>
                  <option value="ai_chat">AI Chat</option>
                  <option value="bug">Bug Report</option>
                </select>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[1,2,3,4,5].map((s) => (
                    <button key={s} type="button" onClick={() => setFeedbackRating(s)} style={{ fontSize: 24, background: 'none', border: 'none', cursor: 'pointer', opacity: s <= feedbackRating ? 1 : 0.3, minWidth: 44, minHeight: 44 }} aria-label={`Rate ${s}`}>⭐</button>
                  ))}
                </div>
                <textarea className="textarea" rows={3} maxLength={300} value={feedbackComment} onChange={(e) => setFeedbackComment(e.target.value)} placeholder="Optional comment…" />
                <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                  <button className="btn btn--primary btn--sm" onClick={handleFeedbackSubmit} disabled={sendingFeedback} style={{ flex: 1 }}>
                    {sendingFeedback ? 'Sending…' : 'Send'}
                  </button>
                  <button className="btn btn--muted btn--sm" onClick={() => setFeedbackOpen(false)} style={{ flex: 1 }}>Cancel</button>
                </div>
              </div>
            )
          ) : (
            <button className="btn btn--ghost btn--sm" style={{ width: 'auto' }} onClick={() => setFeedbackOpen(true)}>Send Feedback</button>
          )}
        </div>

        <button
          className="btn btn--muted"
          onClick={handleLogout}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--color-danger)' }}
        >
          <SignOut size={20} weight="duotone" aria-hidden="true" />
          Log Out
        </button>

        {/* Legal footer */}
        <div style={{ textAlign: 'center', paddingTop: 'var(--space-sm)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
            <Link to="/privacy-policy" style={{ fontSize: 12, color: 'var(--color-text-muted)', textDecoration: 'none' }}>Privacy Policy</Link>
            <Link to="/terms-of-service" style={{ fontSize: 12, color: 'var(--color-text-muted)', textDecoration: 'none' }}>Terms of Service</Link>
            <Link to="/data-compliance" style={{ fontSize: 12, color: 'var(--color-text-muted)', textDecoration: 'none' }}>Data Compliance</Link>
          </div>
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            © 2025 MindBridge. All rights reserved.
          </p>
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            MindBridge is not a medical service.
          </p>
        </div>
      </div>
    </div>
  );
}
