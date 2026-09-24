import { useNavigate } from 'react-router-dom';
import { Stethoscope, ArrowLeft } from '@phosphor-icons/react';

export default function TherapistComingSoonScreen() {
  const navigate = useNavigate();

  return (
    <div className="screen" style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px', textAlign: 'center', gap: 24,
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: 20,
        background: 'rgba(143,175,154,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Stethoscope size={36} weight="duotone" color="var(--color-calm)" />
      </div>

      <div>
        <h1 style={{ fontSize: 22, fontFamily: 'var(--font-editorial)', fontWeight: 400, marginBottom: 8 }}>
          Therapist Marketplace
        </h1>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.6, maxWidth: 280 }}>
          Book a session with a verified therapist. This feature is launching very soon.
        </p>
      </div>

      <div style={{
        background: 'var(--color-surface-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 12, padding: '16px 20px',
        fontSize: 13, color: 'var(--color-text-secondary)',
        lineHeight: 1.6, maxWidth: 300,
      }}>
        You'll be able to browse licensed therapists, book sessions, and connect securely — all within PeerPal.
      </div>

      <button
        className="btn btn--ghost"
        onClick={() => navigate(-1)}
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <ArrowLeft size={16} />
        Go back
      </button>
    </div>
  );
}
