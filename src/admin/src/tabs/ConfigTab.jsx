import { useEffect, useState, useCallback } from 'react';

const API = '/api/admin';

function PackagesEditor({ packages, onChange }) {
  const pkgIds = ['standard', 'plus', 'premium'];

  function updatePkg(id, field, raw) {
    const val = field === 'name' ? raw : parseFloat(raw) || 0;
    onChange({ ...packages, [id]: { ...packages[id], [field]: val } });
  }

  return (
    <div className="config-packages">
      {pkgIds.map((id) => {
        const p = packages[id] || {};
        return (
          <div key={id} className="card config-pkg-card">
            <div className="config-pkg-label">{id}</div>
            <div className="form-group">
              <label>Name</label>
              <input value={p.name || ''} onChange={(e) => updatePkg(id, 'name', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Price (KSH)</label>
              <input type="number" min="0" value={p.price_ksh ?? ''} onChange={(e) => updatePkg(id, 'price_ksh', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Credits</label>
              <input type="number" min="1" value={p.credits ?? ''} onChange={(e) => updatePkg(id, 'credits', e.target.value)} />
            </div>
            <div className="form-group">
              <label>AI Conversations</label>
              <input type="number" min="0" value={p.ai_conversations ?? ''} onChange={(e) => updatePkg(id, 'ai_conversations', e.target.value)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ConfigTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [saving, setSaving]   = useState(null);
  const [saved,  setSaved]    = useState(null);

  const [packages,    setPackages]    = useState(null);
  const [creditCosts, setCreditCosts] = useState(null);
  const [aiCost,      setAiCost]      = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/config`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load config');
      const data = await res.json();
      const byKey = Object.fromEntries(data.config.map((r) => [r.key, r.value]));
      setPackages(byKey.packages || null);
      setCreditCosts(byKey.credit_costs || { text: 1, voice: 2, referral: 1 });
      setAiCost(byKey.ai_cost_per_session_ksh ?? 2.60);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save(key, value) {
    setSaving(key);
    setSaved(null);
    try {
      const res = await fetch(`${API}/config/${key}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) throw new Error('Save failed');
      setSaved(key);
      setTimeout(() => setSaved(null), 2000);
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(null);
    }
  }

  if (loading) return <div className="page-header"><p>Loading…</p></div>;
  if (error)   return <div className="page-header"><p style={{ color: 'var(--danger)' }}>{error}</p></div>;

  return (
    <div>
      <div className="page-header">
        <h2>Platform Config</h2>
        <p>Runtime configuration. Changes take effect within 5 minutes (cache TTL).</p>
      </div>

      {/* ── Credit costs ─────────────────────────────── */}
      <section className="config-section">
        <h3>Credit Costs</h3>
        <div className="card">
          {['text', 'voice', 'referral'].map((k) => (
            <div className="form-group form-group--inline" key={k}>
              <label style={{ textTransform: 'capitalize' }}>{k} session</label>
              <input
                type="number" min="1"
                value={creditCosts?.[k] ?? ''}
                onChange={(e) => setCreditCosts((prev) => ({ ...prev, [k]: parseInt(e.target.value) || 1 }))}
              />
            </div>
          ))}
          <button
            className={`btn btn--primary btn--sm${saving === 'credit_costs' ? ' btn--loading' : ''}`}
            disabled={!!saving}
            onClick={() => save('credit_costs', creditCosts)}
          >
            {saved === 'credit_costs' ? 'Saved' : 'Save credit costs'}
          </button>
        </div>
      </section>

      {/* ── AI economics ─────────────────────────────── */}
      <section className="config-section">
        <h3>AI Economics</h3>
        <div className="card">
          <div className="form-group form-group--inline">
            <label>Cost per AI session (KSH)</label>
            <input
              type="number" min="0" step="0.01"
              value={aiCost}
              onChange={(e) => setAiCost(parseFloat(e.target.value) || 0)}
            />
          </div>
          <button
            className={`btn btn--primary btn--sm${saving === 'ai_cost_per_session_ksh' ? ' btn--loading' : ''}`}
            disabled={!!saving}
            onClick={() => save('ai_cost_per_session_ksh', parseFloat(aiCost))}
          >
            {saved === 'ai_cost_per_session_ksh' ? 'Saved' : 'Save AI cost'}
          </button>
        </div>
      </section>

      {/* ── Packages ─────────────────────────────────── */}
      <section className="config-section">
        <h3>Credit Packages</h3>
        {packages ? (
          <>
            <PackagesEditor packages={packages} onChange={setPackages} />
            <button
              className={`btn btn--primary btn--sm${saving === 'packages' ? ' btn--loading' : ''}`}
              disabled={!!saving}
              onClick={() => save('packages', packages)}
              style={{ marginTop: '12px' }}
            >
              {saved === 'packages' ? 'Saved' : 'Save packages'}
            </button>
          </>
        ) : (
          <p style={{ color: 'var(--muted)' }}>No packages found in database. Check migration 073.</p>
        )}
      </section>
    </div>
  );
}
