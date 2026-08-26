import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wind, CloudRain, ArrowsClockwise, Lightning,
  Butterfly, Tree, Waves, Heart, CheckCircle,
} from '@phosphor-icons/react';
import client from '../../api/client';

const CONDITIONS = [
  {
    value: 'anxiety',
    label: 'Anxiety',
    Icon: Wind,
    color: '#F59E0B',
    bg: 'rgba(245,158,11,0.12)',
    selectedBorder: 'rgba(245,158,11,0.8)',
    selectedCard: 'rgba(245,158,11,0.08)',
  },
  {
    value: 'depression',
    label: 'Depression',
    Icon: CloudRain,
    color: '#60A5FA',
    bg: 'rgba(96,165,250,0.12)',
    selectedBorder: 'rgba(96,165,250,0.8)',
    selectedCard: 'rgba(96,165,250,0.08)',
  },
  {
    value: 'ocd',
    label: 'OCD',
    Icon: ArrowsClockwise,
    color: '#34D399',
    bg: 'rgba(52,211,153,0.12)',
    selectedBorder: 'rgba(52,211,153,0.8)',
    selectedCard: 'rgba(52,211,153,0.08)',
  },
  {
    value: 'adhd',
    label: 'ADHD',
    Icon: Lightning,
    color: '#FBBF24',
    bg: 'rgba(251,191,36,0.12)',
    selectedBorder: 'rgba(251,191,36,0.8)',
    selectedCard: 'rgba(251,191,36,0.08)',
  },
  {
    value: 'grief',
    label: 'Grief & Loss',
    Icon: Butterfly,
    color: '#A78BFA',
    bg: 'rgba(167,139,250,0.12)',
    selectedBorder: 'rgba(167,139,250,0.8)',
    selectedCard: 'rgba(167,139,250,0.08)',
  },
  {
    value: 'loneliness',
    label: 'Loneliness',
    Icon: Tree,
    color: '#86EFAC',
    bg: 'rgba(134,239,172,0.12)',
    selectedBorder: 'rgba(134,239,172,0.8)',
    selectedCard: 'rgba(134,239,172,0.08)',
  },
  {
    value: 'stress',
    label: 'Stress',
    Icon: Waves,
    color: '#67E8F9',
    bg: 'rgba(103,232,249,0.12)',
    selectedBorder: 'rgba(103,232,249,0.8)',
    selectedCard: 'rgba(103,232,249,0.08)',
  },
  {
    value: 'general_support',
    label: 'General Support',
    Icon: Heart,
    color: '#FB7185',
    bg: 'rgba(251,113,133,0.12)',
    selectedBorder: 'rgba(251,113,133,0.8)',
    selectedCard: 'rgba(251,113,133,0.08)',
  },
];

export default function ConditionScreen() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    if (!selected) return;
    setSubmitting(true);
    setError('');
    try {
      await client.post('/api/onboarding/condition', { condition_category: selected });
      navigate('/onboarding/first-mood', { replace: true });
    } catch {
      setError('Something went wrong. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <div
      className="screen screen--no-nav"
      style={{
        display: 'flex', flexDirection: 'column',
        padding: 'var(--space-xl) var(--space-lg) var(--space-lg)',
        gap: 'var(--space-lg)',
      }}
    >
      <div>
        <h1 style={{
          fontFamily: 'var(--font-editorial)', fontSize: 26,
          fontWeight: 400, marginBottom: 'var(--space-xs)',
        }}>
          What brings you here?
        </h1>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          We'll connect you with people who understand. You can always explore other groups later.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, flex: 1 }}>
        {CONDITIONS.map((c) => {
          const isSelected = selected === c.value;
          const { Icon } = c;
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => setSelected(c.value)}
              style={{
                position: 'relative',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 10, padding: '20px 10px',
                minHeight: 110,
                borderRadius: 'var(--radius-lg)',
                border: `1.5px solid ${isSelected ? c.selectedBorder : 'var(--color-border)'}`,
                background: isSelected ? c.selectedCard : 'var(--color-surface-card)',
                cursor: 'pointer',
                transition: 'border-color 180ms ease, background 180ms ease, transform 120ms ease',
                transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                boxShadow: isSelected ? `0 0 0 3px ${c.bg}` : 'none',
              }}
            >
              {/* Check indicator */}
              {isSelected && (
                <CheckCircle
                  size={16}
                  weight="fill"
                  color={c.color}
                  style={{ position: 'absolute', top: 8, right: 8 }}
                />
              )}

              {/* Icon pill */}
              <div style={{
                width: 48, height: 48,
                borderRadius: 14,
                background: c.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                transition: 'background 180ms ease',
              }}>
                <Icon size={24} weight="duotone" color={c.color} />
              </div>

              <span style={{
                fontSize: 13,
                fontWeight: isSelected ? 600 : 400,
                color: isSelected ? c.color : 'var(--color-text-primary)',
                textAlign: 'center',
                lineHeight: 1.3,
                transition: 'color 180ms ease',
              }}>
                {c.label}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <p style={{ fontSize: 13, color: 'var(--color-danger)', textAlign: 'center', margin: 0 }}>
          {error}
        </p>
      )}

      <button
        className="btn btn--primary"
        onClick={handleSubmit}
        disabled={!selected || submitting}
        style={{ marginTop: 'auto', flexShrink: 0 }}
      >
        {submitting ? 'Joining your group…' : 'Continue'}
      </button>
    </div>
  );
}
