import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Stethoscope, Warning } from '@phosphor-icons/react';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function TherapyConsentScreen() {
  const navigate = useNavigate();
  const { updateUser } = useAuth();
  const [checked1, setChecked1] = useState(false);
  const [checked2, setChecked2] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleConsent() {
    if (!checked1 || !checked2) return;
    setSubmitting(true);
    setError('');
    try {
      await client.post('/api/therapy/consent', { consent_version: '2.0' });
      updateUser({ therapy_consent_version: '2.0' });
      navigate('/therapists', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save consent. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <div className="screen" style={{ overflowY: 'auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '20px var(--space-md) 0',
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--color-text-primary)', lineHeight: 1 }}
          aria-label="Go back"
        >
          ←
        </button>
        <span style={{ fontWeight: 700, fontSize: 17 }}>Before you continue</span>
      </div>

      <div style={{ padding: 'var(--space-md)' }}>
        {/* Icon */}
        <div style={{ display: 'flex', justifyContent: 'center', margin: '24px 0 20px' }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'var(--color-calm-light, #e8f4f8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Stethoscope size={36} color="var(--color-calm)" weight="duotone" />
          </div>
        </div>

        <h2 style={{ textAlign: 'center', marginBottom: 8, fontFamily: 'var(--font-editorial)' }}>
          Therapy on PeerPal
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.88rem', marginBottom: 28, lineHeight: 1.5 }}>
          Please read and agree to the following before accessing our therapist marketplace.
        </p>

        {/* Consent points */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 28 }}>
          <ConsentPoint icon={<ShieldCheck size={20} color="var(--color-calm)" />} text="Your therapist can access notes and information you share during sessions to provide care." />
          <ConsentPoint icon={<ShieldCheck size={20} color="var(--color-calm)" />} text="Therapists on PeerPal are independent professionals, not PeerPal employees. PeerPal facilitates access to their services." />
          <ConsentPoint icon={<ShieldCheck size={20} color="var(--color-calm)" />} text="Sessions are not recorded. No audio, video, or text logs are stored by PeerPal." />
          <ConsentPoint icon={<Warning size={20} color="var(--color-warning, #E88B3F)" />} text="If a crisis is identified before or during a session, we may pause the session and connect you with emergency resources." />
          <ConsentPoint icon={<ShieldCheck size={20} color="var(--color-calm)" />} text="Cancellations over 24 hours in advance: full refund. 2–24 hours: 50% M-Pesa refund, credit non-refundable. Under 2 hours: no refund (first occurrence may be waived)." />
          <ConsentPoint icon={<ShieldCheck size={20} color="var(--color-calm)" />} text="Session data is retained for 7 years as required by Kenyan health regulations. You may request deletion after your last session date." />
        </div>

        {/* Checkboxes */}
        <div style={{ background: 'var(--color-surface-card)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-md)', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', fontSize: '0.88rem', lineHeight: 1.5 }}>
            <input
              type="checkbox"
              checked={checked1}
              onChange={e => setChecked1(e.target.checked)}
              style={{ width: 20, height: 20, accentColor: 'var(--color-calm)', flexShrink: 0, marginTop: 2 }}
            />
            I understand that my therapist is an independent professional and not a PeerPal employee, and I consent to my session data being accessed by them for the purpose of providing care.
          </label>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', fontSize: '0.88rem', lineHeight: 1.5 }}>
            <input
              type="checkbox"
              checked={checked2}
              onChange={e => setChecked2(e.target.checked)}
              style={{ width: 20, height: 20, accentColor: 'var(--color-calm)', flexShrink: 0, marginTop: 2 }}
            />
            I agree to the cancellation policy and understand that sessions are not recorded, crisis escalation may occur if needed, and my data will be retained for 7 years.
          </label>
        </div>

        {error && (
          <p style={{ color: 'var(--color-error, #c0392b)', fontSize: '0.84rem', marginBottom: 12, textAlign: 'center' }}>{error}</p>
        )}

        <button
          className="btn btn--primary"
          style={{ width: '100%' }}
          onClick={handleConsent}
          disabled={!checked1 || !checked2 || submitting}
        >
          {submitting ? 'Saving…' : 'I Agree — Browse Therapists'}
        </button>

        <button
          onClick={() => navigate(-1)}
          className="btn btn--muted"
          style={{ width: '100%', marginTop: 10 }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ConsentPoint({ icon, text }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ flexShrink: 0, marginTop: 1 }}>{icon}</div>
      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: 0 }}>{text}</p>
    </div>
  );
}
