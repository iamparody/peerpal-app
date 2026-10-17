# Referral System (Phase 46)

Spec: `CHECKLIST.md` Phase 46. This doc records how it was built and where it deliberately differs.

## Flow

1. Every account has a 6-char base36 `users.referral_code`. New accounts get one at `POST /auth/register`. Accounts created before migration 108 get one the first time they open Profile (`GET /referrals/my-stats`).
2. Sharing: Profile → "Refer a Friend" card → copy `[APP_URL]/?ref=CODE` (`VITE_APP_URL`, falling back to the current origin).
3. The friend opens the link. `src/frontend/src/main.jsx` stores the code in localStorage (`pp_referral_code`) before the router drops the query string (`/` redirects to `/welcome`).
4. Register: the "Have a referral code?" expander opens pre-filled. A valid code at signup:
   - sets `users.referred_by`
   - adds +1 credit (`credit_transactions` type `bonus`, channel `referral`)
   - inserts `referral_rewards` with status `pending`, `credits_awarded = 2`
   Unknown, inactive, malformed or own codes are ignored without any error. A failing referral write rolls back to a savepoint, so the account is still created.
5. Friend's first confirmed purchase (`POST /credits/payment-webhook`): `services/referrals.js rewardReferrerOnPurchase` runs one transaction that flips the reward `pending → credited`, adds 2 credits to the referrer (type `referral_reward`, channel `referral`), and writes an in-app `referral_reward_credited` notification. The push goes out after commit. Errors are logged and never affect the purchase.

## Where it differs from the spec

| Spec | Built | Why |
|---|---|---|
| Hook in `POST /credits/mpesa-callback` | Hooked in `POST /credits/payment-webhook` | The mpesa-callback route does not exist; payment-webhook is the live confirmation path. |
| Notification: "[alias] joined using your link" | "A friend you invited made their first top-up. You've earned 2 credits." No alias in the in-app row or the push. | The referrer knows the friend in real life. Showing the alias lets them recognise the friend in groups and peer sessions, which breaks the blueprint's anonymity-by-default rule. Seka approved this on 2026-10-17. |
| First purchase = `COUNT(confirmed purchases) = 1` | First purchase = pending reward row exists, flipped atomically with `WHERE status = 'pending'` | The pending row is created at signup, so the two are the same in normal operation. The atomic flip also blocks a double payout when the webhook fires twice, and a reward that failed to credit is retried on the next purchase instead of being lost. |
| `UNIQUE(referrer, referred)` | That, plus a unique index on `referred_user_id` | A user can only be referred once. |

## Data

- `users.referral_code VARCHAR(10) UNIQUE`, `users.referred_by UUID → users ON DELETE SET NULL`
- `referral_rewards`: both user FKs `ON DELETE CASCADE`, so `deletionJob` hard deletes still work.
- Enum values: `credit_tx_type.referral_reward`, `credit_tx_channel.referral` (already present from 043), `notification_type.referral_reward_credited`.

## Measuring it

`node scripts/referral_report.js [days=30]` (from `src/backend`) prints referred signups, conversions, conversion rate, credits given away (signup bonus plus referrer rewards), credits per paying user, and median hours to convert.

Log lines: `[referral] signup`, `[referral] reward credited`, `[referral] reward failed`.
PostHog events: `referral_link_copied`, `referral_code_submitted`.

## Failure modes

- **Backend deployed before migration 108:** register inserts `referral_code`, so every signup fails. Run 108 first.
- **Code collision under concurrency:** the generator checks before insert and the UNIQUE constraint catches a race. A lost race fails that one signup with a 500. Odds are about 1 in 2.2 billion per pair of codes.
- **Referrer deactivated after the friend signed up:** the reward is still paid on purchase. Only the signup lookup checks `is_active`.
- **Abuse:** a new account using a code gets 1 free credit, which is less than the trial's 2. The referrer earns only when the friend pays real money.

## Tests

- `src/backend`: `npm run test:referrals` (29 tests). `npm run test:ledger` also scans the new credit inserts.
- `src/frontend`: `npm test` (includes `tests/referral.test.mjs`).
