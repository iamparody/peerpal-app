import { useEffect, useState, useCallback } from 'react';
import { Tag } from '@phosphor-icons/react';
import client from '../api/client';

function CreateForm({ onCreated }) {
  const [code,      setCode]      = useState('');
  const [credits,   setCredits]   = useState('');
  const [maxUses,   setMaxUses]   = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [saving,    setSaving]    = useState(false);
  const [codeError, setCodeError] = useState('');

  async function checkCode(value) {
    if (!value) { setCodeError(''); return; }
    try {
      const { data } = await client.get('/api/admin/promo-codes/check', { params: { code: value } });
      setCodeError(data.exists ? 'Code already exists' : '');
    } catch {
      setCodeError('');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (codeError) return;
    setSaving(true);
    try {
      const body = { code, credits_awarded: parseInt(credits), max_uses: maxUses ? parseInt(maxUses) : null };
      if (expiresAt) body.expires_at = new Date(expiresAt).toISOString();
      const { data } = await client.post('/api/admin/promo-codes', body);
      setCode(''); setCredits(''); setMaxUses(''); setExpiresAt('');
      onCreated(data);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create code');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: 14, fontWeight: 600 }}>Create promo code</h3>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '200px 90px 110px 1fr auto', gap: 12, alignItems: 'end' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Code</label>
          <input
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setCodeError(''); }}
            onBlur={(e) => checkCode(e.target.value.toUpperCase())}
            placeholder="e.g. LAUNCH20"
            pattern="[A-Z0-9]+"
            title="Uppercase letters and numbers only"
            required
          />
          {codeError && <span className="error-text" style={{ fontSize: 11 }}>{codeError}</span>}
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Credits</label>
          <input type="number" min="1" value={credits} onChange={(e) => setCredits(e.target.value)} required />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Max uses</label>
          <input type="number" min="1" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="Unlimited" />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Expires (optional)</label>
          <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </div>
        <button
          className={`btn btn--primary btn--sm${saving ? ' btn--loading' : ''}`}
          type="submit"
          disabled={saving || !!codeError}
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
    client.get(`/api/admin/promo-codes/${codeId}/redemptions`)
      .then(({ data }) => { setRows(data.redemptions || []); setLoading(false); })
      .catch(() => { setRows([]); setLoading(false); });
  }, [codeId]);

  return (
    <>
      <div className="panel-overlay" onClick={onClose} />
      <div className="slide-panel">
        <div className="slide-panel__header">
          <h2 className="slide-panel__title">Redemptions — {code}</h2>
          <button className="slide-panel__close" onClick={onClose}>✕</button>
        </div>
        <div className="slide-panel__body">
          {loading && <div className="loading">Loading…</div>}
          {!loading && rows.length === 0 && (
            <div className="empty-state">
              <Tag size={32} className="empty-state__icon" />
              <p className="empty-state__title">No redemptions yet</p>
              <p className="empty-state__sub">Nobody has used this code.</p>
            </div>
          )}
          {!loading && rows.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Alias</th>
                  <th>Redeemed</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id}>
                    <td><span className="elapsed">{i + 1}</span></td>
                    <td><span className="alias">{r.alias || '—'}</span></td>
                    <td>
                      <span className="elapsed">
                        {new Date(r.redeemed_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

export default function PromoCodesTab() {
  const [codes,    setCodes]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [panel,    setPanel]    = useState(null);
  const [toggling, setToggling] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await client.get('/api/admin/promo-codes');
      setCodes(data.codes || []);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load promo codes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleActive(id, currentlyActive) {
    setToggling(id);
    try {
      await client.patch(`/api/admin/promo-codes/${id}`, { is_active: !currentlyActive });
      setCodes((prev) => prev.map((c) => c.id === id ? { ...c, is_active: !currentlyActive } : c));
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to update code');
    } finally {
      setToggling(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Promo Codes</h1>
          <p className="page-subtitle">Create and manage promotional credit codes. Codes are single-use per user.</p>
        </div>
        <button className="refresh-btn" onClick={load} title="Refresh">↻</button>
      </div>

      <CreateForm onCreated={(newCode) => setCodes((prev) => [newCode, ...prev])} />

      {error && <p className="error-text">{error}</p>}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          {loading ? (
            <div className="loading">Loading…</div>
          ) : codes.length === 0 ? (
            <div className="empty-state">
              <Tag size={40} className="empty-state__icon" />
              <p className="empty-state__title">No promo codes yet</p>
              <p className="empty-state__sub">Create one using the form above.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Credits</th>
                  <th>Uses</th>
                  <th>Max</th>
                  <th>Expires</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => {
                  const expired = c.expires_at && new Date(c.expires_at) < new Date();
                  const full    = c.max_uses !== null && c.uses_count >= c.max_uses;
                  return (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600, letterSpacing: 1 }}>{c.code}</td>
                      <td>{c.credits_awarded}</td>
                      <td>{c.uses_count}</td>
                      <td><span className="elapsed">{c.max_uses ?? '—'}</span></td>
                      <td>
                        <span className={expired ? 'badge badge--high' : 'elapsed'}>
                          {c.expires_at
                            ? new Date(c.expires_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
                            : '—'}
                        </span>
                      </td>
                      <td>
                        {expired ? (
                          <span className="badge badge--high">Expired</span>
                        ) : full ? (
                          <span className="badge badge--archived">Full</span>
                        ) : c.is_active ? (
                          <span className="badge badge--published">Active</span>
                        ) : (
                          <span className="badge badge--archived">Inactive</span>
                        )}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div className="btn-group" style={{ flexWrap: 'nowrap' }}>
                          <button
                            className="btn btn--ghost btn--sm"
                            onClick={() => setPanel({ id: c.id, code: c.code })}
                          >
                            Redemptions
                          </button>
                          <button
                            className={`btn btn--ghost btn--sm${toggling === c.id ? ' btn--loading' : ''}`}
                            disabled={toggling === c.id}
                            onClick={() => toggleActive(c.id, c.is_active)}
                          >
                            {c.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

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
