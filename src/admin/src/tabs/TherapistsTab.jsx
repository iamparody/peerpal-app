import { useEffect, useState, useCallback } from 'react';
import client from '../api/client';

const SPECIALIZATIONS = [
  'anxiety','depression','ocd','adhd','grief','trauma',
  'relationships','loneliness','stress','general_support',
];
const SESSION_FORMATS  = ['in_app_chat','voice_call','in_person'];
const AVAILABILITY_OPT = ['available','limited','unavailable'];

export default function TherapistsTab() {
  const [therapists, setTherapists] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [panel,      setPanel]      = useState(null); // null | { therapist? }

  const load = useCallback(async () => {
    try {
      const { data } = await client.get('/api/admin/therapists');
      setTherapists(data.therapists ?? []);
    } catch { setError('Failed to load therapists.'); }
    finally   { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAvailability(id, status) {
    try {
      await client.patch(`/api/admin/therapists/${id}/availability`, { availability_status: status });
      load();
    } catch (err) { setError(err.response?.data?.error || 'Failed to update availability.'); }
  }

  async function handleToggleActive(id, current) {
    try {
      await client.patch(`/api/admin/therapists/${id}`, { is_active: !current });
      load();
    } catch (err) { setError(err.response?.data?.error || 'Failed to update.'); }
  }

  const AVAIL_BADGE = {
    available:   { bg: 'var(--color-calm-bg)',    text: 'var(--color-calm)',    label: 'Available' },
    limited:     { bg: 'var(--color-warning-bg)', text: 'var(--color-warning)', label: 'Limited' },
    unavailable: { bg: 'var(--color-danger-bg)',  text: 'var(--color-danger)',  label: 'Unavailable' },
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Therapist Profiles</h1>
          <p className="page-subtitle">Manage verified partner therapists</p>
        </div>
        <div className="filter-row">
          <button className="btn btn--primary btn--sm" onClick={() => setPanel({ isNew: true })}>
            + Add Therapist
          </button>
          <button className="refresh-btn" onClick={load} title="Refresh">↻</button>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card">
        <div className="table-wrap">
          {loading ? (
            <div className="loading">Loading…</div>
          ) : therapists.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">🩺</div>
              <p className="empty-text">No therapists added yet</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Therapist</th>
                  <th>Specializations</th>
                  <th>Languages</th>
                  <th>Formats</th>
                  <th>Availability</th>
                  <th>Active</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {therapists.map((t) => {
                  const av = AVAIL_BADGE[t.availability_status] || AVAIL_BADGE.unavailable;
                  return (
                    <tr key={t.id} style={{ opacity: t.is_active ? 1 : 0.5 }}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {t.photo_url ? (
                            <img src={t.photo_url} alt={t.display_name}
                              style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                          ) : (
                            <div style={{
                              width: 36, height: 36, borderRadius: '50%',
                              background: 'var(--color-surface-secondary)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)',
                              flexShrink: 0,
                            }}>
                              {t.display_name.charAt(0)}
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight: 500, color: 'var(--color-text-primary)', fontSize: 14 }}>
                              {t.display_name}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                              {t.credentials}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {(t.specializations || []).slice(0, 3).map((sp) => (
                            <span key={sp} className="badge badge--review" style={{ fontSize: 10 }}>
                              {sp.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        {(t.languages || []).join(', ') || '—'}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        {(t.session_formats || []).map((f) => f.replace(/_/g, ' ')).join(', ') || '—'}
                      </td>
                      <td>
                        <select
                          style={{ fontSize: 12, padding: '3px 6px', borderRadius: 6,
                            background: av.bg, color: av.text, border: 'none', cursor: 'pointer' }}
                          value={t.availability_status}
                          onChange={(e) => handleAvailability(t.id, e.target.value)}
                        >
                          {AVAILABILITY_OPT.map((a) => (
                            <option key={a} value={a}>{AVAIL_BADGE[a].label}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button
                          className={`btn btn--sm ${t.is_active ? 'btn--success' : 'btn--ghost'}`}
                          onClick={() => handleToggleActive(t.id, t.is_active)}
                          style={{ fontSize: 11, padding: '0 8px', height: 28 }}
                        >
                          {t.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td>
                        <button className="btn btn--ghost btn--sm" onClick={() => setPanel({ therapist: t })}>
                          Edit
                        </button>
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
        <TherapistPanel
          therapist={panel.therapist ?? null}
          onClose={() => setPanel(null)}
          onSaved={() => { setPanel(null); load(); }}
        />
      )}
    </div>
  );
}

function TherapistPanel({ therapist, onClose, onSaved }) {
  const isNew = !therapist;

  const [email,           setEmail]           = useState('');
  const [displayName,     setDisplayName]     = useState(therapist?.display_name ?? '');
  const [fullName,        setFullName]        = useState(therapist?.full_name ?? '');
  const [credentials,     setCredentials]     = useState(therapist?.credentials ?? '');
  const [yearsExp,        setYearsExp]        = useState(therapist?.years_experience ?? 0);
  const [specializations, setSpecializations] = useState(therapist?.specializations ?? []);
  const [languages,       setLanguages]       = useState((therapist?.languages ?? []).join(', '));
  const [sessionFormats,  setSessionFormats]  = useState(therapist?.session_formats ?? []);
  const [location,        setLocation]        = useState(therapist?.location ?? '');
  const [statement,       setStatement]       = useState(therapist?.statement ?? '');
  const [plainIntro,      setPlainIntro]      = useState(therapist?.plain_language_intro ?? '');
  const [culturalComps,   setCulturalComps]   = useState((therapist?.cultural_competencies ?? []).join(', '));
  const [approachPlain,   setApproachPlain]   = useState(therapist?.approach_plain ?? '');
  const [photoUrl,        setPhotoUrl]        = useState(therapist?.photo_url ?? '');
  const [availability,    setAvailability]    = useState(therapist?.availability_status ?? 'available');
  const [saving,          setSaving]          = useState(false);
  const [error,           setError]           = useState('');
  const [dirty,           setDirty]           = useState(false);

  function markDirty(setter) {
    return (val) => { setter(val); setDirty(true); };
  }

  function handleClose() {
    if (dirty && !window.confirm('You have unsaved changes. Leave without saving?')) return;
    onClose();
  }

  function toggleSpec(sp) {
    setSpecializations((prev) =>
      prev.includes(sp) ? prev.filter((x) => x !== sp) : [...prev, sp]
    );
  }
  function toggleFormat(f) {
    setSessionFormats((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]
    );
  }

  async function handleSave() {
    if (!displayName.trim() || !credentials.trim()) {
      setError('Display name and credentials are required.');
      return;
    }
    if (isNew && (!email.trim() || !fullName.trim())) {
      setError('Email and full name are required for new therapists.');
      return;
    }
    setSaving(true);
    setError('');
    const body = {
      display_name:          displayName.trim(),
      full_name:             fullName.trim(),
      credentials:           credentials.trim(),
      years_experience:      parseInt(yearsExp) || 0,
      specializations,
      languages:             languages.trim() ? languages.split(',').map((l) => l.trim()).filter(Boolean) : [],
      session_formats:       sessionFormats,
      location:              location.trim() || null,
      statement:             statement.trim() || null,
      plain_language_intro:  plainIntro.trim() || null,
      cultural_competencies: culturalComps.trim() ? culturalComps.split(',').map((c) => c.trim()).filter(Boolean) : [],
      approach_plain:        approachPlain.trim() || null,
      photo_url:             photoUrl.trim() || null,
      availability_status:   availability,
    };
    try {
      if (isNew) {
        await client.post('/api/admin/therapists', { ...body, email: email.trim() });
      } else {
        await client.patch(`/api/admin/therapists/${therapist.id}`, body);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="panel-overlay" onClick={handleClose} />
      <div className="slide-panel">
        <div className="slide-panel__header">
          <span className="slide-panel__title">{isNew ? 'Add Therapist' : 'Edit Therapist'}</span>
          <button className="btn btn--ghost btn--sm" onClick={handleClose}>✕</button>
        </div>

        <div className="slide-panel__body">
          {isNew && (
            <>
              <div className="form-group">
                <label className="form-label">Email address</label>
                <input type="email" value={email} onChange={(e) => markDirty(setEmail)(e.target.value)} placeholder="therapist@example.com" />
              </div>
              <div className="form-group">
                <label className="form-label">Full legal name</label>
                <input type="text" value={fullName} onChange={(e) => markDirty(setFullName)(e.target.value)} placeholder="Dr. Amina Hassan" />
              </div>
              <div style={{ background: 'var(--color-surface-secondary)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 4 }}>
                ✉️ An invite email will be sent to this address with a link to set their password. The link expires in 72 hours.
              </div>
            </>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Display name</label>
              <input type="text" value={displayName} onChange={(e) => markDirty(setDisplayName)(e.target.value)} placeholder="Dr. Amina K." />
            </div>
            <div className="form-group">
              <label className="form-label">Years experience</label>
              <input type="number" value={yearsExp} onChange={(e) => markDirty(setYearsExp)(e.target.value)} min={0} max={40} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Credentials</label>
            <input type="text" value={credentials} onChange={(e) => markDirty(setCredentials)(e.target.value)} placeholder="MA Clinical Psychology, KPS" />
          </div>

          <div className="form-group">
            <label className="form-label">Photo URL (optional)</label>
            <input type="url" value={photoUrl} onChange={(e) => markDirty(setPhotoUrl)(e.target.value)} placeholder="https://..." />
          </div>

          <div className="form-group">
            <label className="form-label">Availability</label>
            <select value={availability} onChange={(e) => markDirty(setAvailability)(e.target.value)}>
              {AVAILABILITY_OPT.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {/* Specializations */}
          <div className="form-group">
            <label className="form-label">Specializations</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {SPECIALIZATIONS.map((sp) => (
                <button
                  key={sp}
                  type="button"
                  onClick={() => { toggleSpec(sp); setDirty(true); }}
                  className={`btn btn--sm ${specializations.includes(sp) ? 'btn--primary' : 'btn--ghost'}`}
                  style={{ height: 30, fontSize: 11 }}
                >
                  {sp.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Session formats */}
          <div className="form-group">
            <label className="form-label">Session formats</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {SESSION_FORMATS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => { toggleFormat(f); setDirty(true); }}
                  className={`btn btn--sm ${sessionFormats.includes(f) ? 'btn--primary' : 'btn--ghost'}`}
                  style={{ height: 30, fontSize: 11 }}
                >
                  {f.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Languages (comma-separated)</label>
            <input type="text" value={languages} onChange={(e) => markDirty(setLanguages)(e.target.value)} placeholder="English, Swahili, Kikuyu" />
          </div>

          <div className="form-group">
            <label className="form-label">Location (optional, for in-person)</label>
            <input type="text" value={location} onChange={(e) => markDirty(setLocation)(e.target.value)} placeholder="Westlands, Nairobi" />
          </div>

          {/* Human-facing content */}
          <div className="form-group">
            <label className="form-label">In their own words <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(first person — shown to members)</span></label>
            <textarea value={plainIntro} onChange={(e) => markDirty(setPlainIntro)(e.target.value)} rows={4}
              placeholder="Hi, I'm Amina. I work with people who feel stuck — whether that's anxiety, grief, or just knowing something needs to change…" />
          </div>

          <div className="form-group">
            <label className="form-label">Their approach <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(plain language, shown to members)</span></label>
            <textarea value={approachPlain} onChange={(e) => markDirty(setApproachPlain)(e.target.value)} rows={3}
              placeholder="I help you understand the patterns driving your feelings. We work at your pace — no pressure to arrive at answers before you're ready." />
          </div>

          <div className="form-group">
            <label className="form-label">Cultural competencies (comma-separated)</label>
            <input type="text" value={culturalComps} onChange={(e) => markDirty(setCulturalComps)(e.target.value)}
              placeholder="Kenyan family systems, Faith-integrated, LGBTQ+ affirming, Trauma-informed" />
          </div>

          <div className="form-group">
            <label className="form-label">Professional statement <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(optional, internal)</span></label>
            <textarea value={statement} onChange={(e) => markDirty(setStatement)(e.target.value)} rows={2}
              placeholder="Professional bio or notes (not shown to members)" />
          </div>

          {error && <p className="error-text">{error}</p>}
        </div>

        <div className="slide-panel__footer">
          <button className="btn btn--ghost" onClick={handleClose}>Cancel</button>
          <button className="btn btn--primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : isNew ? 'Add Therapist' : 'Save Changes'}
          </button>
        </div>
      </div>
    </>
  );
}
