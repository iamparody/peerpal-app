import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';

const TABS = ['Activity', 'PeerQueue', 'Emergency', 'Escalations', 'Referrals', 'Reports', 'Risk', 'Resources', 'Stats', 'PeerPerms'];

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

// ── Shared time helpers ───────────────────────────────────────────────────────
function ago(ts) {
  if (!ts) return '—';
  const m = Math.floor((Date.now() - new Date(ts)) / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function timeUntil(ts) {
  if (!ts) return '—';
  const ms = new Date(ts) - Date.now();
  if (ms <= 0) return 'overdue';
  const m = Math.floor(ms / 60000);
  if (m < 60) return `in ${m}m`;
  return `in ${Math.floor(m / 60)}h ${m % 60}m`;
}

// ── Activity Feed ─────────────────────────────────────────────────────────────
const EVENT_STYLES = {
  session:          { bg: 'rgba(143,175,154,0.15)', border: 'rgba(143,175,154,0.5)', label: 'Session' },
  emergency:        { bg: 'rgba(220,60,60,0.12)',   border: 'var(--color-danger)',    label: 'Emergency' },
  peer_escalation:  { bg: 'rgba(232,139,63,0.15)',  border: 'var(--color-warning)',   label: 'Escalation' },
  report:           { bg: 'rgba(194,164,138,0.15)', border: '#C2A48A',               label: 'Report' },
};

function ActivityTab() {
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const { data } = await client.get('/api/admin/activity?limit=40');
      setFeed(data.feed ?? []);
    } catch { setError('Failed to load activity feed.'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <Section title="Activity Feed (last 24h)" loading={loading} error={error}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button onClick={load} style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: '0.78rem', color: 'inherit' }}>
          Refresh
        </button>
      </div>
      {feed.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No activity in the last 24 hours</p>
      ) : feed.map((e, i) => {
        const st = EVENT_STYLES[e.event_type] || EVENT_STYLES.report;
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 12px', marginBottom: 6, borderRadius: 'var(--radius-md)',
            background: st.bg, border: `1px solid ${st.border}`,
          }}>
            <span style={{
              fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.06em', whiteSpace: 'nowrap',
              color: st.border === 'var(--color-danger)' ? 'var(--color-danger)' : 'inherit',
            }}>
              {st.label}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{e.alias}</span>
              {e.sub_type && (
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginLeft: 6 }}>
                  {e.sub_type.replace(/_/g, ' ')}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{ago(e.event_at)}</span>
              {e.status && (
                <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', opacity: 0.7 }}>{e.status}</span>
              )}
            </div>
          </div>
        );
      })}
    </Section>
  );
}

// ── Peer Request Queue ────────────────────────────────────────────────────────
const STATUS_COLORS = {
  open:      { bg: 'rgba(232,139,63,0.12)', border: 'var(--color-warning)' },
  locked:    { bg: 'rgba(143,175,154,0.12)', border: 'rgba(143,175,154,0.5)' },
  active:    { bg: 'rgba(143,175,154,0.2)',  border: 'var(--color-calm)' },
  escalated: { bg: 'rgba(220,60,60,0.1)',    border: 'var(--color-danger)' },
  closed:    { bg: 'transparent',             border: 'var(--color-border)' },
};

function RoutingTrail({ audit }) {
  if (!audit || !audit.length) return null;
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
      {audit.map((step, i) => (
        <span key={i} style={{
          fontSize: '0.62rem', padding: '2px 6px', borderRadius: 10,
          background: 'var(--color-surface-secondary)',
          color: 'var(--color-text-muted)',
        }}>
          {step.event === 'tier1_broadcast'  ? `T1 (${step.peer_count ?? 0} peers)` :
           step.event === 'tier2_broadcast'  ? `T2 (${step.peer_count ?? 0} peers)` :
           step.event === 'accepted'         ? '✓ accepted' :
           step.event === 'no_peer_fallback' ? '✗ no peer' :
           step.event}
        </span>
      ))}
    </div>
  );
}

function PeerQueueTab() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  async function load() {
    setLoading(true);
    try {
      const { data } = await client.get('/api/admin/peer-requests');
      setRequests(data.peer_requests ?? []);
    } catch { setError('Failed to load peer requests.'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);
  const counts = requests.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {});

  return (
    <Section title="Peer Request Queue (last 24h)" loading={loading} error={error}>
      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {['all', 'open', 'active', 'escalated', 'closed'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '4px 10px', borderRadius: 10, border: '1px solid var(--color-border)',
            background: filter === f ? '#C2A48A' : 'none',
            color: filter === f ? '#1A1A2E' : 'inherit',
            fontSize: '0.75rem', fontWeight: filter === f ? 700 : 400, cursor: 'pointer',
          }}>
            {f === 'all' ? `All (${requests.length})` : `${f} (${counts[f] ?? 0})`}
          </button>
        ))}
        <button onClick={load} style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--color-border)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: '0.75rem', color: 'inherit' }}>
          Refresh
        </button>
      </div>

      {filtered.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
          No {filter === 'all' ? '' : filter + ' '}requests in the last 24 hours
        </p>
      ) : filtered.map((r) => {
        const sc = STATUS_COLORS[r.status] || STATUS_COLORS.closed;
        const audit = (() => { try { return Array.isArray(r.routing_audit) ? r.routing_audit : JSON.parse(r.routing_audit || '[]'); } catch { return []; } })();
        const isOpen = r.status === 'open';
        return (
          <div key={r.id} style={{
            padding: '10px 12px', marginBottom: 8, borderRadius: 'var(--radius-md)',
            background: sc.bg, border: `1px solid ${sc.border}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{r.requester_alias}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                    {r.channel_preference} {r.topic_slug ? `· ${r.topic_slug.replace(/_/g, ' ')}` : ''}
                  </span>
                  <span style={{
                    fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                    padding: '2px 6px', borderRadius: 8,
                    background: sc.border === 'var(--color-danger)' ? 'rgba(220,60,60,0.2)' : 'rgba(194,164,138,0.2)',
                    color: sc.border === 'var(--color-danger)' ? 'var(--color-danger)' : '#C2A48A',
                  }}>
                    {r.status}
                  </span>
                </div>

                {r.accepted_by_alias && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 3 }}>
                    Accepted by: <strong>{r.accepted_by_alias}</strong>
                  </div>
                )}

                <RoutingTrail audit={audit} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0, fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                <span>{ago(r.created_at)}</span>
                {isOpen && r.escalate_at && (
                  <span style={{ color: new Date(r.escalate_at) < new Date() ? 'var(--color-danger)' : 'var(--color-warning)' }}>
                    escalate {timeUntil(r.escalate_at)}
                  </span>
                )}
                {r.decline_count > 0 && (
                  <span style={{ color: 'var(--color-warning)' }}>{r.decline_count} decline{r.decline_count !== 1 ? 's' : ''}</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </Section>
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
function CompetencyMetric({ label, value, tooltip }) {
  return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <div style={{ fontWeight: 700, fontSize: '1.25rem', marginBottom: 2 }}>{value ?? '—'}</div>
      <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>{label}</div>
      {tooltip && <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', marginTop: 4, opacity: 0.75 }}>{tooltip}</div>}
    </div>
  );
}

function StatsTab() {
  const [stats, setStats] = useState(null);
  const [competency, setCompetency] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      client.get('/api/admin/stats'),
      client.get('/api/admin/feedback'),
      client.get('/api/admin/competency-stats'),
    ])
      .then(([statsRes, fbRes, compRes]) => {
        setStats({ ...statsRes.data, feedback: fbRes.data });
        setCompetency(compRes.data);
      })
      .catch(() => setError('Failed to load.'))
      .finally(() => setLoading(false));
  }, []);

  function fmtMs(ms) {
    if (ms == null) return '—';
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.round(s / 60)}m ${s % 60}s`;
  }
  function fmtPct(val) {
    if (val == null) return '—';
    return `${Math.round(val * 100)}%`;
  }

  return (
    <Section title="System Stats" loading={loading} error={error}>
      {stats && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            {[
              ['Daily Active Users', stats.dau],
              ['Check-ins Today', stats.checkins_today],
              ['Peer Sessions Today', stats.peer_sessions_today],
              ['AI Sessions Today', stats.ai_sessions_today],
              ['Credits Purchased Today', stats.credits_purchased_today],
            ].map(([label, value]) => (
              <div key={label} className="card" style={{ textAlign: 'center', padding: 12 }}>
                <div style={{ fontWeight: 700, fontSize: '1.5rem' }}>{value ?? '—'}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {competency && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ marginBottom: 10, fontSize: '0.95rem' }}>Peer Competency (last 30 days)</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {competency.match_time_by_topic?.length > 0 && (
                  <CompetencyMetric
                    label="Median match time (top topic)"
                    value={fmtMs(competency.match_time_by_topic[0]?.median_match_ms)}
                    tooltip={competency.match_time_by_topic[0]?.topic_slug}
                  />
                )}
                {competency.fallback_rate_by_topic?.length > 0 && (
                  <CompetencyMetric
                    label="Fallback rate (top topic)"
                    value={fmtPct(competency.fallback_rate_by_topic[0]?.fallback_rate)}
                    tooltip={`${competency.fallback_rate_by_topic[0]?.topic_slug} — % routed to general support`}
                  />
                )}
                {competency.abandoned_by_topic?.length > 0 && (
                  <CompetencyMetric
                    label="Abandoned requests (top topic)"
                    value={competency.abandoned_by_topic[0]?.abandoned_count}
                    tooltip={competency.abandoned_by_topic[0]?.topic_slug}
                  />
                )}
                {competency.confidence_decline != null && (
                  <CompetencyMetric
                    label="Confidence overlay declines"
                    value={competency.confidence_decline?.total_declines ?? '—'}
                    tooltip="Peers who declined after seeing the overlay"
                  />
                )}
                {competency.unmet_demand_by_topic?.length > 0 && (
                  <CompetencyMetric
                    label="Unmet demand (top topic)"
                    value={competency.unmet_demand_by_topic[0]?.unmet_count}
                    tooltip={`${competency.unmet_demand_by_topic[0]?.topic_slug} — requests with no peer`}
                  />
                )}
                {competency.skill_completion_rates?.length > 0 && (
                  <CompetencyMetric
                    label="Skill completion (top skill)"
                    value={fmtPct(competency.skill_completion_rates[0]?.completion_rate)}
                    tooltip={competency.skill_completion_rates[0]?.skill_slug}
                  />
                )}
              </div>
              {(competency.match_time_by_topic?.length > 1 || competency.unmet_demand_by_topic?.length > 1) && (
                <details style={{ marginTop: 10 }}>
                  <summary style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', cursor: 'pointer' }}>All topics breakdown</summary>
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {competency.match_time_by_topic?.map(t => (
                      <div key={t.topic_slug} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '4px 0', borderBottom: '1px solid var(--color-border)' }}>
                        <span>{t.topic_slug}</span>
                        <span style={{ color: 'var(--color-text-muted)' }}>match: {fmtMs(t.median_match_ms)} · unmet: {competency.unmet_demand_by_topic?.find(u => u.topic_slug === t.topic_slug)?.unmet_count ?? 0}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

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
  const [tab, setTab] = useState('Activity');

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
        {tab === 'Activity'    && <ActivityTab />}
        {tab === 'PeerQueue'   && <PeerQueueTab />}
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
