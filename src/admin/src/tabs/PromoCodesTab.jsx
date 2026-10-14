import { useEffect, useState, useCallback } from 'react';

const API = '/api/admin';

function CreateForm({ onCreated }) {
  const [code,       setCode]       = useState('');
  const [credits,    setCredits]    = useState('');
  const [maxUses,    setMaxUses]    = useState('');
  const [expiresAt,  setExpiresAt]  = useState('');
  const [saving,     setSaving]     = useState(false);
  const [codeError,  setCodeError]  = useState('');

  async function checkCode(value) {
    if (!value) { setCodeError(''); return; }
    const res = await fetch(`${API}/promo-codes/check?code=${encodeURIComponent(value)}`, { credentials: 'include' });
    const data = await res.json();
    setCodeError(data.exists ? 'Code already exists' : '');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (codeError) return;
    setSaving(true);
    try {
      const body = { code, credits_awarded: parseInt(credits), max_uses: maxUses ? parseInt(maxUses) : null };
      if (expiresAt) body.expires_at = new Date(expiresAt).toISOString();
      const res = await fetch(`${API}/promo-codes`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create code');
      setCode(''); setCredits(''); setMaxUses(''); setExpiresAt('');
      onCreated(data);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: 14, fontWeight: 600 }}>Create promo code</h3>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <div className="form-group" style={{ flex: '1 1 140px', margin: 0 }}>
          <label>Code</label>
          <input
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setCodeError(''); }}
            onBlur={(e) => checkCode(e.target.value.toUpperCase())}
            placeholder="e.g. LAUNCH20"
            pattern="[A-Z0-9]+"
            title="Uppercase letters and numbers only"
            required
          />
          {codeError && <span style={{ color: 'var(--danger)', fontSize: 11 }}>{codeError}</span>}
        </div>
        <div className="form-group" style={{ flex: '0 0 90px', margin: 0 }}>
          <label>Credits</label>
          <input type="number" min="1" value={credits} onChange={(e) => setCredits(e.target.value)} required />
        </div>
        <div className="form-group" style={{ flex: '0 0 100px', margin: 0 }}>
          <label>Max uses</label>
          <input type="number" min="1" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="Unlimited" />
        </div>
        <div className="form-group" style={{ flex: '1 1 160px', margin: 0 }}>
          <label>Expires</label>
          <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </div>
        <button
          className={`btn btn--primary btn--sm${saving ? ' btn--loading' : ''}`}
          type="submit"
          disabled={saving || !!codeError}
          style={{ flex: '0 0 auto', height: 36 }}
        >
          {saving ? 'Creating…' : 'Create'}
        </button>
      </form>
    </div>
  );
}

function RedemptionsPanel({ codeId, code, onClose }) {
  const [rows,    setRows]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/promo-codes/${codeId}/redemptions`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { setRows(d.redemptions || []); setLoading(false); })
      .catch(() => { setRows([]); setLoading(false); });
  }, [codeId]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--color-card-bg)', borderRadius: 10, padding: 24, width: 480, maxWidth: '90vw',
        maxHeight: '80vh', overflow: 'auto',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>Redemptions — {code}</h3>
          <button className="btn btn--sm" onClick={onClose}>Close</button>
        </div>
        {loading && <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Loading…</p>}
        {!loading && rows.length === 0 && <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No redemptions yet.</p>}
        {!loading && rows.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-card-border)' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600 }}>#</th>
                <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600 }}>Alias</th>
                <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600 }}>Redeemed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--color-card-border)' }}>
                  <td style={{ padding: '6px 8px', color: 'var(--color-text-muted)' }}>{i + 1}</td>
                  <td style={{ padding: '6px 8px' }}>{r.alias || '—'}</td>
                  <td style={{ padding: '6px 8px', color: 'var(--color-text-muted)' }}>
                    {new Date(r.redeemed_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function PromoCodesTab() {
  const [codes,   setCodes]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [panel,   setPanel]   = useState(null); // { id, code }
  const [toggling, setToggling] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/promo-codes`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load promo codes');
      const data = await res.json();
      setCodes(data.codes || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleCreated(newCode) {
    setCodes((prev) => [newCode, ...prev]);
  }

  async function toggleActive(id, currentlyActive) {
    setToggling(id);
    try {
      const res = await fetch(`${API}/promo-codes/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentlyActive }),
      });
      if (!res.ok) throw new Error('Failed to update code');
      setCodes((prev) => prev.map((c) => c.id === id ? { ...c, is_active: !currentlyActive } : c));
    } catch (e) {
      alert(e.message);
    } finally {
      setToggling(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Promo Codes</h2>
        <p>Create and manage promotional credit codes. Codes are single-use per user.</p>
      </div>

      <CreateForm onCreated={handleCreated} />

      {loading && <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Loading…</p>}
      {error   && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}

      {!loading && !error && codes.length === 0 && (
        <div className="card" style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
          No promo codes yet. Create one above.
        </div>
      )}

      {!loading && codes.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-card-border)', background: 'var(--color-table-head, var(--color-bg-deep))' }}>
                {['Code', 'Credits', 'Uses', 'Max', 'Expires', 'Status', ''].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, fontSize: 12, color: 'var(--color-text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => {
                const expired = c.expires_at && new Date(c.expires_at) < new Date();
                const full    = c.max_uses !== null && c.uses_count >= c.max_uses;
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--color-card-border)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, letterSpacing: 1 }}>{c.code}</td>
                    <td style={{ padding: '10px 14px' }}>{c.credits_awarded}</td>
                    <td style={{ padding: '10px 14px' }}>{c.uses_count}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--color-text-muted)' }}>{c.max_uses ?? '—'}</td>
                    <td style={{ padding: '10px 14px', color: expired ? 'var(--danger)' : 'var(--color-text-muted)' }}>
                      {c.expires_at
                        ? new Date(c.expires_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {expired ? (
                        <span style={{ color: 'var(--danger)', fontSize: 11, fontWeight: 600 }}>Expired</span>
                      ) : full ? (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>Full</span>
                      ) : c.is_active ? (
                        <span style={{ color: 'var(--success, #4caf50)', fontSize: 11, fontWeight: 600 }}>Active</span>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>Inactive</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <button
                        className="btn btn--sm"
                        style={{ marginRight: 6 }}
                        onClick={() => setPanel({ id: c.id, code: c.code })}
                      >
                        Redemptions
                      </button>
                      <button
                        className={`btn btn--sm${toggling === c.id ? ' btn--loading' : ''}`}
                        disabled={toggling === c.id}
                        onClick={() => toggleActive(c.id, c.is_active)}
                      >
                        {c.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {panel && (
        <RedemptionsPanel
          codeId={panel.id}
          code={panel.code}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  );
}
