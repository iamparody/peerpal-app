import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';

const TABS = ['Emergency', 'Escalations', 'Referrals', 'Reports', 'Risk', 'Resources', 'Stats', 'PeerPerms'];

function SectionSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {[1,2,3,4,5].map((i) => (
        <div key={i} className="skeleton" style={{ height: 56, borderRadius: 'var(--radius-md)' }} />
      ))}
    </div>
  );
}

function Section({ title, loading, error, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ marginBottom: 12 }}>{title}</h3>
      {loading ? <SectionSkeleton />
        : error ? <div className="error-msg">{error}</div>
        : children}
    </div>
  );
}

// ── Emergency Queue ───────────────────────────────────────────────────────────
function EmergencyTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const { data } = await client.get('/api/admin/emergency-queue');
      setItems(data.queue ?? data ?? []);
    } catch { setError('Failed to load.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function act(id, action) {
    try {
      await client.patch(`/api/admin/emergency/${id}/${action}`);
      load();
    } catch { setError(`Failed to ${action}.`); }
  }

  return (
    <Section title="Emergency Queue" loading={loading} error={error}>
      {items.length === 0
        ? <p style={{ textAlign: 'center', color: 'var(--color-success)' }}>✅ No active emergencies</p>
        : items.map((e) => (
          <div key={e.id} className="card" style={{ marginBottom: 10, borderLeft: '4px solid var(--color-emergency)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{e.alias}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  {new Date(e.triggered_at).toLocaleString()} · Status: {e.status}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {e.status === 'active' && <button className="btn btn--muted btn--sm" style={{ width: 'auto' }} onClick={() => act(e.id, 'acknowledge')}>Acknowledge</button>}
                {e.status !== 'resolved' && <button className="btn btn--success btn--sm" style={{ width: 'auto' }} onClick={() => act(e.id, 'resolve')}>Resolve</button>}
              </div>
            </div>
          </div>
        ))
      }
    </Section>
  );
}

// ── Escalations ───────────────────────────────────────────────────────────────
function EscalationsTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/api/admin/escalations')
      .then(({ data }) => setItems(data.escalations ?? data ?? []))
      .catch(() => setError('Failed to load.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Section title="Peer Escalations" loading={loading} error={error}>
      {items.length === 0
        ? <p style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No escalations</p>
        : items.map((e) => (
          <div key={e.id} className="card" style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 700 }}>{e.alias}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              {e.channel} · {new Date(e.created_at).toLocaleString()}
            </div>
          </div>
        ))
      }
    </Section>
  );
}

// ── Referrals ─────────────────────────────────────────────────────────────────
function ReferralsTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    client.get('/api/admin/referrals')
      .then(({ data }) => setItems(data.referrals ?? data ?? []))
      .catch(() => setError('Failed to load.'))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      await client.patch(`/api/admin/referrals/${selected.id}`, { status: status || selected.status, admin_notes: notes });
      setSelected(null);
      client.get('/api/admin/referrals').then(({ data }) => setItems(data.referrals ?? data ?? []));
    } catch { setError('Failed to save.'); }
    finally { setSaving(false); }
  }

  return (
    <Section title="Therapist Referrals" loading={loading} error={error}>
      {selected ? (
        <div>
          <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', marginBottom: 12 }}>← Back</button>
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 6 }}><strong>Alias:</strong> {selected.alias}</div>
            <div style={{ marginBottom: 6 }}><strong>Struggles:</strong> {selected.struggles}</div>
            <div style={{ marginBottom: 6 }}><strong>Time:</strong> {selected.preferred_time}</div>
            <div style={{ marginBottom: 6 }}><strong>Contact:</strong> {selected.contact_method}</div>
            {selected.specific_needs && <div><strong>Needs:</strong> {selected.specific_needs}</div>}
          </div>
          <label className="label">Status</label>
          <select className="select" value={status || selected.status} onChange={(e) => setStatus(e.target.value)} style={{ marginBottom: 10 }}>
            {['pending','in_review','arranged','escalated','closed'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <label className="label">Admin notes</label>
          <textarea className="textarea" rows={3} value={notes || selected.admin_notes || ''} onChange={(e) => setNotes(e.target.value)} style={{ marginBottom: 10 }} />
          <button className="btn btn--primary btn--sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      ) : (
        items.length === 0
          ? <p style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No referrals</p>
          : items.map((r) => (
            <div key={r.id} className="card" style={{ marginBottom: 10, cursor: 'pointer' }} onClick={() => { setSelected(r); setNotes(r.admin_notes || ''); setStatus(r.status); }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700 }}>{r.alias}</span>
                <span className="pill" style={{ fontSize: '0.7rem' }}>{r.status}</span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 4 }}>{r.struggles?.slice(0, 60)}…</div>
            </div>
          ))
      )}
    </Section>
  );
}

// ── Group Reports ─────────────────────────────────────────────────────────────
function ReportsTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try { const { data } = await client.get('/api/admin/reports'); setItems(data.reports ?? data ?? []); }
    catch { setError('Failed to load.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function action(id, act) {
    try { await client.patch(`/api/admin/reports/${id}/action`, { action: act }); load(); }
    catch { setError('Action failed.'); }
  }

  return (
    <Section title="Group Reports" loading={loading} error={error}>
      {items.length === 0
        ? <p style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No reports</p>
        : items.map((r) => (
          <div key={r.id} className="card" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontWeight: 600 }}>{r.group_name}</span>
              <span className="pill" style={{ fontSize: '0.7rem' }}>{r.reason}</span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 8 }}>
              Reported: <strong>{r.reported_alias}</strong> · "{r.message_preview?.slice(0, 60)}"
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn--muted btn--sm" style={{ width: 'auto' }} onClick={() => action(r.id, 'dismiss')}>Dismiss</button>
              <button className="btn btn--muted btn--sm" style={{ width: 'auto' }} onClick={() => action(r.id, 'warn')}>Warn</button>
              <button className="btn btn--danger btn--sm" style={{ width: 'auto' }} onClick={() => action(r.id, 'ban')}>Ban</button>
            </div>
          </div>
        ))
      }
    </Section>
  );
}

// ── Risk Flags ────────────────────────────────────────────────────────────────
function RiskTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/api/admin/risk-flags')
      .then(({ data }) => setItems(data.flags ?? data ?? []))
      .catch(() => setError('Failed to load.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Section title="User Risk Flags" loading={loading} error={error}>
      {items.length === 0
        ? <p style={{ textAlign: 'center', color: 'var(--color-success)' }}>✅ No high/critical risk users</p>
        : items.map((u) => (
          <div key={u.alias} className="card" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{u.alias}</div>
                <div style={{ fontSize: '0.8rem', color: u.risk_level === 'critical' ? 'var(--color-emergency)' : 'var(--color-warning)' }}>
                  {u.risk_level?.toUpperCase()} · Score: {u.risk_score}
                </div>
              </div>
              <button
                className="btn btn--primary btn--sm"
                style={{ width: 'auto' }}
                onClick={() => client.post(`/api/admin/users/${u.alias}/message`, { message: 'Hi, we wanted to check in with you. How are you doing?' }).catch(() => {})}
              >
                Send care message
              </button>
            </div>
          </div>
        ))
      }
    </Section>
  );
}

// ── Resources ─────────────────────────────────────────────────────────────────
function ResourcesTab() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', category: 'general_wellness', content: '', estimated_read_minutes: '', tags: '' });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try { const { data } = await client.get('/api/admin/resources'); setArticles(data.articles ?? data ?? []); }
    catch { setError('Failed to load.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function saveArticle() {
    setSaving(true);
    try {
      await client.post('/api/admin/resources', {
        ...form,
        estimated_read_minutes: form.estimated_read_minutes ? parseInt(form.estimated_read_minutes) : undefined,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      });
      setShowForm(false);
      setForm({ title: '', category: 'general_wellness', content: '', estimated_read_minutes: '', tags: '' });
      load();
    } catch { setError('Failed to save article.'); }
    finally { setSaving(false); }
  }

  async function articleAction(id, action) {
    try { await client.patch(`/api/admin/resources/${id}/${action}`); load(); }
    catch { setError('Action failed.'); }
  }

  return (
    <Section title="Resource Library" loading={loading} error={error}>
      <button className="btn btn--primary btn--sm" style={{ marginBottom: 12, width: 'auto' }} onClick={() => setShowForm((v) => !v)}>
        + New Article
      </button>
      {showForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input className="input" placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            <select className="select" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
              {['anxiety','depression','ocd','adhd','grief','loneliness','stress','general_wellness','crisis_support'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input className="input" type="number" placeholder="Read time (mins)" value={form.estimated_read_minutes} onChange={(e) => setForm((f) => ({ ...f, estimated_read_minutes: e.target.value }))} />
            <input className="input" placeholder="Tags (comma separated)" value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} />
            <textarea className="textarea" rows={5} placeholder="Content" value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn--primary btn--sm" onClick={saveArticle} disabled={saving}>{saving ? 'Saving…' : 'Save Draft'}</button>
              <button className="btn btn--muted btn--sm" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {articles.map((a) => (
        <div key={a.id} className="card" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{a.title}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <span className="pill" style={{ fontSize: '0.7rem' }}>{a.category}</span>
                <span className="pill" style={{ fontSize: '0.7rem' }}>{a.status}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              {a.status !== 'published' && <button className="btn btn--success btn--sm" style={{ width: 'auto', padding: '4px 8px' }} onClick={() => articleAction(a.id, 'publish')}>Publish</button>}
              {a.status !== 'archived' && <button className="btn btn--muted btn--sm" style={{ width: 'auto', padding: '4px 8px' }} onClick={() => articleAction(a.id, 'archive')}>Archive</button>}
            </div>
          </div>
        </div>
      ))}
    </Section>
  );
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function StatsTab() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([client.get('/api/admin/stats'), client.get('/api/admin/feedback')])
      .then(([statsRes, fbRes]) => setStats({ ...statsRes.data, feedback: fbRes.data }))
      .catch(() => setError('Failed to load.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Section title="System Stats" loading={loading} error={error}>
      {stats && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            {[
              ['Daily Active Users', stats.dau],
              ["Check-ins Today", stats.checkins_today],
              ["Peer Sessions Today", stats.peer_sessions_today],
              ["AI Sessions Today", stats.ai_sessions_today],
              ["Credits Purchased Today", stats.credits_purchased_today],
            ].map(([label, value]) => (
              <div key={label} className="card" style={{ textAlign: 'center', padding: 12 }}>
                <div style={{ fontWeight: 700, fontSize: '1.5rem' }}>{value ?? '—'}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
          {stats.feedback && (
            <div className="card">
              <h3 style={{ marginBottom: 12 }}>Feedback</h3>
              {stats.feedback.recent?.slice(0, 5).map((f, i) => (
                <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--color-border)', fontSize: '0.85rem' }}>
                  <span style={{ fontWeight: 600 }}>{f.type}</span>
                  {f.rating && <span style={{ marginLeft: 8 }}>{'⭐'.repeat(f.rating)}</span>}
                  {f.comment && <span style={{ color: 'var(--color-text-muted)', display: 'block', marginTop: 2 }}>{f.comment}</span>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Section>
  );
}

// ── Peer Permissions / Supervision Queue ─────────────────────────────────────
const FLAG_ACTIONS = [
  { value: 'no_action',             label: 'No action' },
  { value: 'refresher_recommended', label: 'Refresher recommended' },
  { value: 'refresher_required',    label: 'Refresher required (sets inactive)' },
  { value: 'temporary_suspension',  label: 'Temporary suspension' },
  { value: 'revocation',            label: 'Revocation' },
];

const SIGNAL_LABELS = {
  low_feedback:             'Low feedback ratings',
  moderation_intervention:  'Moderation interventions',
  unprepared_reflections:   'Felt unprepared',
  category_drift:           'Topic category drift',
};

function PeerPermsTab() {
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showResolved, setShowResolved] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [resolving, setResolving] = useState(null); // flag id being resolved
  const [actionChoice, setActionChoice] = useState('no_action');
  const [resolveError, setResolveError] = useState('');

  const load = useCallback(async (p = 1, resolved = false) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await client.get(`/api/admin/permission-flags?page=${p}&resolved=${resolved}`);
      setFlags(data.flags ?? []);
      setPages(data.pages ?? 1);
    } catch { setError('Failed to load flags.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(page, showResolved); }, [page, showResolved, load]);

  async function resolve(flagId) {
    setResolveError('');
    try {
      await client.patch(`/api/admin/permission-flags/${flagId}/resolve`, { action_taken: actionChoice });
      setResolving(null);
      load(page, showResolved);
    } catch (e) {
      setResolveError(e.response?.data?.error || 'Failed to resolve flag.');
    }
  }

  return (
    <Section title="Peer Supervision Queue" loading={loading} error={error}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <label style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => { setShowResolved(e.target.checked); setPage(1); }}
          />
          Show resolved
        </label>
        {pages > 1 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.85rem' }}>
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
              style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', color: 'inherit' }}>‹</button>
            <span>{page} / {pages}</span>
            <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)}
              style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', color: 'inherit' }}>›</button>
          </div>
        )}
      </div>

      {flags.length === 0 && (
        <p style={{ textAlign: 'center', color: 'var(--color-success)' }}>
          {showResolved ? 'No resolved flags.' : '✅ No open supervision flags'}
        </p>
      )}

      {flags.map((f) => (
        <div key={f.id} className="card" style={{ marginBottom: 10, borderLeft: '4px solid #C2A48A' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6 }}>
            <div>
              <div style={{ fontWeight: 700 }}>{f.peer_alias}</div>
              <div style={{ fontSize: '0.78rem', opacity: 0.7 }}>{f.peer_email}</div>
              <div style={{ fontSize: '0.82rem', marginTop: 4 }}>
                <span style={{ fontWeight: 600 }}>{f.permission_name}</span>
                {' — '}
                <span>{SIGNAL_LABELS[f.signal_type] ?? f.signal_type}</span>
              </div>
              {f.signal_data && (
                <div style={{ fontSize: '0.78rem', opacity: 0.75, marginTop: 3 }}>
                  {Object.entries(f.signal_data)
                    .filter(([k]) => k !== 'window_days')
                    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
                    .join(' · ')}
                </div>
              )}
              <div style={{ fontSize: '0.75rem', opacity: 0.55, marginTop: 4 }}>
                Flagged {new Date(f.flagged_at).toLocaleDateString()}
                {f.resolved && f.action_taken && (
                  <> · Resolved: <strong>{f.action_taken.replace(/_/g, ' ')}</strong></>
                )}
              </div>
            </div>

            {!f.resolved && (
              resolving === f.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
                  <select
                    value={actionChoice}
                    onChange={(e) => setActionChoice(e.target.value)}
                    style={{ fontSize: '0.82rem', padding: '4px 6px', borderRadius: 4, border: '1px solid var(--color-border)', background: 'var(--color-surface-card)', color: 'inherit' }}
                  >
                    {FLAG_ACTIONS.map((a) => (
                      <option key={a.value} value={a.value}>{a.label}</option>
                    ))}
                  </select>
                  {resolveError && <div style={{ fontSize: '0.78rem', color: 'var(--color-warning)' }}>{resolveError}</div>}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => resolve(f.id)}
                      style={{ flex: 1, padding: '5px 0', background: '#C2A48A', border: 'none', borderRadius: 6, fontWeight: 700, color: '#1A1A2E', cursor: 'pointer', fontSize: '0.82rem' }}>
                      Confirm
                    </button>
                    <button onClick={() => { setResolving(null); setResolveError(''); }}
                      style={{ flex: 1, padding: '5px 0', background: 'none', border: '1px solid var(--color-border)', borderRadius: 6, cursor: 'pointer', fontSize: '0.82rem', color: 'inherit' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setResolving(f.id); setActionChoice('no_action'); setResolveError(''); }}
                  style={{ padding: '6px 14px', background: 'none', border: '1px solid #C2A48A', borderRadius: 6, color: '#C2A48A', cursor: 'pointer', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                  Resolve
                </button>
              )
            )}
          </div>
        </div>
      ))}
    </Section>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('Emergency');

  return (
    <div className="screen screen--no-nav" style={{ padding: '0 0 16px' }}>
      <div style={{ background: 'var(--color-bg-deep)', padding: '16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => navigate('/dashboard')} style={{ background: 'none', border: 'none', color: '#F5EDE4', fontSize: 20, cursor: 'pointer' }}>‹</button>
        <h2 style={{ color: '#F5EDE4', fontSize: '1rem' }}>Admin Dashboard</h2>
      </div>

      <div style={{ display: 'flex', gap: 0, overflowX: 'auto', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface-card)' }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '10px 12px', border: 'none', background: 'none',
              borderBottom: `2px solid ${tab === t ? '#C2A48A' : 'transparent'}`,
              color: tab === t ? '#C2A48A' : 'rgba(245,237,228,0.55)',
              fontWeight: tab === t ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: '0.85rem',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div style={{ padding: '16px' }}>
        {tab === 'Emergency'   && <EmergencyTab />}
        {tab === 'Escalations' && <EscalationsTab />}
        {tab === 'Referrals'   && <ReferralsTab />}
        {tab === 'Reports'     && <ReportsTab />}
        {tab === 'Risk'        && <RiskTab />}
        {tab === 'Resources'   && <ResourcesTab />}
        {tab === 'Stats'       && <StatsTab />}
        {tab === 'PeerPerms'   && <PeerPermsTab />}
      </div>
    </div>
  );
}
