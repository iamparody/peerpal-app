# Skill Prerequisite Graph — v1

Skills form a directed acyclic graph (DAG). A skill cannot be issued unless all listed prerequisites are already held by the peer at level 1 or above.

---

## Graph

```
active_listening ──────────────────────────────────────────┐
                                                            │
empathy_and_validation ─────────────────────────────────── │ ──► [All specialty skills]
                                                            │
confidentiality_and_privacy ────────────────────────────── │
                                                            │
active_listening ──► boundary_setting ─────────────────────┤
                                                            │
active_listening ──► boundary_setting ──► escalation_and_referral ──► [All specialty skills]
```

Simplified:

```
Tier 0 (no prereqs)
  active_listening
  empathy_and_validation
  confidentiality_and_privacy

Tier 1 (requires Tier 0 specific)
  boundary_setting          ← requires: active_listening
  
Tier 2 (requires Tier 1 specific)
  escalation_and_referral   ← requires: active_listening, boundary_setting

Tier 3 — Specialty (requires ALL 5 baseline)
  trauma_informed_communication
  grief_and_loss_support
  identity_sensitive_communication
  sexual_harassment_awareness
  relationship_support
  bullying_support
  stress_and_burnout
  financial_stress_support
  parenting_support
  addiction_awareness
  domestic_violence_awareness
  disability_awareness
  cultural_sensitivity
```

---

## Rationale

- **Active Listening first** — all peer support flows from the ability to listen. No skill is meaningful without it.
- **Boundary Setting requires Active Listening** — you can only set appropriate limits if you are first able to hear what the person is expressing. Listening reveals where boundaries become necessary.
- **Escalation requires Boundary Setting** — knowing when to refer someone on is itself a boundary: acknowledging the limits of peer support. You cannot teach escalation to someone who hasn't learned that limits are legitimate.
- **All specialty skills require all 5 baseline** — specialty skills deal with higher-risk situations. A peer must demonstrate the full baseline suite before entering those conversations. There are no shortcuts.

---

## Enforcement Rules

1. The API blocks `POST /training/skills/:slug/start` if any prerequisite is not held.
2. The UI grays out skills with unmet prerequisites and shows which prerequisite is needed.
3. Prerequisite checking uses `peer_skills.is_active = true` — an inactive skill does not satisfy a prerequisite.
4. If a prerequisite skill lapses (inactivity), any downstream specialty permission also becomes inactive until the prerequisite is refreshed.

---

## Future Extensions

When adding a new specialty skill, it inherits "requires all 5 baseline" by default unless explicitly specified otherwise. No new intra-baseline dependencies should be added without a taxonomy version bump.
