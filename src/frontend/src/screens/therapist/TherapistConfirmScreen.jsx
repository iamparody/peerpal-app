import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const STYLE_LABELS = {
  listener: 'Someone who listens without jumping to solutions',
  patterns: 'Help understanding the patterns behind my feelings',
  tools:    'Practical tools I can use day-to-day',
  unsure:   "I'm not sure yet — open to guidance",
};

export default function TherapistConfirmScreen() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const state     = location.state || {};
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setTimeout(() => setVisible(true), 120);
  }, []);

  const selected      = state.selected || [];
  const hasTherapists = selected.length > 0;

  return (
    <div style={s.screen}>
      <div style={{ ...s.content, opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(10px)' }}>

        {/* Confirmation mark */}
        <div style={s.iconWrap}>
          <span style={s.icon}>✦</span>
        </div>

        <h1 style={s.heading}>Your request is with us.</h1>

        {hasTherapists ? (
          <p style={s.body}>
            We'll do our best to connect you with{' '}
            <span style={s.names}>
              {selected.map((t, i) => (
                <span key={t.id}>
                  {i > 0 && (i === selected.length - 1 ? ' or ' : ', ')}
                  {t.display_name.split(' ')[0]}
                </span>
              ))}
            </span>
            .
          </p>
        ) : (
          <p style={s.body}>
            An admin will review your request and find someone right for you.
          </p>
        )}

        <p style={s.sub}>You'll hear from us within 24 hours via an in-app message.</p>

        {/* What you shared */}
        {state.struggles && (
          <div style={s.summaryCard}>
            <p style={s.summaryLabel}>What you shared</p>
            <p style={s.summaryText}>{state.struggles}</p>
            {state.supportStyle && STYLE_LABELS[state.supportStyle] && (
              <>
                <div style={s.divider} />
                <p style={s.summaryText}>{STYLE_LABELS[state.supportStyle]}</p>
              </>
            )}
          </div>
        )}

        {/* Selected therapists */}
        {hasTherapists && (
          <div style={s.therapistRow}>
            {selected.map((t) => (
              <div key={t.id} style={s.therapistChip}>
                <div style={s.chipAvatar}>
                  {t.photo_url
                    ? <img src={t.photo_url} alt={t.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={s.chipInitial}>{t.display_name.charAt(0)}</span>
                  }
                </div>
                <span style={s.chipName}>{t.display_name.split(' ')[0]}</span>
              </div>
            ))}
          </div>
        )}

        <div style={s.footer}>
          <button style={s.homeBtn} onClick={() => navigate('/dashboard', { replace: true })}>
            Back to home
          </button>
          <button style={s.statusBtn} onClick={() => navigate('/therapists/status', { replace: true })}>
            View request status
          </button>
        </div>
      </div>
    </div>
  );
}

const s = {
  screen: {
    minHeight: '100vh',
    background: 'var(--color-bg-primary)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '0 24px 40px',
  },
  content: {
    width: '100%',
    maxWidth: 400,
    paddingTop: 80,
    transition: 'opacity 500ms var(--easing-out), transform 500ms var(--easing-out)',
  },
  iconWrap: {
    marginBottom: 20,
  },
  icon: {
    fontSize: 32,
    color: 'var(--color-calm)',
    display: 'block',
  },
  heading: {
    fontSize: 28,
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    lineHeight: 1.25,
    marginBottom: 14,
    fontFamily: 'Lora, Georgia, serif',
  },
  body: {
    fontSize: 17,
    lineHeight: 1.65,
    color: 'var(--color-text-primary)',
    marginBottom: 8,
  },
  names: {
    color: 'var(--color-accent)',
    fontWeight: 500,
    fontFamily: 'Lora, Georgia, serif',
  },
  sub: {
    fontSize: 14,
    color: 'var(--color-text-muted)',
    lineHeight: 1.6,
    marginBottom: 32,
  },
  summaryCard: {
    background: 'var(--color-surface-card)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    padding: '16px 18px',
    marginBottom: 20,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    color: 'rgba(245,237,228,0.5)',
    marginBottom: 8,
  },
  summaryText: {
    fontSize: 14,
    lineHeight: 1.65,
    color: 'rgba(245,237,228,0.9)',
    fontFamily: 'Lora, Georgia, serif',
  },
  divider: {
    height: 1,
    background: 'var(--color-border)',
    margin: '10px 0',
  },
  therapistRow: {
    display: 'flex',
    gap: 14,
    marginBottom: 36,
    flexWrap: 'wrap',
  },
  therapistChip: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
  },
  chipAvatar: {
    width: 52,
    height: 52,
    borderRadius: '50%',
    background: 'var(--color-surface-secondary)',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '2px solid var(--color-calm)',
  },
  chipInitial: {
    fontSize: 22,
    fontWeight: 600,
    color: 'var(--color-text-dark)',
    fontFamily: 'Lora, Georgia, serif',
  },
  chipName: {
    fontSize: 12,
    color: 'var(--color-text-secondary)',
    fontWeight: 500,
  },
  footer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  homeBtn: {
    width: '100%',
    height: 52,
    background: 'var(--color-accent)',
    border: 'none',
    borderRadius: 'var(--radius-pill)',
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--color-text-dark)',
    cursor: 'pointer',
    boxShadow: 'var(--shadow-button)',
  },
  statusBtn: {
    width: '100%',
    height: 48,
    background: 'none',
    border: '1.5px solid var(--color-border-focus)',
    borderRadius: 'var(--radius-pill)',
    fontSize: 15,
    fontWeight: 500,
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
  },
};
