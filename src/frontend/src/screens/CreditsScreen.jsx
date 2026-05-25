import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Coin, CheckCircle, X } from '@phosphor-icons/react';
import client from '../api/client';

const PACKAGES = [
  { id: 'standard', label: 'Standard', price: 100, credits: 7,  desc: 'Most popular' },
  { id: 'plus',     label: 'Plus',     price: 250, credits: 15, desc: 'Best value' },
  { id: 'premium',  label: 'Premium',  price: 500, credits: 40, desc: 'Power user' },
];

function txLabel(tx) {
  if (tx.type === 'purchase') return 'Top up';
  if (tx.type === 'bonus') return tx.session_id ? 'Session reward' : 'Welcome bonus';
  if (tx.type === 'refund') {
    if (tx.channel === 'text' || tx.channel === 'voice') return 'Refund — no peer available';
    if (tx.channel === 'referral') return 'Refund — referral not arranged';
    return 'Refund';
  }
  if (tx.type === 'peer_earning') return 'Earned from peer support';
  if (tx.type === 'debit') {
    if (tx.channel === 'text') return 'Peer text session';
    if (tx.channel === 'voice') return 'Peer voice call';
    if (tx.channel === 'referral') return 'Therapist referral';
    if (tx.channel === 'ai') return 'AI session';
    return 'Session';
  }
  return tx.type;
}

function txDetail(tx) {
  if (tx.duration_minutes != null && tx.duration_minutes > 0) {
    return `${tx.duration_minutes} min`;
  }
  return null;
}

function PhoneModal({ pkg, onConfirm, onClose, submitting, error }) {
  const [phone, setPhone] = useState('');
  const [phoneErr, setPhoneErr] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 12) {
      setPhoneErr('Enter a valid Safaricom number e.g. 0712 345 678');
      return;
    }
    setPhoneErr('');
    onConfirm(phone);
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'flex-end',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: '100%', background: 'var(--color-surface-card)',
        borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
        padding: '24px 20px 32px',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>M-Pesa Payment</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>
              {pkg.credits} credits · KSh {pkg.price}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
              Safaricom phone number
            </label>
            <input
              type="tel"
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="07XX XXX XXX"
              inputMode="numeric"
              autoFocus
              style={{ width: '100%' }}
            />
            {phoneErr && (
              <p style={{ fontSize: 12, color: 'var(--color-danger)', marginTop: 4 }}>{phoneErr}</p>
            )}
            {error && (
              <p style={{ fontSize: 12, color: 'var(--color-danger)', marginTop: 4 }}>{error}</p>
            )}
          </div>

          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            You'll receive an M-Pesa prompt on this number. Enter your PIN to complete the payment.
            Your number is used only for this transaction and is not stored.
          </p>

          <button
            type="submit"
            className="btn btn--primary"
            disabled={submitting || !phone.trim()}
          >
            {submitting ? 'Sending prompt…' : 'Send M-Pesa Prompt'}
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
        </form>
      </div>
    </div>
  );
}

export default function CreditsScreen() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [pendingPkg, setPendingPkg] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');
  const [purchaseMessage, setPurchaseMessage] = useState('');

  const { data: balanceData } = useQuery({
    queryKey: ['credits', 'balance'],
    queryFn: () => client.get('/api/credits/balance').then(r => r.data),
  });
  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ['credits', 'transactions'],
    queryFn: () => client.get('/api/credits/transactions').then(r => r.data),
  });

  const balance = balanceData?.balance ?? null;
  const balanceLow = balance !== null && balance <= 2;
  const transactions = txData?.transactions ?? (Array.isArray(txData) ? txData : []);

  async function handleConfirmPurchase(phone) {
    setModalError('');
    setSubmitting(true);
    try {
      const { data } = await client.post('/api/credits/purchase', {
        package: pendingPkg.id,
        phone,
      });
      if (data.pending) {
        setPendingPkg(null);
        setPurchaseMessage(data.message || 'Check your phone for the M-Pesa prompt.');
        qc.invalidateQueries({ queryKey: ['credits', 'balance'] });
      } else {
        setModalError(data.message || 'Payments coming soon. Please check back or contact support.');
      }
    } catch (err) {
      setModalError(err.response?.data?.error || 'Could not initiate payment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="screen screen--no-nav" style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      {/* Phone modal */}
      {pendingPkg && (
        <PhoneModal
          pkg={pendingPkg}
          onConfirm={handleConfirmPurchase}
          onClose={() => { if (!submitting) { setPendingPkg(null); setModalError(''); } }}
          submitting={submitting}
          error={modalError}
        />
      )}

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '12px 16px', background: 'var(--color-surface-card)',
        borderBottom: '1px solid var(--color-border)', flexShrink: 0,
      }}>
        <button className="page-header__back" onClick={() => navigate(-1)} aria-label="Back">‹</button>
        <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Credits</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
        {purchaseMessage && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'rgba(143,175,154,0.15)', border: '1px solid var(--color-calm)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--color-calm)' }}>
            <CheckCircle size={18} weight="fill" aria-hidden="true" />
            {purchaseMessage}
          </div>
        )}

        {/* Balance */}
        <div className="card" style={{ textAlign: 'center', padding: '28px 24px' }}>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 8 }}>Current balance</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <Coin size={36} weight="duotone" color={balanceLow ? 'var(--color-danger)' : 'var(--color-accent)'} aria-hidden="true" />
            <span style={{ fontSize: 52, fontWeight: 700, color: balanceLow ? 'var(--color-danger)' : 'var(--color-text-primary)', lineHeight: 1 }}>
              {balance ?? '—'}
            </span>
          </div>
          {balanceLow && balance !== null && (
            <p style={{ fontSize: 13, color: 'var(--color-danger)', marginTop: 8 }}>
              Running low — top up to keep using sessions.
            </p>
          )}
          {balance === 0 && (
            <p style={{ fontSize: 13, color: 'var(--color-danger)', marginTop: 4 }}>
              No credits remaining. Sessions are paused until you top up.
            </p>
          )}
        </div>

        {/* Top up */}
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 'var(--space-sm)' }}>
            Top up
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)' }}>
            {PACKAGES.map((pkg) => (
              <button
                key={pkg.id}
                onClick={() => { setPurchaseMessage(''); setModalError(''); setPendingPkg(pkg); }}
                style={{
                  padding: '14px 10px',
                  borderRadius: 'var(--radius-md)',
                  border: '1.5px solid var(--color-border)',
                  background: 'var(--color-surface-card)',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'border-color var(--duration-fast)',
                }}
              >
                <div style={{ fontWeight: 700, color: 'var(--color-accent)', fontSize: 20, marginBottom: 2 }}>
                  {pkg.credits} cr
                </div>
                <div style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 600, marginBottom: 2 }}>KSh {pkg.price}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{pkg.desc}</div>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--color-surface-secondary)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
            <div style={{ fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>How credits work</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span>💬 Peer text chat — <strong>1 credit = 30 min</strong></span>
              <span>🎙️ Peer voice call — <strong>2 credits = 30 min</strong></span>
              <span>⏱️ Extend any session for the same cost per 30 min</span>
              <span>🩺 Therapist referral — <strong>free</strong></span>
            </div>
            <div style={{ marginTop: 6, borderTop: '1px solid var(--color-divider)', paddingTop: 6, color: 'var(--color-text-muted)' }}>
              Always free: AI chat · Journal · Mood check-in · Breathing · Resources · Emergency
            </div>
            <div style={{ marginTop: 4, color: 'var(--color-text-muted)' }}>
              Unused credits from cancelled or expired requests are automatically refunded.
            </div>
          </div>
        </div>

        {/* Transaction history */}
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 'var(--space-sm)' }}>
            History
          </p>
          {txLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[...Array(4)].map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 36, borderRadius: 'var(--radius-sm)' }} />
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', padding: '24px 0' }}>No transactions yet.</p>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {transactions.map((tx, i) => {
                const detail = txDetail(tx);
                const isDebit = tx.type === 'debit';
                return (
                  <div key={tx.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px', fontSize: 13,
                    borderBottom: i < transactions.length - 1 ? '1px solid var(--color-divider)' : 'none',
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{txLabel(tx)}</span>
                      <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                        {detail && <>{detail} · </>}
                        {new Date(tx.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                    <span style={{
                      fontWeight: 700, fontSize: 15,
                      color: isDebit ? 'var(--color-danger)' : 'var(--color-calm)',
                    }}>
                      {isDebit ? '-' : '+'}{tx.amount_credits ?? tx.amount} cr
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
