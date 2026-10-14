# Phase 47 — Free Trial and Promo Codes

All copy and design decisions are locked below.
Do not change wording. Do not add screens beyond what is listed.

---

## SCHEMA — Migration first, no code before this runs

New columns on users table:
  trial_claimed_at TIMESTAMPTZ NULL
  trial_ends_at TIMESTAMPTZ NULL
  trial_ai_sessions_used INTEGER NOT NULL DEFAULT 0
  trial_credits_issued INTEGER NOT NULL DEFAULT 0

New table promo_codes:
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
  code VARCHAR(20) UNIQUE NOT NULL CHECK (code = UPPER(code))
  credit_value INTEGER NOT NULL CHECK (credit_value > 0)
  max_uses INTEGER NULL
  uses_count INTEGER NOT NULL DEFAULT 0
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW()
  valid_until TIMESTAMPTZ NULL
  campaign_label VARCHAR(100) NULL
  created_by UUID NOT NULL REFERENCES users(id)
  is_active BOOLEAN NOT NULL DEFAULT true
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

New table promo_code_redemptions:
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
  promo_code_id UUID NOT NULL REFERENCES promo_codes(id)
  user_id UUID NOT NULL REFERENCES users(id)
  credits_awarded INTEGER NOT NULL
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  UNIQUE(promo_code_id, user_id)

New notification types to add to enum: trial_reminder, trial_expired

Write rollback migration alongside every migration file.
Run npm run migrate only when migration is finalised and reviewed.

---

## BACKEND

### POST /trial/claim (auth required)
- Guard: if trial_claimed_at IS NOT NULL return 409 { code: 'TRIAL_ALREADY_CLAIMED', message: 'Trial already claimed' }
- Set trial_claimed_at = NOW(), trial_ends_at = NOW() + INTERVAL '7 days'
- Set trial_ai_sessions_used = 0, trial_credits_issued = 0
- Do NOT issue credits here. Credits issued only by the daily drip job.
- Return { trial_ends_at, message: 'Trial active' }

### GET /trial/status (auth required)
Returns:
- is_active: trial_claimed_at IS NOT NULL AND trial_ends_at > NOW()
- is_claimed: trial_claimed_at IS NOT NULL
- days_remaining: CEIL((trial_ends_at - NOW()) / INTERVAL '1 day') capped at 0
- trial_credits_today: SUM of credit_transactions WHERE type = 'trial_drip' AND DATE(created_at) = CURRENT_DATE for this user
- ai_sessions_used: trial_ai_sessions_used
- ai_sessions_remaining: 10 - trial_ai_sessions_used

### POST /promo/redeem (auth required)
- Accepts { code }
- Uppercase and trim input before lookup
- Validate in order, return specific error for each:
  - Code not found: 'That code does not exist'
  - is_active false: 'That code is no longer active'
  - valid_until passed: 'That code has expired'
  - uses_count >= max_uses (when max_uses NOT NULL): 'This code has reached its limit'
  - User already redeemed: 'You have already used this code'
- On success:
  - Add credits to user balance (atomic)
  - Write credit_transaction type: 'promo', channel: 'purchase'
  - Write promo_code_redemptions record
  - Increment promo_codes.uses_count (SELECT FOR UPDATE)
  - Return { credits_awarded, new_balance }
- No side effects beyond the above.

### AI session gate (modify existing POST /ai/session/start)
- If trial active AND trial_ai_sessions_used >= 10:
  Return 429 { code: 'TRIAL_AI_LIMIT', message: 'You have used all 10 AI sessions in your trial. Top up to continue.' }
- If trial active AND session proceeds: increment trial_ai_sessions_used

---

## CRON JOBS (all in trialDripJob.js)

### Trial drip (runs daily at 06:00 EAT = 03:00 UTC)
Query users WHERE trial_claimed_at IS NOT NULL AND trial_ends_at > NOW() AND trial_credits_issued < 14
For each user:
- Issue 2 credits to credits.balance
- Write credit_transaction: type='trial_drip', amount_credits=2, channel='trial', status='confirmed'
- Increment trial_credits_issued by 2
- Cap: skip if trial_credits_issued + 2 > 14

### Day 6 reminder (runs daily at 06:05 EAT = 03:05 UTC)
Query users WHERE trial_ends_at BETWEEN NOW() + INTERVAL '20 hours' AND NOW() + INTERVAL '28 hours' AND trial_claimed_at IS NOT NULL
For each user:
- Send push + in_app notification type: trial_reminder
- Copy: "Your trial ends tomorrow. Everything you experienced is still here when you top up."
- Action: /credits

### Trial expiry (runs daily at 06:05 EAT = 03:05 UTC, after reminder)
Query users WHERE trial_ends_at < NOW() AND trial_ends_at > NOW() - INTERVAL '25 hours'
For each user:
- Calculate unspent trial credits:
  - Sum of trial_drip credits issued since trial_claimed_at
  - Minus sum of debits (negative transactions) since trial_claimed_at
  - Remove the lesser of that amount or current balance. Never set balance below zero.
- Only removes trial_drip credits. Purchase, referral, and promo credits are never touched.
- Write in_app notification type: trial_expired. Do NOT send push. In-app only.

---

## FRONTEND

### POST-ONBOARDING SCREEN (new screen, appears once ever)
Trigger: immediately after onboarding complete, before dashboard.
Gate: shown only if trial_claimed_at IS NULL. If already claimed, skip to /dashboard.

- Full screen, dark background var(--color-bg-deep)
- Blob in happy state, centered, 160px
- Heading (Lora, 24px, cream): "You're all set."
- Body (Inter, 16px, muted): "Your first peer session is ready when you are."
- Sub-body (Inter, 13px, muted): "2 credits added to your account today. More tomorrow."
- Primary CTA (full width): "Talk to someone" → /peer
  - On tap: POST /trial/claim, handle 409 gracefully (just navigate), then navigate
- Secondary CTA (text link below button): "Explore first" → /dashboard
  - On tap: POST /trial/claim, handle 409 gracefully, then navigate
- No back navigation. No skip button. This screen IS the trial claim moment.

### CREDITS SCREEN — trial card (above all packages)
Load GET /trial/status on mount.

State 1 — not yet claimed (is_claimed = false):
- Card: warm card, accent left border 3px, slightly elevated, matches paid package card style
- Heading (Inter 16px 600): "Start here"
- Body (Inter 14px muted): "7 days to find out what is possible. No payment needed."
- CTA (full width, primary): "Claim your trial"
- On tap: POST /trial/claim → on success or 409: card transitions to State 2 in place. No navigation.

State 2 — trial active (is_active = true):
- Same card position and style
- Heading (Inter 16px 600): "Day [X] of your trial" where X = 7 - days_remaining + 1
- Body rows (Inter 14px): "[N] credits remaining today" / "[N] of 10 AI sessions used"
- Nudge (Inter 13px muted): "Enjoying it? Top up anytime to keep going."
  "Top up" smooth-scrolls to packages section. No navigation.
- No urgency language. Progress framing only.

State 3 — trial ended (is_active = false AND is_claimed = true):
- Same card, greyed out, opacity 0.6, no button
- Heading (Inter 16px 600, muted): "Trial complete"
- Body (Inter 14px muted): "Your trial has ended. Everything you experienced is still here."
- Below body (Inter 13px, accent color, tappable): "Top up to keep going." Smooth scrolls to packages.
- Card stays visible permanently. Never remove it.

Separator between trial card and packages (State 1 only):
- Small muted label: "or choose a package"

### CREDITS SCREEN — promo code entry (below last package)
Default: text link "Have a promo code?" (Inter 13px, accent color, underline)
Expanded on tap:
- Inline input, placeholder "Enter code", auto-uppercases on change
- "Redeem" button beside input
- No modal, no separate screen
Loading: button shows spinner, input disabled
Success: input + button replaced by blob-happy 48px + "+ [N] credits added. Welcome to PeerPal." in calm green. Fades after 3s, section collapses. Toast fires simultaneously.
Error states (inline below input, Inter 13px danger color — exact strings from backend):
- 'That code does not exist'
- 'That code has expired'
- 'This code has reached its limit'
- 'You have already used this code'

### TRIAL EXPIRY — in-app notification only
In notification list when trial has ended:
- Icon: neutral blob
- Title: "Your trial has ended"
- Body: "Everything you experienced is still here. Top up to keep going."
- Action: /credits
No full-screen interstitial. No blocking modal.

### SERVICE WORKER — add to NOTIF_TYPES
trial_reminder:
  title: "Trial ends tomorrow"
  body: "Everything you experienced is still here when you top up."
  vibrate: [100]
  requireInteraction: false
  actions: [{ action: 'topup', title: 'Top up' }]
  route: /credits

trial_expired: in-app only, no push. No entry needed in service worker.

---

## ADMIN PANEL — Promo Codes tab

New tab: "Promo Codes" in admin dashboard.

Table columns: Code | Credits | Uses (redeemed / max) | Campaign | Expires | Status | Actions
Actions per row:
- Deactivate toggle (PATCH /admin/promo-codes/:id sets is_active = false)
- View redemptions: side panel with alias + date, no PII, no email, no user_id

Create form (above table):
- Code (auto-uppercases, unique check on blur via GET /admin/promo-codes/check?code=X)
- Credits (number, min 1)
- Max uses (optional, blank = unlimited)
- Expires (date picker, optional)
- Campaign label (optional, internal only, never shown to users)
- Submit: "Create code" — success: row appears in table, error inline if code exists

Endpoints (all adminAuth):
  GET /admin/promo-codes
  POST /admin/promo-codes
  PATCH /admin/promo-codes/:id
  GET /admin/promo-codes/:id/redemptions
  GET /admin/promo-codes/check?code=X

---

## SECURITY

POST /trial/claim: rate limit 3/hour per IP. One claim per user at DB level.
POST /promo/redeem: rate limit 10/hour per user. UNIQUE constraint enforces one redemption per user per code. uses_count increment uses SELECT FOR UPDATE.
Trial credits isolation: only trial_drip transactions are removed at expiry. All other credit types untouched.

---

## VERIFICATION

Trial flow:
- New user completes onboarding → post-onboarding screen appears
- Tap "Talk to someone" → POST /trial/claim fires → navigate to /peer
- Credits screen shows State 2 (active trial)
- Daily drip adds 2 credits at job time
- Day 6 push notification fires
- Day 7 expiry job removes unspent trial credits
- Credits screen shows State 3 (expired)
- In-app expiry notification visible

Promo code flow:
- Valid code redeems correctly
- All four error states render correctly
- Success state shows blob + credit count
- Admin can create, view redemptions, deactivate
- Double redemption blocked at DB

AI session gate:
- 11th AI session during trial returns 429 with correct message
- After trial ends gate is removed

Before every commit: search modified files for em dashes. Replace with commas or restructured sentences.
