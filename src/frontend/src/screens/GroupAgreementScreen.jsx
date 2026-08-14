import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Handshake,
  Heart,
  ShieldCheck,
  Stethoscope,
  UserFocus,
} from '@phosphor-icons/react';
import client from '../api/client';

const RULES = [
  {
    Icon: Heart,
    text: 'Be kind. This is a safe space for people going through difficult things.',
  },
  {
    Icon: UserFocus,
    text: 'Your identity here is your alias. Do not share personal information about yourself or others.',
  },
  {
    Icon: Stethoscope,
    text: 'Respond from your own experience. Do not give medical advice or diagnoses.',
  },
  {
    Icon: ShieldCheck,
    text: 'If you see something concerning, report it. Do not engage with harmful content.',
  },
  {
    Icon: Handshake,
    text: 'You are here as a peer, not a counsellor. Offer support — not solutions.',
  },
];

export default function GroupAgreementScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [agreed, setAgreed]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  async function handleJoin() {
    if (!agreed) { setError('You must agree to the community rules to join.'); return; }
    setError('');
    setLoading(true);
    try {
      await client.post(`/api/groups/${id}/join`, { agreement_confirmed: true });
      navigate(`/groups/${id}/chat`, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Could not join group. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="screen" style={{ padding: '0 0 16px' }}>
      <div className="page-header">
        <button className="page-header__back" onClick={() => navigate(-1)} aria-label="Back">‹</button>
        <h2 className="page-header__title">Community Agreement</h2>
      </div>

      <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Community Rules</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {RULES.map(({ Icon, text }, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <Icon size={20} weight="duotone" color="var(--color-accent)" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: '0.92rem', lineHeight: 'var(--leading-normal)', margin: 0, color: 'var(--color-text-primary)' }}>
                  {text}
                </p>
              </div>
            ))}
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            style={{ width: 20, height: 20, flexShrink: 0, marginTop: 2, accentColor: 'var(--color-accent)' }}
          />
          <span style={{ fontSize: '0.9rem', lineHeight: 'var(--leading-normal)' }}>
            I agree to the community rules and understand that violations may result in removal
          </span>
        </label>

        {error && <div className="error-msg">{error}</div>}

        <button className="btn btn--primary" onClick={handleJoin} disabled={loading || !agreed}>
          {loading ? 'Joining…' : 'I agree and join'}
        </button>

        <button className="btn btn--muted" onClick={() => navigate(-1)}>Cancel</button>
      </div>
    </div>
  );
}
