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

export default function TermsScreen({ embedded = false }) {
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
          <span style={{ color: '#F5EDE4', fontSize: 17, fontWeight: 700, marginLeft: 12 }}>Terms of Service</span>
        </div>
      )}

      <div style={{ padding: '24px 20px 48px' }}>
        <p style={{ fontSize: 12, color: 'rgba(245,237,228,0.4)', marginBottom: 28 }}>
          Effective date: May 1, 2026 · Governing law: Republic of Kenya
        </p>

        <SECTION title="1. Acceptance of Terms">
          <P>By creating an account or using Melah, you agree to these Terms of Service. If you do not agree, do not use the platform.</P>
        </SECTION>

        <SECTION title="2. What Melah Is — And Is Not">
          <P style={{ fontWeight: 600, color: '#F5EDE4' }}>Melah is a peer support and digital wellness platform.</P>
          <P><strong style={{ color: '#F5EDE4' }}>It is NOT a medical service.</strong> It is not a substitute for professional mental health care, psychiatric treatment, or emergency services.</P>
          <P>The AI companion available on this platform is a conversational support tool. <strong style={{ color: '#F5EDE4' }}>It is NOT a therapist, psychiatrist, counsellor, or clinical tool of any kind.</strong> It cannot diagnose conditions, prescribe treatment, or provide medical advice. Responses from the AI companion are not clinical assessments.</P>
          <P>If you are in immediate danger or experiencing a mental health emergency, call 999 (Kenya emergency services) or Befrienders Kenya: 0800 723 253 (free, 24/7).</P>
        </SECTION>

        <SECTION title="3. Eligibility">
          <UL items={[
            'You must be 18 years of age or older to use this platform.',
            'If you are under 18, you may only use Melah with the explicit consent and supervision of a parent or legal guardian.',
            'By creating an account, you confirm you meet the eligibility requirement.',
          ]} />
        </SECTION>

        <SECTION title="4. Account Responsibilities">
          <UL items={[
            'One account per person. Creating multiple accounts is prohibited.',
            'Your alias is system-assigned and non-transferable. You may not share your account with others.',
            'You are responsible for keeping your login credentials secure. We are not liable for unauthorised access resulting from your failure to protect your credentials.',
            'Notify us immediately at antonykkiriinya@gmail.com if you believe your account has been compromised.',
          ]} />
        </SECTION>

        <SECTION title="5. Acceptable Use">
          <P>You agree not to use Melah to:</P>
          <UL items={[
            'Harass, abuse, threaten, or demean other users in groups or peer sessions.',
            'Share personally identifying information (full name, location, phone number, ID) about yourself or others in group chats or peer sessions.',
            'Attempt to extract or identify the real-world identity of other users.',
            'Misuse the Emergency feature for non-emergency purposes.',
            'Use the platform for any commercial, promotional, or business purpose.',
            'Attempt to reverse-engineer, scrape, or interfere with the platform or its AI systems.',
            'Post content that is illegal, hateful, sexually explicit, or incites violence.',
          ]} />
        </SECTION>

        <SECTION title="6. Credits and Payments">
          <UL items={[
            'Credits are purchased in advance and consumed during peer support sessions.',
            'Credits are non-refundable once used in a session.',
            'Unused credits: refund requests for unused credits are considered at our discretion. Contact antonykkiriinya@gmail.com.',
            'All payment processing is handled by Paystack. Their Terms of Service apply to all transactions. We do not process or store card details.',
            'We reserve the right to adjust credit pricing with 30 days\' notice to existing users.',
          ]} />
        </SECTION>

        <SECTION title="7. Content You Post">
          <P>You retain ownership of content you write (journal entries, group messages). By posting in group spaces, you grant Melah a limited licence to display that content to group members.</P>
          <P>We reserve the right to remove content that violates these terms without notice.</P>
        </SECTION>

        <SECTION title="8. Limitation of Liability">
          <P>Melah is provided "as is" without warranties of any kind. To the maximum extent permitted by Kenyan law:</P>
          <UL items={[
            'We are not liable for outcomes or experiences arising from peer support interactions.',
            'We are not liable for the content of AI companion responses.',
            'We are not liable for any harm arising from failure to access emergency services through this app — always call 999 for life-threatening emergencies.',
            'Our total liability to you for any claim shall not exceed the amount you paid for credits in the 30 days before the claim.',
          ]} />
        </SECTION>

        <SECTION title="9. Termination">
          <UL items={[
            'You may delete your account at any time from Profile → Delete My Data.',
            'We may suspend or terminate accounts that violate these Terms, with or without notice.',
            'On termination, your data will be deleted per our Privacy Policy.',
          ]} />
        </SECTION>

        <SECTION title="10. Changes to Terms">
          <P>We will notify you in-app before material changes take effect. Continued use after notification constitutes acceptance.</P>
        </SECTION>

        <SECTION title="11. Governing Law and Disputes">
          <P>These Terms are governed by the laws of the Republic of Kenya. Disputes shall be resolved in the courts of Kenya.</P>
          <P>For informal resolution, contact us first at antonykkiriinya@gmail.com.</P>
        </SECTION>

        <div style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid rgba(245,237,228,0.10)', textAlign: 'center', fontSize: 12, color: 'rgba(245,237,228,0.35)' }}>
          <div>© 2025 Melah. All rights reserved.</div>
          <div style={{ marginTop: 4 }}>Melah is not a medical service.</div>
        </div>
      </div>
    </div>
  );
}
