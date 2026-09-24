import { useNavigate } from 'react-router-dom';

const SECTION = ({ title, children }) => (
  <div style={{ marginBottom: 28 }}>
    <h2 style={{ fontSize: 15, fontWeight: 700, color: '#F5EDE4', marginBottom: 10, letterSpacing: 0.2 }}>{title}</h2>
    <div style={{ fontSize: 14, lineHeight: 1.75, color: 'rgba(245,237,228,0.75)' }}>{children}</div>
  </div>
);

const P = ({ children }) => <p style={{ marginBottom: 8 }}>{children}</p>;
const UL = ({ items }) => (
  <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
    {items.map((item, i) => <li key={i}>{item}</li>)}
  </ul>
);

export default function PrivacyPolicyScreen({ embedded = false }) {
  const navigate = useNavigate();

  return (
    <div
      className={embedded ? undefined : 'screen screen--no-nav'}
      style={{ background: 'var(--color-bg-deep)', minHeight: embedded ? undefined : '100dvh', overflowY: 'auto' }}
    >
      {!embedded && (
        <div style={{ position: 'sticky', top: 0, background: 'var(--color-bg-deep)', zIndex: 10, padding: '16px 20px 12px', borderBottom: '1px solid rgba(245,237,228,0.1)' }}>
          <button
            onClick={() => navigate(-1)}
            style={{ background: 'none', border: 'none', color: '#F5EDE4', fontSize: 24, cursor: 'pointer', padding: 0, lineHeight: 1 }}
            aria-label="Back"
          >‹</button>
          <span style={{ color: '#F5EDE4', fontSize: 17, fontWeight: 700, marginLeft: 12 }}>Privacy Policy</span>
        </div>
      )}

      <div style={{ padding: '24px 20px 48px' }}>
        <p style={{ fontSize: 12, color: 'rgba(245,237,228,0.4)', marginBottom: 28 }}>
          Effective date: May 1, 2026 · Governed by the Kenya Data Protection Act 2019
        </p>

        <SECTION title="1. Who We Are">
          <P>PeerPal is a peer support and digital wellness platform operated by [Your Name / Company Name], Kenya.</P>
          <P>For data protection queries, contact us through the app.</P>
        </SECTION>

        <SECTION title="2. Data We Collect">
          <P>We collect only what is necessary to provide the service:</P>
          <UL items={[
            'Email address — used solely for account recovery. Never displayed publicly. Stored in plain text to allow login lookup; protected by TLS in transit and database-level access controls.',
            'Alias — system-generated anonymous identifier (e.g. "QuietRiver42"). Never chosen by you, never linked to your real identity in any display.',
            'Mood entries — date, mood level (very_low → great), optional tags and notes.',
            'Journal entries — private text you write. Visible only to you.',
            'AI interaction text — your messages to your companion and the companion\'s responses. Entries that trigger a safety flag are anonymised (your user ID is removed and replaced with NULL) but retained for safety pattern analysis. This cannot be opted out of; it is how we protect the community.',
            'Session metadata — type (text/voice/AI), duration, credits used. No call content passes through our servers for voice calls (peer-to-peer via WebRTC).',
            'Device token — FCM push notification token. Used only to deliver in-app notifications. Never shared.',
            'Payment references — Paystack reference numbers for transaction reconciliation. We never see, store, or process your card number or bank details — Paystack handles all card data under their PCI-DSS compliance.',
          ]} />
        </SECTION>

        <SECTION title="3. Why We Collect It">
          <UL items={[
            'To provide your mood analytics, journaling, AI chat, and peer support features.',
            'To send you relevant in-app notifications (new messages, check-in reminders).',
            'To detect and respond to safety concerns (risk classification on journal and AI content).',
            'To credit your account when a Paystack payment is confirmed.',
            'We do NOT sell your data. We do NOT use your data for advertising. We do NOT share it with third parties for commercial purposes.',
          ]} />
        </SECTION>

        <SECTION title="4. Data Retention">
          <UL items={[
            'All personal data is retained until you request deletion.',
            'On deletion: your account and all associated records are permanently purged within 24 hours.',
            'Exception: AI interaction records that triggered a safety flag are retained indefinitely in anonymised form (user_id set to NULL). This is disclosed here and cannot be opted out of.',
            'Payment references may be retained for up to 7 years for financial record-keeping compliance.',
          ]} />
        </SECTION>

        <SECTION title="5. Your Rights Under the Kenya DPA 2019">
          <P>As a data subject, you have the right to:</P>
          <UL items={[
            'Access — request a copy of your personal data.',
            'Rectification — correct inaccurate data held about you.',
            'Erasure — delete your data at any time from Profile → Delete My Data.',
            'Withdraw consent — you may withdraw consent at any time by deleting your account.',
            'Lodge a complaint — with the Office of the Data Protection Commissioner (ODPC) at www.odpc.go.ke.',
          ]} />
          <P>To exercise rights other than erasure (which is self-service in the app), contact us through the app.</P>
        </SECTION>

        <SECTION title="6. Third-Party Services">
          <P>We use the following services to operate the platform:</P>
          <UL items={[
            'Supabase — database hosting (PostgreSQL). Data stored on Supabase-managed infrastructure (AWS, region disclosed in your Supabase project settings). Supabase processes data under their DPA.',
            'Groq — AI language model processing. Your AI conversation inputs are sent to Groq to generate responses. Per Groq\'s policy, inputs are not retained for training. Groq processes data under their privacy policy.',
            'Paystack — payment processing. Handles all card data. We receive only a payment reference number. Paystack is PCI-DSS Level 1 compliant.',
            'Firebase (Google) — push notification delivery via FCM. Your device token is stored and used to route notifications. Governed by Google\'s privacy policy.',
            'WebRTC STUN/TURN servers — used only for NAT traversal in voice peer calls. No call audio content passes through our servers. Peer audio is end-to-end between devices.',
          ]} />
        </SECTION>

        <SECTION title="7. Security">
          <P>We apply the following protections:</P>
          <UL items={[
            'All data in transit: TLS 1.3 encryption.',
            'Sensitive fields at rest: AES-256 encryption (safety plan contacts, therapy session tokens).',
            'Passwords: bcrypt hashed with cost factor 12. We never store plain-text passwords.',
            'Access: authenticated via signed JWT tokens with blacklisting on logout.',
          ]} />
        </SECTION>

        <SECTION title="8. Changes to This Policy">
          <P>We will notify you in-app before any material change to this policy takes effect. Continued use after notification constitutes acceptance.</P>
        </SECTION>

        <SECTION title="9. Contact">
          <P>For urgent data breach concerns, we aim to acknowledge within 24 hours. Contact us through the app.</P>
        </SECTION>

        <div style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid rgba(245,237,228,0.10)', textAlign: 'center', fontSize: 12, color: 'rgba(245,237,228,0.35)' }}>
          <div>© {new Date().getFullYear()} PeerPal. All rights reserved.</div>
          <div style={{ marginTop: 4 }}>PeerPal is not a medical service.</div>
        </div>
      </div>
    </div>
  );
}
