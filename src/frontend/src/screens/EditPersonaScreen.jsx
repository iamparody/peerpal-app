import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import client from '../api/client';

const TONES = [
  { value: 'warm',         label: 'Warm',         desc: 'Compassionate and nurturing' },
  { value: 'motivational', label: 'Motivational',  desc: 'Energetic and encouraging' },
  { value: 'clinical',     label: 'Clinical',      desc: 'Structured and objective' },
  { value: 'casual',       label: 'Casual',        desc: 'Relaxed and conversational' },
];

const STYLES = [
  { value: 'brief',     label: 'Brief',     desc: 'Short, focused replies' },
  { value: 'elaborate', label: 'Elaborate', desc: 'Detailed, thorough responses' },
];

const FORMALITIES = [
  { value: 'formal',   label: 'Formal' },
  { value: 'neutral',  label: 'Neutral' },
  { value: 'informal', label: 'Informal' },
];

const LANGUAGES = [
  { value: 'english', label: 'English',        desc: 'Standard English responses' },
  { value: 'swahili', label: 'Swahili',         desc: 'Responses in Kiswahili' },
  { value: 'sheng',   label: 'Sheng',           desc: 'Nairobi street mix — casual & authentic' },
];

export default function EditPersonaScreen() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => client.get('/api/profile').then(r => r.data),
  });

  const [personaNameInput, setPersonaNameInput] = useState('');
  const [tone,      setTone]      = useState('warm');
  const [style,     setStyle]     = useState('brief');
  const [formality, setFormality] = useState('neutral');
  const [usesAlias, setUsesAlias] = useState(true);
  const [language,  setLanguage]  = useState('english');
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const [saved,     setSaved]     = useState(false);
  const [seeded,    setSeeded]    = useState(false);

  useEffect(() => {
    if (profile?.persona && !seeded) {
      setPersonaNameInput(profile.persona.persona_name || '');
      setTone(profile.persona.tone || 'warm');
      setStyle(profile.persona.response_style || 'brief');
      setFormality(profile.persona.formality || 'neutral');
      setUsesAlias(profile.persona.uses_alias ?? true);
      setLanguage(profile.persona.language || 'english');
      setSeeded(true);
    }
  }, [profile, seeded]);

  async function handleSave() {
    if (!personaNameInput.trim()) {
      setError('Companion name cannot be empty.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await client.patch('/api/ai/persona', {
        persona_name: personaNameInput.trim(),
        tone,
        response_style: style,
        formality,
        uses_alias: usesAlias,
        language,
      });
      qc.invalidateQueries({ queryKey: ['profile'] });
      setSaved(true);
      setTimeout(() => navigate('/profile'), 1200);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="screen screen--no-nav" style={{ padding: 'var(--space-xl) var(--space-lg)' }}>
        {[1, 2, 3].map(i => (
          <div key={i} className="skeleton" style={{ height: 80, borderRadius: 'var(--radius-lg)', marginBottom: 16 }} />
        ))}
      </div>
    );
  }

  const personaName = profile?.persona?.persona_name || 'Your companion';

  if (saved) {
    return (
      <div className="screen screen--no-nav" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
        <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-calm)' }}>Saved</p>
        <p style={{ fontSize: 14, color: 'var(--color-text-muted)', marginTop: 8 }}>{personaNameInput || personaName} has been updated.</p>
      </div>
    );
  }

  return (
    <div className="screen screen--no-nav" style={{ padding: 'var(--space-xl) var(--space-lg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 'var(--space-lg)' }}>
        <button
          style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--color-text-secondary)', padding: '4px 0' }}
          onClick={() => navigate('/profile')}
          aria-label="Back"
        >←</button>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text-primary)' }}>Edit Companion</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>Update your companion's name and preferences</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>

        {/* Companion name */}
        <div>
          <label className="label">Companion name</label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              className="input"
              value={personaNameInput}
              onChange={(e) => setPersonaNameInput(e.target.value.slice(0, 20))}
              placeholder="e.g. Sage, Luna, Kai"
              maxLength={20}
              style={{ paddingRight: 48 }}
            />
            <span style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              fontSize: 11, color: 'var(--color-text-muted)', pointerEvents: 'none',
            }}>
              {personaNameInput.length}/20
            </span>
          </div>
        </div>

        {/* Tone */}
        <div>
          <label className="label">Tone</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)' }}>
            {TONES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTone(t.value)}
                style={{
                  padding: 'var(--space-md)',
                  borderRadius: 'var(--radius-md)',
                  border: `2px solid ${tone === t.value ? 'var(--color-border-focus)' : 'var(--color-border)'}`,
                  background: tone === t.value ? 'rgba(194,164,138,0.15)' : 'rgba(194,164,138,0.06)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'border-color var(--duration-fast), background var(--duration-fast)',
                  minHeight: 'var(--touch-target-min)',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)' }}>{t.label}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>{t.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Response style */}
        <div>
          <label className="label">Response style</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)' }}>
            {STYLES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setStyle(s.value)}
                style={{
                  padding: 'var(--space-md)',
                  borderRadius: 'var(--radius-md)',
                  border: `2px solid ${style === s.value ? 'var(--color-border-focus)' : 'var(--color-border)'}`,
                  background: style === s.value ? 'rgba(194,164,138,0.15)' : 'rgba(194,164,138,0.06)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'border-color var(--duration-fast), background var(--duration-fast)',
                  minHeight: 'var(--touch-target-min)',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)' }}>{s.label}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>{s.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Formality */}
        <div>
          <label className="label">Formality</label>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            {FORMALITIES.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFormality(f.value)}
                className={`pill${formality === f.value ? ' pill--active' : ''}`}
                style={{ cursor: 'pointer', border: '1px solid var(--color-border)', flex: 1, padding: '10px', minHeight: 'var(--touch-target-min)', justifyContent: 'center' }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Language */}
        <div>
          <label className="label">Conversation language</label>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 'var(--space-sm)' }}>
            Changes the language {personaName} responds in. The app UI stays in English.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            {LANGUAGES.map((l) => (
              <button
                key={l.value}
                type="button"
                onClick={() => setLanguage(l.value)}
                style={{
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  border: `2px solid ${language === l.value ? 'var(--color-border-focus)' : 'var(--color-border)'}`,
                  background: language === l.value ? 'rgba(194,164,138,0.15)' : 'rgba(194,164,138,0.06)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'border-color var(--duration-fast), background var(--duration-fast)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)' }}>{l.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{l.desc}</div>
                </div>
                {language === l.value && <span style={{ fontSize: 16, color: 'var(--color-accent)' }}>✓</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Alias toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', cursor: 'pointer', minHeight: 'var(--touch-target-min)' }}>
          <input
            type="checkbox"
            checked={usesAlias}
            onChange={(e) => setUsesAlias(e.target.checked)}
            style={{ width: 20, height: 20, accentColor: 'var(--color-accent)', flexShrink: 0 }}
          />
          <span style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>Address me by my alias</span>
        </label>

        {error && <div className="error-msg">{error}</div>}

        <button
          className="btn btn--primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
