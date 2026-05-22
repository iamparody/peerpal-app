import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';

const TONES = [
  { value: 'warm',         label: 'Warm',         desc: 'Compassionate and nurturing' },
  { value: 'motivational', label: 'Motivational',  desc: 'Energetic and encouraging' },
  { value: 'clinical',     label: 'Clinical',      desc: 'Structured and objective' },
  { value: 'casual',       label: 'Casual',        desc: 'Relaxed and conversational' },
];

const LANGUAGES = [
  { value: 'english', label: 'English', desc: 'Standard English responses' },
  { value: 'swahili', label: 'Swahili',  desc: 'Responses in Kiswahili' },
  { value: 'sheng',   label: 'Sheng',   desc: 'Nairobi street mix — casual & authentic' },
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

function previewSnippet(name, tone, style, usesAlias, alias) {
  const addressee = usesAlias && alias ? alias : 'you';
  const greetings = {
    warm:         `Hello${usesAlias && alias ? `, ${addressee}` : ''}. I'm ${name || 'your companion'}. I'm here to listen — what's on your heart today?`,
    motivational: `Hey${usesAlias && alias ? ` ${addressee}` : ''}! I'm ${name || 'your companion'}. Ready to take on the day together? What's going on?`,
    clinical:     `Hello. I'm ${name || 'your companion'}. Let's begin. How are you feeling at this moment?`,
    casual:       `Hey${usesAlias && alias ? ` ${addressee}` : ''}! I'm ${name || 'your companion'}. What's up?`,
  };
  const elaboration = style === 'elaborate' ? " I'm fully present and there's no rush — take all the time you need to share." : '';
  return (greetings[tone] || greetings.warm) + elaboration;
}

/* Persona confirmation sequence (spec 9.4 #2) */
function PersonaConfirmation({ name, onDone }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--color-bg-deep)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999,
        padding: 'var(--space-xl)',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-editorial)',
          fontSize: 28,
          fontWeight: 400,
          color: 'var(--color-accent)',
          marginBottom: 'var(--space-md)',
          animation: 'personaIn 400ms var(--easing-spring) both',
          animationDelay: '300ms',
          opacity: 0,
        }}
      >
        {name}
      </div>
      <p
        style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 16,
          color: 'var(--color-text-muted)',
          animation: 'personaIn 300ms ease-out both',
          animationDelay: '700ms',
          opacity: 0,
        }}
      >
        Your companion is ready.
      </p>
    </div>
  );
}

export default function PersonaScreen() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [tone, setTone] = useState('warm');
  const [style, setStyle] = useState('brief');
  const [formality, setFormality] = useState('neutral');
  const [usesAlias, setUsesAlias] = useState(true);
  const [language, setLanguage] = useState('english');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const storedUser = (() => { try { return JSON.parse(localStorage.getItem('mb_user') || '{}'); } catch { return {}; } })();
  const alias = storedUser.alias || '';

  const preview = previewSnippet(name, tone, style, usesAlias, alias);

  async function handleSubmit() {
    if (!name.trim()) { setError('Give your companion a name.'); return; }
    if (!confirmed) { setError('Please confirm that you understand the persona is permanent.'); return; }
    setError('');
    setLoading(true);
    try {
      await client.post('/api/onboarding/persona', {
        persona_name: name.trim(),
        tone,
        response_style: style,
        formality,
        uses_alias: usesAlias,
        language,
      });
      setShowConfirmation(true);
      setTimeout(() => navigate('/onboarding/condition', { replace: true }), 2500);
    } catch (err) {
      const status = err.response?.status;
      setError(status === 403
        ? 'Your persona has already been created.'
        : err.response?.data?.error || 'Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  if (showConfirmation) {
    return <PersonaConfirmation name={name.trim()} />;
  }

  return (
    <div className="screen screen--no-nav" style={{ padding: 'var(--space-xl) var(--space-lg)' }}>
      {/* Progress dots */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 'var(--space-lg)' }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              width: i === 2 ? 24 : 8,
              height: 8,
              borderRadius: 'var(--radius-pill)',
              background: i === 2 ? 'var(--color-accent)' : 'var(--color-border)',
              transition: 'width var(--duration-normal)',
            }}
          />
        ))}
      </div>

      <div style={{ marginBottom: 'var(--space-lg)', textAlign: 'center' }}>
        <h1 style={{ fontSize: 'var(--text-h2)', marginBottom: 'var(--space-xs)' }}>Create Your Companion</h1>
        <p style={{ fontSize: 14 }}>The name is permanent — everything else can be changed later</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
        <div>
          <label className="label" htmlFor="pname">
            Companion name <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', textTransform: 'none', letterSpacing: 0 }}>(max 20 chars)</span>
          </label>
          <input
            id="pname"
            type="text"
            className="input"
            style={{ fontFamily: 'var(--font-editorial)', fontSize: 'var(--text-h3)' }}
            maxLength={20}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sage, Aria, Nova…"
          />
          <div className="char-counter">{name.length}/20</div>
        </div>

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

        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', cursor: 'pointer', minHeight: 'var(--touch-target-min)' }}>
          <input
            type="checkbox"
            checked={usesAlias}
            onChange={(e) => setUsesAlias(e.target.checked)}
            style={{ width: 20, height: 20, accentColor: 'var(--color-accent)', flexShrink: 0 }}
          />
          <span style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>Address me by my alias ({alias || 'your alias'})</span>
        </label>

        {/* Language */}
        <div>
          <label className="label">Conversation language</label>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 'var(--space-sm)' }}>
            You can change this anytime from your profile.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            {LANGUAGES.map((l) => (
              <button
                key={l.value}
                type="button"
                onClick={() => setLanguage(l.value)}
                className={`pill${language === l.value ? ' pill--active' : ''}`}
                style={{ cursor: 'pointer', border: '1px solid var(--color-border)', flex: 1, padding: '10px 6px', minHeight: 'var(--touch-target-min)', justifyContent: 'center', fontSize: 13 }}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {/* Live preview card */}
        <div
          style={{
            background: 'rgba(194,164,138,0.08)',
            borderRadius: 'var(--radius-lg)',
            border: '1.5px solid var(--color-border-focus)',
            padding: 'var(--space-md)',
          }}
        >
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 'var(--space-sm)' }}>
            Preview — how {name || 'your companion'} will greet you:
          </p>
          <p
            style={{
              fontSize: 15,
              fontFamily: 'var(--font-editorial)',
              color: 'var(--color-text-primary)',
              fontStyle: 'italic',
              lineHeight: 1.7,
              transition: 'color 200ms',
            }}
          >
            "{preview}"
          </p>
        </div>

        <div className="info-banner info-banner--warning">
          <strong style={{ color: 'var(--color-warning)', display: 'block', marginBottom: 4 }}>This cannot be changed</strong>
          Once set, your companion's name cannot be changed. Tone, style, and language can be updated anytime from your profile.
        </div>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-md)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            style={{ width: 20, height: 20, flexShrink: 0, marginTop: 2, accentColor: 'var(--color-accent)' }}
          />
          <span style={{ fontSize: 14, color: 'var(--color-text-primary)', lineHeight: 1.5 }}>I understand my companion's name is permanent and cannot be changed later</span>
        </label>

        {error && <div className="error-msg">{error}</div>}

        <button
          className="btn btn--primary"
          onClick={handleSubmit}
          disabled={loading || !name.trim() || !confirmed}
        >
          {loading ? 'Creating…' : 'Create My Companion'}
        </button>
      </div>
    </div>
  );
}
