import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import * as PhosphorIcons from '@phosphor-icons/react';
import { Stethoscope } from '@phosphor-icons/react';
import client from '../../api/client';

function CategorySkeleton() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, padding: 'var(--space-md)' }}>
      {[...Array(6)].map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 120, borderRadius: 'var(--radius-lg)' }} />
      ))}
    </div>
  );
}

function PhosphorIcon({ name, size = 48, color }) {
  const Icon = PhosphorIcons[name] ?? Stethoscope;
  return <Icon size={size} color={color} weight="duotone" />;
}

export default function TherapistCategoryScreen() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['therapy', 'categories'],
    queryFn: () => client.get('/api/therapy/categories').then(r => r.data),
  });

  const categories = data?.categories ?? [];

  return (
    <div className="screen" style={{ overflowY: 'auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        height: 'var(--top-bar-height)', padding: '0 var(--space-md)',
        background: 'var(--color-bg-primary)', borderBottom: '1px solid var(--color-border)',
        flexShrink: 0,
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--color-text-primary)', lineHeight: 1, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          aria-label="Go back"
        >
          ←
        </button>
        <span style={{ fontWeight: 700, fontSize: 17 }}>Find a Therapist</span>
      </div>

      <div style={{ padding: 'var(--space-md)' }}>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.86rem', marginBottom: 'var(--space-md)', lineHeight: 1.5 }}>
          Choose a specialisation to find therapists who can help with what you're going through.
        </p>

        {isLoading && <CategorySkeleton />}

        {!isLoading && categories.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-muted)' }}>
            <Stethoscope size={48} color="var(--color-text-muted)" weight="duotone" style={{ marginBottom: 12 }} />
            <p style={{ fontWeight: 600 }}>No categories available</p>
            <p style={{ fontSize: '0.84rem', marginTop: 4 }}>Please check back soon.</p>
          </div>
        )}

        {!isLoading && categories.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {categories.map((cat, i) => (
              <button
                key={cat.id}
                onClick={() => navigate(`/therapists/category/${cat.id}`)}
                style={{
                  background: 'var(--color-surface-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '16px 8px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  cursor: 'pointer', textAlign: 'center',
                  animation: `cardFadeIn 300ms ease ${i * 40}ms both`,
                  transition: 'transform 120ms ease, box-shadow 120ms ease',
                }}
                onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
                onMouseUp={e => e.currentTarget.style.transform = ''}
                onMouseLeave={e => e.currentTarget.style.transform = ''}
              >
                <PhosphorIcon name={cat.icon_name} size={40} color="var(--color-calm)" />
                <div style={{ fontWeight: 600, fontSize: '0.78rem', lineHeight: 1.3, color: 'var(--color-text-primary)' }}>
                  {cat.name}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', lineHeight: 1.2 }}>
                  {cat.therapist_count} therapist{cat.therapist_count !== 1 ? 's' : ''}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes cardFadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
