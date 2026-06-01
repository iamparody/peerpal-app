import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';

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

const Badge = ({ children, color = 'var(--color-calm)' }) => (
  <span style={{ display: 'inline-block', background: `${color}22`, border: `1px solid ${color}55`, borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600, color, marginLeft: 8 }}>
    {children}
  </span>
);

export default function DataComplianceScreen() {
  const navigate = useNavigate();

  return (
    <div
      className="screen screen--no-nav"
      style={{ background: 'var(--color-bg-deep)', minHeight: '100dvh', overflowY: 'auto' }}
    >
      <div style={{ position: 'sticky', top: 0, background: 'var(--color-bg-deep)', zIndex: 10, padding: '16px 20px 12px', borderBottom: '1px solid rgba(245,237,228,0.1)' }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', color: '#F5EDE4', fontSize: 24, cursor: 'pointer', padding: 0, lineHeight: 1 }}
          aria-label="Back"
        >‹</button>
        <span style={{ color: '#F5EDE4', fontSize: 17, fontWeight: 700, marginLeft: 12 }}>Data Compliance</span>
      </div>

      <div style={{ padding: '24px 20px 48px' }}>
        <p style={{ fontSize: 12, color: 'rgba(245,237,228,0.4)', marginBottom: 28 }}>
          Last reviewed: May 1, 2026
        </p>

        <SECTION title="Kenya Data Protection Act 2019 — Compliance Statement">
          <P>Melah operates in compliance with the Kenya Data Protection Act 2019 (DPA). We process personal data lawfully, fairly, and transparently, collecting only what is necessary for the service we provide.</P>
          <P>
            ODPC Registration status:
            <Badge color="var(--color-warning)">Registration pending — filed [date]</Badge>
          </P>
        </SECTION>

        <SECTION title="Sensitive Personal Data">
          <P>Mental health data — including mood entries, journal content, AI interaction history, and peer session activity — is classified as <strong style={{ color: '#F5EDE4' }}>sensitive personal data</strong> under Section 2 of the Kenya DPA 2019.</P>
          <P>We apply heightened protections to this category:</P>
          <UL items={[
            'Access is restricted to you and our engineering team for maintenance purposes only.',
            'AI interactions that trigger safety flags are anonymised (user ID removed) before retention.',
            'We do not share mental health data with any third party for commercial or research purposes.',
          ]} />
        </SECTION>

        <SECTION title="Encryption Standards">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'Data in transit', value: 'TLS 1.3', status: 'ACTIVE' },
              { label: 'Safety plan contacts (at rest)', value: 'AES-256', status: 'ACTIVE' },
              { label: 'Therapist referral phone numbers (at rest)', value: 'AES-256', status: 'ACTIVE' },
              { label: 'Passwords', value: 'bcrypt (cost 12)', status: 'ACTIVE' },
              { label: 'Payment data', value: 'Handled by Paystack (PCI-DSS L1)', status: 'DELEGATED' },
            ].map(({ label, value, status }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'rgba(245,237,228,0.05)', borderRadius: 8 }}>
                <div>
                  <div style={{ fontSize: 13, color: '#F5EDE4', fontWeight: 500 }}>{label}</div>
                  <div style={{ fontSize: 12, color: 'rgba(245,237,228,0.5)', marginTop: 2 }}>{value}</div>
                </div>
                <Badge color={status === 'ACTIVE' ? 'var(--color-calm)' : 'var(--color-accent)'}>{status}</Badge>
              </div>
            ))}
          </div>
        </SECTION>

        <SECTION title="Breach Notification">
          <P>In the event of a confirmed personal data breach, we will:</P>
          <UL items={[
            'Notify affected users in-app within 72 hours of confirmed discovery.',
            'Notify the ODPC as required under the DPA.',
            'Document the nature, scope, and remediation of the breach.',
          ]} />
          <P>To report a suspected breach: <span style={{ color: 'var(--color-accent)' }}>antonykkiriinya@gmail.com</span></P>
        </SECTION>

        <SECTION title="Data Protection Officer">
          <P>Our designated Data Protection Officer is contactable at:</P>
          <P style={{ color: 'var(--color-accent)' }}>antonykkiriinya@gmail.com</P>
          <P>The DPO handles access requests, correction requests, and complaints regarding personal data processing.</P>
        </SECTION>

        <SECTION title="Your Rights">
          <P>Under the Kenya DPA 2019, you have the right to access, correct, and delete your personal data. These rights are exercisable in-app (Profile → Delete My Data) or by contacting us directly.</P>
          <P>You may also lodge a complaint with the ODPC at <span style={{ color: 'var(--color-accent)' }}>www.odpc.go.ke</span>.</P>
        </SECTION>

        <div style={{ marginTop: 32, padding: '16px', background: 'rgba(194,164,138,0.08)', borderRadius: 12, border: '1px solid rgba(194,164,138,0.2)' }}>
          <p style={{ fontSize: 13, color: 'rgba(245,237,228,0.7)', marginBottom: 8 }}>For full details on data collection, retention, and third-party processors:</p>
          <Link
            to="/privacy-policy"
            style={{ color: 'var(--color-accent)', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}
          >
            Read the full Privacy Policy →
          </Link>
        </div>

        <div style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid rgba(245,237,228,0.10)', textAlign: 'center', fontSize: 12, color: 'rgba(245,237,228,0.35)' }}>
          <div>© 2025 Melah. All rights reserved.</div>
          <div style={{ marginTop: 4 }}>Melah is not a medical service.</div>
        </div>
      </div>
    </div>
  );
}
