import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';

const FORMAT_OPTIONS = ['video', 'voice', 'text'];
const AVAILABILITY_OPTIONS = ['available', 'busy', 'on_leave'];

export default function ProfileTab() {
  const { therapist } = useAuth();
  const [profile, setProfile]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState('');

  // Editable fields
  const [form, setForm] = useState({
    photo_url:              '',
    plain_language_intro:   '',
    approach_plain:         '',
    cultural_competencies:  '',
    languages:              '',
    session_formats:        [],
    rate_per_session_kes:   '',
    availability_status:    'available',
  });

  useEffect(() => {
    const endpoint = therapist?.id
      ? `/api/therapy/therapist/profile`
      : `/api/therapy/therapist/profile`;

    client.get(endpoint)
      .then((res) => {
        const p = res.data?.profile || res.data || {};
        setProfile(p);
        setForm({
          photo_url:             p.photo_url || '',
          plain_language_intro:  p.plain_language_intro || '',
          approach_plain:        p.approach_plain || '',
          cultural_competencies: Array.isArray(p.cultural_competencies)
            ? p.cultural_competencies.join(', ')
            : (p.cultural_competencies || ''),
          languages:             Array.isArray(p.languages)
            ? p.languages.join(', ')
            : (p.languages || ''),
          session_formats:       p.session_formats || [],
          rate_per_session_kes:  p.rate_per_session_kes || '',
          availability_status:   p.availability_status || 'available',
        });
      })
      .catch(() => {
        setProfile(null);
      })
      .finally(() => setLoading(false));
  }, [therapist?.id]);

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  function toggleFormat(fmt) {
    setForm((f) => {
      const has = f.session_formats.includes(fmt);
      return {
        ...f,
        session_formats: has
          ? f.session_formats.filter((x) => x !== fmt)
          : [...f.session_formats, fmt],
      };
    });
    setSaved(false);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const payload = {
        ...form,
        cultural_competencies: form.cultural_competencies
          .split(',').map((s) => s.trim()).filter(Boolean),
        languages: form.languages
          .split(',').map((s) => s.trim()).filter(Boolean),
        rate_per_session_kes: form.rate_per_session_kes
          ? Number(form.rate_per_session_kes)
          : undefined,
      };
      await client.patch('/api/therapy/therapist/profile', payload);
      setSaved(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="loading">Loading profile…</div>;

  // Read-only fields from profile
  const ro = profile || {};

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Profile</h1>
          <p className="page-subtitle">Manage your public therapist profile</p>
        </div>
      </div>

      <div style={{
        background: 'var(--color-warning-bg)',
        border: '1px solid rgba(217,164,65,0.25)',
        borderRadius: 8,
        padding: '10px 16px',
        fontSize: 13,
        color: 'var(--color-status-pending)',
        marginBottom: 20,
      }}>
        Editing credentials triggers re-verification by admin.
      </div>

      <div className="two-col" style={{ gap: 24 }}>
        {/* Editable form */}
        <div className="card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 20, color: 'var(--color-text-primary)' }}>
            Edit Profile
          </h2>
          <form onSubmit={handleSave}>
            <div className="form-group">
              <label className="form-label">Photo URL</label>
              <input
                type="text"
                value={form.photo_url}
                onChange={(e) => setField('photo_url', e.target.value)}
                placeholder="https://…"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Plain Language Introduction</label>
              <textarea
                value={form.plain_language_intro}
                onChange={(e) => setField('plain_language_intro', e.target.value)}
                placeholder="Describe yourself in plain language for members…"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Therapeutic Approach (plain)</label>
              <textarea
                value={form.approach_plain}
                onChange={(e) => setField('approach_plain', e.target.value)}
                placeholder="Describe your approach in plain language…"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Cultural Competencies (comma-separated)</label>
              <input
                type="text"
                value={form.cultural_competencies}
                onChange={(e) => setField('cultural_competencies', e.target.value)}
                placeholder="e.g. Kikuyu, Luo, Coastal communities"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Languages Spoken (comma-separated)</label>
              <input
                type="text"
                value={form.languages}
                onChange={(e) => setField('languages', e.target.value)}
                placeholder="e.g. English, Swahili, Sheng"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Session Formats</label>
              <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                {FORMAT_OPTIONS.map((fmt) => (
                  <label key={fmt} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.session_formats.includes(fmt)}
                      onChange={() => toggleFormat(fmt)}
                      style={{ width: 'auto' }}
                    />
                    <span style={{ textTransform: 'capitalize' }}>{fmt}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Rate per Session (KES)</label>
              <input
                type="number"
                min="0"
                value={form.rate_per_session_kes}
                onChange={(e) => setField('rate_per_session_kes', e.target.value)}
                placeholder="e.g. 2500"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Availability Status</label>
              <select
                value={form.availability_status}
                onChange={(e) => setField('availability_status', e.target.value)}
              >
                {AVAILABILITY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>

            {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}
            {saved && (
              <div style={{ fontSize: 13, color: 'var(--color-success)', marginBottom: 12 }}>
                Profile saved successfully.
              </div>
            )}

            <button
              type="submit"
              className="btn btn--primary"
              disabled={saving}
              style={{ width: '100%', justifyContent: 'center', padding: '11px 14px' }}
            >
              {saving ? 'Saving…' : 'Save Profile'}
            </button>
          </form>
        </div>

        {/* Read-only info */}
        <div>
          {ro.photo_url && (
            <div className="card" style={{ padding: 16, marginBottom: 16, textAlign: 'center' }}>
              <img
                src={ro.photo_url}
                alt="Profile"
                style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--color-card-border)' }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            </div>
          )}

          <div className="card" style={{ padding: '20px 24px' }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: 'var(--color-text-primary)' }}>
              Read-only Info
            </h2>

            {[
              { label: 'Display Name',       value: ro.display_name },
              { label: 'Credentials',        value: ro.credentials },
              { label: 'Registration No.',   value: ro.registration_number },
              { label: 'KCPA Level',         value: ro.kcpa_level },
              { label: 'Total Sessions',     value: ro.total_sessions },
              { label: 'Average Rating',     value: ro.average_rating != null ? Number(ro.average_rating).toFixed(1) : undefined },
            ].map(({ label, value }) => (
              value != null && value !== '' ? (
                <div key={label} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>
                    {value}
                  </div>
                </div>
              ) : null
            ))}

            {!profile && (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                Profile data unavailable — fill in the form on the left to set up your profile.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
