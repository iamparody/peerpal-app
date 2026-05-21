# Next Session — Pick Up Here

## Immediate fixes — DONE ✅ (2026-05-21)

### 1. Dashboard — tappable mood area ✅
### 2. Dashboard — timestamp format ✅
### 3. ArticleScreen bugs (blank content, read time, crisis banner, markdown) ✅
### 4. Trauma + relationships articles (10 new), stories infrastructure ✅

---

## Migration 035 — DONE ✅ (2026-05-21)

Applied to Supabase: `trauma` + `relationships` enum values added, `content_type`/`author_name`/`author_bio`/`source_url` columns live. All 55 articles seeded (45 original + 10 new trauma/relationships). Article peer review in progress.

---

## On hold — awaiting name decision

### App icon
**Decision:** Two arcs meeting at center (bridge span silhouette), warm amber `#E88B3F` → golden `#C8943A` gradient.
**Work (once name is final):**
1. Create `src/frontend/public/icon.svg` — the SVG source
2. Generate PNG exports: `icon-192.png`, `icon-512.png` in `public/`
3. Update `src/frontend/public/manifest.json` with correct `icons` array + app name
4. Update `vite.config.js` PWA plugin config to reference the icon files
5. Add `<link rel="icon" href="/icon.svg">` to `index.html`
6. Find/replace app name across: `DashboardScreen.jsx` top bar, `manifest.json`, `index.html` title, `README.md`

---

## Paystack (do before deployment)

**File:** `src/backend/.env`
**Action:** Fill in:
```
PAYSTACK_SECRET_KEY=sk_live_...
PAYSTACK_WEBHOOK_SECRET=...
```
Get from: https://dashboard.paystack.com/#/settings/developer

---

## Deployment — Railway

Order:
1. Set all production env vars in Railway dashboard (use `.env.example` as checklist)
2. Set `FCM_SERVICE_ACCOUNT_JSON` as the full single-line JSON string (not the file path — Railway has no filesystem)
3. Re-enable `UPSTASH_REDIS_URL=rediss://...` (port 6380 works on Railway)
4. Run migrations: `npm run migrate` (Railway shell or deploy hook)
5. Run seeds if needed (admin user, psychoeducation articles)
6. Smoke test: register → verify email → onboarding → mood → AI chat → credits
7. Set `FRONTEND_URL` to deployed frontend URL for CORS

---

## Migrations to apply — Phase 19

Migrations 036–039 are written but not yet applied to Supabase. Run before using any therapist marketplace features:

```bash
npm run migrate
```

Files:
- `036_therapist_profiles.sql` — therapist_profiles table
- `037_therapist_interests.sql` — therapist_interests table
- `038_referrals_support_style.sql` — support_style_preference column on therapist_referrals
- `039_therapist_rls.sql` — RLS deny-anon for both new tables

---

## Pending phases (await implementation call)

- **Phase 20** — Persona & Language Enhancements (CHECKLIST.md 20.1–20.3)
- **Phase 21** — UI Performance & Design System (CHECKLIST.md 21.1–21.6)
