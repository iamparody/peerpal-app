# Legal, Compliance & Certifications — PeerPal Therapist Marketplace

> Last updated: 2026-09-24
> Scope: Covers the therapist marketplace module (Phase 37) and platform-wide obligations
> Owner: Platform admin / legal lead
> Review cycle: Every 6 months or on any regulatory change

---

## 1. Governing Laws & Regulations

| Law / Regulation | Relevance | Status |
|---|---|---|
| **Kenya Data Protection Act 2019** | Governs collection, storage, processing of personal and sensitive health data for all users and therapists | Required before launch |
| **Kenya Digital Health Act 2023** | Establishes framework for e-health platforms; covers teletherapy, consent, data localization | Required before launch |
| **Mental Health (Amendment) Act 2022** | Governs mental health service delivery in Kenya; therapist scope of practice, patient rights, consent | Required before launch |
| **Medical Practitioners and Dentists Act (Cap 253)** | KMPDC licensing for clinical psychologists practicing on platform | Required for each therapist |
| **KCPA Code of Ethics** | Ethical guidelines for counsellors and psychologists; covers confidentiality, dual relationships, teletherapy standards | Required for each therapist |
| **Occupational Safety & Health Act** | Relevant if pursuing employer/B2B packages (employee mental health obligations) | If/when B2B tier launches |
| **Consumer Protection Act 2012** | Governs refund policies, cancellation terms, payment disputes | Required before launch |

---

## 2. Platform-Level Certifications & Registrations

### 2.1 Office of the Data Protection Commissioner (ODPC)
- **What**: Register as a data controller and data processor under Kenya DPA 2019
- **Who registers**: PeerPal as a company
- **Deadline**: Before collecting any user data commercially (already operating — register immediately if not done)
- **Link**: [ODPC Registration](https://www.odpc.go.ke)
- **Cost**: KES 5,000 (individual) / KES 10,000 (organisation) annual fee
- **Action required**: File Form DP/DC/01 (Data Controller) and Form DP/DP/02 (Data Processor)

### 2.2 Kenya Revenue Authority (KRA)
- **What**: Digital marketplace VAT obligations — platforms facilitating services between providers and consumers may be required to collect and remit VAT
- **Applicable**: Once therapist transactions commence
- **Action required**: Confirm with tax advisor whether the 20% platform fee attracts VAT; whether therapist earnings on the platform attract withholding tax obligations

### 2.3 Communications Authority of Kenya (CA)
- **What**: If the platform is classified as an Over-The-Top (OTT) service (video/voice delivered over the internet), CA licensing may apply
- **Status**: Unclear — CA has been expanding OTT regulation scope since 2023
- **Action required**: Legal opinion on whether in-app video therapy sessions fall under OTT licensing requirements

---

## 3. Therapist-Level Verification Requirements

Every therapist onboarded to the platform must satisfy ALL of the following before `is_verified = true`:

### 3.1 KCPA Registration (Mandatory)
- Verify active membership via KCPA member portal or by requesting KCPA verification letter
- Accepted membership levels for independent practice: Level 3 (Associate) minimum; Level 4 (Full Member) preferred
- Store: `registration_number`, `kcpa_level VARCHAR(20)`, `kcpa_verified_at TIMESTAMPTZ`
- Re-verify annually (KCPA membership is annual)

### 3.2 KMPDC Registration (For Clinical Psychologists)
- If therapist holds a clinical psychology degree and practices as a psychologist (not just counsellor), KMPDC registration is legally required
- Store: `kmpdc_number VARCHAR(50) NULL` (null for counsellors who are not registered with KMPDC)
- KMPDC public register is searchable — admin must cross-check

### 3.3 Academic Credentials
- Minimum: Diploma in Counselling (accredited institution) + supervised practice hours
- Preferred: Bachelor's or Master's in Psychology / Counselling Psychology
- Admin must sight scanned certificate and confirm issuing institution is KCPA-recognised
- Store as: document uploaded to secure storage (not the DB) — store only `credentials_verified_by UUID FK → users(admin)` and `credentials_verified_at TIMESTAMPTZ`

### 3.4 Professional Indemnity Insurance
- Therapist should hold their own professional indemnity insurance
- Platform is not the insurer — therapist's personal practice insurance covers sessions
- Admin should request proof of insurance before verification
- Store: `indemnity_verified BOOLEAN DEFAULT false`

### 3.5 Background Check
- Criminal background check (Certificate of Good Conduct — Kenya Police)
- Good conduct certificate valid for 1 year from issue
- Store: `good_conduct_verified BOOLEAN DEFAULT false`, `good_conduct_expires_at DATE NULL`

### 3.6 Teletherapy Competency
- KCPA has issued guidance on ethical teletherapy practice (informed consent, digital boundaries, crisis protocols)
- Admin should confirm therapist is aware of and agrees to KCPA teletherapy guidelines before activation
- Captured via: therapist agreement checkbox during onboarding (not just admin flag)

---

## 4. Member Consent Requirements

### 4.1 Existing Consent (version 1.0)
Covers: platform ToS, Privacy Policy, age 18+.
**Does NOT cover**: therapy session data, therapist access to member notes, session recording absence, data shared with therapist.

### 4.2 Required: Therapy Consent Addendum
Before a member accesses the therapist module for the first time, a new consent screen must be shown and accepted. Consent version bump required in DB.

This consent must cover:
- Member understands the therapist is an independent verified professional, not a PeerPal employee
- Session data (booking notes, session content) may be accessed by the therapist and PeerPal admin (for disputes only)
- Sessions are not recorded
- In a crisis, the therapist may contact emergency services or escalate to PeerPal admin
- Cancellation and refund policy (explicit)
- Member has the right to end any session at any time
- Data retention: session notes retained for [X] years per clinical standards, then deleted

Store as: `therapy_consent_version VARCHAR(10)`, `therapy_consented_at TIMESTAMPTZ` on `users` table.

### 4.3 Minor Safeguarding
The platform is 18+ only (age gate at onboarding). The therapist category "Youth & Adolescent" **must not be accessible to members** unless a separate under-18 safeguarding framework is established. Remove the category or restrict it to admin/B2B access only until a minor safeguarding policy is formally written and reviewed.

---

## 5. Data Governance — Therapy-Specific

### 5.1 What Is Sensitive Health Data on This Platform
Under Kenya DPA 2019, the following are sensitive personal data requiring heightened protection:
- Session booking notes (member's stated reason for booking)
- Therapist session notes
- Mood data linked to therapy context
- Any content from in-app text therapy sessions
- Ratings and reviews (linkable to a session = linkable to health status)

### 5.2 Data Minimisation Rules
- Therapist sees: member **alias only** (never real name, email, or phone)
- Therapist profile: display name only to members (full legal name is internal/admin only)
- Booking data: therapist sees session format, scheduled time, member's optional notes, and member alias
- Admin sees all for dispute resolution only — access should be logged in `admin_audit_log`

### 5.3 Data Retention
| Data Type | Retention | Basis |
|---|---|---|
| Session booking records | 7 years | Clinical record standard (Kenya) |
| Therapist session notes | 7 years | Clinical record standard |
| Member booking notes | 7 years | Clinical record standard |
| Payment records | 7 years | KRA tax compliance |
| Rating & review data | Duration of therapist's active status + 2 years | Legitimate interest |
| Video session content | Not retained — no recording | Privacy by design |

### 5.4 Analytics — No Tracking Pixels on Therapy Screens
Following the Cerebral/BetterHelp precedent: **zero third-party analytics events** on any screen within the therapist module. This includes:
- No FCM event logging of session starts/ends
- No `events` table entries for therapist-specific screens
- Sentry error tracking is permitted but must be configured to scrub PHI (no member alias, no booking ID in error payloads)

### 5.5 Right to Deletion
When a member requests data deletion:
- Booking records: anonymise member_user_id → NULL (retain for therapist payment records)
- Session notes: delete member-side content; flag therapist notes as anonymised
- Ratings: delete comment; retain rating score anonymously for therapist aggregate

---

## 6. Financial Compliance

### 6.1 Escrow / Payment Gateway
- PeerPal acts as a payment intermediary — collects from member, disburses to therapist
- This may require a **Payment Service Provider (PSP) licence** from Central Bank of Kenya if classified as payment facilitation (not just STK Push collection)
- **Action required**: Legal opinion on whether the escrow model triggers CBK PSP licensing requirements
- Interim mitigation: Structure as "platform administration fee" model where therapist sets rate, member pays therapist directly via M-Pesa, platform collects a separate administration fee — avoids escrow classification

### 6.2 Therapist Earnings — Tax Obligation
- Therapist earnings via B2C payout are taxable income for the therapist
- Platform should issue a monthly earnings statement to each therapist
- If therapist earns > KES 24,000/month on the platform, withholding tax obligations may apply (confirm with KRA)

### 6.3 Split Percentages — Document as Policy
Platform fee: 20% of session rate (retained by PeerPal)
Therapist payout: 80% of session rate (via M-Pesa B2C)
This split must appear in:
- Therapist onboarding agreement (signed before activation)
- Terms of Service (member-facing, in plain language)
- Therapist portal (visible on every payout record)

---

## 7. Therapist Agreement (Required Document)

Before a therapist is activated (`is_verified = true`), they must sign a Therapist Partnership Agreement covering:

1. Independent contractor status (not PeerPal employee)
2. Obligation to maintain KCPA membership and notify platform of any suspension
3. Platform fee structure (20/80 split) — acknowledgement
4. Data handling obligations (member alias only, no contact outside app)
5. Off-platform solicitation prohibition (cannot give personal contact to members met on platform)
6. Session standards (punctuality, crisis escalation, session notes)
7. Dispute resolution process
8. Termination clauses (grounds for deactivation)
9. Governing law: Laws of Kenya

Store: signed agreement (PDF) in secure document storage. Store `agreement_signed_at TIMESTAMPTZ` in DB.

---

## 8. Privacy Policy & Terms — Required Updates

The existing Privacy Policy must be updated before therapist module launch to cover:

- [ ] What session data is collected and why
- [ ] Who the therapist is (independent professional, not PeerPal staff)
- [ ] How therapist data is used (verification, payments, ratings)
- [ ] Data retention periods for therapy data
- [ ] Third-party services used for video (Daily.co or WebRTC TURN provider) and their data handling
- [ ] Dispute resolution process and what data admin accesses
- [ ] Right to request session note deletion

Terms of Service must be updated to cover:
- [ ] Cancellation and no-show policy (specific timelines and fees)
- [ ] Dispute window (24hrs from session completion)
- [ ] Platform's liability limitation (therapist is independent professional)
- [ ] Crisis protocol (therapist may escalate to emergency services)

---

## 9. Crisis Protocol — Legal Obligation

If a therapist identifies a member in active crisis during a session, they have a **duty of care** obligation under KCPA ethics and Kenyan law.

Platform must provide:
- One-tap therapist escalation button during session → alerts PeerPal admin + logs emergency
- Clear protocol document given to all therapists at onboarding: what to do if member is at risk
- Integration with existing emergency flow (`POST /emergency/trigger`) — therapist-initiated variant
- Befrienders Kenya 0800 723 253 surfaced to therapist as a resource during session

This is not optional and is not covered anywhere in the Phase 37 spec.

---

## 10. Certifications Roadmap

| Certification / Registration | Priority | Timeline | Owner |
|---|---|---|---|
| ODPC Data Controller registration | P0 — Immediate | Before therapist module goes live | Founder |
| Privacy Policy & ToS update (therapy addendum) | P0 — Before launch | Before therapist module goes live | Founder + Legal |
| Therapist Agreement document drafted | P0 — Before first therapist onboarded | Before NGO therapists are added | Founder + Legal |
| Therapy consent screen (version bump) | P0 — Before launch | Sprint 37 | Engineering |
| KRA VAT / withholding tax opinion | P1 | Before first payout | Accountant |
| CBK PSP licence opinion | P1 | Before escrow model goes live | Legal |
| CA OTT licence opinion | P2 | After video sessions launch | Legal |
| ISO 27001 (Information Security) | P3 — Future | Year 2 if pursuing institutional/B2B contracts | TBD |
| HIPAA Business Associate Agreement with Daily.co | P2 — If Daily.co used | Before video launch | Engineering + Legal |

---

## 11. Incident Response — Minimum Viable Plan

For a production mental health platform, the following must exist before launch:

**If a member is harmed during or after a therapy session:**
1. Admin is notified immediately (in-app escalation or direct report)
2. Session logs preserved (booking record, any text session content)
3. Therapist account suspended pending investigation (admin one-click action needed in TherapistsTab)
4. Member offered crisis support (Befrienders Kenya, emergency contacts)
5. ODPC notified within 72 hours if a data breach occurred (legal obligation under DPA 2019)
6. KCPA notified if therapist misconduct is alleged

**Add to admin panel**: Therapist "Suspend immediately" button (sets `is_active = false` + flags account) — separate from the soft deactivation toggle currently in TherapistsTab.

---

*This document is a living reference. It is not a substitute for formal legal advice. Consult a Kenyan lawyer specialising in health law and data protection before platform launch.*
