# Peer Screening Governance — v1

---

## 1. Feature Flag

`PEER_SCREENING_LIVE=false` (default, set in backend env)

The peer screening system can be fully built and tested with this flag off. When `false`:
- Training screens are accessible to peers
- Skills and permissions are issued normally
- Routing engine does NOT filter by permission — all peers remain eligible
- Topic picker appears in the UI but has no routing effect

**Development / staging:** Set `PEER_SCREENING_LIVE=true` freely — use draft scenarios for full end-to-end testing.

**Production:** Set `PEER_SCREENING_LIVE=true` only after:
- All baseline scenario content has received written clinical sign-off
- Supervision queue has a named reviewer with a defined response window
- At least 20 peers have completed baseline training in staging

---

## 2. Change Control

### 2.1 What triggers a version bump

A **version bump** is required when any of the following change:
- A skill is added, removed, or renamed
- A permission's required skill list changes
- A topic is added, removed, or its required permission changes
- A prerequisite relationship changes
- A scenario's pass/fail scoring changes materially

A version bump is NOT required for:
- Fixing a typo in scenario text
- Updating display copy or disclaimer wording
- Adding a new scenario variant (A/B) without changing pass criteria

### 2.2 Approval process

| Change type | Who approves |
|---|---|
| Scenario text edits (non-scoring) | Product owner |
| New skill or permission | Product owner + clinical reviewer |
| Scoring change | Clinical reviewer |
| Prerequisite graph change | Product owner |
| Emergency fix (active harm risk in scenario) | Product owner alone, clinical review within 7 days |

### 2.3 Version bump procedure

1. Update `taxonomy-v1.md` → increment filename to `taxonomy-v2.md`
2. Update the change log table at the bottom of the taxonomy doc
3. Run the version drift check to identify peers whose permissions were granted on the old version
4. Set a 30-day grace period for those peers (notify them to refresh)
5. Update `skills.current_version` in the DB for affected skills
6. Existing peer_skills rows with older `scenario_version_completed` become inactive after grace period

---

## 3. Supervision Queue SLA

### 3.1 What generates a flag

The nightly flag aggregation job checks rolling patterns per peer per permission. A flag is inserted into `permission_flags` when any of these thresholds are crossed:

| Signal | Threshold | Action |
|---|---|---|
| Requester feedback ≤ 2/5 | 3 sessions within 14 days | Queue for review |
| Confidence-to-accept decline | 5 declines within 7 days for same category | Queue for review (possible overwhelm) |
| Moderation intervention | Any single intervention | Immediate queue |
| Reflection: felt_prepared = false | 4 sessions within 14 days | Queue for review |
| Inactivity | 180 days since last_used_at | Permission set inactive (no flag, automated) |

Thresholds are defined in `src/backend/config/screening.js`, not hardcoded in job logic.

### 3.2 Reviewer

**Current reviewer:** Antony Kiriinya (akirinya@afya.ai)  
**Response window:** 7 days from flag creation  
**Permission status while under review:** Remains active unless reviewer explicitly suspends  
**Escalation:** If not reviewed within 7 days, permission is automatically suspended until reviewed

### 3.3 Possible actions

| Action | Effect |
|---|---|
| No action | Flag resolved, no change to permission |
| Refresher recommended | In-app notification to peer suggesting a refresher; no permission change |
| Refresher required | Permission set to `inactive` until peer completes refresher scenario |
| Temporary suspension | Permission set to `suspended`; peer notified; re-review after 14 days |
| Revocation | Permission set to `revoked`; peer notified with reason; can appeal |

### 3.4 Revocation rule

**No automated process can set `peer_permissions.status = 'revoked'`.** Revocation requires:
- A `permission_flags` row with `reviewer_id` set (non-null)
- `action_taken = 'revocation'`
- The PATCH endpoint that performs revocation checks both conditions and returns 403 if either is missing

---

## 4. Grace Period

When a skill's `current_version` increments:
- Peers who completed the scenario at an older version are notified
- They have **30 days** to complete the updated scenario
- After 30 days, `peer_permissions.status` is set to `inactive` for permissions that depended on that skill
- A peer who completes the refresher within the grace period never loses active status
- Maximum: no grace period may extend beyond 60 days regardless of circumstances

---

## 5. Safety Invariants

These must be preserved by every feature and every code change:

1. No permission implies clinical competence — only demonstrated platform-specific awareness.
2. Every requester always has a fallback path — no topic selection can leave them stranded.
3. Permissions only expand routing eligibility; they never replace crisis protocols.
4. Every active permission is traceable to specific skills and scenario versions.
5. Permissions can be suspended individually without affecting unrelated permissions.
6. No automated quality signal alone can revoke a permission — human review is required.
7. All training content is versioned and auditable.

---

## 6. Clinical Sign-Off Checklist

Before `PEER_SCREENING_LIVE=true`:

- [ ] Named clinical reviewer identified (mental health professional, MHFA-trained, or equivalent)
- [ ] All 5 baseline scenarios reviewed and approved in writing
- [ ] Reviewer confirms: scoring rubric rewards correct behaviors (boundary-setting, open questions, escalation) and penalises harmful ones (advice-giving, clinical claims, minimising)
- [ ] Reviewer confirms: no scenario inadvertently teaches harmful responses
- [ ] Reviewer confirms: escalation paths in all scenarios route to appropriate resources
- [ ] Approved scenarios marked `status: approved` in DB
- [ ] Sign-off document filed (email or document with reviewer name, date, scope of review)
