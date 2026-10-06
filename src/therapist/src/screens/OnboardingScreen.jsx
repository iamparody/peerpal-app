import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';

const MOBILE_STYLES = `
  .ob-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
  .ob-stepbar { display: flex; gap: 0; }
  .ob-stepbar__label { font-size: 11px; }
  .ob-filerow { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: nowrap; }
  .ob-filerow__left { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; }
  @media (max-width: 480px) {
    .ob-grid { grid-template-columns: 1fr; }
    .ob-stepbar__label { display: none; }
    .ob-filerow { gap: 8px; }
  }
`;

const FORMAT_OPTIONS = ['video', 'voice', 'text'];

const DOC_TYPES = [
  { key: 'photo',         label: 'Profile Photo',           accept: 'image/jpeg,image/png,image/webp', required: true,  hint: 'JPG, PNG or WebP · max 10 MB' },
  { key: 'kcpa_cert',     label: 'KCPA Certificate',         accept: 'application/pdf,image/jpeg,image/png', required: true,  hint: 'PDF or image · max 10 MB' },
  { key: 'academic_cert', label: 'Academic Certificate',     accept: 'application/pdf,image/jpeg,image/png', required: true,  hint: 'PDF or image · max 10 MB' },
  { key: 'agreement',     label: 'Signed Practice Agreement',accept: 'application/pdf',                    required: true,  hint: 'PDF · max 10 MB' },
  { key: 'indemnity',     label: 'Professional Indemnity',   accept: 'application/pdf,image/jpeg,image/png', required: false, hint: 'PDF or image · optional' },
  { key: 'good_conduct',  label: 'Good Conduct Certificate', accept: 'application/pdf,image/jpeg,image/png', required: false, hint: 'PDF or image · optional' },
];

// ── Step pill indicator ────────────────────────────────────────────────────
function StepBar({ current }) {
  const steps = ['Professional Details', 'Bio & Approach', 'Documents'];
  return (
    <div className="ob-stepbar" style={{ marginBottom: 32 }}>
      {steps.map((label, i) => {
        const n      = i + 1;
        const active = current === n;
        const done   = current > n;
        return (
          <div key={n} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: 6 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700,
                background: done ? 'var(--color-accent)' : active ? 'var(--color-text-primary)' : 'transparent',
                color: done || active ? '#fff' : 'var(--color-text-muted)',
                border: done || active ? 'none' : '2px solid var(--color-card-border)',
                transition: 'background 0.2s', flexShrink: 0,
              }}>
                {done ? '✓' : n}
              </div>
              <span className="ob-stepbar__label" style={{
                fontWeight: active ? 600 : 400,
                color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                textAlign: 'center', lineHeight: 1.3, letterSpacing: '0.01em',
              }}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{
                height: 2, flex: '0 0 16px',
                background: done ? 'var(--color-accent)' : 'var(--color-card-border)',
                marginBottom: 22, transition: 'background 0.2s',
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Format toggle pill ────────────────────────────────────────────────────
function FormatPill({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '7px 18px', borderRadius: 20, fontSize: 13, fontWeight: 500,
        cursor: 'pointer', fontFamily: 'inherit',
        background: active ? 'var(--color-text-primary)' : 'transparent',
        color: active ? '#fff' : 'var(--color-text-muted)',
        border: `1.5px solid ${active ? 'var(--color-text-primary)' : 'var(--color-card-border)'}`,
        transition: 'background 0.12s, color 0.12s, border-color 0.12s',
      }}
    >
      {label}
    </button>
  );
}

// ── File upload row ───────────────────────────────────────────────────────
function FileRow({ doc, entry, onChange }) {
  const ref = useRef();
  const hasFile = !!entry?.file;
  const uploading = entry?.status === 'uploading';
  const done      = entry?.status === 'done';

  return (
    <div className="ob-filerow" style={{
      padding: '12px 14px',
      background: done
        ? 'rgba(143,175,154,0.08)'
        : hasFile
          ? 'rgba(194,164,138,0.06)'
          : 'var(--color-main-bg)',
      border: `1px solid ${done ? 'rgba(143,175,154,0.3)' : hasFile ? 'var(--color-accent)' : 'var(--color-card-border)'}`,
      borderRadius: 8,
      marginBottom: 10,
      gap: 12,
      transition: 'background 0.15s, border-color 0.15s',
    }}>
      {/* Left: status icon + label */}
      <div className="ob-filerow__left">
        <div style={{
          width: 34, height: 34, borderRadius: 8, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
          background: done
            ? 'rgba(143,175,154,0.15)'
            : hasFile
              ? 'rgba(194,164,138,0.15)'
              : 'rgba(47,38,34,0.05)',
        }}>
          {done ? '✓' : uploading ? '⋯' : hasFile ? '📎' : '📄'}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', display: 'flex', gap: 6, alignItems: 'center' }}>
            {doc.label}
            {doc.required && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-status-open)', letterSpacing: '0.05em' }}>REQ</span>}
            {!doc.required && <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>optional</span>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 1 }}>
            {done
              ? <span style={{ color: 'var(--color-status-resolved, #8FAF9A)' }}>Uploaded</span>
              : uploading
                ? 'Uploading…'
                : hasFile
                  ? entry.file.name
                  : doc.hint}
          </div>
        </div>
      </div>

      {/* Right: action button */}
      <input ref={ref} type="file" accept={doc.accept} style={{ display: 'none' }} onChange={(e) => onChange(e.target.files[0] || null)} />
      {!done && (
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => ref.current?.click()}
          disabled={uploading}
          style={{ flexShrink: 0 }}
        >
          {hasFile ? 'Change' : 'Select'}
        </button>
      )}
    </div>
  );
}

// ── Error bar ─────────────────────────────────────────────────────────────
function ErrorBar({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      background: 'var(--color-danger-bg)',
      border: '1px solid rgba(179,92,92,0.2)',
      borderRadius: 8, padding: '10px 14px',
      fontSize: 13, color: 'var(--color-status-open)',
      marginBottom: 16,
    }}>
      {msg}
    </div>
  );
}

// ── Two-column grid shorthand ─────────────────────────────────────────────
function Grid2({ children }) {
  return (
    <div className="ob-grid">{children}</div>
  );
}

// ── Form field wrapper ────────────────────────────────────────────────────
function Field({ label, required, children }) {
  return (
    <div className="form-group">
      <label className="form-label">
        {label}{required && <span style={{ color: 'var(--color-status-open)', marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Main screen
// ══════════════════════════════════════════════════════════════════════════
export default function OnboardingScreen() {
  const { refreshProfile, logout } = useAuth();
  const [step, setStep]            = useState(1);
  const [error, setError]          = useState('');

  // Step 1 state
  const [s1, setS1] = useState({
    display_name: '', years_experience: '', credentials: '',
    registration_number: '', kcpa_level: '', gender: '', age: '',
    location: '', languages: '', session_formats: [], rate_per_session_kes: '',
  });

  // Step 2 state
  const [s2, setS2] = useState({ plain_language_intro: '', approach_plain: '', cultural_competencies: '' });

  // Step 3 state
  const [uploads, setUploads] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);

  // Pre-populate from existing admin-entered data on mount
  useEffect(() => {
    client.get('/api/therapy/therapist/profile')
      .then((r) => {
        const p = r.data.profile || {};
        setS1((prev) => ({
          ...prev,
          display_name:        p.display_name        || prev.display_name,
          years_experience:    p.years_experience     != null ? String(p.years_experience) : prev.years_experience,
          credentials:         p.credentials         || prev.credentials,
          registration_number: p.registration_number || prev.registration_number,
          kcpa_level:          p.kcpa_level           || prev.kcpa_level,
          gender:              p.gender               || prev.gender,
          age:                 p.age != null           ? String(p.age) : prev.age,
          location:            p.location             || prev.location,
          languages:           Array.isArray(p.languages) ? p.languages.join(', ') : (p.languages || prev.languages),
          session_formats:     p.session_formats?.length ? p.session_formats : prev.session_formats,
          rate_per_session_kes: p.rate_per_session_kes != null ? String(p.rate_per_session_kes) : prev.rate_per_session_kes,
        }));
        setS2((prev) => ({
          ...prev,
          plain_language_intro:  p.plain_language_intro  || prev.plain_language_intro,
          approach_plain:        p.approach_plain        || prev.approach_plain,
          cultural_competencies: Array.isArray(p.cultural_competencies)
            ? p.cultural_competencies.join(', ')
            : (p.cultural_competencies || prev.cultural_competencies),
        }));
      })
      .catch(() => {})
      .finally(() => setProfileLoading(false));
  }, []);

  function set1(k, v) { setS1((p) => ({ ...p, [k]: v })); setError(''); }
  function set2(k, v) { setS2((p) => ({ ...p, [k]: v })); setError(''); }

  function toggleFormat(fmt) {
    setS1((p) => ({
      ...p,
      session_formats: p.session_formats.includes(fmt)
        ? p.session_formats.filter((x) => x !== fmt)
        : [...p.session_formats, fmt],
    }));
    setError('');
  }

  function setFile(docType, file) {
    setUploads((u) => ({ ...u, [docType]: { file, status: 'pending', error: null } }));
    setError('');
  }

  function validateStep1() {
    if (!s1.display_name.trim())    return 'Display name is required.';
    if (!s1.credentials.trim())     return 'Credentials are required.';
    if (!s1.languages.trim())       return 'Languages are required.';
    if (s1.session_formats.length === 0) return 'Select at least one session format.';
    if (!s1.years_experience)       return 'Years of experience is required.';
    return null;
  }

  function validateStep2() {
    if (!s2.plain_language_intro.trim()) return 'A short bio is required.';
    return null;
  }

  function validateStep3() {
    for (const d of DOC_TYPES.filter((x) => x.required)) {
      if (!uploads[d.key]?.file) return `${d.label} is required.`;
    }
    return null;
  }

  async function handleSubmit() {
    const err = validateStep3();
    if (err) { setError(err); return; }
    setSubmitting(true);
    setError('');
    try {
      // Step 1: save profile fields
      await client.patch('/api/therapy/therapist/profile', {
        display_name:          s1.display_name,
        credentials:           s1.credentials,
        registration_number:   s1.registration_number || undefined,
        kcpa_level:            s1.kcpa_level || undefined,
        gender:                s1.gender || undefined,
        age:                   s1.age ? parseInt(s1.age) : undefined,
        location:              s1.location || undefined,
        years_experience:      s1.years_experience ? parseInt(s1.years_experience) : undefined,
        languages:             s1.languages.split(',').map((l) => l.trim()).filter(Boolean),
        session_formats:       s1.session_formats,
        rate_per_session_kes:  s1.rate_per_session_kes ? parseInt(s1.rate_per_session_kes) : undefined,
        plain_language_intro:  s2.plain_language_intro,
        approach_plain:        s2.approach_plain || undefined,
        cultural_competencies: s2.cultural_competencies.split(',').map((c) => c.trim()).filter(Boolean),
      });

      // Step 2: upload documents
      for (const [docType, entry] of Object.entries(uploads)) {
        if (!entry?.file) continue;
        setUploads((u) => ({ ...u, [docType]: { ...u[docType], status: 'uploading' } }));
        try {
          const fd = new FormData();
          fd.append('file', entry.file);
          fd.append('document_type', docType);
          await client.post('/api/therapy/therapist/documents/upload', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          setUploads((u) => ({ ...u, [docType]: { ...u[docType], status: 'done' } }));
        } catch (uploadErr) {
          const msg = uploadErr?.response?.data?.error || uploadErr.message;
          throw new Error(`Document upload failed (${docType}): ${msg}`);
        }
      }

      // Step 3: mark onboarding complete
      await client.patch('/api/therapy/therapist/onboarding/complete');
      refreshProfile();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Submission failed — please try again.');
      setSubmitting(false);
    }
  }

  if (profileLoading) return (
    <div style={{
      minHeight: '100vh', background: 'var(--color-sidebar-bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--color-sidebar-muted)', fontSize: 14,
    }}>
      Loading…
    </div>
  );

  // Shared card wrapper
  const card = (
    <div style={{
      background: 'var(--color-card-bg)',
      borderRadius: 16,
      boxShadow: 'var(--shadow-modal)',
      padding: 'clamp(20px, 5vw, 36px) clamp(16px, 6vw, 40px)',
      width: '100%',
      maxWidth: 580,
    }}>
      <StepBar current={step} />

      {step === 1 && (
        <Step1
          s={s1} set={set1} toggleFormat={toggleFormat}
          error={error}
          onNext={() => { const e = validateStep1(); if (e) { setError(e); return; } setError(''); setStep(2); }}
        />
      )}
      {step === 2 && (
        <Step2
          s={s2} set={set2}
          error={error}
          onBack={() => { setError(''); setStep(1); }}
          onNext={() => { const e = validateStep2(); if (e) { setError(e); return; } setError(''); setStep(3); }}
        />
      )}
      {step === 3 && (
        <Step3
          uploads={uploads} setFile={setFile}
          error={error} submitting={submitting}
          onBack={() => { setError(''); setStep(2); }}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--color-sidebar-bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: 'clamp(24px, 5vw, 48px) 16px 80px',
    }}>
      <style>{MOBILE_STYLES}</style>
      {/* Brand header */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12, margin: '0 auto 12px',
          background: 'var(--color-sidebar-accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
        }}>
          🩺
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-sidebar-text)', letterSpacing: '-0.3px' }}>
          PeerPal Therapist Portal
        </div>
        <div style={{ fontSize: 14, color: 'var(--color-sidebar-muted)', marginTop: 4 }}>
          Complete your profile to activate your account
        </div>
      </div>

      {card}

      <button
        onClick={logout}
        style={{
          marginTop: 20, background: 'none', border: 'none',
          color: 'var(--color-sidebar-muted)', fontSize: 13, cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Sign out
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Step 1 — Professional Details
// ══════════════════════════════════════════════════════════════════════════
function Step1({ s, set, toggleFormat, error, onNext }) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onNext(); }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 4 }}>
          Professional Details
        </h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          This information is reviewed by our team and shown to clients on your profile.
        </p>
      </div>

      <Field label="Display Name" required>
        <input type="text" value={s.display_name} onChange={(e) => set('display_name', e.target.value)} placeholder="e.g. Dr. Jane Mwangi" required />
      </Field>

      <Grid2>
        <Field label="Credentials" required>
          <input type="text" value={s.credentials} onChange={(e) => set('credentials', e.target.value)} placeholder="e.g. MSc Clinical Psychology" required />
        </Field>
        <Field label="Years of Experience" required>
          <input type="number" min="0" max="60" value={s.years_experience} onChange={(e) => set('years_experience', e.target.value)} placeholder="e.g. 5" required />
        </Field>
        <Field label="KCPA Level">
          <input type="text" value={s.kcpa_level} onChange={(e) => set('kcpa_level', e.target.value)} placeholder="e.g. Associate, Fellow" />
        </Field>
        <Field label="Registration No.">
          <input type="text" value={s.registration_number} onChange={(e) => set('registration_number', e.target.value)} placeholder="e.g. KCP/2019/001" />
        </Field>
        <Field label="Gender">
          <select value={s.gender} onChange={(e) => set('gender', e.target.value)}>
            <option value="">Select…</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="non_binary">Non-binary</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </Field>
        <Field label="Age">
          <input type="number" min="22" max="80" value={s.age} onChange={(e) => set('age', e.target.value)} placeholder="e.g. 34" />
        </Field>
      </Grid2>

      <Field label="Location">
        <input type="text" value={s.location} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Nairobi, Kenya" />
      </Field>

      <Field label="Languages (comma-separated)" required>
        <input type="text" value={s.languages} onChange={(e) => set('languages', e.target.value)} placeholder="e.g. English, Swahili" required />
      </Field>

      <Field label="Rate per Session (KES)">
        <input type="number" min="0" value={s.rate_per_session_kes} onChange={(e) => set('rate_per_session_kes', e.target.value)} placeholder="e.g. 2500" />
      </Field>

      <div className="form-group">
        <label className="form-label">Session Formats <span style={{ color: 'var(--color-status-open)' }}>*</span></label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {FORMAT_OPTIONS.map((fmt) => (
            <FormatPill key={fmt} label={fmt} active={s.session_formats.includes(fmt)} onClick={() => toggleFormat(fmt)} />
          ))}
        </div>
      </div>

      <ErrorBar msg={error} />

      <button type="submit" className="btn btn--primary" style={{ width: '100%', justifyContent: 'center', padding: '11px 0', fontSize: 14, marginTop: 4 }}>
        Continue →
      </button>
    </form>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Step 2 — Bio & Approach
// ══════════════════════════════════════════════════════════════════════════
function Step2({ s, set, error, onBack, onNext }) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onNext(); }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 4 }}>
          Bio &amp; Approach
        </h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          Write in plain language — clients read this when choosing a therapist.
        </p>
      </div>

      <Field label="Short Bio" required>
        <textarea
          value={s.plain_language_intro}
          onChange={(e) => set('plain_language_intro', e.target.value)}
          placeholder="A warm, accessible description of who you are and what you offer…"
          style={{ minHeight: 110 }}
          required
        />
      </Field>

      <Field label="Therapeutic Approach">
        <textarea
          value={s.approach_plain}
          onChange={(e) => set('approach_plain', e.target.value)}
          placeholder="e.g. I work primarily with CBT and person-centred approaches, with a trauma-informed lens…"
          style={{ minHeight: 90 }}
        />
      </Field>

      <Field label="Cultural Competencies (comma-separated)">
        <input
          type="text"
          value={s.cultural_competencies}
          onChange={(e) => set('cultural_competencies', e.target.value)}
          placeholder="e.g. LGBTQ+ affirming, Grief, Diaspora issues, Religious sensitivity"
        />
      </Field>

      <ErrorBar msg={error} />

      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button type="button" className="btn btn--ghost" onClick={onBack} style={{ flex: 1, justifyContent: 'center', padding: '11px 0' }}>
          ← Back
        </button>
        <button type="submit" className="btn btn--primary" style={{ flex: 2, justifyContent: 'center', padding: '11px 0' }}>
          Continue →
        </button>
      </div>
    </form>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Step 3 — Documents
// ══════════════════════════════════════════════════════════════════════════
function Step3({ uploads, setFile, error, submitting, onBack, onSubmit }) {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 4 }}>
          Documents
        </h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          Files are stored privately — no public URLs are generated at any point. Only admin staff can access them for verification.
        </p>
      </div>

      <div style={{ marginBottom: 8 }}>
        {DOC_TYPES.map((doc) => (
          <FileRow key={doc.key} doc={doc} entry={uploads[doc.key]} onChange={(file) => setFile(doc.key, file)} />
        ))}
      </div>

      {/* Privacy note */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px',
        background: 'rgba(194,164,138,0.08)', borderRadius: 8, marginBottom: 20,
        border: '1px solid var(--color-card-border)',
      }}>
        <span style={{ fontSize: 15, lineHeight: 1, marginTop: 1 }}>🔒</span>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          Documents are encrypted in storage and accessible only to verified PeerPal admins for the purpose of credential verification.
        </span>
      </div>

      <ErrorBar msg={error} />

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onBack}
          disabled={submitting}
          style={{ flex: 1, justifyContent: 'center', padding: '11px 0' }}
        >
          ← Back
        </button>
        <button
          type="button"
          className="btn btn--accent"
          onClick={onSubmit}
          disabled={submitting}
          style={{ flex: 2, justifyContent: 'center', padding: '11px 0', fontSize: 14 }}
        >
          {submitting ? 'Submitting…' : 'Submit for Verification'}
        </button>
      </div>
    </div>
  );
}

