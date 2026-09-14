# PeerPal AI Specification
## Section 1: Shared Schema

*Status: Locked*
*Version: 1.0*

---

### 1.1 Schema Principles

The following principles govern every field, enum, and contract in this section. Downstream sections may not introduce schemas that contradict them.

**P1 — Minimal fields.**
No field is defined unless it has a named purpose in a specific component. Free-form annotation fields are not permitted on any stage schema.

**P2 — Bounded values.**
Every field on a DETECTED or DECIDED record has a closed set of permitted values drawn from the controlled enumerations in 1.7. Open-text inferred fields are prohibited.

**P3 — Stage integrity.**
A record may not be promoted from one stage to another by rewriting its stage label. DETECTED records are not editable after write. OBSERVED records are not editable by any AI component.

**P4 — Uncertainty is first-class where applicable.**
Each DETECTED field carries a `confidence_status` of either `AVAILABLE` or `NOT_APPLICABLE`. A float confidence value (0.0–1.0) is required only when `confidence_status = AVAILABLE`. A missing confidence value where `confidence_status = AVAILABLE` is a schema violation. Null confidence where `confidence_status = NOT_APPLICABLE` is not a violation. A confidence value being present and emitting a number does not make it a calibrated probability; calibration is validated against the evaluation corpus in Section 2.

**P5 — Provenance is required.**
Every DETECTED, DECIDED, and GENERATED record carries a reference to the upstream record(s) it was derived from. A record without a valid upstream reference is a schema violation.

**P6 — reason_code is shared vocabulary.**
DETECTED and DECIDED records carry a reason_code drawn from the controlled enumeration in 1.7. This is the common explanation vocabulary across Safety (Section 3), AI (Sections 4–7), and Evaluation (Section 2). reason_code must not be used to expose raw model reasoning or hidden intermediate state.

**P7 — Schema is versioned.**
Every record type carries the schema version under which it was written. Schema version changes follow the compatibility rules in 1.8.

---

### 1.2 OBSERVED Stage Schema

OBSERVED records represent data that exists in the system independent of AI inference. No AI component may alter an OBSERVED record.

```
Field               Type        Required    Constraints
─────────────────────────────────────────────────────────────────
record_id           UUID        Yes         Globally unique; immutable after write
user_id             UUID        Yes         References authenticated user
source              Enum        Yes         See ObservedSource in 1.7
created_at          Timestamp   Yes         UTC; immutable after write
session_id          UUID        No          Present when source is SESSION_MESSAGE
                                            or SESSION_EVENT
content_type        Enum        Yes         See ObservedContentType in 1.7
content_ref         UUID        Yes         Opaque identifier referencing the source
                                            record in its originating system. The
                                            mapping from ObservedSource to authoritative
                                            source records is defined in Section 9.
                                            content_ref must not be interpreted without
                                            that mapping.
schema_version      SemVer      Yes         Version of this schema at write time
```

**Design note:** OBSERVED records are typed, versioned pointers to existing data, not copies. The content lives in its source system. This ensures there is one authoritative copy of what the user said or did.

---

### 1.3 DETECTED Stage Schema

DETECTED records represent AI-inferred properties of a specific OBSERVED interaction. A DETECTED record must never be created without a valid OBSERVED upstream reference.

**Scope constraint:** DETECTED records represent properties of a single interaction context. They are not longitudinal profiles, condition inferences, or diagnostic assessments. The permitted fields and their controlled enumerations enforce this boundary.

**Non-clinical constraint:** DETECTED records describe observable interaction signals and operational inferences. They do not assign diagnoses, clinical states, or clinical assessment results. Every field name, permitted value, and inference label is reviewable against this constraint. A value that encodes a clinical interpretation does not belong in the DETECTED schema.

**DetectedField pattern:** Every inferred property in a DETECTED record is a structured object, not a scalar. Each field carries its own provenance, status, and — where applicable — calibrated confidence. This allows different fields to be produced by different components at different versions, and allows the policy engine to treat each field's uncertainty independently.

```
DetectedField<T>:

Field               Type        Required    Constraints
─────────────────────────────────────────────────────────────────
value               T           Yes         Permitted values defined by the controlling
                                            enum; null permitted only where the field
                                            is explicitly nullable (see below)
status              Enum        Yes         See DetectionStatus in 1.7
confidence_status   Enum        Yes         See ConfidenceStatus in 1.7
confidence          Float       Conditional 0.0–1.0 inclusive; required when
                                            confidence_status = AVAILABLE; null when
                                            confidence_status = NOT_APPLICABLE.
                                            Presence does not imply calibration; see 1.6.
uncertainty_flag    Boolean     Conditional Required when confidence_status = AVAILABLE;
                                            true when confidence is below the threshold
                                            defined in Section 3
provenance          Object      Yes         Structured reference to the source data:
                                              source_type: ObservedSource (1.7)
                                              id: UUID
detector_version    String      Yes         Version-pinned identifier of the component
                                            that produced this specific field value;
                                            format: "<detector_name>@<semver>"
created_at          Timestamp   Yes         UTC; when this field value was set
```

**DETECTED record (top-level):**

```
Field               Type                               Required    Constraints
────────────────────────────────────────────────────────────────────────────────
detection_id        UUID                               Yes         Globally unique; immutable after write
observed_ref        UUID                               Yes         FK to OBSERVED.record_id
detector_id         String                             Yes         Version-pinned identifier for the
                                                                   overall detection component:
                                                                   "<name>@<semver>"
detected_at         Timestamp                          Yes         UTC; immutable after write
expressed_emotion   DetectedField<ExpressedEmotion>    No          Nullable; absence is valid —
                                                                   not all inputs carry detectable
                                                                   expressed emotion
support_need        DetectedField<SupportNeed>         Yes         Required; every detected interaction
                                                                   has an implied support need
urgency             DetectedField<Urgency>             Yes         Required; independent of risk_signal
risk_signal         DetectedField<RiskSignal>          Yes         Required; describes operational
                                                                   safety-relevant content in the
                                                                   interaction, not clinical state
reason_code         Enum                               Yes         See DetectionReasonCode in 1.7;
                                                                   single primary reason at record level
schema_version      SemVer                             Yes         Version of this schema at write time
```

**Field notes:**

- `expressed_emotion` — named "expressed" to reflect what the user communicated, not a clinical assessment. Nullable because absence of detectable expressed emotion is a valid state. The enum values (see 1.7) are deliberately non-clinical.
- `support_need` — the primary routing signal for the policy engine. Required; even an ambiguous input maps to `NONE_IDENTIFIED`.
- `urgency` and `risk_signal` are independent fields. Urgency reflects response priority; risk_signal reflects the presence of safety-relevant content. They may diverge.
- `risk_signal` describes an operational safety signal — content that requires policy-defined handling. It is not a clinical risk assessment and must not be labelled or communicated as one.

---

### 1.4 DECIDED Stage Schema

DECIDED records represent the deterministic policy engine's output. A DECIDED record must never be created without a valid DETECTED upstream reference.

```
Field                   Type        Required    Constraints
────────────────────────────────────────────────────────────────────────
decision_id             UUID        Yes         Globally unique; immutable after write
detection_ref           UUID        Yes         FK to DETECTED.detection_id
policy_version          SemVer      Yes         Version of the policy engine that
                                                produced this decision
decided_at              Timestamp   Yes         UTC; immutable after write
upstream_uncertainty    Boolean     Yes         True when any DETECTED field relied upon
                                                by this policy decision has
                                                uncertainty_flag = true. Fields not used
                                                as inputs to this decision do not set
                                                this flag; unrelated field uncertainty
                                                does not contaminate the decision audit.
strategy                Enum        Yes         See ResponseStrategy in 1.7;
                                                authoritative definition in Section 5
question_limit          Integer     Yes         0–5; maximum questions permitted in
                                                this response
must_validate           Boolean     Yes         True = generation output must pass
                                                safety validation before delivery
may_suggest_exercises   Boolean     Yes         True = strategy contract permits
                                                exercise suggestions
max_response_length     Integer     Yes         Token limit for generated response;
                                                must be > 0
escalation_action       Enum        Yes         See EscalationAction in 1.7
reason_code             Enum        Yes         See DecisionReasonCode in 1.7;
                                                single primary reason
schema_version          SemVer      Yes         Version of this schema at write time
```

**Immutability constraint:** DECIDED fields are the contract for generation. No LLM output, post-processing step, or downstream component may modify a DECIDED record after it is written. If the policy engine must revise a decision, it writes a new DECIDED record referencing the superseded decision_id.

**Cross-record consistency constraints:**

A DECIDED record must be internally consistent with all safety constraints applicable to its referenced DETECTED state. Any violation is a policy and schema failure and must fail closed.

The following constraint is mandatory:

```
DETECTED.support_need.value = SAFETY_ESCALATION
        ⇒
DECIDED.escalation_action ≠ NONE
```

A DECIDED record that sets `escalation_action = NONE` when the upstream `support_need` is `SAFETY_ESCALATION` is a schema violation. This constraint is evaluated by the policy engine before the DECIDED record is written. Additional safety-coupling constraints are defined in Section 3.

---

### 1.5 GENERATED Stage Schema

GENERATED records represent LLM output produced within the constraints of a DECIDED record. A GENERATED record must never be delivered to the user without a passing validation_status.

```
Field                   Type            Required    Constraints
────────────────────────────────────────────────────────────────────────
generation_id           UUID            Yes         Globally unique; immutable after write
decision_ref            UUID            Yes         FK to DECIDED.decision_id
model_id                String          Yes         Version-pinned identifier:
                                                    "<provider>/<model>@<semver>"
generated_at            Timestamp       Yes         UTC; immutable after write
content                 Text            Yes         The generated response text
validation_status       Enum            Yes         See ValidationStatus in 1.7;
                                                    FAILED records must not be delivered
violations              Array<Enum>     No          GenerationViolation reason codes
                                                    if validation_status is FAILED or
                                                    SANITIZED; empty array otherwise
schema_version          SemVer          Yes         Version of this schema at write time
```

**Delivery rule:** A GENERATED record with validation_status FAILED must not be delivered to the user under any condition. A SANITIZED record may be delivered only if the sanitization removed the specific violations and the remaining content satisfies the strategy contract. This determination is made by the validation component, not the LLM.

---

### 1.6 Provenance and Uncertainty

**Provenance chain:**
Every production record carries a typed reference to its upstream:

```
OBSERVED
  └── DETECTED  (observed_ref → OBSERVED.record_id)
        └── DECIDED  (detection_ref → DETECTED.detection_id)
              └── GENERATED  (decision_ref → DECIDED.decision_id)
```

Within DETECTED, each field additionally carries its own `provenance` and `detector_version` (see 1.3), enabling field-level lineage when different components produce different fields.

A broken provenance link — a reference to a non-existent or inaccessible upstream record — is a schema violation. The handling rule is defined in 1.10.

**Uncertainty semantics:**
Confidence is a first-class value on applicable fields, not a quality score. A confidence of 0.3 is not "bad detection" — it is a valid signal that the input is ambiguous or that the detector has limited coverage for this input type. The policy engine must treat uncertain detections differently from confident ones:

- An uncertain detection of `risk_signal ELEVATED` must be handled with the same escalation caution as a confident detection at that level.
- An uncertain detection of `risk_signal ABSENT` must not be treated as a confirmed safe state. Absence of a confident risk signal is not confirmation of safety. **ABSENT does not mean safe.**
- A `risk_signal` field with `status = DETERMINISTIC` carries no confidence value. It was produced by a rule, not a classifier. The policy engine must account for this distinction; deterministic rules are not subject to confidence thresholds, but they also carry no calibrated probability.

**Confidence threshold:**
The numeric threshold below which `uncertainty_flag` is set to true is defined in Section 3 (Safety Policy). It is a policy parameter, not a schema parameter. The schema requires only that confidence is present where applicable and that `uncertainty_flag` is set accordingly.

---

### 1.7 Controlled Enumerations

All enumerations are versioned alongside the schema. An unknown value in a required enum field is a schema violation (see 1.10).

**ObservedSource**
```
MOOD_ENTRY          User-submitted mood check-in
JOURNAL             User-written journal entry
SESSION_MESSAGE     Message sent during an AI session
SESSION_EVENT       Structured event within a session (start, end, pause)
USER_PROFILE        Profile or onboarding data
PEER_CONTEXT        Injected context from peer bridge
```

**ObservedContentType**
```
TEXT                Unstructured text
STRUCTURED          Typed record (mood score, event metadata)
MIXED               Text with structured metadata
```

**DetectionStatus**
```
INFERRED            Produced by a classifier or ML component
DETERMINISTIC       Produced by rule-based logic; no probabilistic uncertainty
NOT_APPLICABLE      Field is not applicable in this detection context
                    (e.g., expressed_emotion on a SESSION_EVENT record)
```

**ConfidenceStatus**
```
AVAILABLE       A confidence value is present and the component emits one.
                AVAILABLE does not imply the value is calibrated.
                Calibration is validated against the evaluation corpus
                in Section 2.
NOT_APPLICABLE  The component does not produce a confidence value for
                this field — because the signal is deterministic, because
                the component does not support confidence for this field
                type, or because the field status is NOT_APPLICABLE.
```

**ExpressedEmotion**
```
DISTRESS            Expressed distress in any form
SADNESS             Expressed sadness or grief
ANXIETY             Expressed anxiety, worry, or fear
ANGER               Expressed anger or frustration
POSITIVE            Expressed positive emotional state
NEUTRAL             No discernible emotional valence expressed
MIXED               ≥2 distinct emotion classes independently exceed the
                    classification threshold simultaneously. Must not be
                    used to express model uncertainty between two candidate
                    labels — use UNCLEAR for that case.
UNCLEAR             No candidate emotion class exceeds the classification
                    threshold. The input is present but not classifiable
                    at the required confidence level.
```

These labels describe what the user communicated, not a clinical assessment of their emotional state. Additions require DUAL_REVIEW.

**SupportNeed**
```
EMOTIONAL_VALIDATION    User needs to feel heard and acknowledged
PRACTICAL_GUIDANCE      User is seeking actionable steps or information
PSYCHOEDUCATION         User would benefit from contextual explanation
SAFETY_ESCALATION       Safety signals require escalation response
PEER_BRIDGE             Peer connection is the appropriate next step
CHECK_IN                Lightweight wellbeing check-in is appropriate
NONE_IDENTIFIED         No specific support need detected; default to open
```

**Urgency**
```
NONE        No time-sensitivity detected
LOW         Low urgency; standard response timing
MODERATE    Moderate urgency; prompt response appropriate
HIGH        High urgency; immediate response required
CRITICAL    Crisis-level urgency; deterministic path only
```

**RiskSignal**
```
ABSENT      No risk-relevant content detected in this interaction.
            ABSENT does not confirm safety; see 1.6 uncertainty semantics.
PRESENT     Risk-relevant content detected; below escalation threshold
ELEVATED    Elevated safety signal; escalation review required
CRITICAL    Critical safety signal; deterministic crisis path required
```

RiskSignal describes an operational safety signal in the interaction content. It is not a clinical risk assessment and must not be labelled or communicated as one.

**ResponseStrategy**
```
OPEN_SUPPORT            Open supportive conversation; no specific intervention
VALIDATION_FOCUS        Prioritise acknowledgment and validation
PSYCHOEDUCATION         Deliver approved psychoeducational content
GUIDED_EXERCISE         Guide an approved exercise within strategy constraints
SAFETY_HOLD             Hold all non-safety response; escalation is active
CRISIS_RESPONSE         Deterministic crisis response; LLM is not used
```

**Authoritative definition in Section 5.** The values above are reproduced here for reference. Section 5 defines the full strategy contract for each value, including permitted constraints and failure modes. Additions to this enum require AI_SAFETY_REVIEW and must be reflected in both Section 1 and Section 5.

**EscalationAction**
```
NONE                    No escalation action required
SURFACE_RESOURCES       Surface relevant support resources in response
ESCALATE_TO_HUMAN       Flag for human peer or support review
DETERMINISTIC_CRISIS    Immediately invoke deterministic crisis path
```

**ValidationStatus**
```
PASSED      Output satisfies all strategy contract constraints
SANITIZED   Output was modified to remove violations; may be delivered
            only if remaining content satisfies the strategy contract
FAILED      Output violates strategy contract; must not be delivered
```

**DetectionReasonCode**
```
KEYWORD_RISK_MATCH          Risk classifier matched one or more keywords
HIGH_CONFIDENCE_DETECTION   Confidence above threshold; signals clear
LOW_CONFIDENCE_DETECTION    Confidence below threshold; uncertainty_flag set
CONFLICTING_SIGNALS         Multiple signals present with contradictory valence
SINGLE_SIGNAL_DOMINANT      One signal dominates; others below threshold
NO_SIGNAL_DETECTED          No classifiable signal in input
URGENCY_ELEVATED_BY_CONTEXT Urgency raised by session or longitudinal context
```

**DecisionReasonCode**
```
POLICY_ESCALATION_TRIGGERED     Escalation required by policy rule
STRATEGY_BY_SUPPORT_NEED        Strategy selected from support need mapping
STRATEGY_CONSTRAINED_BY_SAFETY  Strategy limited by active safety constraint
FALLBACK_STRATEGY_APPLIED       Primary strategy unavailable; fallback used
DEFAULT_STRATEGY_APPLIED        No specific signal; default strategy applied
UNCERTAINTY_CONSERVED           Uncertain detection → conservative strategy
```

**GenerationViolation**
```
RESPONSE_LENGTH_EXCEEDED        Generated content exceeds max_response_length
PROHIBITED_CONTENT              Content violates clinical or safety boundary
QUESTION_LIMIT_EXCEEDED         More questions than question_limit permits
EXERCISE_NOT_PERMITTED          Exercise included when may_suggest_exercises=false
STRATEGY_CONTRACT_BREACH        Content inconsistent with assigned strategy
```

---

### 1.8 Versioning and Compatibility

**Schema version format:** SemVer (MAJOR.MINOR.PATCH)

**Breaking changes (MAJOR increment required):**
- Adding a required field to any stage schema
- Removing or renaming any field
- Removing or renaming any enum value
- Changing the type of any field

**Non-breaking changes (MINOR increment):**
- Adding an optional field
- Adding a new enum value (except ExpressedEmotion — see 1.7)

**Patch changes:**
- Documentation corrections with no semantic change

**Compatibility rules — symmetric:**

```
On write:         A component must not write a record under a schema
                  version it was not built against.

On read:          A component must reject a record whose schema_version
                  MAJOR differs from the MAJOR version it was built against.

MINOR/PATCH read: A component may accept a record with a higher MINOR or
                  PATCH version; unrecognised optional fields are ignored.

No silent coercion: A component must never coerce, cast, or substitute
                  a default to reconcile a version mismatch. Incompatible
                  records are rejected and the violation is logged.
```

**Version pinning:** `detector_id`, `detector_version`, and `model_id` in DETECTED and GENERATED records are version-pinned strings of the format `<name>@<semver>`. A record produced by an unpinned or unversioned component is a schema violation.

---

### 1.9 Data Lineage and Auditability

**Logical lineage:** The provenance chain in 1.6 establishes a logical lineage from every GENERATED response back to the OBSERVED data it was derived from. This lineage is:
- Immutable once written
- Required for audit and review
- Governed by the deletion policy specified in Section 0, I6

Section 1 defines this lineage as a logical contract. The storage and query implementation — how records are stored, indexed, and retrieved for audit — is defined in Section 9.

**Lineage for audit:** The lineage chain provides an auditable derivation path from every GENERATED record back to its source OBSERVED record. The four records together constitute a complete audit trace for any interaction.

**Lineage and deletion:** When a user data deletion request is processed, the OBSERVED record is deleted first. Downstream DETECTED, DECIDED, and GENERATED records that reference it are governed by the same deletion policy. The lineage relationship does not grant downstream records independent retention rights beyond those of the source OBSERVED record.

**Audit logs vs lineage records:** Audit logs (access records, deletion records, approval records) are governed by a separate retention policy (see Section 0, I6). Audit logs must not contain user-generated content. Lineage records are user data and are governed accordingly.

---

### 1.10 Schema Failure Handling

Schema violations are classified into two categories based on which stage the violation occurs in and whether it is safety-critical.

**Safety-critical violations → FAIL_CLOSED**

The following violations require FAIL_CLOSED handling:
- Broken provenance reference in any record (upstream record not found)
- Unknown value in a required enum field
- Schema version MAJOR mismatch on read
- `risk_signal` or `urgency` field missing from a DETECTED record
- `confidence` missing or null on a DETECTED field where `status = INFERRED`
- `uncertainty_flag` missing on a DETECTED field where confidence is applicable

FAIL_CLOSED means: do not proceed with AI response generation; execute the deterministic safe fallback path; log the violation with full record context.

**Non-safety-critical violations → GRACEFUL_DEGRADATION**

The following violations permit GRACEFUL_DEGRADATION:
- Schema version MINOR or PATCH mismatch on read (unrecognised optional field)
- Unknown value in an optional field
- `violations` array malformed when `validation_status` is PASSED
- `expressed_emotion` field missing or null (this field is nullable)

GRACEFUL_DEGRADATION means: the capability is suspended for this interaction; the interaction continues without it; the violation is logged; no unsafe behaviour results.

**Rejection, not silent default:** Schema failures must be rejected and logged. A component must not silently substitute a default value for a missing required field. Silent defaulting masks violations and can produce a superficially valid record that does not reflect genuine system state.

**Unknown enum value handling:** An unknown value in a required enum field is always FAIL_CLOSED, regardless of stage. A component that does not recognise a required enum value must not infer its semantics — it must reject the record.

---

*End of Section 1.*
