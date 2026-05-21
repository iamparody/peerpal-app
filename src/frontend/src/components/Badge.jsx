/**
 * Status badge with colour variants that map to the design system.
 *
 * variant: 'default' | 'success' | 'warning' | 'danger' | 'calm' | 'muted'
 */
const VARIANTS = {
  default: { bg: 'var(--color-surface-secondary)', color: 'var(--color-text-secondary)' },
  success: { bg: 'var(--color-success-bg)',         color: 'var(--color-success)'         },
  warning: { bg: 'var(--color-warning-bg)',         color: 'var(--color-warning)'         },
  danger:  { bg: 'var(--color-danger-bg)',          color: 'var(--color-danger)'          },
  calm:    { bg: 'var(--color-calm-bg)',            color: 'var(--color-calm)'            },
  muted:   { bg: 'var(--color-border)',             color: 'var(--color-text-muted)'      },
};

export default function Badge({ children, variant = 'default', style: extraStyle }) {
  const v = VARIANTS[variant] ?? VARIANTS.default;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: v.bg,
        color: v.color,
        borderRadius: 'var(--radius-pill)',
        padding: '3px 10px',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.03em',
        whiteSpace: 'nowrap',
        ...extraStyle,
      }}
    >
      {children}
    </span>
  );
}
