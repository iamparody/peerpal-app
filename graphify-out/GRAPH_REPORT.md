# MindBridge Knowledge Graph Report
Generated: 2026-05-04 | Last updated: 2026-05-22 (session 21) | Agent: Claude Code
<!-- Update this file whenever credentials, migrations, or architecture change -->

---

## 1. BACKEND FILES

### Core Application
| File | Purpose |
|---|---|
| `src/backend/app.js` | Express app setup: helmet (security headers), CORS (explicit allowlist, no wildcard), rate-limiting middleware, all route mounts |
| `src/backend/server.js` | HTTP server entry point; starts WebSocket signaling server, email/notification workers, 3 cron jobs; listens on port 3001 |
| `src/backend/package.json` | 17 prod deps: Express, bcrypt, JWT, Groq SDK, Firebase Admin, ioredis, BullMQ, nodemailer, ws, pg, uuid, etc. |
| `src/backend/.env.example` | All env vars: DATABASE_URL/POOLER/DIRECT, JWT secrets, encryption key, Groq API keys, Paystack keys, FCM JSON, TURN creds, SMTP, Redis URL, CORS URL |

### Database Layer
| File | Purpose |
|---|---|
| `src/backend/db/index.js` | pg Pool (max 20 connections, 30s idle timeout); exports `query()` and `getClient()` for transactions |
| `src/backend/migrations/run.js` | Reads/executes numbered SQL files 001–028; tracks applied migrations in `migrations_log`; uses DATABASE_DIRECT_URL for DDL |

### Migrations (44 SQL files, 001–042 applied; 043–044 written, pending apply)
| File | Table/Change | Key Fields |
|---|---|---|
| `001_users.sql` | users | UUID PK, alias UNIQUE, email UNIQUE, password_hash, role enum, risk_level enum, streak_count, consent fields, notif prefs, fcm_token |
| `002_ai_personas.sql` | ai_personas | user_id UNIQUE FK, persona_name, tone enum, response_style enum, formality enum, uses_alias boolean |
| `003_moods.sql` | moods | user_id FK, mood_level enum, tags TEXT[], note, created_at |
| `004_credits.sql` | credits | user_id UNIQUE FK, balance INTEGER CHECK >= 0 |
| `005_sessions.sql` | sessions | user_id FK, type enum (ai/peer), status enum, channel enum, ended_at |
| `006_peer_requests.sql` | peer_requests | user_id FK, accepted_by FK, session_id FK, status enum, channel_preference enum, escalation_job_id |
| `007_sessions_peer_request_fk.sql` | ALTER sessions | Adds peer_request_id FK (resolves circular dependency) |
| `008_ai_interactions.sql` | ai_interactions | user_id FK (nullable for anonymized), session_id FK, input_text, output_text, context_snapshot JSONB, flagged, flag_reason |
| `009_credit_transactions.sql` | credit_transactions | user_id FK, type enum, amount_credits, amount_currency DECIMAL, payment_method, status, payment_reference |
| `010_notifications.sql` | notifications | user_id FK, type enum (12 values), payload JSONB, channel enum, status enum, read_at |
| `011_journals.sql` | journals | user_id FK, mood_id FK nullable, tags TEXT[], content TEXT, risk_flagged boolean |
| `012_safety_plans.sql` | safety_plans | user_id UNIQUE FK, warning_signs, helpful_things, things_to_avoid, contacts JSONB (encrypted), emergency_resources, reason_to_continue |
| `013_groups.sql` | groups | condition_category enum (8), created_by FK, name, description, is_active boolean |
| `014_group_memberships.sql` | group_memberships | group_id+user_id UNIQUE composite FK, status enum, agreed_at NOT NULL |
| `015_group_messages.sql` | group_messages | group_id FK, user_id FK, deleted_by FK, content, is_pinned, is_deleted boolean |
| `016_group_reports.sql` | group_reports | reported_user_id FK, reported_by FK, message_id FK, reason enum, status enum, admin_action enum |
| `017_group_bans.sql` | group_bans | group_id FK, user_id FK, banned_by FK, reason, expires_at nullable |
| `018_emergency_logs.sql` | emergency_logs | user_id FK, trigger_type enum, status enum, handled_by FK, acknowledged_at, resolved_at |
| `019_escalation_logs.sql` | escalation_logs | session_id FK, trigger_type enum, escalated_to enum, timestamp |
| `020_therapist_referrals.sql` | therapist_referrals | user_id FK, preferred_time enum, contact_method enum, contact_detail TEXT (encrypted), specific_needs, status enum, admin_notes |
| `021_feedback.sql` | feedback | NO user_id (anonymous by design), type enum, rating CHECK 1–5, session_id FK nullable, comment |
| `022_psychoeducation_articles.sql` | psychoeducation_articles | title, category enum (11 — incl. trauma, relationships), content TEXT, estimated_read_minutes, tags[], status enum, created_by FK, published_at, content_type ('article'/'story'), author_name, author_bio, source_url |
| `023_auth_recovery.sql` | ALTER users | Adds reset_token_hash, reset_token_expires |
| `024_welcome_seen.sql` | ALTER users | Adds welcome_seen boolean (default false) |
| `025_email_verification.sql` | ALTER users | Adds email_verified, email_verify_token_hash, email_verify_expires, jwt_issued_before |
| `026_row_level_security.sql` | RLS policies | Denies anon-role read/write on all 22 tables (idempotent) |
| `027_indexes.sql` | Indexes | 20+ composite/partial indexes (user+created_at, status+created_at, risk_level, email verification, etc.) |
| `028_ai_usage.sql` | ai_usage | user_id FK, date, token_count, message_count, UNIQUE(user_id, date); daily 50k token limit tracking |
| `029_enable_rls.sql` | RLS | Enables RLS on token_blacklist + additional tables missed by 026 |
| `030_rls_remaining_tables.sql` | RLS | Deny-anon policies for remaining tables; all 24 app tables now fully RLS-enabled |
| `031_notification_journal_prompt.sql` | ALTER notifications enum | Adds 'journal_prompt' to notification_type enum |
| `032_users_condition_category.sql` | ALTER users | Adds condition_category (group_category enum, nullable) — set at onboarding condition step; index on non-null values |
| `033_peer_quiz_done.sql` | ALTER users | Adds peer_quiz_done BOOLEAN (default false) — tracks volunteer readiness quiz completion |
| `034_events.sql` | events | id UUID PK, user_id FK nullable, event_name VARCHAR(64), properties JSONB, created_at; 3 indexes (name, user_id, created_at DESC) — basic funnel analytics |
| `035_articles_trauma_relationships_stories.sql` | ALTER article_category enum + ALTER psychoeducation_articles | Adds 'trauma' + 'relationships' to article_category enum; adds content_type VARCHAR(10) DEFAULT 'article' (CHECK IN ('article','story')), author_name VARCHAR(100) NULL, author_bio TEXT NULL, source_url VARCHAR(500) NULL; index on content_type |
| `036_therapist_profiles.sql` | therapist_profiles | id UUID PK, display_name, full_name, photo_url, credentials, years_experience, specializations TEXT[], languages TEXT[], session_formats TEXT[], location, statement (max 300 chars), plain_language_intro TEXT, cultural_competencies TEXT[], approach_plain TEXT, availability_status enum (available/limited/unavailable), is_active BOOLEAN, created_at, updated_at — **pending apply** |
| `037_therapist_interests.sql` | therapist_interests | id UUID PK, member_user_id FK → users, therapist_id FK → therapist_profiles, referral_id FK → therapist_referrals, status enum (pending/matched/closed), created_at — **pending apply** |
| `038_referrals_support_style.sql` | ALTER therapist_referrals | Adds support_style_preference column — **pending apply** |
| `039_therapist_rls.sql` | RLS | Deny-anon policies for therapist_profiles and therapist_interests (consistent with migration 030 pattern) — **pending apply** |
| `040_last_data_deletion_at.sql` | ALTER users | Adds `last_data_deletion_at TIMESTAMPTZ NULL` — analytics anchor for all-time view — **applied** |
| `041_user_role_therapist.sql` | ALTER TYPE user_role | Adds `'therapist'` value to `user_role` enum — **applied** |
| `042_ai_persona_language_and_updated_at.sql` | ALTER ai_personas | Adds `language VARCHAR(20) DEFAULT 'english'` + `updated_at TIMESTAMPTZ`; CHECK IN (english/swahili/sheng) — **applied** |
| `043_credit_system_v2.sql` | ALTER credit_transactions + enums | Adds `duration_minutes INTEGER NULL`; adds `'refund'` to `credit_tx_type`; adds `'ai'` and `'referral'` to `credit_tx_channel` — **pending apply** |
| `044_peer_stats.sql` | CREATE peer_stats + enums | New table: user_id UNIQUE FK, sessions_completed INT, pending_credits DECIMAL(10,2), earned_credits_lifetime DECIMAL(10,2), redeemed_credits_lifetime DECIMAL(10,2); adds `'peer_earning'` to `credit_tx_type` and `credit_tx_channel`; RLS deny-anon — **pending apply** |

### Route Files (17 files)
| File | Endpoints |
|---|---|
| `routes/auth.js` | POST /register, GET /verify-email, POST /resend-verification, POST /login, POST /logout, POST /recover, POST /reset-password |
| `routes/onboarding.js` | POST /consent, POST /persona, GET /status, PATCH /welcome-seen |
| `routes/moods.js` | POST /, GET /today, GET /history, GET /analytics |
| `routes/journals.js` | POST /, GET /, GET /:id, PATCH /:id, DELETE /:id, DELETE / |
| `routes/ai.js` | POST /session/start, POST /session/:id/message, POST /session/:id/end |
| `routes/credits.js` | GET /balance, GET /transactions, POST /purchase, POST /webhook |
| `routes/peer.js` | POST /request, GET /requests/open, PATCH /request/:id/accept, PATCH /request/:id/close, GET /session/:id, GET /request/:id/status |
| `routes/groups.js` | GET /, GET /:id, POST /:id/join, POST /:id/leave, GET /:id/messages, POST /:id/messages, POST /:id/messages/:msgId/report |
| `routes/emergency.js` | POST /trigger |
| `routes/safetyPlan.js` | GET /, PUT / |
| `routes/notifications.js` | GET /, PATCH /:id/read, PATCH /read-all, PATCH /preferences |
| `routes/feedback.js` | POST / (no auth required) |
| `routes/resources.js` | GET /, GET /:id |
| `routes/referrals.js` | POST / (accepts support_style_preference), GET /my (includes interests array), POST /:id/interests |
| `routes/therapists.js` | GET / (filters: specialization, language, session_format, availability_status), GET /:id |
| `routes/profile.js` | GET /, POST /delete-data, PATCH /deactivate, POST /deactivate-undo |
| `routes/admin.js` | 24 admin-only endpoints (reports, emergency, escalations, referrals + interests + support_style_preference, risk-flags, resources, feedback, stats, therapists CRUD, therapist-interests status) |

### Middleware (3 files)
| File | Purpose |
|---|---|
| `middleware/auth.js` | Extracts Bearer token, verifies JWT, checks jwt_issued_before for session invalidation, gates email-unverified users (exempts /api/auth/*, POST /api/emergency, GET /api/resources) |
| `middleware/adminAuth.js` | Calls auth.js then re-queries DB to confirm role='admin' (not trusted from JWT) |
| `middleware/rateLimit.js` | authLimiter (5 POST /register per 15min), loginCooldownMiddleware (30s cooldown after 15 failures/IP), apiLimiter (100/15min), checkResendLimit (3/hr/user), Redis-backed with in-memory fallback |

### Utilities (9 files)
| File | Purpose |
|---|---|
| `utils/jwt.js` | generateAccessToken(user): 7-day JWT with sub, alias, role, jti (unique token ID) |
| `utils/encryption.js` | AES-256-GCM encrypt()/decrypt() using ENCRYPTION_KEY (must be 32 bytes); used for safety plan contacts, referral phone numbers |
| `utils/aliasGenerator.js` | generateAlias(): [Adjective][Animal][Number], collision-checked, 3M combinations |
| `utils/riskClassifier.js` | classify(text): 6 keyword categories — 2 critical (self_harm 11+, suicidal_ideation 13+), 3 high (abuse, severe_distress, substance_crisis), 1 medium (moderate_distress) |
| `utils/sanitizer.js` | sanitize(text): removes diagnostic/prescriptive language via regex; stripHtml(): removes HTML tags; >40% stripped returns safe fallback |
| `utils/fcm.js` | sendPushNotification(token, title, body, data) via firebase-admin; enqueuePushNotification() uses BullMQ or falls back to direct; initFCM() tries FCM_SERVICE_ACCOUNT_JSON (inline JSON env var) first, falls back to FCM_SERVICE_ACCOUNT_PATH via fs.readFileSync |
| `utils/notificationWriter.js` | writeNotification(user_id, type, payload, channel): INSERTs notification, calls enqueuePushNotification if channel includes 'push' |
| `utils/creditDeductor.js` | `deductCredit(user_id, amount, session_id, channel)`: atomic decrement by `amount` (1 or 2); session_id nullable (backfilled later); INSERTs credit_transaction type='debit'; sends credit_low notification if balance < 2. `refundCredit(user_id, amount, session_id, channel, reason)`: adds credits back, INSERTs type='refund', sends account_notice notification |
| `utils/paystack.js` | initializeTransaction(), verifyWebhookSignature() (HMAC-SHA512); PACKAGES const: starter 50KSh/3cr, standard 100KSh/7cr, plus 200KSh/15cr, support 500KSh/40cr |

### Services (2 files)
| File | Purpose |
|---|---|
| `services/cache.js` | Redis wrapper: get, set, del, delPattern, incrby; all fail gracefully if Redis unavailable |
| `services/emailService.js` | sendVerificationEmail(), sendPasswordResetEmail(); nodemailer or console fallback; enqueueEmail() uses BullMQ |

### Config (1 file)
| File | Purpose |
|---|---|
| `config/redis.js` | getCacheClient() singleton (maxRetriesPerRequest:3); createQueueClient() for BullMQ (maxRetriesPerRequest:null); both return null if UPSTASH_REDIS_URL missing |

### Queues & Workers (3 files)
| File | Purpose |
|---|---|
| `queues/index.js` | BullMQ emailQueue + notificationQueue; attempts:3, exponential backoff; returns null if Redis unavailable |
| `workers/emailWorker.js` | BullMQ Worker on 'email' queue; 3 attempts with exponential backoff |
| `workers/notificationWorker.js` | BullMQ Worker on 'notification' queue; 3 attempts with exponential backoff; handles invalid FCM tokens |

### Jobs (3 files)
| File | Schedule | Purpose |
|---|---|---|
| `jobs/riskScoreJob.js` | Midnight UTC | Recalculates composite risk_level per user (journals + emergencies + escalations); UPDATEs users.risk_level; INSERTs critical alert notifications |
| `jobs/checkinReminderJob.js` | 17:00 UTC (8pm Nairobi) | For each active user with notif_checkin_reminder=true and no mood today, INSERTs push notification |
| `jobs/deletionJob.js` | Every hour | Finds users WHERE scheduled_deletion_at <= NOW(); purges 14 record types; anonymizes flagged ai_interactions (user_id=NULL, retained); confirms via notification |

### WebSocket (1 file)
| File | Purpose |
|---|---|
| `ws/signaling.js` | WebRTC peer signaling; matches peers by session_id only; relays offer/answer/ICE candidates without transmitting alias or user_id; STUN (stun.l.google.com) + TURN (env-configured) |

---

## 2. FRONTEND SCREENS & ROUTES

### Authentication Screens (`src/frontend/src/screens/auth/`)
| Screen | Route | Purpose |
|---|---|---|
| `LoginScreen.jsx` | `/login` | Email+password login; handles EMAIL_NOT_VERIFIED (→/email-sent); 429/COOLDOWN timer; 10+ failures shows /emergency-public link |
| `RegisterScreen.jsx` | `/register` | Email+password (min 8 chars); POST /api/auth/register; 409 on duplicate email |
| `RecoverScreen.jsx` | `/recover` | Email input; POST /api/auth/recover; always shows generic "check your email" message (no enumeration) |
| `EmailSentScreen.jsx` | `/email-sent` | 60s resend cooldown; emergency link; for both verify + recovery flows |
| `VerifyEmailScreen.jsx` | `/verify-email` | Token from URL query; success auto-redirects /login; shows resend option on expired |
| `ResetPasswordScreen.jsx` | `/reset-password` | Token+new password; inline blur validation; POST /api/auth/reset-password |

### Onboarding Screens (`src/frontend/src/screens/onboarding/`)
| Screen | Route | Purpose |
|---|---|---|
| `ConsentScreen.jsx` | `/onboarding/consent` | 2 required checkboxes (ToS/Privacy + age 18+); BottomSheet ToS/Privacy; POST /api/onboarding/consent |
| `PersonaScreen.jsx` | `/onboarding/persona` | 6-field AI persona config with live preview (+ language selector: English/Swahili/Sheng); POST /api/onboarding/persona; 403 guard if already created; "permanent" copy restricted to name only |
| `FirstMoodScreen.jsx` | `/onboarding/first-mood` | Mood + tags + note; BonusToast on signup bonus; safety prompt overlay on very_low; POST /api/moods |

### Main App Screens (`src/frontend/src/screens/`)
| Screen | Route | Purpose |
|---|---|---|
| `WelcomeScreen.jsx` | `/welcome` | Time-based greeting + rotating support messages; auto-transitions /dashboard after 9s; PATCH /welcome-seen on first visit |
| `DashboardScreen.jsx` | `/dashboard` | MoodBlob + greeting + 2×3 tile grid (Peer Help, AI Chat, Therapist, Journal, Groups, Emergency); 4 useQuery hooks (balance, notifications, mood today, history?limit=1); Radix tooltips on coin badge + bell; quick-link pills (My Insights, Safety Plan, Breathing) |
| `MoodCheckinScreen.jsx` | `/mood` | MoodSelector + TagSelector + note (200 chars); invalidates ['moods'] queries on submit; streak toast; safety prompt overlay on very_low |
| `AnalyticsScreen.jsx` | `/analytics` | MoodDotGrid (dynamic weeks); TodayArc; timeframe pill selector (7d/30d/90d/all); adaptive bar chart (daily/weekly/monthly); common mood + frequent tags scoped to period; streak + total check-ins; DayDetailSheet on dot tap; 3 useQuery hooks (analytics?period=, arc, history?limit=) |
| `AIChatScreen.jsx` | `/ai-chat` | POST /ai/session/start on mount; real-time chat bubbles; POST /session/:id/message; action='emergency' auto-navigates /emergency; FeedbackModal on end |
| `JournalScreen.jsx` | `/journal` | CRUD journal entries; search + mood filter (useQuery dynamic key); voice-to-text (Web Speech API); optimistic delete via setQueryData; invalidates on save |
| `GroupsScreen.jsx` | `/groups` | useQuery(['groups']); group cards with name, category, member count; PageHeader |
| `GroupDetailScreen.jsx` | `/groups/:id` | Join button (→ AgreementScreen) or Enter Chat (→ GroupChatScreen); banned users see removal message |
| `GroupAgreementScreen.jsx` | `/groups/:id/agree` | 5-rule community agreement; POST /groups/:id/join on confirm |
| `GroupChatScreen.jsx` | `/groups/:id/chat` | Pinned messages + scrollable chat; polls every 5s; long-press → ReportModal; Leave Group button; optimistic message send (pending:true at 0.55 opacity) |
| `EmergencyScreen.jsx` | `/emergency` | Befrienders Kenya 0800 723 253 tap-to-call; POST /emergency/trigger; polls GET /emergency/status every 8s; shows "Someone has seen this" on ack; escalates to hotlines after 5 min if no ack; gentle close on resolve; stale-closure handled via ackStatusRef |
| `SafetyPlanScreen.jsx` | `/safety-plan` | 6-field form (all optional); useQuery(['safety-plan']); planData synced to editable form state via useEffect; PUT /safety-plan; contacts up to 3 (name + encrypted phone) |
| `ResourcesScreen.jsx` | `/resources` | useQuery(['resources', contentType, category.value, search]); Articles/Stories toggle; 11-category filter; article card list; PageHeader |
| `ArticleScreen.jsx` | `/resources/:id` | Full article with read-time; bookmark to localStorage |
| `BreathingScreen.jsx` | `/breathing` | 4 exercise cards: Box, 4-7-8, Grounding 5-4-3-2-1, PMR |
| `CalmingSoundsScreen.jsx` | `/sounds` | 8 procedurally synthesized ambient sounds via Web Audio API (ambientAudio.js singleton); rain, forest, ocean, white-noise, tibetan-bowls, fireplace, stream, wind; volume slider; stop button in header; no audio files required |
| `NotificationsScreen.jsx` | `/notifications` | 4 stratified lanes (Activity / Support / Payments / System); unread badge per tab; tap marks read optimistically + deep-links by notification type; Mark-all-read; skeleton loading; TYPE_META map drives icon + label + route per type |
| `CreditsScreen.jsx` | `/credits` | Large balance display; 4 top-up packages (Starter 50KSh/3cr → Support 500KSh/40cr); "How credits work" block (peer text 1cr, voice 2cr, referral 1cr, always-free list, refund policy); transaction history with rich labels using type+channel+duration_minutes; peer_earning shown as "Earned from peer support"; navigated from Dashboard coin badge, credit_low notifications |
| `ProfileScreen.jsx` | `/profile` | useQuery hooks: profile, credits/balance, notifications, peer/stats; Account card; AI persona card (+ Edit); Credits summary card (→ /credits); "Your Peer Impact" card (shown if sessions_completed > 0 or pending_credits > 0): progress bar pending/2.00, lifetime stats, collapsible "How it works"; Privacy & Data; Notifications toggles; Feedback; Logout |
| `EditPersonaScreen.jsx` | `/persona/edit` | Mutable persona settings: tone, response_style, formality, uses_alias, language; seeds from profile cache; PATCH /api/ai/persona on save; invalidates profile cache; no-nav screen |
| `ReferralScreen.jsx` | `/referral` | Therapist referral form (struggles, preferred_time, contact_method/detail); POST /referrals; confirmation screen |
| `PublicEmergencyScreen.jsx` | `/emergency-public` | No auth; Befrienders Kenya tap-to-call; breathing animation |
| `AdminDashboard.jsx` | `/admin` | **Removed from user app (Phase 18)** — route + import deleted from App.jsx |

### Peer Support Screens (`src/frontend/src/screens/peer/`)
| Screen | Route | Purpose |
|---|---|---|
| `PeerRequestScreen.jsx` | `/peer` | Channel selector (Text/Voice); flat cost display (1cr / 2cr); balance check is channel-aware; inline "top up" link if insufficient; "Top Up" → /credits; Leaderboard tab; POST /peer/request deducts at submission |
| `PeerWaitingScreen.jsx` | `/peer/waiting` | 90s countdown; polls GET /peer/request/:id/status every 3s; on active → invalidates credits cache + navigates session screen; 120ms skeleton before timer fades in |
| `PeerTextChatScreen.jsx` | `/peer/session/:id/text` | Text chat via WebSocket; End Session → PATCH /peer/request/:id/close; no time-based credit logic (billing is flat, server-side) |
| `PeerVoiceCallScreen.jsx` | `/peer/session/:id/voice` | WebRTC audio via ws/signaling; mute toggle; End Call → PATCH /peer/request/:id/close; no time-based credit logic |

### Therapist Marketplace Screens (`src/frontend/src/screens/therapist/`) — Phase 19
| Screen | Route | Purpose |
|---|---|---|
| `TherapistIntakeScreen.jsx` | `/therapists` | 3-step conversational intake (struggles → support style → preferences); language list: English/Swahili/Specify (text input); support style uses inline SVG icons; checks for existing open referral → redirects /therapists/status; creates referral on submit |
| `TherapistListScreen.jsx` | `/therapists/browse` | 1.8s warm intro moment (pulsing dots); staggered card entrance (90ms delay, 450ms ease-out); fit highlights per intake answers; ProfileSheet bottom sheet (350ms); max 3 selections; sticky CTA bar |
| `TherapistConfirmScreen.jsx` | `/therapists/confirm` | Therapist first names in Lora font; intake summary card; home + status buttons; intentional no-auto-navigate |
| `TherapistStatusScreen.jsx` | `/therapists/status` | Animated timeline (pending → in_review → arranged → closed); expressed interests display (avatar + name chips); re-match path for closed referrals |

### Shared Components (`src/frontend/src/components/`) — Phase 21
| Component | Purpose |
|---|---|
| `MoodBlob.jsx` | Animated SVG blob; colour + expression changes by mood; blink + float animations |
| `MoodDotGrid.jsx` | GitHub-style dot-matrix mood calendar; 10px dots, 7-row Mon–Sun grid, month labels; `compact` prop (4 weeks); `weeks` prop override (dynamic weeks for all-time view); `onDotPress(dateStr)` callback makes past dots with data tappable — used in AnalyticsScreen + DashboardScreen |
| `DayDetailSheet.jsx` | Bottom sheet (Phase 22); receives `date` (YYYY-MM-DD) + `onClose`; fetches GET /api/moods/day; shows all mood entries (emoji, tags, note) + full journal entries for that date; safety framing + AI chat CTA for low/very_low days |
| `PageHeader.jsx` | Reusable screen header: back button + title + optional `right` slot; wired into Analytics, Resources, Groups, SafetyPlan, Journal |
| `Toast.jsx` | Radix Toast-based notification system; `useToast()` hook; success/error/warning/default variants; mounted in main.jsx via `<ToastProvider>` |
| `EmptyState.jsx` | Icon + title + body + optional action button; standardises empty list states |
| `Badge.jsx` | Inline status chip; 6 colour variants (default/success/warning/danger/calm/muted) |
| `ProtectedRoute.jsx` | Auth + onboarding gate; shows `AppSkeleton` (full dashboard-shaped skeleton) during auth check instead of blank flash |
| `BottomNav.jsx` | 5-tab nav (Home, Resources, Sounds, Breathing, Profile); NavLink active state |

### Frontend Utilities (`src/frontend/src/utils/`) — Phase 21
| File | Purpose |
|---|---|
| `ambientAudio.js` | Web Audio API procedural sound engine; `AmbientSound` class builds noise buffers + oscillators per sound type; 8 sounds (rain/forest/ocean/white-noise/tibetan-bowls/fireplace/stream/wind); module-level `getAmbient()` singleton persists across React navigation; no audio files needed |

### Frontend Dependencies (Phase 21 additions)
| Package | Purpose |
|---|---|
| `@tanstack/react-query` v5 | Server state cache; QueryClientProvider in main.jsx; staleTime 5min, gcTime 30min |
| `@radix-ui/react-tooltip` | Tooltip primitive; TooltipProvider in main.jsx (delayDuration 400ms) |
| `@radix-ui/react-toast` | Toast primitive; used in Toast.jsx component |

### Standalone Admin Panel (`src/admin/`) — Phase 18 + Phase 19
Separate Vite React app. Deployed independently (Railway or Netlify). Set `VITE_API_URL` to backend Railway URL.
| File | Purpose |
|---|---|
| `App.jsx` | Collapsible sidebar (240px ↔ 64px), Phosphor icons, active amber border, live red badges on Emergency/Escalations/Reports/Risk, breadcrumb topbar, mobile off-canvas drawer < 900px; 8 tabs (added Therapists tab in Phase 19) |
| `components/LoginScreen.jsx` | Dark sidebar bg wrap, white card, admin credential auth |
| `components/MessageModal.jsx` | Send in-app message to user by alias → POST /admin/users/:alias/message |
| `context/AuthContext.jsx` | Admin JWT storage, logout |
| `tabs/OverviewTab.jsx` | 4 animated stat cards (count-up, staggered entrance), activity feed, quick actions |
| `tabs/EmergencyTab.jsx` | Emergency queue with row colouring (open=red, ack=amber), elapsed time |
| `tabs/EscalationsTab.jsx` | Peer escalations; onCountChange badge callback |
| `tabs/ReferralsTab.jsx` | Therapist referrals as card list; shows expressed interests (therapist avatar chips) + support_style_preference (updated Phase 19) |
| `tabs/ReportsTab.jsx` | Group reports with Pending/Reviewed/All filter tabs; onCountChange badge |
| `tabs/RiskTab.jsx` | Risk-flagged users; onCountChange badge |
| `tabs/ContentTab.jsx` | Psychoeducation articles CRUD; right slide panel (480px) replaces modal |
| `tabs/StatsTab.jsx` | DAU + session stats with rating bar indicators; Recharts LineChart for daily series (7/14/30/60 day range selector); tracks DAU, AI sessions, peer sessions, emergencies, new users |
| `tabs/PatternsTab.jsx` | High-utilisation user monitoring; PatternChips per user (red: 3+ emergencies, amber: open referrals, orange: peer sessions this week); Message button → MessageModal |
| `tabs/TherapistsTab.jsx` | Therapist profiles table; inline availability toggle; active/inactive toggle; full create/edit slide panel with all fields incl. plain_language_intro, cultural_competencies, approach_plain (NEW Phase 19) |
| `styles/globals.css` | Full brand token system: sidebar `#2F2622`, cream `#FAF6F2`, status colours |

### Legal Screens (`src/frontend/src/screens/`)
| Screen | Route | Purpose |
|---|---|---|
| `PrivacyPolicyScreen.jsx` | `/privacy` | Public route; accepts embedded prop for BottomSheet |
| `TermsScreen.jsx` | `/terms` | Public route; accepts embedded prop |
| `DataComplianceScreen.jsx` | `/data-compliance` | GDPR/data compliance text |

---

## 3. DATABASE SCHEMA — All 24 Tables (+ 2 pending: therapist_profiles, therapist_interests)

| Table | Key Fields (3) | Notes |
|---|---|---|
| **users** | id UUID PK, alias UNIQUE, email UNIQUE | + password_hash, role, risk_level, streak_count, email_verified, jwt_issued_before, fcm_token, 4 notif booleans, condition_category (group_category enum nullable), peer_quiz_done boolean, last_data_deletion_at TIMESTAMPTZ NULL (analytics anchor — migration 040, pending apply) |
| **ai_personas** | user_id UNIQUE FK, persona_name, tone enum | + response_style, formality, uses_alias, language VARCHAR(20) DEFAULT 'english' CHECK IN (english/swahili/sheng), updated_at TIMESTAMPTZ; one per user; name is immutable, all other fields mutable via PATCH /api/ai/persona |
| **moods** | user_id FK, mood_level enum, created_at | + tags TEXT[], note (200 max) |
| **credits** | user_id UNIQUE FK, balance INTEGER | CHECK balance >= 0; signup bonus = 2 credits |
| **sessions** | user_id FK, type enum, status enum | + channel, ended_at, peer_request_id FK |
| **peer_requests** | user_id FK, status enum, channel_preference | + accepted_by FK, session_id FK, escalation_job_id |
| **ai_interactions** | session_id FK, input_text, flagged boolean | user_id nullable (anonymized on deletion but retained); context_snapshot JSONB |
| **credit_transactions** | user_id FK, type enum, amount_credits | + amount_currency, payment_method, status, payment_reference, session_id FK nullable, channel enum, duration_minutes INTEGER NULL; type ∈ {purchase/debit/bonus/refund/peer_earning}; channel ∈ {text/voice/purchase/ai/referral/peer_earning} |
| **notifications** | user_id FK, type enum (13), status enum | + payload JSONB, channel, read_at; types include journal_prompt (added migration 031) |
| **journals** | user_id FK, content TEXT, risk_flagged | + mood_id FK, tags[], created_at |
| **safety_plans** | user_id UNIQUE FK, contacts JSONB, warning_signs | contacts encrypted app-side; emergency_resources pre-filled (Befrienders Kenya) |
| **groups** | name, condition_category enum (8), is_active | + created_by FK, description |
| **group_memberships** | group_id FK, user_id FK, agreed_at NOT NULL | UNIQUE(group_id, user_id); status: active/left/banned |
| **group_messages** | group_id FK, content TEXT, is_deleted | + user_id FK, deleted_by FK, is_pinned; deleted shown as '[deleted]' |
| **group_reports** | reported_user_id FK, reason enum, status enum | + reported_by FK, message_id FK, admin_action enum |
| **group_bans** | group_id FK, user_id FK, expires_at nullable | + banned_by FK, reason; nullable expiry for permanent |
| **emergency_logs** | user_id FK, trigger_type enum, status enum | + handled_by FK, acknowledged_at, resolved_at |
| **escalation_logs** | session_id FK, trigger_type enum, escalated_to | Trigger types: user_initiated, ai_escalation, peer_escalation |
| **therapist_referrals** | user_id FK, contact_detail TEXT (encrypted), status | + preferred_time, contact_method, specific_needs, admin_notes, support_style_preference (added migration 038) |
| **therapist_profiles** | id UUID PK, display_name, full_name, availability_status enum | + photo_url, credentials, years_experience, specializations[], languages[], session_formats[], location, statement, plain_language_intro, cultural_competencies[], approach_plain, is_active; RLS deny-anon — **pending migrations 036 + 039** |
| **therapist_interests** | member_user_id FK, therapist_id FK, referral_id FK | + status enum (pending/matched/closed); max 3 per referral enforced at API layer; RLS deny-anon — **pending migrations 037 + 039** |
| **feedback** | type enum, rating CHECK 1-5, session_id FK | NO user_id — fully anonymous by design |
| **psychoeducation_articles** | title, category enum (11), status enum, content_type | + content, estimated_read_minutes, tags[], created_by FK, published_at; content_type ∈ {article, story}; author_name/bio/source_url for stories; 55 seeded articles |
| **ai_usage** | user_id FK, date, token_count | UNIQUE(user_id, date); supports 50k daily limit |
| **events** | user_id FK nullable, event_name VARCHAR(64), properties JSONB | Basic funnel analytics; user_id SET NULL on delete; 3 indexes (name, user_id, created_at DESC) |
| **peer_stats** | user_id UNIQUE FK, pending_credits DECIMAL(10,2), earned_credits_lifetime DECIMAL(10,2) | + redeemed_credits_lifetime DECIMAL(10,2), sessions_completed INT; fractional peer earnings accumulate here; converts to credits.balance when pending >= 2.0 (Math.floor); RLS deny-anon — **pending migration 044** |

---

## 4. API ENDPOINTS — By Module

### Auth (`/api/auth`)
```
POST   /register              — {email, password} → {token, alias, userId}
GET    /verify-email?token=   — Single-use token validation
POST   /resend-verification   — Rate-limited (3/hr/user)
POST   /login                 — {email, password} → {token, alias, role}
POST   /logout                — Blacklist token JTI
POST   /recover               — {email} → always 200 (no enumeration)
POST   /reset-password        — {token, new_password} → sets jwt_issued_before
```

### Onboarding (`/api/onboarding`)
```
POST   /consent               — {consent_version: '1.0'}
POST   /persona               — {persona_name, tone, response_style, formality, uses_alias, language?}
GET    /status                — {consent, persona, first_mood, signup_bonus, welcome_seen}
PATCH  /welcome-seen          — Sets welcome_seen=true
```

### Moods (`/api/moods`)
```
POST   /                      — {mood_level, tags[], note} → {mood_id, streak_count, bonus_credited}
GET    /today                 — {entry} | {entry: null}
GET    /history               — {entries, total, page} (paginated; ?from_date, ?to_date; limit max raised to 500)
GET    /analytics             — ?period=7d|30d|90d|all (default 7d); {trend[], common_mood, frequent_tags, current_streak, total_checkins, account_start_date, week_trend alias} (cached 300s per period)
GET    /arc                   — {entries} — today's mood entries in chronological order for TodayArc chart
GET    /day                   — ?date=YYYY-MM-DD; {date, moods[], journals[]} — full mood + journal content for one calendar date (Phase 22)
```

### Journals (`/api/journals`)
```
POST   /                      — {content, mood_level, tags[], mood_id}
GET    /                      — {entries, total, page} (filters: mood_level, tag, date range, search; preview 100 chars)
GET    /:id                   — Full entry
PATCH  /:id                   — {content, mood_level, tags, mood_id}; re-classifies if content changed
DELETE /:id                   — Hard delete; 204
DELETE /                      — Bulk delete all; {deleted_count}
```

### AI Chat (`/api/ai`)
```
POST   /session/start         — {persona_name} → {session_id}; 403 if no persona; 429 DAILY_SESSION_LIMIT if >= 5 AI sessions today (counted from sessions table)
POST   /session/:id/message   — {input_text max 2000} → {response_text, flagged, action, session_flag_count}; 429 on 30/session or 100/day msg limit or 50k token limit
POST   /session/:id/end       — {ended_at}
PATCH  /persona               — {tone?, response_style?, formality?, uses_alias?, language?} → {persona}; busts persona cache; name field rejected (immutable)
GET    /sessions              — Paginated AI session history
```

### Credits (`/api/credits`)
```
GET    /balance               — {balance} (cached 30s)
GET    /transactions          — {transactions, total, page} (paginated; includes duration_minutes, channel for rich display)
POST   /purchase              — {package_id} → {payment_url, reference} (Paystack)
POST   /webhook               — Paystack webhook; HMAC-SHA512 signature verification; updates balance on charge.success
```
Note: `POST /deduct` endpoint removed in Phase 26. Credit deduction is now server-side at request submission.

### Peer Support (`/api/peer`)
```
POST   /request               — {channel_preference} → {request_id}; deducts credits at submission (1cr text / 2cr voice); 402 if insufficient; refunded on 90s expiry
GET    /requests/open         — {requests}
GET    /quiz/status           — {peer_quiz_done}
POST   /quiz/complete         — marks peer_quiz_done=true
PATCH  /request/:id/accept    — {session_id, request_id, channel}; backfills session_id on debit tx
PATCH  /request/:id/close     — {ended_at}; writes duration_minutes to credit_transactions; triggers fractional peer earning (0.25cr text / 0.50cr voice → peer_stats; converts to balance when pending >= 2.0)
GET    /request/:id/status    — {session_id, status} (polling endpoint for waiting screen)
GET    /session/:id           — Session details for participants
GET    /stats                 — {sessions_completed, pending_credits, earned_credits_lifetime, redeemed_credits_lifetime, credits_earned, rank}
GET    /leaderboard           — Top 10 peers by sessions_completed (alias only)
GET    /history               — Paginated peer session history
```

### Groups (`/api/groups`)
```
GET    /                      — {groups} (cached 300s; includes member_count)
GET    /:id                   — {group, is_member, membership_status}
POST   /:id/join              — {agreement_confirmed: true}
POST   /:id/leave             — 200
GET    /:id/messages          — {messages, pinned, total, page} (paginated; pinned first)
POST   /:id/messages          — {content} → {message_id}; broadcasts push notification
POST   /:id/messages/:msgId/report — {reason, details} → {report_id}; admin notified
```

### Emergency (`/api/emergency`)
```
POST   /trigger               — {log_id}; INSERTs emergency_logs; alerts admin
GET    /status                — {active, acknowledged_at, resolved_at}; returns most recent open/acknowledged log for polling
```

### Safety Plan (`/api/safety-plan`)
```
GET    /                      — {plan} | {plan: null}; decrypts contacts
PUT    /                      — UPSERT; encrypts contact_detail fields
```

### Notifications (`/api/notifications`)
```
GET    /                      — {notifications, total, page}
PATCH  /:id/read              — {read_at}
PATCH  /read-all              — {updated_count}
PATCH  /preferences           — {notif_peer_broadcast, notif_checkin_reminder, notif_group_messages, notif_credit_low}
```

### Feedback (`/api/feedback`) — No auth
```
POST   /                      — {type, rating 1-5, session_id, comment}; no user_id stored
```

### Resources (`/api/resources`)
```
GET    /                      — {articles} (filters: category, search; cached 3600s)
GET    /:id                   — Full article
```

### Referrals (`/api/referrals`)
```
POST   /                      — {struggles, preferred_time, contact_method, contact_detail, specific_needs, support_style_preference}; deducts 1cr at submission; 402 if insufficient; refunded if admin marks escalated
GET    /my                    — {referrals} with status; each referral includes interests array
POST   /:id/interests         — {therapist_ids[]} — max 3 per referral; enforces deduplication
```

### Therapists (`/api/therapists`)
```
GET    /                      — {therapists} (filters: specialization, language, session_format, availability_status; auth required — not public)
GET    /:id                   — Full therapist profile (auth required)
```

### Profile (`/api/profile`)
```
GET    /                      — {alias, email (masked), consent_version, persona_name, streak_count, credits, notif_*}
POST   /delete-data           — Schedules deletion 24h from now
PATCH  /deactivate            — Sets is_active=false; schedules deletion 30 days
POST   /deactivate-undo       — Reverses scheduled deletion
```

### Admin (`/admin`) — Requires role='admin' (DB-verified, not JWT-only)
```
GET    /reports               — Pending group reports
PATCH  /emergency/:id/acknowledge
PATCH  /emergency/:id/resolve
PATCH  /reports/:id/action    — {action: warn|ban|dismiss, admin_notes}
GET    /emergency-queue
GET    /escalations
GET    /referrals             — ?status filter; each referral includes interests array + support_style_preference
PATCH  /referrals/:id         — {status, admin_notes}; triggers refundCredit(1cr) when status='escalated'
GET    /risk-flags
POST   /users/:alias/message  — {message} → in-app notification
GET    /resources             — All statuses (admin view)
POST   /resources             — {title, category, content, estimated_read_minutes, tags}
PATCH  /resources/:id
PATCH  /resources/:id/publish
PATCH  /resources/:id/archive
GET    /feedback              — {avg_rating_by_type, recent_comments}
GET    /stats                 — {dau, checkins_today, peer_sessions_today, ai_sessions_today, credits_purchased_today}
GET    /stats/daily           — ?days=7|14|30|60 (max 90); {series[]} daily DAU/ai_sessions/peer_sessions/emergencies/new_users; Recharts line chart in StatsTab
GET    /users/patterns        — High-utilisation users: 3+ emergencies (red), open referrals (amber), peer sessions this week (orange); used in PatternsTab
GET    /therapists            — All therapist profiles
POST   /therapists            — Create user (role=therapist) + therapist_profiles row
PATCH  /therapists/:id        — Update any profile field
PATCH  /therapists/:id/availability — Quick availability toggle
PATCH  /therapist-interests/:id/status — Update interest status (pending/matched/closed)
```

---

## 5. QUEUES & WHAT THEY PROCESS

| Queue | Worker | Trigger | Processing | Failure |
|---|---|---|---|---|
| **email** | `workers/emailWorker.js` | Registration, password reset | nodemailer delivery via emailService.deliverEmail() | 3 attempts, exponential backoff; logged on final failure |
| **notification** | `workers/notificationWorker.js` | Any writeNotification() with push channel | FCM push via fcm.sendPushNotification() | 3 attempts, exponential backoff; handles invalid tokens |

**Fallback**: If Redis/BullMQ unavailable, both queues fall back to synchronous (inline) delivery.

### Cron Jobs (node-cron, from server.js)
| Job | Schedule | Trigger |
|---|---|---|
| riskScoreJob | `0 0 * * *` (midnight UTC) | Auto: recalculates risk_level per user |
| checkinReminderJob | `0 17 * * *` (17:00 UTC = 8pm EAT) | Auto: sends check-in reminders |
| deletionJob | `0 * * * *` (hourly) | Auto: processes scheduled account deletions |

### Timer Job (ad-hoc)
| Job | Trigger | Purpose |
|---|---|---|
| Peer Escalation | 90s after peer_request INSERT | If status still 'open' at 90s → mark escalated, refund credits to requester (1cr text / 2cr voice), notify requester + admin |

---

## 6. CACHE KEYS & TTLs

| Key Pattern | TTL | Invalidated By |
|---|---|---|
| `analytics:{userId}` | 300s | On new mood POST |
| `persona:{userId}` | 86400s | On persona update (or natural expiry) |
| `credits:{userId}` | 30s | On any credit change |
| `groups:list` | 300s | On group join/leave/create |
| `resources:{category}:{search}` | 3600s | On admin publish/archive/edit |
| `ai_tokens:{userId}:{date}` | 86400s | Never (counter; expires at day rollover) |
| `login_fail:{ip}` | 900s | On successful login or natural expiry |

**All cache misses gracefully fall through to DB. Redis down = no caching, no errors.**

---

## 7. SERVICES & THEIR DEPENDENCIES

| Service/Utility | Depends On | Used By |
|---|---|---|
| `db/index.js` | PostgreSQL (pg Pool) | All routes, jobs, middleware/auth |
| `config/redis.js` | `getRestClient()`: UPSTASH_REDIS_REST_URL + TOKEN (HTTPS, always works); `createQueueClient()`: UPSTASH_REDIS_URL ioredis TCP (BullMQ only) | services/cache.js (REST), queues/index.js (TCP), middleware/rateLimit.js (REST via cache) |
| `services/cache.js` | config/redis.js `getRestClient()` — @upstash/redis REST | routes/moods (analytics), routes/ai (persona), routes/credits (balance), routes/groups (list), routes/resources (articles) |
| `services/emailService.js` | Resend SDK (RESEND_API_KEY env), queues/index.js | routes/auth (verification + reset), workers/emailWorker |
| `utils/riskClassifier.js` | — (pure function) | routes/journals, routes/ai |
| `utils/sanitizer.js` | — (pure function) | routes/ai |
| `utils/encryption.js` | ENCRYPTION_KEY env | routes/safetyPlan, routes/referrals, routes/admin |
| `utils/creditDeductor.js` | db/index.js, notificationWriter | routes/peer, routes/credits |
| `utils/notificationWriter.js` | db/index.js, utils/fcm.js | All routes that send notifications |
| `utils/fcm.js` | firebase-admin, queues/index.js | utils/notificationWriter |
| `utils/paystack.js` | PAYSTACK_SECRET_KEY env | routes/credits |
| `utils/aliasGenerator.js` | db/index.js | routes/auth (registration) |
| `ws/signaling.js` | ws package | server.js (WebRTC peer calls) |
| `middleware/auth.js` | utils/jwt.js, db/index.js | All protected routes |
| `middleware/adminAuth.js` | middleware/auth.js, db/index.js | All /admin routes |

---

## 8. CURRENT PHASE STATUS & REMAINING TASKS

### Completed Phases (27/27; Phase 20.3 deferred; Phase 24 blocked on clinical content)
| Phase | Status | Description |
|---|---|---|
| Phase 1 | ✅ | Database migrations (35 SQL files applied, 4 pending; 25+ tables) |
| Phase 2 | ✅ | Backend auth & onboarding APIs |
| Phase 3 | ✅ | Core module APIs (moods, journals, AI chat) |
| Phase 4 | ✅ | Credits & Paystack payments |
| Phase 5 | ✅ | Peer support + WebRTC signaling |
| Phase 6 | ✅ | Groups & moderation |
| Phase 7 | ✅ | Emergency & safety plan |
| Phase 8 | ✅ | Notifications (FCM + BullMQ) |
| Phase 9 | ✅ | Admin dashboard APIs |
| Phase 10 | ✅ | Resources, feedback, referrals, profile, cron jobs |
| Phase 11 | ✅ | React PWA frontend (40 screens) |
| Phase 12 | ✅ | Safety tests (10/10 PASSED) |
| Phase 13 | ✅ | Launch prep (seed scripts, Docker, smoke test) |
| Phase 14 | ✅ | Voice journaling, calming sounds (Web Audio API), welcome screen |
| Phase 15 | ✅ | Email verification + password reset flow |
| Phase 16 | ✅ | Performance, security, scale (Redis, RLS, indexes, BullMQ) |
| Phase 17 | ✅ | Feature triage: peer incentives, onboarding condition step, peer quiz gate, group profile UI, Sentry/analytics (migrations 031–034) |
| Phase 18 | ✅ | Standalone admin panel at `src/admin/` — 8-tab redesign, collapsible sidebar, animated stat cards, mobile responsive |
| Phase 19 | ✅ | Therapist Marketplace — intake flow, browse/select, confirm + status screens; therapists.js route; migrations 036–039 (pending apply) |
| Phase 20 | ✅ | Mutable Persona (PATCH /api/ai/persona) + Language Switcher (English/Swahili/Sheng) — EditPersonaScreen, language layer 2.5 in system prompt, migration 042 |
| Phase 21 | ✅ | UI Performance & Design System — TanStack Query (all 7 screens), optimistic updates (group send, notification read-all, credits invalidation), skeletons, Radix tooltips, component library, Web Audio calming sounds engine |
| Phase 22 | ✅ | Mood History & Pattern Reflection — tappable dot calendar, DayDetailSheet (moods + journals per day), timeframe selector (7d/30d/90d/all), period-scoped analytics, safety framing on low-mood days |
| Phase 23 | ✅ | Notifications UX (NotificationsScreen, 4 lanes, deep-links), Emergency feedback loop (GET /emergency/status, polling, ack/escalate/resolve states), Admin depth (daily chart, GET /admin/stats/daily, PatternsTab, GET /admin/users/patterns) |
| Phase 24 | ⚠️ BLOCKED | Help a Friend Module — blocked on clinical content sign-off (scenarios must be reviewed against WHO mhGAP / MHFA Kenya / Befrienders guidelines before build) |
| Phase 25 | ✅ | Admin stats/patterns SQL bug fixes (generate_series integer offset; member_user_id; matched|closed); CreditsScreen at /credits (balance, packages, history); balance badge clickable; credit_low notification → /credits |
| Phase 26 | ✅ | Credit System v2 — flat per-session billing (1cr text / 2cr voice); `deductCredit(user_id, amount, session_id, channel)` + `refundCredit`; session_id backfill on peer accept; duration_minutes written on close; AI 5 sessions/day cap; POST /deduct removed; migration 043 |
| Phase 27 | ✅ | Peer Incentive System — fractional earnings (0.25cr text / 0.50cr voice → pending_credits); conversion threshold 2.0 (Math.floor converts to spendable balance); peer_stats table; Profile Impact card with progress bar + collapsible explainer; migration 044 |

### Credentials & External Services Status
| Service | Status | Notes |
|---|---|---|
| **Supabase DB** | ✅ Connected | DATABASE_URL + POOLER_URL set; migrations 001–030 all applied |
| **Groq AI** | ✅ Configured | GROQ_API_KEY set; llama-3.3-70b-versatile primary |
| **Resend Email** | ✅ Configured | RESEND_API_KEY set; EMAIL_FROM=onboarding@resend.dev (Resend shared sender, no domain verification needed) |
| **Firebase FCM** | ✅ Configured | Service account JSON at `src/backend/config/` (gitignored); FCM_SERVICE_ACCOUNT_PATH set in .env; `utils/fcm.js` tries FCM_SERVICE_ACCOUNT_JSON env first, falls back to FCM_SERVICE_ACCOUNT_PATH via fs.readFileSync |
| **Upstash Redis (REST)** | ✅ Connected | UPSTASH_REDIS_REST_URL + TOKEN set; @upstash/redis REST client active for cache + rate limiting; PING verified; cache set/get/del round-trip verified |
| **Upstash Redis (TCP)** | ⚠️ Blocked locally | UPSTASH_REDIS_URL set but port 6380 blocked on local network; ioredis gives up after 3 retries (family:4 fix prevents AggregateError flood); BullMQ falls back to sync delivery locally; will connect on Railway |
| **Paystack** | ❌ Not configured | PAYSTACK_SECRET_KEY still placeholder; needs live account |
| **TURN Server** | ⚠️ OpenRelay | Using free openrelay.metered.ca — adequate for testing, may drop under load; upgrade for production |

### Remaining Actions
| Task | Blocker |
|---|---|
| Apply migrations 036–041 | ✅ All applied — therapist tables, RLS, last_data_deletion_at, user_role therapist value all live |
| Test payment flow | Paystack live account + public webhook URL (Railway deploy needed) |
| Configure TURN for production | Metered.ca paid plan or self-hosted coturn on Railway |
| Deploy to Railway | Set all production env vars; run seed scripts; TCP Redis will connect from Railway |
| App name decision | Propagate to manifest.json, index.html, DashboardScreen topbar, legal page [Your Name] placeholders |

---

## 9. KNOWN ISSUES

| Issue | Location | Severity | Notes |
|---|---|---|---|
| BullMQ TCP blocked locally | `config/redis.js` | Low | Port 6380 blocked on local network; ioredis retries 3× then stops (no crash, no flood); BullMQ falls back to sync delivery; resolves automatically on Railway |
| Paystack not configured | `routes/credits.js` | Medium | Placeholder keys; purchase + webhook flow untestable until live Paystack account connected |
| TURN server is free tier | `ws/signaling.js` | Low | openrelay.metered.ca adequate for testing; upgrade before launch |
| Peer escalation uses setTimeout | `routes/peer.js` | Low | In-memory timer lost on server restart; consider BullMQ delayed job in production |
| Migrations 036–041 applied | Supabase | — | All therapist tables live; user_role therapist value added (was missing from 001) |

---

## File Counts Summary

| Category | Count |
|---|---|
| Database migrations | 44 SQL files (001–042 applied; 043–044 written, pending apply) |
| Database tables | 25 live + 3 pending (therapist_profiles, therapist_interests, peer_stats); all RLS-enabled once applied |
| Backend route files | 17 |
| Backend middleware | 3 |
| Backend utilities | 9 |
| Backend services | 2 |
| Background workers | 2 |
| Cron jobs | 3 |
| Frontend screens (user app) | 43 (+ NotificationsScreen, CreditsScreen) |
| Frontend shared components | 9 (incl. MoodDotGrid, PageHeader, Toast, EmptyState, Badge — Phase 21; DayDetailSheet — Phase 22) |
| Frontend utilities | 1 (ambientAudio.js — Phase 21 Web Audio engine) |
| Admin panel tabs | 10 (+ PatternsTab) |
| API endpoints (total) | ~77 (+ GET /emergency/status, GET /admin/stats/daily, GET /admin/users/patterns, PATCH /notifications/:id/read) |
| Cache keys | 7 |
| BullMQ queues | 2 |
| Build phases complete | 27/27 (Phases 23–27 complete; Phase 20.3 custom model pending external collaboration; Phase 24 blocked on clinical content) |
| Safety tests passed | 10/10 |

### Additional Projects
| Project | Path | Purpose |
|---|---|---|
| Landing site | `landing-site/` | Standalone Vite React competition entry; no CTA/signup; Vercel-ready |
