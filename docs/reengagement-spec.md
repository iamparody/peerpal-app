# Re-engagement & Notification Overhaul — Locked Spec
**Date locked:** 2026-10-13  
**Status:** Approved. Do not deviate without explicit user sign-off.

---

## Context / why this exists

Current re-engagement is a flat priority-list job that loops every active user every 2 hours, picks the first true condition, and sends one push per 24h. Problems confirmed by the user:
- Received two identical streak notifications at the same time (duplicate delivery bug)
- Notifications show generic Chrome icon — no brand
- Copy uses em dashes (`—`) which render as garbage on some Android notification drawers
- No distinction between active and inactive users — healthy users get nudged too
- Messages are not contextual to what the user actually did

---

## What is NOT changing (out of scope)

- The underlying FCM infrastructure (already works)
- The service worker notification rendering (already has 20 typed notifications)
- The peer request broadcast / session confirmation notifications (not re-engagement)
- The existing `notifications` table structure (only adding one column)

---

## Two pipelines — this is the core architectural decision

### Pipeline A — Event-driven (fires for ALL users including healthy)
These are transactional. A healthy, active user still gets these.

| Type | Trigger | Cooldown mechanism |
|---|---|---|
| `bad_mood_followup` | specific mood record ID | `event_ref = mood:{id}` — once per mood event |
| `unmatched_request` | specific request record ID | `event_ref = request:{id}` — once per request |
| `session_followup_peer` | specific session record ID | `event_ref = session:{id}` — once per session |
| `session_followup_therapy` | specific booking record ID | `event_ref = booking:{id}` — once per booking |
| `credit_zero` | balance hits 0 | `event_ref = creditzero:{YYYY-MM-DD}` — once per day |
| `credit_low` | balance hits 1 | `event_ref = creditlow:{YYYY-MM-DD}` — once per day |

### Pipeline B — Churn nudges (ONLY for cooling / at_risk / dormant — never healthy)

| Type | Cooldown mechanism |
|---|---|
| `streak_reminder` | `event_ref = streakremind:{YYYY-WNN}` — weekly |
| `streak_broken` | `event_ref = streakbreak:{YYYY-WNN}` — once per week of break |
| `ai_dormant` | `event_ref = aidormant:{YYYY-WNN}` — weekly |
| `dormant_nudge` | `event_ref = dormant:{YYYY-WNN}` (cooling) or `dormant:{YYYY-MM}` (dormant) |
| `no_safety_plan` | `event_ref = safetyplan:{YYYY-WNN}` — 2 weeks between (use WNN % 2) |
| `therapist_upsell` | `event_ref = therapistupsell:lifetime` — once ever |

---

## Idempotency — atomic, no race condition

**Migration required:** add one nullable column to the existing `notifications` table + a UNIQUE constraint:

```sql
-- Migration: add event_ref to notifications for idempotent delivery
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS event_ref VARCHAR(100) NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_user_type_event
  ON notifications (user_id, type, event_ref)
  WHERE event_ref IS NOT NULL;
```

**How it works:** The INSERT into `notifications` IS the atomic claim. If two job runs overlap, the second INSERT fails with a unique violation — caught, logged, skipped. No check-then-send. No separate send log table.

---

## Engagement scoring — pure function, testable

### Columns added to users table
```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS engagement_segment VARCHAR(10) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS engagement_score   SMALLINT    DEFAULT NULL;
```

### Formula
```
score = recency_pts + frequency_pts + breadth_pts + history_pts

recency_pts   = max(0, 40 - days_inactive * 3)
                -- days_inactive = days since last activity of any type
                -- 0 days → 40pts, 14+ days → 0pts

frequency_pts = min(30, activity_count_30d * 3)
                -- activity_count_30d = mood check-ins + AI sessions + peer sessions + journal entries
                -- in last 30 days

breadth_pts   = distinct_features_used_ever * 5
                -- features: AI (ai_interactions), peer (sessions), journal (journals), therapy (therapist_bookings)
                -- max 4 features × 5pts = 20pts

history_pts   = min(10, active_days_last_90d / 3)
                -- active_days_last_90d = count of distinct days with at least 1 activity in last 90 days
                -- 30 active days in 90 → 10pts (max)
```

### Segment thresholds
| Segment | Score | Meaning |
|---|---|---|
| `healthy` | 70–100 | No Pipeline B nudges |
| `cooling` | 40–69 | Weekly Pipeline B nudges |
| `at_risk` | 15–39 | Targeted Pipeline B nudges |
| `dormant` | 0–14 | Win-back message only, once per 2 weeks, no CTA |

### Test cases — all must pass before integration

| Profile | recency | freq | breadth | history | score | segment |
|---|---|---|---|---|---|---|
| Opens app daily, uses 3 features | 40 | 30 | 15 | 10 | 95 | healthy |
| 4 days quiet, long-term user (30 active days / 90) | 28 | 24 | 20 | 10 | 82 | healthy |
| 8 days quiet, moderate user (15 active days / 90) | 16 | 12 | 10 | 5 | 43 | cooling |
| 12 days quiet, light user (3 active days / 90) | 4 | 3 | 5 | 1 | 13 | at_risk |
| 20 days gone, tried it twice | 0 | 0 | 5 | 0 | 5 | dormant |
| New user, day 3, tried AI once | 37 | 3 | 5 | 1 | 46 | cooling |

### Dominant feature detection
Computed in the same nightly job. Based on counts in last 30 days:
- `ai` — highest count among AI sessions
- `peer` — highest count among peer sessions
- `journal` — highest count among journal entries
- `none` — if all counts are zero OR account age < 7 days → route to funnel step logic (Phase 45) instead of feature nudge

Stored nowhere — derived at job run time. No new column needed.

---

## Privacy rules — push payload (non-negotiable)

FCM data payload contains ONLY: `{ type, route }`. Nothing else.

Lock-screen copy must NEVER contain:
- Mood level or emotional state ("you checked in feeling low")
- Session content or any clinical/diagnosis-adjacent language
- Therapy or crisis context

### Sensitive copy replacements
| Old (banned) | Replacement |
|---|---|
| "You checked in feeling low earlier" | "How are you feeling compared to this morning?" |
| "You've been having 3 hard days" | "You've been checking in — take a moment today" |
| "Your mood streak is at risk" | "A quick check-in keeps things on track" |
| "You haven't opened the AI chat in a while" | "Your companion is ready when you are" |

### Dormant win-back copy (no CTA, no feature mention)
> "We noticed you've been away. No pressure — we're here when you're ready."

One line. Tap → home screen. No button. No feature name.

---

## Branded notification icons

### Phase 1 only (build first, verify on Android before continuing)
- `blob-neutral.png` — 192×192, sage green blob (`#9BB5A0`), neutral expression — default icon for ALL notifications
- `badge.png` — 72×72 monochrome white heartbeat line on transparent — status bar badge

These are rendered programmatically from the existing `MoodBlob` SVG source via a Node script using `sharp`. No manual export.

### Phase 2 (only AFTER Phase 1 verified on a real Android device)
- `blob-low.png` — 192×192, amber blob (`#C9A96E`), low expression — alert-category nudges (streak at risk, credit low/zero)
- `blob-good.png` — 192×192, mint blob (`#7EC8A4`), good expression — session followups, milestones

### Icon assignment per notification type
| Blob | Notification types |
|---|---|
| `blob-neutral` | dormant_nudge, ai_dormant, no_safety_plan, streak_broken, journal_prompt |
| `blob-low` | streak_reminder, credit_low, credit_zero, unmatched_request |
| `blob-good` | session_followup_peer, session_followup_therapy, therapist_upsell |

---

## Notification permission timing

**Remove:** `registerFCMToken()` silent call from `App.jsx` line ~275 (fires on every authenticated load — wrong moment).

**Add explicit opt-in at two moments only:**
1. After first AI session ends — on the ended state in `AIChatScreen`
2. After first peer session closes — on the session-ended screen

**Prompt copy:** *"Get notified when a peer is available or your companion has something for you."*  
One line + "Enable" button. User taps → `requestPermission()` fires. If already granted → skip silently.

Gate: only show once (check `Notification.permission !== 'default'` before showing).

---

## Em dashes — immediate fix

Every `—` in `reengagementCopy.js` and `firebase-messaging-sw.js` must be replaced with either:
- A comma
- An ellipsis (`...`)
- A restructured sentence with no dash at all

**Do not** use HTML entities (`&mdash;`) — push notification text is plain text, not HTML.

---

## Execution order (locked — do not reorder)

### Step 1 — Immediate fixes (no scoring, no segmentation)
1. Fix all em dashes in `reengagementCopy.js` and `firebase-messaging-sw.js`
2. Add `event_ref` column + UNIQUE index to `notifications` table (migration)
3. Update `reengagementJob.js` to pass `event_ref` on every INSERT — this kills the duplicate delivery bug
4. Add quiet hours to the job (no sends 21:00–07:00 EAT, same as peer broadcast)
5. Render `blob-neutral.png` and `badge.png` from SVG source via Node script
6. Add `icon` and `badge` fields to `showNotification()` calls in service worker using `blob-neutral.png`

**Commit and deploy after Step 1. Verify on Android before Step 2.**

### Step 2 — Scoring function
1. Implement `computeEngagementScore(userId)` as a pure async function with the test cases above
2. Add `engagement_segment` + `engagement_score` columns to `users` (migration)
3. Wire into nightly job — compute and store segment for all active users
4. No nudge logic changes yet — just scoring running in background

**Unit test the scoring function before wiring into the job.**

### Step 3 — Pipeline split + per-type cooldowns
1. Split `reengagementJob.js` into Pipeline A (event-driven, all users) and Pipeline B (churn, non-healthy only)
2. Implement `event_ref` values per type as defined in the pipeline tables above
3. Apply dominant feature detection for Pipeline B nudge selection
4. Update copy to comply with privacy rules (no sensitive data in lock-screen text)

### Step 4 — Permission timing
1. Remove silent `registerFCMToken()` from `App.jsx`
2. Add post-first-session opt-in prompt to `AIChatScreen` and peer session-ended screen
3. Test full first-session flow (new user, no prior permission)

### Step 5 — Android verification
1. Install PWA on physical Android device
2. Verify: branded icon renders, badge renders, quiet hours respected, no duplicate delivery, opt-out works, dormant win-back fires correctly
3. Only after Step 5 passes: add `blob-low.png` and `blob-good.png` variants

---

## Files that will change (by step)

**Step 1:**
- `src/backend/config/reengagementCopy.js` — em dash removal
- `src/frontend/public/firebase-messaging-sw.js` — em dash removal + icon/badge fields
- `src/backend/migrations/NNN_notifications_event_ref.sql` — new migration
- `src/backend/jobs/reengagementJob.js` — event_ref on inserts + quiet hours
- `src/backend/scripts/render-blob-icons.js` — new script (renders PNGs)
- `src/frontend/public/blob-neutral.png` — new asset
- `src/frontend/public/badge.png` — new asset

**Step 2:**
- `src/backend/ai/engagementScore.js` — new pure function (with tests)
- `src/backend/ai/engagementScore.test.js` — test cases from spec
- `src/backend/migrations/NNN_engagement_columns.sql` — new migration
- `src/backend/jobs/reengagementJob.js` — wire scoring

**Step 3:**
- `src/backend/jobs/reengagementJob.js` — pipeline split, event_ref, privacy copy
- `src/backend/config/reengagementCopy.js` — copy rewrite

**Step 4:**
- `src/frontend/src/App.jsx` — remove silent registerFCMToken
- `src/frontend/src/screens/AIChatScreen.jsx` — post-session permission prompt
- peer session-ended screen — post-session permission prompt

---

## Metrics to measure after launch (do not claim "80% value" without data)

- Reactivation rate: % of `cooling` users who return within 7 days of nudge
- Opt-out rate: % of users who disable notifications after receiving a nudge
- Duplicate send rate: should be 0 after Step 1
- Repeat engagement: do nudged users open the app more than once after returning?
- Segment distribution: what % of users are healthy / cooling / at_risk / dormant?
