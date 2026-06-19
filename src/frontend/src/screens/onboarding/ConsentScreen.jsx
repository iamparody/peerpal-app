import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import client from '../../api/client';
import PrivacyPolicyScreen from '../PrivacyPolicyScreen';
import TermsScreen from '../TermsScreen';

const CONSENT_VERSION = '1.0';

function BottomSheet({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(47,38,34,0.7)' }}
      />
      <div
        style={{
          position: 'relative', zIndex: 1,
          background: 'var(--color-bg-deep)',
          borderRadius: '20px 20px 0 0',
          maxHeight: '88dvh',
          overflowY: 'auto',
        }}
      >
        <div style={{ position: 'sticky', top: 0, background: 'var(--color-bg-deep)', padding: '14px 20px 10px', display: 'flex', justifyContent: 'flex-end', borderBottom: '1px solid rgba(245,237,228,0.08)' }}>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#F5EDE4', fontSize: 22, cursor: 'pointer', padding: '4px 8px', borderRadius: 6 }}
            aria-label="Close"
          >×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 1923 }, (_, i) => CURRENT_YEAR - i);

export default function ConsentScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [agreed, setAgreed] = useState(false);
  const [birthMonth, setBirthMonth] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [underage, setUnderage] = useState(false);
  const [sheet, setSheet] = useState(null); // 'privacy' | 'terms' | null

  const dobFilled = birthMonth !== '' && birthYear !== '';
  const canSubmit = agreed && dobFilled && !underage;

  async function handleAgree() {
    if (!agreed) {
      setError('Please read and accept the Terms of Service and Privacy Policy.');
      return;
    }
    if (!dobFilled) {
      setError('Please enter your date of birth.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await client.post('/api/onboarding/consent', {
        consent_version: CONSENT_VERSION,
        birth_month: parseInt(birthMonth, 10),
        birth_year: parseInt(birthYear, 10),
      });
      navigate('/onboarding/persona', { replace: true });
    } catch (err) {
      if (err.response?.data?.code === 'UNDERAGE') {
        setUnderage(true);
        setError('');
      } else {
        setError(err.response?.data?.error || 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="screen screen--no-nav" style={{ padding: '32px 24px' }}>
        <div style={{ marginBottom: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
          <h1 style={{ fontSize: '1.5rem' }}>Before You Begin</h1>
          {user?.alias && <p style={{ marginTop: 4 }}>Welcome, <strong>{user.alias}</strong></p>}
        </div>

        <div className="card" style={{ marginBottom: 24, fontSize: '0.9rem', lineHeight: 1.7 }}>
          <h2 style={{ marginBottom: 12, fontSize: '1rem' }}>What we collect</h2>
          <ul style={{ paddingLeft: 20, color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li>Mood entries — dates, levels, and optional tags</li>
            <li>Journal entries — private text you write</li>
            <li>AI conversation content — exchanges with your companion</li>
            <li>Session metadata — timing and type of peer sessions</li>
          </ul>

          <div className="divider" />

          <h2 style={{ marginBottom: 12, fontSize: '1rem' }}>How it's used</h2>
          <ul style={{ paddingLeft: 20, color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li>Solely to improve your own experience on PeerPal</li>
            <li>No commercial use, no advertising, no third-party sharing</li>
          </ul>

          <div className="divider" />

          <h2 style={{ marginBottom: 12, fontSize: '1rem' }}>Safety exception</h2>
          <p style={{ color: 'var(--color-text-muted)' }}>
            AI conversations that trigger a safety flag are anonymised (your user ID is removed) but retained for safety pattern analysis only. This cannot be opted out of.
          </p>

          <div className="divider" />

          <h2 style={{ marginBottom: 12, fontSize: '1rem' }}>Not a medical service</h2>
          <p style={{ color: 'var(--color-text-muted)' }}>
            PeerPal is a peer support platform. It is not a substitute for professional mental health care. The AI companion is not a therapist or clinical tool.
          </p>
        </div>

        {/* Checkbox 1 — Terms + Privacy */}
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => { setAgreed(e.target.checked); setError(''); }}
            style={{ width: 20, height: 20, flexShrink: 0, marginTop: 2, accentColor: 'var(--color-accent)' }}
          />
          <span style={{ fontSize: '0.875rem', color: 'var(--color-text)', lineHeight: 1.6 }}>
            I have read and agree to the{' '}
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); setSheet('terms'); }}
              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-accent)', textDecoration: 'underline', cursor: 'pointer', fontSize: 'inherit', fontFamily: 'inherit' }}
            >
              Terms of Service
            </button>
            {' '}and{' '}
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); setSheet('privacy'); }}
              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-accent)', textDecoration: 'underline', cursor: 'pointer', fontSize: 'inherit', fontFamily: 'inherit' }}
            >
              Privacy Policy
            </button>
            . I understand this platform is not a medical service.
          </span>
        </label>

        {/* Date of birth — replaces the self-reported age checkbox */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text)', marginBottom: 10, lineHeight: 1.5 }}>
            Date of birth <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(PeerPal is 18+ only)</span>
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <select
              value={birthMonth}
              onChange={(e) => { setBirthMonth(e.target.value); setUnderage(false); setError(''); }}
              style={{
                flex: 1, padding: '10px 12px', borderRadius: 8,
                background: 'var(--color-surface-card)', color: 'var(--color-text)',
                border: '1px solid rgba(245,237,228,0.15)', fontSize: '0.9rem',
                appearance: 'none', WebkitAppearance: 'none',
              }}
              aria-label="Birth month"
            >
              <option value="">Month</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
            <select
              value={birthYear}
              onChange={(e) => { setBirthYear(e.target.value); setUnderage(false); setError(''); }}
              style={{
                width: 100, padding: '10px 12px', borderRadius: 8,
                background: 'var(--color-surface-card)', color: 'var(--color-text)',
                border: '1px solid rgba(245,237,228,0.15)', fontSize: '0.9rem',
                appearance: 'none', WebkitAppearance: 'none',
              }}
              aria-label="Birth year"
            >
              <option value="">Year</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 6 }}>
            We only store your birth year — not the full date.
          </p>
        </div>

        {/* Underage message */}
        {underage && (
          <div style={{
            background: 'rgba(231,76,60,0.12)', border: '1px solid rgba(231,76,60,0.3)',
            borderRadius: 10, padding: '16px 18px', marginBottom: 20,
          }}>
            <p style={{ fontWeight: 600, color: '#E74C3C', marginBottom: 6, fontSize: '0.9rem' }}>
              PeerPal is for adults aged 18 and over.
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', lineHeight: 1.6, margin: 0 }}>
              If you need support right now, Befrienders Kenya offer free, confidential help for everyone:{' '}
              <a href="tel:0800723253" style={{ color: 'var(--color-accent)', fontWeight: 600 }}>0800 723 253</a>
            </p>
          </div>
        )}

        {error && <div className="error-msg" style={{ marginBottom: 16 }}>{error}</div>}

        <button
          className="btn btn--primary"
          onClick={handleAgree}
          disabled={loading || !canSubmit}
        >
          {loading ? 'Saving…' : 'I Agree — Continue'}
        </button>
      </div>

      {/* Bottom sheets */}
      <BottomSheet open={sheet === 'privacy'} onClose={() => setSheet(null)}>
        <PrivacyPolicyScreen embedded />
      </BottomSheet>
      <BottomSheet open={sheet === 'terms'} onClose={() => setSheet(null)}>
        <TermsScreen embedded />
      </BottomSheet>
    </>
  );
}
