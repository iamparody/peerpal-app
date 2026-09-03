import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Coin, CheckCircle, X, Leaf, Heart, Mountains } from '@phosphor-icons/react';
import client from '../api/client';

const PACKAGES = [
  {
    id: 'standard',
    name: 'Just for now',
    tagline: 'Take it one day at a time',
    price: 150,
    credits: 10,
    aiConversations: 4,
    Icon: Leaf,
    highlight: false,
    iconColor: '#C2A48A',
    iconBg: 'rgba(194,164,138,0.14)',
    cardBg: 'rgba(255,255,255,0.55)',
    border: '1px solid rgba(75,58,47,0.11)',
    shadow: '0 4px 24px rgba(47,38,34,0.07), 0 1px 4px rgba(47,38,34,0.04)',
    priceColor: 'var(--color-text-primary)',
  },
  {
    id: 'plus',
    name: "I'm committed",
    tagline: "You're showing up for yourself",
    price: 300,
    credits: 25,
    aiConversations: 10,
    Icon: Heart,
    highlight: true,
    iconColor: '#8FAF9A',
    iconBg: 'rgba(143,175,154,0.2)',
    cardBg: 'rgba(143,175,154,0.09)',
    border: '1.5px solid rgba(143,175,154,0.42)',
    shadow: '0 8px 36px rgba(143,175,154,0.18), 0 2px 8px rgba(47,38,34,0.06)',
    priceColor: '#6B9A7A',
  },
  {
    id: 'premium',
    name: 'All of me',
    tagline: 'Full support, nothing held back',
    price: 500,
    credits: 50,
    aiConversations: 20,
    Icon: Mountains,
    highlight: false,
    iconColor: '#C2A48A',
    iconBg: 'rgba(194,164,138,0.14)',
    cardBg: 'rgba(255,255,255,0.55)',
    border: '1px solid rgba(75,58,47,0.11)',
    shadow: '0 4px 24px rgba(47,38,34,0.07), 0 1px 4px rgba(47,38,34,0.04)',
    priceColor: 'var(--color-text-primary)',
  },
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
  const [digits, setDigits] = useState('');
  const [phoneErr, setPhoneErr] = useState('');

  function handleChange(e) {
    // Only allow digits, max 9 (the part after +254)
    const val = e.target.value.replace(/\D/g, '').slice(0, 9);
    setDigits(val);
    setPhoneErr('');
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (digits.length !== 9) {
      setPhoneErr('Enter 9 digits after +254 (e.g. 712 345 678 or 110 123 456)');
      return;
    }
    setPhoneErr('');
    onConfirm(`254${digits}`);
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: '100%',
        maxWidth: 480,
        background: 'var(--color-surface-card)',
        borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10 }}>
          <div style={{ width: 32, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
        </div>

        <div style={{ padding: '16px 20px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{pkg.name}</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>
                {pkg.credits} peer credits · {pkg.aiConversations} AI sessions · KSh {pkg.price}
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

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Phone input */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8, color: 'var(--color-text-secondary)' }}>
                Safaricom number
              </label>
              <div style={{
                display: 'flex', alignItems: 'center',
                border: '1.5px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                background: 'var(--color-bg-deep)',
              }}>
                <span style={{
                  padding: '12px 14px', fontSize: 15, fontWeight: 600,
                  color: 'var(--color-text-secondary)',
                  borderRight: '1px solid var(--color-border)',
                  flexShrink: 0,
                }}>
                  +254
                </span>
                <input
                  type="tel"
                  value={digits}
                  onChange={handleChange}
                  placeholder="7XX XXX XXX"
                  inputMode="numeric"
                  autoFocus
                  style={{
                    flex: 1, border: 'none', outline: 'none',
                    padding: '12px 14px', fontSize: 15,
                    background: 'transparent', color: 'var(--color-text-primary)',
                    letterSpacing: 0.5,
                  }}
                />
              </div>
              {(phoneErr || error) && (
                <p style={{ fontSize: 12, color: 'var(--color-danger)', marginTop: 6 }}>
                  {phoneErr || error}
                </p>
              )}
            </div>

            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6, margin: 0 }}>
              You'll receive an M-Pesa prompt on this number. Enter your PIN to complete the payment.
            </p>

            <button
              type="submit"
              className="btn btn--primary"
              disabled={submitting || digits.length !== 9}
            >
              {submitting ? 'Sending prompt…' : 'Pay KSh ' + pkg.price}
            </button>
          </form>
        </div>
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
  const [showAllTx, setShowAllTx] = useState(false);
  const [showHowCredits, setShowHowCredits] = useState(false);

  const { data: balanceData } = useQuery({
    queryKey: ['credits', 'balance'],
    queryFn: () => client.get('/api/credits/balance').then(r => r.data),
  });
  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ['credits', 'transactions'],
    queryFn: () => client.get('/api/credits/transactions').then(r => r.data),
  });

  const balance = balanceData?.balance ?? null;
  const balanceLow = balance !== null && balance > 0 && balance <= 2;
  const balanceEmpty = balance === 0;
  const aiUsed = balanceData?.ai_conversations_used ?? 0;
  const aiCap  = balanceData?.ai_conversations_cap  ?? 0;
  const aiLeft = Math.max(0, aiCap - aiUsed);
  const transactions = txData?.transactions ?? (Array.isArray(txData) ? txData : []);
  const TX_PREVIEW = 4;
  const visibleTx = showAllTx ? transactions : transactions.slice(0, TX_PREVIEW);

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
    <div className="screen screen--no-nav">
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

      {/* Sticky header — sits at top while body scrolls */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '12px 16px', background: 'var(--color-bg-primary)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <button className="page-header__back" onClick={() => navigate(-1)} aria-label="Back">‹</button>
        <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Credits</span>
      </div>

      {/* Page content — naturally scrolls with the body */}
      <div style={{ padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)', paddingBottom: 40 }}>
        {purchaseMessage && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'rgba(143,175,154,0.15)', border: '1px solid var(--color-calm)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--color-calm)' }}>
            <CheckCircle size={18} weight="fill" aria-hidden="true" />
            {purchaseMessage}
          </div>
        )}

        {/* Balance card — compact flex column so coin/label/number stack cleanly */}
        <div className="card" style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 4, padding: '20px 20px 16px', textAlign: 'center',
        }}>
          <Coin
            size={28} weight="duotone"
            color={balanceEmpty ? 'var(--color-danger)' : balanceLow ? 'var(--color-warning)' : 'var(--color-accent)'}
            aria-hidden="true"
          />
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>
            Current balance
          </div>
          <div style={{
            fontSize: 52, fontWeight: 800, lineHeight: 1.1,
            color: balanceEmpty ? 'var(--color-danger)' : balanceLow ? 'var(--color-warning)' : 'var(--color-text-primary)',
          }}>
            {balance ?? '—'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>peer credits</div>
          {aiCap > 0 && (
            <div style={{ marginTop: 10, fontSize: 12, color: aiLeft > 0 ? 'var(--color-calm)' : 'var(--color-text-muted)' }}>
              {aiLeft > 0 ? `${aiLeft} AI conversation${aiLeft !== 1 ? 's' : ''} left` : 'AI conversations used up'}
            </div>
          )}
          {balanceEmpty ? (
            <p style={{ fontSize: 13, color: 'var(--color-danger)', marginTop: 8, lineHeight: 1.5 }}>
              No credits remaining. Top up to resume sessions.
            </p>
          ) : balanceLow ? (
            <p style={{ fontSize: 13, color: 'var(--color-warning)', marginTop: 8, lineHeight: 1.5 }}>
              Running low — top up to keep using sessions.
            </p>
          ) : null}
        </div>

        {/* Headline */}
        <div>
          <p style={{ fontFamily: 'var(--font-editorial)', fontSize: '1.15rem', fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1.4, margin: 0 }}>
            Everyone can get help. Everyone who can, helps keep it available.
          </p>
        </div>

        {/* Top up */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {PACKAGES.map((pkg) => (
            <button
              key={pkg.id}
              onClick={() => { setPurchaseMessage(''); setModalError(''); setPendingPkg(pkg); }}
              style={{
                width: '100%',
                padding: '18px 20px',
                borderRadius: 'var(--radius-md)',
                border: pkg.border,
                background: pkg.cardBg,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                boxShadow: pkg.shadow,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                transform: pkg.highlight ? 'scale(1.015)' : 'scale(1)',
                transition: 'transform 180ms ease, box-shadow 180ms ease',
              }}
            >
              <div style={{
                width: 46, height: 46,
                borderRadius: 13,
                background: pkg.iconBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <pkg.Icon size={22} weight="duotone" color={pkg.iconColor} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: 'var(--font-editorial)',
                  fontWeight: 600,
                  fontSize: '1rem',
                  color: 'var(--color-text-primary)',
                  marginBottom: 3,
                }}>
                  {pkg.name}
                </div>
                <div style={{
                  fontSize: '0.78rem',
                  color: 'var(--color-text-muted)',
                  lineHeight: 1.4,
                }}>
                  {pkg.tagline}
                </div>
              </div>

              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{
                  fontWeight: 800,
                  fontSize: '1.05rem',
                  color: pkg.priceColor,
                  letterSpacing: '-0.01em',
                }}>
                  KSh {pkg.price}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                  {pkg.credits} cr · {pkg.aiConversations} AI
                </div>
              </div>
            </button>
          ))}

          {/* How credits work — collapsible */}
          <div style={{ marginTop: 8, borderRadius: 'var(--radius-md)', border: '1px solid rgba(194,164,138,0.14)', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setShowHowCredits(s => !s)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', background: 'rgba(194,164,138,0.06)',
                border: 'none', cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                How credits work
              </span>
              <span style={{ fontSize: 14, color: 'var(--color-text-muted)', transition: 'transform 0.2s', display: 'inline-block', transform: showHowCredits ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                ›
              </span>
            </button>
            {showHowCredits && (
              <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8, background: 'rgba(194,164,138,0.03)' }}>
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6, margin: 0 }}>
                  One free AI session every week. Top up for peer sessions, voice calls, and more AI conversations.
                </p>
                <div style={{ borderTop: '1px solid var(--color-divider)', paddingTop: 8 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-calm)', marginBottom: 4 }}>Always free</p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                    1 AI session every 7 days — no top-up needed<br />
                    Crisis support, breathing exercises &amp; articles — free forever
                  </p>
                </div>
                <div style={{ borderTop: '1px solid var(--color-divider)', paddingTop: 8 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Using peer credits</p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.8 }}>
                    1 credit — Peer support (text, 30 min)<br />
                    2 credits — Peer voice call (30 min)<br />
                    1 credit — Therapist referral
                  </p>
                </div>
                <div style={{ borderTop: '1px solid var(--color-divider)', paddingTop: 8 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>AI conversations</p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                    Each bundle includes AI sessions (4, 10, or 20)<br />
                    Buying a new bundle adds to your remaining pool<br />
                    AI sessions don't deduct from peer credits
                  </p>
                </div>
                <div style={{ borderTop: '1px solid var(--color-divider)', paddingTop: 8 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Good to know</p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                    2 welcome credits on sign-up<br />
                    Credits don't expire<br />
                    Unused credits refunded if no peer is available
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Transaction history — shows up to 4 entries, paginated */}
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
            <>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {visibleTx.map((tx, i) => {
                  const detail = txDetail(tx);
                  const isDebit = tx.type === 'debit';
                  return (
                    <div key={tx.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 14px', fontSize: 13,
                      borderBottom: i < visibleTx.length - 1 ? '1px solid var(--color-divider)' : 'none',
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: 1, marginRight: 12 }}>
                        <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{txLabel(tx)}</span>
                        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                          {detail && <>{detail} · </>}
                          {new Date(tx.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                      <span style={{
                        fontWeight: 700, fontSize: 15, flexShrink: 0,
                        color: isDebit ? 'var(--color-danger)' : 'var(--color-calm)',
                      }}>
                        {isDebit ? '−' : '+'}{tx.amount_credits ?? tx.amount} cr
                      </span>
                    </div>
                  );
                })}
              </div>
              {transactions.length > TX_PREVIEW && (
                <button
                  onClick={() => setShowAllTx(s => !s)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 13, color: 'var(--color-accent)', fontWeight: 600,
                    padding: '10px 0', width: '100%', textAlign: 'center',
                  }}
                >
                  {showAllTx ? 'Show less' : `Show all ${transactions.length} transactions`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
