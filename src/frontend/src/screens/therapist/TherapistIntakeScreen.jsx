import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import client from '../../api/client';

// Purpose-built inline SVG icons — not borrowed from a library
const IconListener = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 9a5.5 5.5 0 0 1 11 0v1" />
    <path d="M7 9a3 3 0 0 1 6 0v1.5a2 2 0 0 1-2 2h-.5" />
    <circle cx="11.5" cy="14" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

const IconPatterns = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <circle cx="10" cy="3.5" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="3.5" cy="15.5" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="16.5" cy="15.5" r="1.5" fill="currentColor" stroke="none" />
    <line x1="10" y1="5" x2="4.1" y2="14.1" />
    <line x1="10" y1="5" x2="15.9" y2="14.1" />
    <line x1="5" y1="15.5" x2="15" y2="15.5" />
  </svg>
);

const IconCompass = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="10" cy="10" r="7.5" />
    <path d="M6.5 13.5L8.5 8.5L13.5 6.5L11.5 11.5L6.5 13.5Z" />
    <circle cx="10" cy="10" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const IconQuestion = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M7.5 7.8C7.5 6 8.6 4.5 10 4.5s2.5 1.3 2.5 2.8c0 1.4-1.4 2-2.3 3.2" />
    <circle cx="10" cy="15" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const SUPPORT_STYLES = [
  { id: 'listener', label: 'Someone who listens without jumping to solutions', Icon: IconListener },
  { id: 'patterns', label: 'Help understanding the patterns behind my feelings', Icon: IconPatterns },
  { id: 'tools',    label: 'Practical tools I can use day-to-day',              Icon: IconCompass },
  { id: 'unsure',   label: "Honestly, I'm not sure yet",                        Icon: IconQuestion },
];

const FORMATS = [
  { id: 'in_app',    label: 'Text (in-app)' },
  { id: 'voice',     label: 'Voice call' },
  { id: 'in_person', label: 'In-person' },
  { id: 'flexible',  label: 'Any format' },
];
const TIMES = [
  { id: 'morning',   label: 'Morning' },
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'evening',   label: 'Evening' },
];

export default function TherapistIntakeScreen() {
  const navigate = useNavigate();
  const [step,          setStep]          = useState(0);
  const [struggles,     setStruggles]     = useState('');
  const [supportStyle,  setSupportStyle]  = useState('');
  const [language,      setLanguage]      = useState('English');
  const [specifyText,   setSpecifyText]   = useState('');
  const [sessionFormat, setSessionFormat] = useState('flexible');
  const [preferredTime, setPreferredTime] = useState('evening');
  const [visible,       setVisible]       = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState('');

  useEffect(() => {
    async function checkExisting() {
      try {
        const { data } = await client.get('/api/referrals/my');
        const open = (data.referrals || []).find(
          (r) => !['closed', 'arranged'].includes(r.status)
        );
        if (open) { navigate('/therapists/status', { replace: true }); return; }
      } catch { /* no open referral, proceed */ }
      setTimeout(() => setVisible(true), 80);
      setStep(1);
    }
    checkExisting();
  }, [navigate]);

  function goNext() {
    setVisible(false);
    setTimeout(() => { setStep((s) => s + 1); setVisible(true); }, 350);
  }

  async function handleSubmit() {
    setSaving(true);
    setError('');
    try {
      const resolvedLanguage = language === 'Specify'
        ? (specifyText.trim() || 'Not specified')
        : language;

      const { data } = await client.post('/api/referrals', {
        struggles:                struggles.trim(),
        preferred_time:           preferredTime,
        contact_method:           'in_app',
        support_style_preference: supportStyle,
        specific_needs:           `Language: ${resolvedLanguage}. Format: ${sessionFormat}`,
      });
      navigate('/therapists/browse', {
        state: {
          referralId:     data.referral_id,
          struggles,
          supportStyle,
          language:       resolvedLanguage,
          sessionFormat,
          preferredTime,
        },
        replace: true,
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
      setSaving(false);
    }
  }

  if (step === 0) return null;

  const progress = step / 3;

  return (
    <div style={styles.screen}>
      <div style={styles.progressBar}>
        <div style={{ ...styles.progressFill, width: `${progress * 100}%` }} />
      </div>

      {step > 1 && (
        <button
          style={styles.back}
          onClick={() => { setVisible(false); setTimeout(() => { setStep((s) => s - 1); setVisible(true); }, 300); }}
        >
          ←
        </button>
      )}

      <div style={{ ...styles.content, opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(6px)' }}>

        {step === 1 && (
          <Step1 value={struggles} onChange={setStruggles} onNext={goNext} />
        )}

        {step === 2 && (
          <Step2 selected={supportStyle} onSelect={setSupportStyle} onNext={goNext} />
        )}

        {step === 3 && (
          <Step3
            language={language}
            specifyText={specifyText}
            sessionFormat={sessionFormat}
            preferredTime={preferredTime}
            onLanguage={setLanguage}
            onSpecifyText={setSpecifyText}
            onFormat={setSessionFormat}
            onTime={setPreferredTime}
            onSubmit={handleSubmit}
            saving={saving}
            error={error}
          />
        )}
      </div>
    </div>
  );
}

function Step1({ value, onChange, onNext }) {
  const remaining = 300 - value.length;
  return (
    <div style={styles.step}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <p style={{ ...styles.eyebrow, marginBottom: 0 }}>Finding the right person for you</p>
        <span style={{
          fontSize: 11, fontWeight: 600, color: 'var(--color-accent)',
          background: 'rgba(194,164,138,0.15)', borderRadius: 20,
          padding: '3px 10px', letterSpacing: '0.03em',
        }}>
          1 credit
        </span>
      </div>
      <h1 style={styles.question}>What's been on your mind lately?</h1>
      <p style={styles.hint}>
        Share as much or as little as you like. This helps us understand what you're carrying.
      </p>
      <textarea
        style={styles.textarea}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 300))}
        placeholder="You can start anywhere — there's no wrong answer…"
        autoFocus
        rows={5}
      />
      <p style={{ ...styles.counter, color: remaining < 30 ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>
        {remaining} characters remaining
      </p>
      <button
        style={{ ...styles.cta, opacity: value.trim().length < 10 ? 0.4 : 1 }}
        disabled={value.trim().length < 10}
        onClick={onNext}
      >
        Continue
      </button>
    </div>
  );
}

function Step2({ selected, onSelect, onNext }) {
  return (
    <div style={styles.step}>
      <p style={styles.eyebrow}>Step 2 of 3</p>
      <h1 style={styles.question}>What kind of support feels right?</h1>
      <p style={styles.hint}>You can change your mind later — this is just to help us find a good fit.</p>
      <div style={styles.optionList}>
        {SUPPORT_STYLES.map((s) => {
          const isSelected = selected === s.id;
          return (
            <button
              key={s.id}
              style={{ ...styles.option, ...(isSelected ? styles.optionSelected : {}) }}
              onClick={() => onSelect(s.id)}
            >
              <div style={{ ...styles.optionIconBox, ...(isSelected ? styles.optionIconBoxSelected : {}) }}>
                <s.Icon />
              </div>
              <span style={{ ...styles.optionLabel, ...(isSelected ? styles.optionLabelSelected : {}) }}>
                {s.label}
              </span>
              {isSelected && (
                <div style={styles.checkMark}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2.5 7L5.5 10L11.5 4" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>
      <button
        style={{ ...styles.cta, opacity: !selected ? 0.4 : 1 }}
        disabled={!selected}
        onClick={onNext}
      >
        Continue
      </button>
    </div>
  );
}

function Step3({ language, specifyText, sessionFormat, preferredTime, onLanguage, onSpecifyText, onFormat, onTime, onSubmit, saving, error }) {
  const specifyRef = useRef(null);

  useEffect(() => {
    if (language === 'Specify') {
      setTimeout(() => specifyRef.current?.focus(), 60);
    }
  }, [language]);

  return (
    <div style={styles.step}>
      <p style={styles.eyebrow}>Step 3 of 3</p>
      <h1 style={styles.question}>A few quick preferences</h1>
      <p style={styles.hint}>These help us narrow things down — none are set in stone.</p>

      <div style={styles.prefSection}>
        <p style={styles.prefLabel}>Language you're most comfortable in</p>
        <div style={styles.pillRow}>
          {['English', 'Swahili', 'Specify'].map((l) => (
            <button
              key={l}
              style={{ ...styles.pill, ...(language === l ? styles.pillActive : {}) }}
              onClick={() => onLanguage(l)}
            >
              {l}
            </button>
          ))}
        </div>
        {language === 'Specify' && (
          <input
            ref={specifyRef}
            style={styles.specifyInput}
            value={specifyText}
            onChange={(e) => onSpecifyText(e.target.value.slice(0, 40))}
            placeholder="e.g. Kikuyu, French, Arabic…"
            maxLength={40}
          />
        )}
      </div>

      <div style={styles.prefSection}>
        <p style={styles.prefLabel}>How would you prefer to meet?</p>
        <div style={styles.pillRow}>
          {FORMATS.map((f) => (
            <button
              key={f.id}
              style={{ ...styles.pill, ...(sessionFormat === f.id ? styles.pillActive : {}) }}
              onClick={() => onFormat(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div style={styles.prefSection}>
        <p style={styles.prefLabel}>Best time for you</p>
        <div style={styles.pillRow}>
          {TIMES.map((t) => (
            <button
              key={t.id}
              style={{ ...styles.pill, ...(preferredTime === t.id ? styles.pillActive : {}) }}
              onClick={() => onTime(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        error.toLowerCase().includes('credit') ? (
          <p style={styles.error}>
            {error}{' '}
            <Link to="/credits" style={{ color: 'var(--color-accent)', fontWeight: 600 }}>
              Top up →
            </Link>
          </p>
        ) : (
          <p style={styles.error}>{error}</p>
        )
      )}

      <button style={styles.cta} onClick={onSubmit} disabled={saving}>
        {saving ? 'One moment…' : 'Show me who can help'}
      </button>
      <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--color-text-muted)', marginTop: 12 }}>
        Uses 1 credit
      </p>
    </div>
  );
}

const styles = {
  screen: {
    minHeight: '100vh',
    background: 'var(--color-bg-primary)',
    display: 'flex',
    flexDirection: 'column',
    paddingBottom: 32,
  },
  progressBar: {
    height: 3,
    background: 'var(--color-border)',
    position: 'fixed',
    top: 0, left: 0, right: 0,
    zIndex: 100,
  },
  progressFill: {
    height: '100%',
    background: 'var(--color-accent)',
    transition: 'width 500ms var(--easing-out)',
    borderRadius: '0 2px 2px 0',
  },
  back: {
    position: 'fixed',
    top: 16, left: 16,
    background: 'none',
    border: 'none',
    color: 'var(--color-text-secondary)',
    fontSize: 22,
    cursor: 'pointer',
    padding: '8px 12px',
    zIndex: 99,
    borderRadius: 'var(--radius-sm)',
  },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    transition: 'opacity 400ms var(--easing-out), transform 400ms var(--easing-out)',
  },
  step: {
    flex: 1,
    padding: '80px 24px 32px',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: 500,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--color-text-secondary)',
    marginBottom: 12,
  },
  question: {
    fontSize: 26,
    fontWeight: 600,
    lineHeight: 1.3,
    color: 'var(--color-text-primary)',
    marginBottom: 12,
  },
  hint: {
    fontSize: 15,
    lineHeight: 1.6,
    color: 'var(--color-text-muted)',
    marginBottom: 28,
  },
  textarea: {
    width: '100%',
    background: 'var(--color-surface-secondary)',
    border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    padding: '16px',
    fontSize: 16,
    lineHeight: 1.65,
    color: 'var(--color-text-dark)',
    fontFamily: 'Lora, Georgia, serif',
    resize: 'none',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 200ms ease, box-shadow 200ms ease',
  },
  counter: {
    fontSize: 12,
    textAlign: 'right',
    marginTop: 6,
    marginBottom: 24,
    transition: 'color 200ms ease',
  },
  optionList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    marginBottom: 28,
  },
  option: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    background: 'var(--color-surface-card)',
    border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    padding: '14px 16px',
    cursor: 'pointer',
    transition: 'border-color 220ms ease, background 220ms ease',
    textAlign: 'left',
  },
  optionSelected: {
    borderColor: 'var(--color-calm)',
    background: 'var(--color-calm-bg)',
  },
  optionIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    background: 'var(--color-surface-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    color: 'var(--color-text-secondary)',
    transition: 'background 220ms ease, color 220ms ease',
  },
  optionIconBoxSelected: {
    background: 'var(--color-calm-bg)',
    color: 'var(--color-calm)',
  },
  optionLabel: {
    fontSize: 15,
    lineHeight: 1.45,
    color: '#F5EDE4',
    flex: 1,
    transition: 'color 220ms ease',
  },
  optionLabelSelected: {
    color: 'var(--color-text-primary)',
  },
  checkMark: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    background: 'var(--color-calm)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    color: '#fff',
  },
  prefSection: { marginBottom: 24 },
  prefLabel: {
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    marginBottom: 10,
  },
  pillRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  pill: {
    background: 'var(--color-surface-card)',
    border: '1.5px solid rgba(245,237,228,0.15)',
    borderRadius: 'var(--radius-pill)',
    padding: '9px 18px',
    fontSize: 14,
    color: '#F5EDE4',
    cursor: 'pointer',
    transition: 'border-color 200ms ease, background 200ms ease, color 200ms ease',
  },
  pillActive: {
    borderColor: 'var(--color-accent)',
    background: 'rgba(194,164,138,0.15)',
    color: 'var(--color-accent)',
    fontWeight: 500,
  },
  specifyInput: {
    marginTop: 10,
    width: '100%',
    background: 'var(--color-surface-secondary)',
    border: '1.5px solid var(--color-accent)',
    borderRadius: 'var(--radius-md)',
    padding: '11px 14px',
    fontSize: 15,
    color: 'var(--color-text-dark)',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 200ms ease',
    fontFamily: 'inherit',
  },
  cta: {
    marginTop: 'auto',
    width: '100%',
    height: 52,
    background: 'var(--color-accent)',
    color: '#ffffff',
    border: 'none',
    borderRadius: 'var(--radius-pill)',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 200ms ease, transform 150ms ease',
    boxShadow: 'var(--shadow-button)',
  },
  error: {
    fontSize: 13,
    color: 'var(--color-danger)',
    marginBottom: 12,
    textAlign: 'center',
  },
};
