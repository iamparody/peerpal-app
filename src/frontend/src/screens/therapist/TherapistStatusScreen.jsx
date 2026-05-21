import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';

const STATUS_STEPS = ['pending', 'in_review', 'arranged', 'closed'];

const STATUS_COPY = {
  pending:   { label: 'Request received',    sub: 'We're reviewing your preferences.' },
  in_review: { label: 'Under review',        sub: 'Our team is finding the right fit.' },
  arranged:  { label: 'Match in progress',   sub: 'Someone will reach out via message.' },
  escalated: { label: 'Needs attention',     sub: 'Our team has flagged this for follow-up.' },
  closed:    { label: 'Closed',              sub: 'This request has been completed.' },
};

export default function TherapistStatusScreen() {
  const navigate     = useNavigate();
  const [referrals,  setReferrals]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [visible,    setVisible]    = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await client.get('/api/referrals/my');
        setReferrals(data.referrals || []);
      } catch { /* empty */ }
      finally {
        setLoading(false);
        setTimeout(() => setVisible(true), 80);
      }
    }
    load();
  }, []);

  const latest = referrals[0];
  const hasOpen = latest && !['closed'].includes(latest.status);

  if (loading) return (
    <div style={s.screen}>
      <div style={s.loading}>
        <div className="skeleton" style={{ width: 200, height: 20, borderRadius: 8, marginBottom: 12 }} />
        <div className="skeleton" style={{ width: 300, height: 14, borderRadius: 8 }} />
      </div>
    </div>
  );

  return (
    <div style={s.screen}>
      <div style={{ ...s.content, opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(8px)' }}>

        {/* Back */}
        <button style={s.back} onClick={() => navigate('/dashboard')}>← Home</button>

        <h1 style={s.heading}>Your therapist request</h1>

        {!latest ? (
          <div style={s.empty}>
            <p style={s.emptyText}>You haven't submitted a request yet.</p>
            <button style={s.newBtn} onClick={() => navigate('/therapists')}>
              Find a therapist
            </button>
          </div>
        ) : (
          <>
            {/* Status timeline */}
            <div style={s.timeline}>
              {STATUS_STEPS.map((step, i) => {
                const isActive  = latest.status === step;
                const isPast    = STATUS_STEPS.indexOf(latest.status) > i;
                const isCurrent = isActive;
                return (
                  <div key={step} style={s.timelineRow}>
                    <div style={s.timelineLeft}>
                      <div style={{
                        ...s.timelineDot,
                        background: (isPast || isCurrent) ? 'var(--color-calm)' : 'var(--color-border)',
                        borderColor: isCurrent ? 'var(--color-calm)' : 'transparent',
                        boxShadow: isCurrent ? '0 0 0 3px var(--color-calm-bg)' : 'none',
                      }} />
                      {i < STATUS_STEPS.length - 1 && (
                        <div style={{
                          ...s.timelineLine,
                          background: isPast ? 'var(--color-calm)' : 'var(--color-border)',
                        }} />
                      )}
                    </div>
                    <div style={s.timelineBody}>
                      <p style={{
                        ...s.timelineLabel,
                        color: isCurrent ? 'var(--color-text-primary)' : isPast ? 'var(--color-calm)' : 'var(--color-text-muted)',
                        fontWeight: isCurrent ? 600 : 400,
                      }}>
                        {STATUS_COPY[step]?.label || step}
                      </p>
                      {isCurrent && (
                        <p style={s.timelineSub}>{STATUS_COPY[step]?.sub}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* What you shared */}
            <div style={s.card}>
              <p style={s.cardLabel}>What you shared</p>
              <p style={s.cardText}>{latest.struggles}</p>

              {/* Expressed interests */}
              {latest.interests?.length > 0 && (
                <>
                  <div style={s.divider} />
                  <p style={s.cardLabel}>Therapists you expressed interest in</p>
                  <div style={s.interestRow}>
                    {latest.interests.map((interest) => (
                      <div key={interest.id} style={s.interestChip}>
                        <div style={s.interestAvatar}>
                          {interest.photo_url
                            ? <img src={interest.photo_url} alt={interest.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <span style={s.interestInitial}>{interest.display_name.charAt(0)}</span>
                          }
                        </div>
                        <span style={s.interestName}>{interest.display_name.split(' ')[0]}</span>
                        {interest.status === 'matched' && (
                          <span style={s.matchedTag}>Matched</span>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Re-match path */}
            {!hasOpen && (
              <button style={s.rematchBtn} onClick={() => navigate('/therapists')}>
                Request a different match
              </button>
            )}

            {/* All past referrals */}
            {referrals.length > 1 && (
              <div style={s.pastSection}>
                <p style={s.pastLabel}>Previous requests</p>
                {referrals.slice(1).map((r) => (
                  <div key={r.id} style={s.pastRow}>
                    <span style={s.pastDate}>{new Date(r.created_at).toLocaleDateString('en-KE', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    <span style={{ ...s.pastStatus, color: r.status === 'closed' ? 'var(--color-text-muted)' : 'var(--color-calm)' }}>
                      {STATUS_COPY[r.status]?.label || r.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const s = {
  screen: {
    minHeight: '100vh',
    background: 'var(--color-bg-primary)',
    padding: '0 20px 48px',
  },
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: 100,
  },
  content: {
    paddingTop: 56,
    transition: 'opacity 450ms var(--easing-out), transform 450ms var(--easing-out)',
  },
  back: {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-secondary)',
    fontSize: 14,
    cursor: 'pointer',
    padding: '0 0 20px 0',
    display: 'block',
  },
  heading: {
    fontSize: 24,
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    marginBottom: 28,
  },
  timeline: {
    marginBottom: 24,
  },
  timelineRow: {
    display: 'flex',
    gap: 14,
    minHeight: 52,
  },
  timelineLeft: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: 16,
    flexShrink: 0,
  },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: '50%',
    border: '2.5px solid transparent',
    transition: 'background 300ms ease, box-shadow 300ms ease',
    flexShrink: 0,
    marginTop: 3,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    margin: '3px 0',
    transition: 'background 300ms ease',
    borderRadius: 1,
  },
  timelineBody: {
    paddingBottom: 16,
    flex: 1,
  },
  timelineLabel: {
    fontSize: 14,
    lineHeight: 1.4,
    transition: 'color 300ms ease',
  },
  timelineSub: {
    fontSize: 13,
    color: 'var(--color-text-muted)',
    marginTop: 4,
    lineHeight: 1.5,
  },
  card: {
    background: 'var(--color-surface-card)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-lg)',
    padding: '18px 18px',
    marginBottom: 20,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    color: 'var(--color-text-secondary)',
    marginBottom: 8,
  },
  cardText: {
    fontSize: 14,
    lineHeight: 1.65,
    color: 'var(--color-text-primary)',
    fontFamily: 'Lora, Georgia, serif',
  },
  divider: {
    height: 1,
    background: 'var(--color-border)',
    margin: '14px 0',
  },
  interestRow: {
    display: 'flex',
    gap: 16,
    flexWrap: 'wrap',
  },
  interestChip: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  interestAvatar: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    background: 'var(--color-surface-secondary)',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '2px solid var(--color-border)',
  },
  interestInitial: {
    fontSize: 18,
    fontWeight: 600,
    color: 'var(--color-text-dark)',
    fontFamily: 'Lora, Georgia, serif',
  },
  interestName: {
    fontSize: 11,
    color: 'var(--color-text-secondary)',
  },
  matchedTag: {
    fontSize: 10,
    background: 'var(--color-calm-bg)',
    color: 'var(--color-calm)',
    borderRadius: 'var(--radius-pill)',
    padding: '2px 8px',
    fontWeight: 600,
  },
  rematchBtn: {
    width: '100%',
    height: 48,
    background: 'none',
    border: '1.5px solid var(--color-border-focus)',
    borderRadius: 'var(--radius-pill)',
    fontSize: 15,
    fontWeight: 500,
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    marginBottom: 24,
  },
  empty: {
    textAlign: 'center',
    paddingTop: 40,
  },
  emptyText: {
    fontSize: 15,
    color: 'var(--color-text-muted)',
    marginBottom: 20,
  },
  newBtn: {
    background: 'var(--color-accent)',
    border: 'none',
    borderRadius: 'var(--radius-pill)',
    padding: '12px 28px',
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--color-text-dark)',
    cursor: 'pointer',
  },
  pastSection: {
    marginTop: 8,
  },
  pastLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    color: 'var(--color-text-secondary)',
    marginBottom: 10,
  },
  pastRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderTop: '1px solid var(--color-border)',
  },
  pastDate: {
    fontSize: 13,
    color: 'var(--color-text-muted)',
  },
  pastStatus: {
    fontSize: 13,
    fontWeight: 500,
  },
};
