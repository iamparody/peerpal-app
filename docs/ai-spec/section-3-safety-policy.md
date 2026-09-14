# PeerPal AI Specification
## Section 3: Safety Policy

*Status: Locked*
*Version: 1.0*
*Approval gate: DUAL_REVIEW (see 3.14)*

---

### 3.1 Purpose and Authority

Section 3 is the authoritative safety policy for the PeerPal AI system. It defines the precedence hierarchy referenced by Invariant I1 in Section 0, the risk classification rules, the deterministic crisis path, and the policy decision rules that produce DECIDED output from DETECTED state.

**Authority:** Safety Policy decisions take precedence over all other capability decisions. No capability defined in Sections 4–8 may produce a DECIDED outcome that weakens a safety decision produced by Section 3 rules. Where two components produce conflicting outputs, Section 3 output prevails.

**Scope:** This section governs:
- Risk classification (what constitutes a safety signal and at what level)
- Escalation thresholds and actions
- The deterministic crisis path
- Confidence thresholds for risk-relevant fields
- Policy decision rules mapping DETECTED to DECIDED

**Approval requirement:** All rules, thresholds, taxonomies, and decision tables in this section require DUAL_REVIEW approval before production deployment. Changes to any element of this section after initial approval require a new DUAL_REVIEW. Version-pinning rules from Section 0.5 apply.

---

### 3.2 Safety Decision Precedence Hierarchy

This hierarchy is the authoritative definition of "stronger" referenced in Section 0, I1. When two pipeline stages produce conflicting safety decisions, the decision with higher precedence applies. No downstream component may produce a decision that moves the outcome to a lower-precedence level.

```
Precedence level    EscalationAction            Condition
────────────────────────────────────────────────────────────────────
P1 (highest)        DETERMINISTIC_CRISIS        risk_signal = CRITICAL;
                                                LLM not invoked;
                                                deterministic path only

P2                  ESCALATE_TO_HUMAN           risk_signal = ELEVATED;
                                                or support_need =
                                                SAFETY_ESCALATION with
                                                risk_signal ≥ PRESENT

P3                  SURFACE_RESOURCES           risk_signal = PRESENT;
                                                or risk_signal = ABSENT
                                                with uncertainty_flag = true;
                                                or support_need =
                                                SAFETY_ESCALATION with
                                                risk_signal = ABSENT

P4                  SAFETY_HOLD                 Active escalation pending
                                                confirmation; response
                                                held until escalation
                                                action is complete

P5 (lowest)         NONE                        risk_signal = ABSENT,
                                                uncertainty_flag = false,
                                                support_need ≠ SAFETY_ESCALATION
```

**Monotonicity rule:** The precedence level of the final DECIDED output must be ≥ the highest precedence level present in any DETECTED field or prior turn's safety state. A transition from a higher to a lower precedence level within a session requires explicit policy justification and is recorded as an ESCALATION_DEESCALATION transition event (see 3.11). This is a session-level state event, not a DecisionReasonCode on the DECIDED record.

---

### 3.3 Risk Classification Taxonomy

Risk signals are classified into four levels. Each level maps to an EscalationAction in the policy decision rules (see 3.7). Classification is performed by the risk classifier components defined in 3.4 and 3.5.

```
RiskSignal      Definition
────────────────────────────────────────────────────────────────────
ABSENT          No risk-relevant content detected in the current
                interaction. Does not confirm safety; see Section 1,
                1.6 uncertainty semantics.

PRESENT         Risk-relevant content is detected but does not meet
                the threshold for escalation review. The content is
                safety-relevant but the appropriate response is to
                surface resources and maintain a supportive strategy,
                not to interrupt the interaction or escalate to a human.

ELEVATED        Risk-relevant content that requires escalation review.
                The system cannot determine independently that the user
                is safe. A human escalation path is surfaced and the
                interaction is flagged for review.

CRITICAL        Explicit or strongly implicit crisis content indicating
                imminent risk to the user or others. The deterministic
                crisis path is invoked. The LLM is not called.
```

**Classification is operational, not clinical:** These levels describe the system's operational response, not a clinical assessment of the user's mental state. The classification drives policy action, not a diagnostic conclusion. Labels are not surfaced to the user.

---

### 3.4 Keyword Risk Classifier

The keyword risk classifier is a deterministic, pre-LLM component. It evaluates the user's message text against a controlled vocabulary of risk-relevant terms and phrases, and produces a risk_signal DETECTED field with `status = DETERMINISTIC`.

**Execution order:** The keyword classifier runs before the LLM is invoked. A CRITICAL classification from the keyword classifier causes the LLM to not be called at all. The deterministic crisis path is invoked directly.

**Output schema:**
```
Produces:   DETECTED_SOURCE (intermediate record; input to resolver in 3.5.1)
status:     DETERMINISTIC
confidence_status: NOT_APPLICABLE
```

**Keyword categories:**
```
Category        Risk level produced     Description
────────────────────────────────────────────────────────────────────
CRITICAL_TERMS  CRITICAL                Explicit statements of intent
                                        to harm self or others;
                                        explicit crisis language

ELEVATED_TERMS  ELEVATED                Strong indirect indicators;
                                        expressions of severe hopelessness
                                        or statements of no reason to live
                                        without explicit intent

PRESENT_TERMS   PRESENT                 Risk-relevant content below
                                        escalation threshold; references
                                        to distress, self-harm in past
                                        tense, or abstract discussion
```

**Vocabulary governance:**

The keyword vocabulary is a governed policy artefact, separate from this document. It is referenced by version identifier in every KEYWORD_CLASSIFICATION log event (see 3.11). The artefact contract is:

```
policy_artifact_id      Stable identifier for the keyword vocabulary artefact
policy_artifact_version SemVer; incremented on any change to any category
owner                   AI Safety owner (changes require DUAL_REVIEW)
approval_type           DUAL_REVIEW for all additions and removals
effective_at            UTC timestamp when the version became active
```

Change rules:
- Any change to any category increments policy_artifact_version
- Additions to CRITICAL_TERMS require DUAL_REVIEW and are effective immediately after approval
- The vocabulary must include multilingual terms: English, Swahili, Sheng, and common code-switching patterns
- Physical storage location and access controls are defined in Section 9

**Keyword classifier failure:** If the keyword classifier is unavailable or fails to produce output, the system must treat the interaction as if risk_signal = ELEVATED until a valid classification is available. It must not default to ABSENT. See 3.11 for failure handling.

---

### 3.5 Contextual Risk Classifier

The contextual risk classifier is an LLM-based or ML-based component that evaluates the full message context — including session history, expressed emotion, and support need — to detect risk signals that the keyword classifier may miss. It produces a DETECTED_SOURCE record with `status = INFERRED`. This intermediate record is not consumed by the policy engine directly; it is an input to the resolver (3.5.1), which produces the canonical DETECTED record.

**Execution order:** Contextual classification runs independently of the keyword classifier. Both classifiers produce DETECTED_SOURCE records simultaneously. Neither classifier modifies the other's output.

**Output schema:**
```
Produces:   DETECTED_SOURCE (intermediate; resolver input only)
status:     INFERRED
confidence_status: AVAILABLE
confidence: 0.0–1.0 (required)
uncertainty_flag: true if confidence < applicable threshold (3.9)
```

**What contextual classification must detect:**
```
INDIRECT_DISTRESS       Risk content expressed through metaphor, indirection,
                        or culturally specific phrasing not covered by keywords

PASSIVE_IDEATION        Expressions of not wanting to continue or exhaustion
                        with life, without explicit intent statements

DECLINING_DISCLOSURE    Risk signal present in prior context but user now
                        minimising; context indicates the earlier signal
                        was genuine

REPEATED_SIGNAL         Same class of risk signal appearing across consecutive
                        turns
```

**Contextual classifier failure:** If the contextual classifier is unavailable, its DETECTED_SOURCE is absent. The resolver handles a missing contextual source per 3.5.1 failure rules. See 3.10.

---

### 3.5.1 Risk Signal Resolver

The resolver is a deterministic component. It receives DETECTED_SOURCE records from the keyword classifier and the contextual classifier, and produces a single canonical DETECTED record for consumption by the policy engine. **The resolver makes no policy decisions.** Its output is a detection result, not a policy action.

**Boundary:**
```
Classifier  →  DETECTED_SOURCE    (detection only)
Resolver    →  canonical DETECTED (detection only; no policy action)
Policy engine → DECIDED           (policy action; consumes canonical DETECTED)
```

**Architecture:**
```
Keyword classifier    →  DETECTED_SOURCE (DETERMINISTIC)  ─┐
                                                            ├─→ Resolver → canonical DETECTED → Policy engine
Contextual classifier →  DETECTED_SOURCE (INFERRED)       ─┘
```

**Resolution rule — severity-first with uncertainty propagation:**

The canonical risk_signal value is the maximum severity level from any source.
Severity ordering (highest to lowest): CRITICAL > ELEVATED > PRESENT > ABSENT.

```
R_S1  If any source produces risk_signal = CRITICAL:
      canonical.value = CRITICAL
      canonical.status = DETERMINISTIC  (if keyword source = CRITICAL)
                         INFERRED       (if contextual source only = CRITICAL)
      Inherit confidence and uncertainty_flag from contextual source if INFERRED.

R_S2  Otherwise, canonical.value = max(keyword_result, contextual_result).

R_S3  Canonical status:
      - Canonical level matches keyword result:
        status = DETERMINISTIC; confidence_status = NOT_APPLICABLE
      - Canonical level is from contextual source only:
        status = INFERRED; inherit confidence and uncertainty_flag
      - Both sources produce the same level:
        status = DETERMINISTIC (keyword confirmation); confidence_status = NOT_APPLICABLE
```

**Uncertainty propagation:**
- A canonical INFERRED risk_signal inherits uncertainty_flag from the contextual source.
- An uncertain contextual signal at ELEVATED does not reduce the escalation level. Policy Rule R2 applies ESCALATE_TO_HUMAN regardless of uncertainty_flag at ELEVATED.
- A DETERMINISTIC result carries no uncertainty_flag (confidence_status = NOT_APPLICABLE).

**Resolver failure handling:**
```
Keyword source missing:      Use contextual result as canonical.
                             Log CLASSIFIER_FAILURE for keyword component.

Contextual source missing:   Use keyword result as canonical.
                             Log CLASSIFIER_FAILURE for contextual component.

Both sources missing:        FAIL_CLOSED.
                             Treat as risk_signal = ELEVATED, status = DETERMINISTIC.
                             Log CLASSIFIER_FAILURE for both components.
                             Policy engine applies Rule R2.

Resolver itself unavailable: FAIL_CLOSED.
                             Treat as risk_signal = ELEVATED.
                             Log CLASSIFIER_FAILURE.
```

---

### 3.6 Crisis Detection and Deterministic Path

When risk_signal = CRITICAL (from any classifier), the deterministic crisis path is invoked. This path is defined in code and policy, not inferred by a model.

**Deterministic crisis path steps:**

```
1. LLM call is not made
2. DECIDED is written with:
   strategy = CRISIS_RESPONSE
   escalation_action = DETERMINISTIC_CRISIS
   must_validate = true
   may_suggest_exercises = false
   question_limit = 0
   max_response_length = [defined by crisis response template]
   reason_code = POLICY_ESCALATION_TRIGGERED

3. GENERATED is produced from the deterministic crisis response
   template, not from the LLM. The template is versioned and
   requires DUAL_REVIEW approval for any change.

4. The deterministic response must:
   - Acknowledge that the user is going through something difficult
   - Not diagnose, assess, or interpret the user's mental state
   - Surface crisis support resources (see 3.6.1)
   - Not ask clarifying questions (question_limit = 0)
   - Not suggest exercises or psychoeducation
   - Comply with the language of the user's input

5. Validation: the deterministic response is validated against
   criteria DOES_NOT_DIAGNOSE and DOES_NOT_PRESCRIBE_TREATMENT
   before delivery. It may not be modified by any AI component.
```

**3.6.1 Crisis support resources:**

The crisis response template surfaces a defined set of crisis support resources. The resource list is a versioned policy artefact maintained separately from this document. It must include:
- At least one 24/7 crisis line reachable from Kenya
- Emergency services reference
- In-app peer escalation path if available

Changes to the resource list require DUAL_REVIEW and are effective immediately after approval.

**Deterministic path failure:** If the crisis response template is unavailable, the system must fail closed: display a static fallback message that surfaces emergency services and does not generate any AI content. The static fallback is defined in code, not policy, and must be present in all deployments.

---

### 3.7 Escalation Thresholds and Decision Rules

Policy decision rules map DETECTED state to DECIDED output. Rules are evaluated in precedence order. The first matching rule applies. Lower-precedence rules are not evaluated once a higher-precedence rule matches.

**Rule R1 — Critical risk (P1):**
```
Condition:  risk_signal.value = CRITICAL
Output:     strategy = CRISIS_RESPONSE
            escalation_action = DETERMINISTIC_CRISIS
            must_validate = true
            may_suggest_exercises = false
            question_limit = 0
            reason_code = POLICY_ESCALATION_TRIGGERED
Note:       LLM is not invoked. Deterministic path (3.6) executes.
            This rule takes precedence over all other rules including
            support_need and urgency values.
```

**Rule R2 — Elevated risk (P2):**
```
Condition:  risk_signal.value = ELEVATED
Output:     strategy = VALIDATION_FOCUS
            escalation_action = ESCALATE_TO_HUMAN
            must_validate = true
            may_suggest_exercises = false
            question_limit = 1
            reason_code = POLICY_ESCALATION_TRIGGERED
Note:       Applies regardless of uncertainty_flag value.
            Elevated risk with uncertainty does not reduce to
            SURFACE_RESOURCES. Uncertainty is conserved, not
            used to weaken the escalation action.
```

**Rule R3 — Safety escalation support need with absent risk (P2/P3):**
```
Condition:  support_need.value = SAFETY_ESCALATION
            AND risk_signal.value = ABSENT
Output:     strategy = VALIDATION_FOCUS
            escalation_action = SURFACE_RESOURCES
            must_validate = true
            may_suggest_exercises = false
            question_limit = 1
            reason_code = STRATEGY_BY_SUPPORT_NEED
Note:       Cross-record constraint from Section 1 requires
            escalation_action ≠ NONE when support_need =
            SAFETY_ESCALATION. This rule satisfies that constraint.
```

**Rule R4 — Present risk (P3):**
```
Condition:  risk_signal.value = PRESENT
Output:     strategy = VALIDATION_FOCUS
            escalation_action = SURFACE_RESOURCES
            must_validate = true
            may_suggest_exercises = false
            question_limit = 2
            reason_code = POLICY_ESCALATION_TRIGGERED
            (or STRATEGY_BY_SUPPORT_NEED if support_need also routes here)
```

**Rule R5 — Absent risk with uncertainty (P3):**
```
Condition:  risk_signal.value = ABSENT
            AND risk_signal.uncertainty_flag = true
Output:     strategy = VALIDATION_FOCUS
            escalation_action = SURFACE_RESOURCES
            must_validate = true
            may_suggest_exercises = false
            question_limit = 2
            reason_code = UNCERTAINTY_CONSERVED
Note:       Uncertain ABSENT is treated conservatively. Resources
            are surfaced as a precaution. Uncertainty is not treated
            as a safe state.
```

**Rule R6 — Default: support need routing (P5):**
```
Condition:  risk_signal.value = ABSENT
            AND risk_signal.uncertainty_flag = false
            AND support_need.value ≠ SAFETY_ESCALATION
Output:     escalation_action = NONE
            must_validate = true
            strategy = [see support_need strategy mapping below]
            question_limit = [see per-strategy defaults below]
            reason_code = STRATEGY_BY_SUPPORT_NEED
            (or DEFAULT_STRATEGY_APPLIED if support_need = NONE_IDENTIFIED)
```

**Rule R7 — Urgency uncertainty conservation:**
```
Condition:  urgency.uncertainty_flag = true
            AND risk_signal does not already produce a higher-precedence rule
Output:     policy engine evaluates the interaction at one urgency level
            higher than the detected value:
              NONE  → LOW
              LOW   → MODERATE
              MODERATE → HIGH
            urgency = HIGH or CRITICAL with uncertainty_flag = true
            is handled at the detected level (no further escalation
            beyond what risk_signal rules already require)
            reason_code = UNCERTAINTY_CONSERVED
Note:       The detected urgency value is unchanged in DETECTED.
            The conservative level is applied internally by the
            policy engine for this decision only. It is logged in
            the POLICY_DECISION event.
```

**Support need → strategy mapping (R6):**
```
SupportNeed             Strategy                question_limit  may_suggest_exercises
─────────────────────────────────────────────────────────────────────────────────────
EMOTIONAL_VALIDATION    VALIDATION_FOCUS        2               false
PRACTICAL_GUIDANCE      OPEN_SUPPORT            2               false
PSYCHOEDUCATION         PSYCHOEDUCATION         1               false
PEER_BRIDGE             OPEN_SUPPORT            1               false
CHECK_IN                OPEN_SUPPORT            2               governed by exercise allowlist
                                                                in Section 7; Section 3 does
                                                                not own exercise eligibility
NONE_IDENTIFIED         OPEN_SUPPORT            2               false
```

---

### 3.8 Safety Hold Conditions

A SAFETY_HOLD is a DECIDED state in which the current strategy is suspended and no non-safety LLM response is delivered until the hold condition is resolved.

**Conditions that produce SAFETY_HOLD:**
- `escalation_action = DETERMINISTIC_CRISIS` is pending and the crisis path has not yet completed
- System awaits confirmation that the crisis response was delivered

**SAFETY_HOLD is not a persistent state.** It resolves to DETERMINISTIC_CRISIS completion or, if the crisis path fails, to the static fallback defined in 3.6.

---

### 3.9 Confidence Thresholds

Section 1 defines that `uncertainty_flag = true` when confidence is below a threshold defined in this section. The thresholds are policy parameters, not schema parameters.

**Threshold structure:**
```
Field                   Threshold name              Notes
────────────────────────────────────────────────────────────────────
risk_signal.confidence  RISK_UNCERTAINTY_THRESHOLD  Set conservatively.
                                                    A lower threshold
                                                    flags more detections
                                                    as uncertain. For
                                                    risk, the cost of
                                                    missing uncertainty is
                                                    higher than the cost
                                                    of over-flagging it.

urgency.confidence      URGENCY_UNCERTAINTY_THRESHOLD

support_need.confidence SUPPORT_NEED_UNCERTAINTY_THRESHOLD

expressed_emotion       EMOTION_UNCERTAINTY_THRESHOLD
.confidence
```

**Threshold values:** Specific numeric values for each threshold are set jointly by the AI Safety owner and clinical safety reviewer during DUAL_REVIEW. They are stored as versioned policy parameters alongside this section. They are not hardcoded in this document because they require calibration against evaluation data (Section 2, 2.9 uncertainty_calibration metric).

**Threshold change protocol:** A change to any threshold value requires DUAL_REVIEW. A threshold that is made less conservative (higher value, flagging less as uncertain) for risk_signal requires additional justification: the existing evaluation data must show that the current threshold is producing false uncertainty flags at a rate that exceeds the risk of missed genuine uncertainty.

**Pre-condition:** All uncertainty thresholds applicable to DETECTED fields produced by the system must be defined, numerically specified, versioned, and approved before production deployment of any capability that relies upon them. This requirement applies to whichever DETECTED fields carry threshold semantics — it is not limited to the four listed above if the field set changes. An undefined threshold is not a valid basis for a production evaluation run.

---

### 3.10 Failure Modes

Safety-critical components must fail closed. The following failure states are defined.

**Keyword classifier unavailable or malformed output:**
- Action: treat risk_signal as ELEVATED (not ABSENT)
- escalation_action: ESCALATE_TO_HUMAN
- LLM is not invoked
- Violation logged as INVALID_RUN contributor (see Section 2, 2.13)
- Classification: FAIL_CLOSED

**Contextual classifier unavailable or schema-invalid output:**
- Action: use keyword classifier result as the sole risk_signal
- If keyword classifier is also unavailable: treat as ELEVATED (both classifiers down → fail closed)
- Violation logged
- Classification: FAIL_CLOSED

**Policy engine unavailable:**
- Action: do not produce a DECIDED record; invoke deterministic safe response
- LLM is not invoked
- Deterministic safe response surfaces escalation resources without AI content
- Classification: FAIL_CLOSED

**Crisis response template unavailable:**
- Action: static fallback defined in 3.6 executes
- No AI content is generated
- Classification: FAIL_CLOSED

**Safety classifier produces unknown enum value in risk_signal:**
- Action: treat as ELEVATED (unknown value cannot be assumed safe)
- Classification: FAIL_CLOSED (schema violation per Section 1, 1.10)

---

### 3.11 Observability

The following events must be logged for every interaction that passes through the safety policy.

```
Event                       Fields logged
────────────────────────────────────────────────────────────────────
KEYWORD_CLASSIFICATION      session_id, detection_id,
                            risk_signal.value,
                            risk_signal.status (DETERMINISTIC),
                            matched_category (CRITICAL/ELEVATED/PRESENT/ABSENT),
                            keyword_classifier_version,
                            timestamp

CONTEXTUAL_CLASSIFICATION   session_id, detection_id,
                            risk_signal.value,
                            risk_signal.status (INFERRED),
                            risk_signal.confidence,
                            risk_signal.uncertainty_flag,
                            contextual_classifier_version,
                            timestamp

POLICY_DECISION             session_id, decision_id, detection_id,
                            escalation_action, strategy,
                            upstream_uncertainty,
                            policy_version, reason_code,
                            timestamp

CRISIS_PATH_INVOKED         session_id, decision_id,
                            trigger (KEYWORD or CONTEXTUAL),
                            crisis_template_version,
                            timestamp

ESCALATION_DEESCALATION     session_id, decision_id,
                            prior_escalation_action,
                            new_escalation_action,
                            reason_code,
                            timestamp

CLASSIFIER_FAILURE          session_id, failure_type,
                            fallback_action_taken,
                            timestamp
```

Logged fields must not include raw message text. Message text is accessible via the OBSERVED record lineage. Observability logs reference record IDs, not content.

---

### 3.12 Evaluation Requirements

Safety Policy evaluation uses the corpus defined in Section 2. The following case types are mandatory for production eligibility of this section:

```
Case type               Coverage requirement
────────────────────────────────────────────────────────────────────
CRISIS                  All scenario classes from Section 2, 2.6;
                        all language variants
SAFETY_SIGNAL           All risk levels; all language variants
BOUNDARY                Risk boundary cases across PRESENT/ELEVATED
                        and ELEVATED/CRITICAL thresholds
ADVERSARIAL             All scenarios from Section 2, 2.7
LONGITUDINAL            State transition and repeated signal cases
                        from Section 2, 2.8
```

**Absolute evaluation gates for this section:**
- Zero SAFETY_FAILURE events
- REGRESSION set pass rate = 100%
- risk_signal false negative rate at ELEVATED = 0%
- risk_signal false negative rate at CRITICAL = 0%
- Crisis path invocation rate = 100% for all CRISIS cases

Threshold values for non-absolute metrics are defined per Section 2, 2.14.

---

### 3.13 Approval Gate

**Required:** DUAL_REVIEW

The following elements require explicit sign-off from both the clinical safety reviewer and the AI Safety owner, independently:

```
Clinical safety reviewer signs off on:
  - Risk classification taxonomy (3.3)
  - Keyword category definitions and vocabulary (3.4)
  - Contextual risk signal definitions (3.5)
  - Deterministic crisis path content and resource list (3.6)
  - Escalation thresholds (3.7 rules R1–R6)
  - Confidence threshold values (3.9)
  - Evaluation case coverage for safety scenarios (3.12)

AI Safety owner signs off on:
  - Policy decision rules and precedence hierarchy (3.2, 3.7)
  - Classifier failure handling (3.10)
  - Observability scope and fields (3.11)
  - Evaluation run validity (3.12)
  - All of the above in combination
```

Both reviewers must approve independently before production deployment. Sign-off is version-specific and references the corpus version used for evaluation.

---

*End of Section 3.*
