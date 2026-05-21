# MindBridge Knowledge Graph Report
Generated: 2026-05-04 | Last updated: 2026-05-21 (session 12) | Agent: Claude Code
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

### Migrations (35 SQL files, 001–035 all applied to Supabase)
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

### Route Files (16 files)
| File | Endpoints |
|---|---|
| `routes/auth.js` | POST /register, GET /verify-email, POST /resend-verification, POST /login, POST /logout, POST /recover, POST /reset-password |
| `routes/onboarding.js` | POST /consent, POST /persona, GET /status, PATCH /welcome-seen |
| `routes/moods.js` | POST /, GET /today, GET /history, GET /analytics |
| `routes/journals.js` | POST /, GET /, GET /:id, PATCH /:id, DELETE /:id, DELETE / |
| `routes/ai.js` | POST /session/start, POST /session/:id/message, POST /session/:id/end |
| `routes/credits.js` | GET /balance, GET /transactions, POST /purchase, POST /webhook, POST /deduct |
| `routes/peer.js` | POST /request, GET /requests/open, PATCH /request/:id/accept, PATCH /request/:id/close, GET /session/:id, GET /request/:id/status |
| `routes/groups.js` | GET /, GET /:id, POST /:id/join, POST /:id/leave, GET /:id/messages, POST /:id/messages, POST /:id/messages/:msgId/report |
| `routes/emergency.js` | POST /trigger |
| `routes/safetyPlan.js` | GET /, PUT / |
| `routes/notifications.js` | GET /, PATCH /:id/read, PATCH /read-all, PATCH /preferences |
| `routes/feedback.js` | POST / (no auth required) |
| `routes/resources.js` | GET /, GET /:id |
| `routes/referrals.js` | POST /, GET /my |
| `routes/profile.js` | GET /, POST /delete-data, PATCH /deactivate, POST /deactivate-undo |
| `routes/admin.js` | 18 admin-only endpoints (reports, emergency, escalations, referrals, risk-flags, resources, feedback, stats) |

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
| `utils/fcm.js` | sendPushNotification(token, title, body, data) via firebase-admin; enqueuePushNotification() uses BullMQ or falls back to direct |
| `utils/notificationWriter.js` | writeNotification(user_id, type, payload, channel): INSERTs notification, calls enqueuePushNotification if channel includes 'push' |
| `utils/creditDeductor.js` | deductCredit(user_id, session_id, channel): checks balance >= 1, deducts 1 credit, INSERTs transaction, sends credit_low notification if balance < 2; voice allows 2min grace on last credit |
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
| `PersonaScreen.jsx` | `/onboarding/persona` | 5-field AI persona config with live preview; POST /api/onboarding/persona; 403 guard if already created |
| `FirstMoodScreen.jsx` | `/onboarding/first-mood` | Mood + tags + note; BonusToast on signup bonus; safety prompt overlay on very_low; POST /api/moods |

### Main App Screens (`src/frontend/src/screens/`)
| Screen | Route | Purpose |
|---|---|---|
| `WelcomeScreen.jsx` | `/welcome` | Time-based greeting + rotating support messages; auto-transitions /dashboard after 9s; PATCH /welcome-seen on first visit |
| `DashboardScreen.jsx` | `/dashboard` | MoodBlob + 2×3 tile grid (Peer Help, AI Chat, Therapist, Journal, Groups, Emergency); parallel fetch: today's mood, credits, notifications |
| `MoodCheckinScreen.jsx` | `/mood` | MoodSelector + TagSelector + note (200 chars); streak toast; safety prompt overlay on very_low; milestone toast at 3/7/30 days |
| `AnalyticsScreen.jsx` | `/analytics` | 7-day bar chart (recharts); common mood card; frequent tags; current streak; total check-ins |
| `AIChatScreen.jsx` | `/ai-chat` | POST /ai/session/start on mount; real-time chat bubbles; POST /session/:id/message; action='emergency' auto-navigates /emergency; FeedbackModal on end |
| `JournalScreen.jsx` | `/journal` | CRUD journal entries; search (debounce 300ms); filters (mood, tag, date); paginated list |
| `GroupsScreen.jsx` | `/groups` | GET /groups; group cards with name, category, member count |
| `GroupDetailScreen.jsx` | `/groups/:id` | Join button (→ AgreementScreen) or Enter Chat (→ GroupChatScreen); banned users see removal message |
| `GroupAgreementScreen.jsx` | `/groups/:id/agree` | 5-rule community agreement; POST /groups/:id/join on confirm |
| `GroupChatScreen.jsx` | `/groups/:id/chat` | Pinned messages + scrollable chat; polls every 5s; long-press → ReportModal; Leave Group button |
| `EmergencyScreen.jsx` | `/emergency` | Befrienders Kenya 0800 723 253 tap-to-call; POST /emergency/trigger; BreathingWidget inline; polls notifications every 10s; no back navigation |
| `SafetyPlanScreen.jsx` | `/safety-plan` | 6-field form (all optional); GET on mount; PUT /safety-plan; contacts up to 3 (name + encrypted phone) |
| `ResourcesScreen.jsx` | `/resources` | GET /resources; 9-category filter tabs + search; article card list |
| `ArticleScreen.jsx` | `/resources/:id` | Full article with read-time; bookmark to localStorage |
| `BreathingScreen.jsx` | `/breathing` | 4 exercise cards: Box, 4-7-8, Grounding 5-4-3-2-1, PMR |
| `CalmingSoundsScreen.jsx` | `/sounds` | 8 ambient tracks from public/sounds/; one plays at a time; volume slider |
| `ProfileScreen.jsx` | `/profile` | Account (alias, masked email), AI persona, Credits (balance + transactions + buy), Privacy (consent version, Delete Data, Clear Journal), Notifications (4 toggles), Referrals, Feedback |
| `ReferralScreen.jsx` | `/referral` | Therapist referral form (struggles, preferred_time, contact_method/detail); POST /referrals; confirmation screen |
| `PublicEmergencyScreen.jsx` | `/emergency-public` | No auth; Befrienders Kenya tap-to-call; breathing animation |
| `AdminDashboard.jsx` | `/admin` | **Removed from user app (Phase 18)** — route + import deleted from App.jsx |

### Peer Support Screens (`src/frontend/src/screens/peer/`)
| Screen | Route | Purpose |
|---|---|---|
| `PeerRequestScreen.jsx` | `/peer` | Balance check; channel selector (Text/Voice); POST /peer/request |
| `PeerWaitingScreen.jsx` | `/peer/waiting` | 90s countdown; polls GET /peer/request/:id/status every 3s; on active → session screen |
| `PeerTextChatScreen.jsx` | `/peer/text/:id` | Text chat; credit countdown per 15min; End Session → FeedbackModal |
| `PeerVoiceCallScreen.jsx` | `/peer/voice/:id` | WebRTC audio via ws/signaling; mute toggle; credit countdown per 5min; 2min grace on last credit |

### Standalone Admin Panel (`src/admin/`) — Phase 18
Separate Vite React app. Deployed independently (Railway or Netlify). Set `VITE_API_URL` to backend Railway URL.
| File | Purpose |
|---|---|
| `App.jsx` | Collapsible sidebar (240px ↔ 64px), Phosphor icons, active amber border, live red badges on Emergency/Escalations/Reports/Risk, breadcrumb topbar, mobile off-canvas drawer < 900px |
| `components/LoginScreen.jsx` | Dark sidebar bg wrap, white card, admin credential auth |
| `components/MessageModal.jsx` | Send in-app message to user by alias → POST /admin/users/:alias/message |
| `context/AuthContext.jsx` | Admin JWT storage, logout |
| `tabs/OverviewTab.jsx` | 4 animated stat cards (count-up, staggered entrance), activity feed, quick actions |
| `tabs/EmergencyTab.jsx` | Emergency queue with row colouring (open=red, ack=amber), elapsed time |
| `tabs/EscalationsTab.jsx` | Peer escalations; onCountChange badge callback |
| `tabs/ReferralsTab.jsx` | Therapist referrals as card list |
| `tabs/ReportsTab.jsx` | Group reports with Pending/Reviewed/All filter tabs; onCountChange badge |
| `tabs/RiskTab.jsx` | Risk-flagged users; onCountChange badge |
| `tabs/ContentTab.jsx` | Psychoeducation articles CRUD; right slide panel (480px) replaces modal |
| `tabs/StatsTab.jsx` | DAU + session stats with rating bar indicators |
| `styles/globals.css` | Full brand token system: sidebar `#2F2622`, cream `#FAF6F2`, status colours |

### Legal Screens (`src/frontend/src/screens/`)
| Screen | Route | Purpose |
|---|---|---|
| `PrivacyPolicyScreen.jsx` | `/privacy` | Public route; accepts embedded prop for BottomSheet |
| `TermsScreen.jsx` | `/terms` | Public route; accepts embedded prop |
| `DataComplianceScreen.jsx` | `/data-compliance` | GDPR/data compliance text |

---

## 3. DATABASE SCHEMA — All 22 Tables

| Table | Key Fields (3) | Notes |
|---|---|---|
| **users** | id UUID PK, alias UNIQUE, email UNIQUE | + password_hash, role, risk_level, streak_count, email_verified, jwt_issued_before, fcm_token, 4 notif booleans, condition_category (group_category enum nullable), peer_quiz_done boolean |
| **ai_personas** | user_id UNIQUE FK, persona_name, tone enum | + response_style, formality, uses_alias; one per user |
| **moods** | user_id FK, mood_level enum, created_at | + tags TEXT[], note (200 max) |
| **credits** | user_id UNIQUE FK, balance INTEGER | CHECK balance >= 0; signup bonus = 2 credits |
| **sessions** | user_id FK, type enum, status enum | + channel, ended_at, peer_request_id FK |
| **peer_requests** | user_id FK, status enum, channel_preference | + accepted_by FK, session_id FK, escalation_job_id |
| **ai_interactions** | session_id FK, input_text, flagged boolean | user_id nullable (anonymized on deletion but retained); context_snapshot JSONB |
| **credit_transactions** | user_id FK, type enum, amount_credits | + amount_currency, payment_method, status, payment_reference |
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
| **therapist_referrals** | user_id FK, contact_detail TEXT (encrypted), status | + preferred_time, contact_method, specific_needs, admin_notes |
| **feedback** | type enum, rating CHECK 1-5, session_id FK | NO user_id — fully anonymous by design |
| **psychoeducation_articles** | title, category enum (11), status enum, content_type | + content, estimated_read_minutes, tags[], created_by FK, published_at; content_type ∈ {article, story}; author_name/bio/source_url for stories; 55 seeded articles |
| **ai_usage** | user_id FK, date, token_count | UNIQUE(user_id, date); supports 50k daily limit |
| **events** | user_id FK nullable, event_name VARCHAR(64), properties JSONB | Basic funnel analytics; user_id SET NULL on delete; 3 indexes (name, user_id, created_at DESC) |

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
POST   /persona               — {persona_name, tone, response_style, formality, uses_alias}
GET    /status                — {consent, persona, first_mood, signup_bonus, welcome_seen}
PATCH  /welcome-seen          — Sets welcome_seen=true
```

### Moods (`/api/moods`)
```
POST   /                      — {mood_level, tags[], note} → {mood_id, streak_count, bonus_credited}
GET    /today                 — {entry} | {entry: null}
GET    /history               — {entries, total, page} (paginated)
GET    /analytics             — {week_trend, month_trend, common_mood, frequent_tags, by_hour, current_streak, total_checkins} (cached 300s)
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
POST   /session/start         — {persona_name} → {session_id}
POST   /session/:id/message   — {input_text max 2000} → {response_text, flagged, action, session_flag_count}
POST   /session/:id/end       — {ended_at}
```

### Credits (`/api/credits`)
```
GET    /balance               — {balance} (cached 30s)
GET    /transactions          — {transactions, total, page} (paginated)
POST   /purchase              — {package_id} → {payment_url, reference} (Paystack)
POST   /webhook               — Paystack webhook; HMAC-SHA512 signature verification; updates balance on charge.success
POST   /deduct                — {session_id, channel} → {new_balance}
```

### Peer Support (`/api/peer`)
```
POST   /request               — {channel_preference} → {request_id}
GET    /requests/open         — {requests}
PATCH  /request/:id/accept    — {session_id, request_id, channel}
PATCH  /request/:id/close     — {ended_at}
GET    /request/:id/status    — {session_id, status} (polling endpoint)
GET    /session/:id           — Session details for participants
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
POST   /                      — {struggles, preferred_time, contact_method, contact_detail, specific_needs}
GET    /my                    — {referrals} with status
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
GET    /referrals             — ?status filter
PATCH  /referrals/:id         — {status, admin_notes}
GET    /risk-flags
POST   /users/:alias/message  — {message} → in-app notification
GET    /resources             — All statuses (admin view)
POST   /resources             — {title, category, content, estimated_read_minutes, tags}
PATCH  /resources/:id
PATCH  /resources/:id/publish
PATCH  /resources/:id/archive
GET    /feedback              — {avg_rating_by_type, recent_comments}
GET    /stats                 — {dau, checkins_today, peer_sessions_today, ai_sessions_today, credits_purchased_today}
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
| Peer Escalation | 90s after peer_request INSERT | If status still 'open' at 90s → mark escalated, notify admin |

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

### Completed Phases (18/18)
| Phase | Status | Description |
|---|---|---|
| Phase 1 | ✅ | Database migrations (34 SQL files, 25 tables) |
| Phase 2 | ✅ | Backend auth & onboarding APIs |
| Phase 3 | ✅ | Core module APIs (moods, journals, AI chat) |
| Phase 4 | ✅ | Credits & Paystack payments |
| Phase 5 | ✅ | Peer support + WebRTC signaling |
| Phase 6 | ✅ | Groups & moderation |
| Phase 7 | ✅ | Emergency & safety plan |
| Phase 8 | ✅ | Notifications (FCM + BullMQ) |
| Phase 9 | ✅ | Admin dashboard APIs |
| Phase 10 | ✅ | Resources, feedback, referrals, profile, cron jobs |
| Phase 11 | ✅ | React PWA frontend (36 screens) |
| Phase 12 | ✅ | Safety tests (10/10 PASSED) |
| Phase 13 | ✅ | Launch prep (seed scripts, Docker, smoke test) |
| Phase 14 | ✅ | Voice journaling, calming sounds, welcome screen |
| Phase 15 | ✅ | Email verification + password reset flow |
| Phase 16 | ✅ | Performance, security, scale (Redis, RLS, indexes, BullMQ) |
| Phase 17 | ✅ | Feature triage: peer incentives, onboarding condition step, peer quiz gate, group profile UI, Sentry/analytics (migrations 031–034), groups read-only for members |
| Phase 18 | ✅ | Standalone admin panel at `src/admin/` — 8-tab redesign, collapsible sidebar, animated stat cards, mobile responsive; AdminDashboard removed from user app |

### Scoped & Pending (not started — await implementation call)
| Phase | Status | Description |
|---|---|---|
| Phase 19 | 🔲 | Therapist Marketplace — browse-and-interest flow, therapist profiles, admin onboarding |
| Phase 20 | 🔲 | Persona & Language Enhancements — mutable persona, Swahili/Sheng switcher |
| Phase 21 | 🔲 | UI Performance & Design System — TanStack Query, skeletons, Radix tooltips, shared components, Nivo mood calendar |

### Credentials & External Services Status
| Service | Status | Notes |
|---|---|---|
| **Supabase DB** | ✅ Connected | DATABASE_URL + POOLER_URL set; migrations 001–030 all applied |
| **Groq AI** | ✅ Configured | GROQ_API_KEY set; llama-3.3-70b-versatile primary |
| **Resend Email** | ✅ Configured | RESEND_API_KEY set; EMAIL_FROM=onboarding@resend.dev (Resend shared sender, no domain verification needed) |
| **Firebase FCM** | ⚠️ Partial | Service account JSON present at `src/backend/config/` (gitignored); FCM_SERVICE_ACCOUNT_PATH set but FCM_SERVICE_ACCOUNT_JSON env not populated — verify which load path `utils/fcm.js` uses |
| **Upstash Redis (REST)** | ✅ Connected | UPSTASH_REDIS_REST_URL + TOKEN set; @upstash/redis REST client active for cache + rate limiting; PING verified; cache set/get/del round-trip verified |
| **Upstash Redis (TCP)** | ⚠️ Blocked locally | UPSTASH_REDIS_URL set but port 6380 blocked on local network; ioredis gives up after 3 retries (family:4 fix prevents AggregateError flood); BullMQ falls back to sync delivery locally; will connect on Railway |
| **Paystack** | ❌ Not configured | PAYSTACK_SECRET_KEY still placeholder; needs live account |
| **TURN Server** | ⚠️ OpenRelay | Using free openrelay.metered.ca — adequate for testing, may drop under load; upgrade for production |

### Remaining Actions
| Task | Blocker |
|---|---|
| Verify FCM path | Check `utils/fcm.js` — uses `FCM_SERVICE_ACCOUNT_JSON` env or `FCM_SERVICE_ACCOUNT_PATH` file; confirm which and set accordingly |
| Test payment flow | Paystack live account + public webhook URL (Railway deploy needed) |
| Configure TURN for production | Metered.ca paid plan or self-hosted coturn on Railway |
| Deploy to Railway | Set all production env vars; run seed scripts; TCP Redis will connect from Railway |

---

## 9. KNOWN ISSUES

| Issue | Location | Severity | Notes |
|---|---|---|---|
| BullMQ TCP blocked locally | `config/redis.js` | Low | Port 6380 blocked on local network; ioredis retries 3× then stops (no crash, no flood); BullMQ falls back to sync delivery; resolves automatically on Railway |
| FCM load path unclear | `utils/fcm.js` | Medium | Firebase JSON file exists at `src/backend/config/` (gitignored); verify fcm.js reads via `FCM_SERVICE_ACCOUNT_PATH` or `FCM_SERVICE_ACCOUNT_JSON` env |
| Paystack not configured | `routes/credits.js` | Medium | Placeholder keys; purchase + webhook flow untestable |
| TURN server is free tier | `ws/signaling.js` | Low | openrelay.metered.ca is adequate for testing; upgrade before launch |
| Peer escalation uses setTimeout | `routes/peer.js` | Low | In-memory timer lost on server restart; consider BullMQ delayed job in production |

---

## File Counts Summary

| Category | Count |
|---|---|
| Database migrations | 34 SQL files (001–034, all applied to Supabase) |
| Database tables | 25 (23 app + events + migrations_log + token_blacklist; all RLS-enabled) |
| Backend route files | 16 |
| Backend middleware | 3 |
| Backend utilities | 9 |
| Backend services | 2 |
| Background workers | 2 |
| Cron jobs | 3 |
| Frontend screens (user app) | 36 |
| Admin panel tabs | 8 (standalone `src/admin/` app) |
| API endpoints (total) | ~65 |
| Cache keys | 7 |
| BullMQ queues | 2 |
| Build phases complete | 18/18 |
| Safety tests passed | 10/10 |

### Additional Projects
| Project | Path | Purpose |
|---|---|---|
| Landing site | `landing-site/` | Standalone Vite React competition entry; no CTA/signup; Vercel-ready |
