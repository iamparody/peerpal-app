import { useState } from 'react';
import client from '../api/client';

export default function MembersTab() {
  const [query,   setQuery]   = useState('');
  const [field,   setField]   = useState('email');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function handleSearch(e) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError('');
    setResults(null);
    try {
      const { data } = await client.get('/api/admin/members', { params: { [field]: q } });
      setResults(data.members);
    } catch (err) {
      setError(err.response?.data?.error || 'Search failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeactivate(member) {
    if (!window.confirm(
      `Deactivate account "${member.alias}" (${member.email})?\n\nThe account will be blocked from signing in. All data is preserved. This action can be reversed by re-enabling the account directly in Supabase.`
    )) return;
    try {
      await client.delete(`/api/admin/members/${member.id}`);
      setResults((prev) => prev.map((m) => m.id === member.id ? { ...m, is_active: false } : m));
    } catch (err) {
      alert(err.response?.data?.error || 'Deactivate failed.');
    }
  }

  return (
    <div className="tab-content">
      <div className="tab-header">
        <div>
          <h2 className="tab-title">Members</h2>
          <p className="tab-subtitle">Find any user account by email or alias</p>
        </div>
      </div>

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <select
          value={field}
          onChange={(e) => setField(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-card-bg)', color: 'var(--color-text-primary)', fontSize: 13 }}
        >
          <option value="email">Email</option>
          <option value="alias">Alias</option>
        </select>
        <input
          type={field === 'email' ? 'email' : 'text'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={field === 'email' ? 'user@example.com' : 'SolarPanda53'}
          style={{ flex: 1, minWidth: 200, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-card-bg)', color: 'var(--color-text-primary)', fontSize: 13 }}
        />
        <button type="submit" className="btn btn--primary btn--sm" disabled={loading || !query.trim()}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error && <div className="error-msg" style={{ marginBottom: 16 }}>{error}</div>}

      {results !== null && results.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>No accounts found.</p>
      )}

      {results && results.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Alias</th>
                <th>Email</th>
                <th>Role</th>
                <th>Verified</th>
                <th>Active</th>
                <th>Credits</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {results.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 600 }}>{m.alias}</td>
                  <td style={{ fontSize: 13 }}>{m.email}</td>
                  <td>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                      background: m.role === 'admin' ? 'rgba(99,102,241,0.1)' : m.role === 'therapist' ? 'rgba(16,185,129,0.1)' : 'rgba(107,114,128,0.1)',
                      color: m.role === 'admin' ? '#6366f1' : m.role === 'therapist' ? '#10b981' : 'var(--color-text-muted)',
                    }}>
                      {m.role}
                    </span>
                  </td>
                  <td>{m.email_verified ? '✓' : <span style={{ color: 'var(--color-warning, #f59e0b)' }}>Pending</span>}</td>
                  <td>{m.is_active ? 'Yes' : <span style={{ color: 'var(--color-status-open)' }}>No</span>}</td>
                  <td>{m.credit_balance ?? '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{new Date(m.created_at).toLocaleDateString()}</td>
                  <td>
                    {m.role === 'member' ? (
                      <button
                        className="btn btn--danger btn--sm"
                        onClick={() => handleDeactivate(m)}
                        disabled={!m.is_active}
                        style={{ fontSize: 12 }}
                        title={m.is_active ? 'Deactivate this account' : 'Already inactive'}
                      >
                        {m.is_active ? 'Deactivate' : 'Inactive'}
                      </button>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Use {m.role === 'therapist' ? 'Therapists' : 'N/A'} tab</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
