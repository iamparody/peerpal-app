import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Coin } from '@phosphor-icons/react';
import client from '../api/client';

const PACKAGES = [
  { id: 'starter',  label: 'Starter',  price: 50,  credits: 3,  desc: 'Try it out' },
  { id: 'standard', label: 'Standard', price: 100, credits: 7,  desc: 'Most popular' },
  { id: 'plus',     label: 'Plus',     price: 200, credits: 15, desc: 'Best value' },
  { id: 'support',  label: 'Support',  price: 500, credits: 40, desc: 'Power user' },
];

function txLabel(type) {
  switch (type) {
    case 'purchase':  return 'Top up';
    case 'debit':     return 'Session';
    case 'bonus':     return 'Bonus';
    case 'refund':    return 'Refund';
    default:          return type;
  }
}

export default function CreditsScreen() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [purchasing, setPurchasing] = useState(null);
  const [error, setError] = useState('');

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

  async function handlePurchase(pkg) {
    setError('');
    setPurchasing(pkg.id);
    try {
      const { data } = await client.post('/api/credits/purchase', { package: pkg.id });
      if (data.payment_url) {
        window.location.href = data.payment_url;
      } else {
        // Paystack not yet live — show placeholder message
        setError('Payments coming soon. Please check back or contact support.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Your payment didn\'t go through. Please try a different method.');
    } finally {
      setPurchasing(null);
    }
  }

  return (
    <div className="screen screen--no-nav" style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
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
        {error && <div className="error-msg">{error}</div>}

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
            {PACKAGES.map((pkg) => {
              const active = purchasing === pkg.id;
              return (
                <button
                  key={pkg.id}
                  onClick={() => handlePurchase(pkg)}
                  disabled={!!purchasing}
                  style={{
                    padding: '14px 10px',
                    borderRadius: 'var(--radius-md)',
                    border: `1.5px solid ${active ? 'var(--color-calm)' : 'var(--color-border)'}`,
                    background: active ? 'rgba(143,175,154,0.1)' : 'var(--color-surface-card)',
                    cursor: purchasing ? 'not-allowed' : 'pointer',
                    textAlign: 'center',
                    opacity: purchasing && !active ? 0.5 : 1,
                    transition: 'opacity var(--duration-fast), border-color var(--duration-fast)',
                  }}
                >
                  <div style={{ fontWeight: 700, color: active ? 'var(--color-calm)' : 'var(--color-accent)', fontSize: 20, marginBottom: 2 }}>
                    {active ? '…' : `${pkg.credits} cr`}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 600, marginBottom: 2 }}>KSh {pkg.price}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{pkg.desc}</div>
                </button>
              );
            })}
          </div>
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 10, textAlign: 'center' }}>
            1 credit = 1 AI session · 2 credits = 1 peer or therapist session
          </p>
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
              {transactions.map((tx, i) => (
                <div key={tx.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px', fontSize: 13,
                  borderBottom: i < transactions.length - 1 ? '1px solid var(--color-divider)' : 'none',
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{txLabel(tx.type)}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                      {new Date(tx.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  <span style={{
                    fontWeight: 700, fontSize: 15,
                    color: tx.type === 'debit' ? 'var(--color-danger)' : 'var(--color-calm)',
                  }}>
                    {tx.type === 'debit' ? '-' : '+'}{tx.amount_credits ?? tx.amount} cr
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
