// Phase 37: therapist_referrals and therapist_interests tables are being replaced
// by the full therapist booking system. This tab will be repurposed as
// TherapyMarketplaceTab once Phase 37 migrations and backend routes are in place.

export default function ReferralsTab() {
  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <p style={s.heading}>Referrals tab decommissioned</p>
        <p style={s.body}>
          The old referral system has been replaced by the Therapist Marketplace.
          Bookings, disputes, payouts, and therapist verification will appear in the
          Therapy tab once Phase 37 is complete.
        </p>
      </div>
    </div>
  );
}

const s = {
  wrap: {
    padding: '40px 32px',
  },
  card: {
    background: '#fff',
    border: '1px solid #E5DDD5',
    borderRadius: 10,
    padding: '28px 32px',
    maxWidth: 520,
  },
  heading: {
    fontSize: 15,
    fontWeight: 600,
    color: '#2F2622',
    marginBottom: 10,
  },
  body: {
    fontSize: 14,
    color: '#6B4F3A',
    lineHeight: 1.6,
  },
};
