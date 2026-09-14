# PeerPal AI Specification
## Section 4: Support-Need and Conversational-State Detection

*Status: Locked*
*Version: 1.0*
*Approval gate: AI_SAFETY_REVIEW (see 4.11)*

---

### 4.1 Purpose and Scope

Section 4 governs detection of the conversational-state fields that the policy engine uses to select a response strategy: `support_need`, `urgency`, and `expressed_emotion`. These fields describe what the current interaction requires — not what the user is clinically.

**Scope:**
- Detection of `support_need`, `urgency`, and `expressed_emotion` as defined in Section 1
- Production of DETECTED_SOURCE records for those fields
- Contribution to canonical DETECTED assembly (4.7)
- Uncertainty semantics, failure modes, and observability for these fields

**Out of scope:**
- `risk_signal` detection — governed exclusively by Section 3
- Strategy selection — governed by Section 5
- Memory and longitudinal context accumulation — governed by Section 6
- Exercise eligibility — governed by Section 7

**Invariant (carried from Section 3):** No component defined in this section may reinterpret a canonical DETECTED `risk_signal` value into a lower-precedence state. If a Section 4 detector observes a message that it believes contains a safety signal, it must produce a support_need value consistent with that observation (e.g. `SAFETY_ESCALATION`) but must not modify `risk_signal`. The `risk_signal` field in canonical DETECTED is exclusively owned by the Section 3 resolver output.

---

### 4.2 Detector Independence from Safety Classification

The Section 4 detector reads from OBSERVED records only. It does not read from DETECTED_SOURCE records produced by Section 3 classifiers, and it does not read from canonical DETECTED produced by the Section 3 resolver.

**Why this matters:** If the Section 4 detector could read Section 3's output, it could — intentionally or accidentally — produce support_need or urgency values that contradict or work around the safety decision. For example, detecting a CRITICAL risk_signal and responding by setting `urgency = NONE` would create a contradiction that the policy engine would have to resolve. That resolution path is not safe.

**Enforcement:** The Section 4 detector's input contract is:
```
Reads from:     OBSERVED (current message and session context per 4.5)
Does not read:  Any DETECTED_SOURCE or canonical DETECTED record
Does not write: risk_signal, in any form
Writes to:      DETECTED_SOURCE records for support_need, urgency,
                expressed_emotion only
```

---

### 4.3 Detected Fields

**`support_need`** — Required; every interaction maps to a support need.

```
Field:              support_need
Type:               DetectedField<SupportNeed>
Required:           Yes; null is a schema violation
Status:             INFERRED (LLM or ML classifier)
Confidence:         AVAILABLE; required; uncertainty_flag applies
Purpose:            Primary routing signal for the policy engine;
                    determines strategy selection under Rule R6
Note:               If the detector identifies safety-relevant content
                    but risk_signal is not within Section 4's scope,
                    the appropriate response is support_need =
                    SAFETY_ESCALATION — not a risk_signal modification
```

**`urgency`** — Required; every interaction has an urgency level.

```
Field:              urgency
Type:               DetectedField<Urgency>
Required:           Yes; null is a schema violation
Status:             INFERRED
Confidence:         AVAILABLE; required; uncertainty_flag applies
Purpose:            Response priority signal; independent of risk_signal.
                    A high-urgency interaction is not necessarily a
                    high-risk interaction, and vice versa.
Note:               urgency = CRITICAL is reserved for cases where the
                    interaction requires immediate attention independently
                    of any safety signal. It does not override
                    risk_signal = CRITICAL handling.
```

**`expressed_emotion`** — Optional; absence is a valid detection state.

```
Field:              expressed_emotion
Type:               DetectedField<ExpressedEmotion>
Required:           No; null is permitted and expected for inputs
                    where no emotional valence is detectable (e.g.
                    factual questions, SESSION_EVENTs)
Status:             INFERRED
Confidence:         AVAILABLE when a value is produced; null when
                    expressed_emotion.value is null
Purpose:            Contextual signal for strategy refinement; not
                    a clinical characterisation of the user's state
Note:               The ExpressedEmotion enum (Section 1.7) uses
                    non-clinical labels. The detector must produce
                    values consistent with those definitions. MIXED
                    and UNCLEAR have operational definitions (Section 1)
                    that the detector must honour.
```

---

### 4.4 Detection Architecture

**Single conversational-state detector:** All three fields (`support_need`, `urgency`, `expressed_emotion`) are produced by a single detection component in a single inference pass. This avoids the latency and consistency problems of three independent inferences over the same input.

**Output:** The detector produces three DETECTED_SOURCE records — one per field — each with its own `provenance`, `detector_version`, `confidence`, and `uncertainty_flag`. Field-level metadata is per-field as defined in Section 1, 1.3.

**Detector type:** LLM-based or ML-based; produces calibrated confidence values per field. The detector is version-pinned. Changes to model, prompt, or classification rules increment the `detector_version` and require re-evaluation before production deployment.

**Execution:** The Section 4 detector and Section 3 classifiers run in parallel against the same OBSERVED record. Neither waits on the other's output. The canonical DETECTED record is assembled after both sets of DETECTED_SOURCE records are available (see 4.7).

**Output schema:**
```
For each field (support_need, urgency, expressed_emotion):
  Produces:         DETECTED_SOURCE
  status:           INFERRED
  confidence_status: AVAILABLE
  confidence:       0.0–1.0 (required for support_need and urgency;
                    required when expressed_emotion is non-null)
  uncertainty_flag: true if confidence < applicable threshold (Section 3.9)
  detector_version: "<detector_name>@<semver>"
  provenance:       {source_type: SESSION_MESSAGE or JOURNAL, id: OBSERVED.record_id}
  created_at:       UTC timestamp
```

---

### 4.5 Session Context and First-Session Handling

**What the detector may use:**
The detector may use the current message and the current session's prior turns (from session_context in CaseInput, or from the live session cache). This provides turn-level context without requiring access to cross-session history.

**What the detector must not do:**
- Build or infer a longitudinal profile from prior session summaries
- Treat memory summaries (ai_memories) as clinical history
- Infer a clinical condition or trait from any combination of prior messages
- Carry forward a prior-session support_need value as an assumption into the current detection

**First-session handling:**
When `session_id` is new and no prior session context exists, the detector operates on the current message alone. The absence of prior context must not cause the detector to default to a particular support_need or urgency value. A first-session message with no discernible support need maps to `NONE_IDENTIFIED`, not to any assumed need based on the user's onboarding profile.

**Memory summaries as context:**
If memory summaries from prior sessions are available (Section 6), the detector may use them as soft context — acknowledging that the user has discussed certain topics — but must not use them to infer a current support need. The current support need is detected from the current message, not recalled from history.

This constraint is enforced by prompt design and validated through evaluation. It is not structurally enforceable. The evaluation corpus must include memory-conditioned cases where the memory summary conflicts with or is irrelevant to the current message, to verify the boundary holds across model versions. These cases belong in the REGRESSION set.

---

### 4.6 Uncertainty Semantics

Uncertainty in Section 4 detection follows the principles established in Section 1, 1.6, with the following field-specific applications.

**`support_need` uncertainty:**
When `support_need.uncertainty_flag = true`:
- The policy engine applies `UNCERTAINTY_CONSERVED` (reason_code)
- Strategy selection defaults to `OPEN_SUPPORT` or `VALIDATION_FOCUS` rather than a more specific strategy
- A detected `support_need = SAFETY_ESCALATION` with `uncertainty_flag = true` does not reduce the escalation level — the cross-record constraint (Section 1, 1.4) still applies

**`urgency` uncertainty:**
`urgency.uncertainty_flag` is propagated unchanged to canonical DETECTED. Conservative handling of uncertain urgency is defined exclusively by Section 3 (Rule R7). Section 4 makes no policy decision about how uncertain urgency is acted upon.

**`expressed_emotion` uncertainty:**
When the detector cannot classify expressed emotion above threshold, it produces `expressed_emotion.value = UNCLEAR` (not null). Null means the field is not applicable (e.g. a SESSION_EVENT). UNCLEAR means the input was present but not classifiable. The distinction matters for evaluation.

**Confidence threshold:**
Applicable thresholds are defined in Section 3.9. They apply to Section 4 detection fields and must be defined before any Section 4 capability is deployed to production.

---

### 4.7 Canonical DETECTED Assembly

The canonical DETECTED record is assembled from DETECTED_SOURCE records produced by Section 3 (risk_signal) and Section 4 (support_need, urgency, expressed_emotion). The assembly step is deterministic and makes no inferences.

**Assembly inputs:**
```
From Section 3 resolver:    risk_signal (DetectedField<RiskSignal>)
From Section 4 detector:    support_need (DetectedField<SupportNeed>)
                            urgency (DetectedField<Urgency>)
                            expressed_emotion (DetectedField<ExpressedEmotion>)
```

**Pre-assembly ordering:**

Canonical DETECTED assembly never accepts missing required fields. Detector failure is resolved *before* assembly by emitting valid deterministic fallback DETECTED_SOURCE records (see 4.8). The sequence is:

```
detector failure
    ↓
fallback DETECTED_SOURCE (deterministic values)
    ↓
canonical DETECTED assembly (always receives all required fields)
    ↓
policy engine
```

**Assembly rules:**
```
1. All required fields (risk_signal, support_need, urgency) must be
   present in DETECTED_SOURCE form before assembly runs. Fallback
   DETECTED_SOURCE records (4.8) satisfy this requirement when the
   originating detector has failed.

2. expressed_emotion may be null in canonical DETECTED when the
   detector did not produce a value for this field.

3. The canonical DETECTED record carries the top-level fields defined
   in Section 1 (detection_id, observed_ref, detector_id, detected_at,
   reason_code, schema_version) alongside the four DetectedField objects.

4. The canonical DETECTED is immutable after write.
   No downstream component may modify it.
```

**Assembly component:** The assembly component is a deterministic merge, not a classifier. It does not produce inferences. Its version is tracked and logged with the canonical DETECTED record.

---

### 4.8 Failure Modes

**Failure vs uncertainty — must not be conflated:**
```
Detector succeeds, confidence low  → valid DETECTED_SOURCE with
                                     uncertainty_flag = true;
                                     Section 3 applies conservative policy

Detector unavailable / malformed   → fallback DETECTED_SOURCE
                                     (deterministic values, no confidence);
                                     canonical DETECTED assembled from fallback;
                                     Section 3 policy applied to fallback values
```
These are distinct states. An `uncertainty_flag = true` on a valid detection is not an infrastructure failure. A fallback DETECTED_SOURCE produced by detector failure carries no uncertainty semantics — it is a safe operational default.

**Conversational-state detector unavailable:**
- Pre-assembly action: emit fallback DETECTED_SOURCE records with deterministic values:
  - `support_need.value = NONE_IDENTIFIED`, `status = DETERMINISTIC`, `confidence_status = NOT_APPLICABLE`
  - `urgency.value = NONE`, `status = DETERMINISTIC`, `confidence_status = NOT_APPLICABLE`
  - `expressed_emotion = null`
- Classification: GRACEFUL_DEGRADATION (risk_signal is independently safe via Section 3)
- Logged as: CLASSIFIER_FAILURE (Section 4 detector); DETECTION_FALLBACK_APPLIED

**Missing confidence on required INFERRED field (support_need or urgency):**
- Pre-assembly action: treat as detector unavailable; emit fallback DETECTED_SOURCE
- Classification: GRACEFUL_DEGRADATION (same path as detector unavailable)

**Missing confidence on expressed_emotion when value is non-null:**
- Pre-assembly action: set `expressed_emotion.value = UNCLEAR`; log the malformed source
- Classification: GRACEFUL_DEGRADATION

**Unknown or invalid enum value in required field (support_need or urgency):**
- Pre-assembly action: treat as detector unavailable; emit fallback DETECTED_SOURCE
- Classification: FAIL_CLOSED per Section 1.10 (unknown required enum)
- Rationale: Section 1.10 is authoritative; Section 4 does not introduce a more permissive exception

**Unknown or invalid enum value in expressed_emotion (optional field):**
- Pre-assembly action: set `expressed_emotion.value = UNCLEAR`
- Classification: GRACEFUL_DEGRADATION per Section 1.10 (unknown optional enum)

**Canonical DETECTED assembly fails (missing required field after fallback):**
- Classification: FAIL_CLOSED
- Action: do not proceed to policy engine; invoke deterministic safe fallback (risk_signal = ELEVATED assumed)

---

### 4.9 Observability

The following events must be logged for every interaction processed by Section 4.

```
Event                           Fields logged
────────────────────────────────────────────────────────────────────
CONVERSATIONAL_STATE_DETECTED   session_id, detection_id,
                                support_need.value,
                                support_need.confidence,
                                support_need.uncertainty_flag,
                                urgency.value,
                                urgency.confidence,
                                urgency.uncertainty_flag,
                                expressed_emotion.value,
                                expressed_emotion.confidence,
                                detector_version,
                                timestamp

CANONICAL_DETECTED_ASSEMBLED    session_id, detection_id,
                                all field values and statuses,
                                assembly_component_version,
                                risk_signal.provenance (from Section 3),
                                support_need.provenance,
                                urgency.provenance,
                                expressed_emotion.provenance,
                                timestamp

DETECTION_FALLBACK_APPLIED      session_id, detection_id,
                                reason (CLASSIFIER_UNAVAILABLE / SCHEMA_VIOLATION),
                                fallback_values_applied,
                                timestamp
```

Logged fields must not include raw message text. Message content is accessible via OBSERVED record lineage.

---

### 4.10 Evaluation Requirements

Section 4 detection is evaluated using the corpus defined in Section 2. The following case coverage is required before production deployment.

**Required case types:**
```
CONVERSATIONAL_QUALITY    support_need accuracy: primary metric
CHECK_IN                  Low-signal detection; NONE_IDENTIFIED handling
MULTILINGUAL              All four language variants for each
                          CONVERSATIONAL_QUALITY scenario
FIRST_SESSION             Detection without prior session context
HIGH_UNCERTAINTY          Inputs where expressed emotion is genuinely
                          ambiguous; MIXED and UNCLEAR handling
```

**Key evaluation metrics (from Section 2, 2.9):**
- `support_need_accuracy`: exact match rate across RELEASE cases
- `urgency_accuracy`: exact match rate
- MIXED vs UNCLEAR: evaluated for consistency against operational definitions (Section 1)
- Differential failure rate: per-language-variant support_need and urgency accuracy reported separately

**Evaluation gate for expressed_emotion:**
expressed_emotion is not the primary routing signal, but MIXED/UNCLEAR consistency is evaluated to detect systematic misuse of the operational definitions (e.g. detector using MIXED where UNCLEAR is correct).

---

### 4.11 Approval Gate

**Required:** AI_SAFETY_REVIEW

The following elements require explicit AI Safety owner sign-off:
- Detection architecture and component versions (4.4)
- Session context boundary rules (4.5)
- Uncertainty application rules (4.6)
- Canonical DETECTED assembly rules (4.7)
- Failure mode definitions and fallback values (4.8)
- Observability scope (4.9)
- Evaluation evidence and corpus coverage (4.10)

**Clinical safety reviewer consultation required for:**
- Any change to the ExpressedEmotion enum (via DUAL_REVIEW per Section 1.7)
- Any change to the definition of `support_need = SAFETY_ESCALATION` and its interaction with Section 3 escalation rules
- Evaluation cases for FIRST_SESSION and HIGH_UNCERTAINTY scenarios if they include safety-adjacent inputs

Approval is version-specific. A new detector version, prompt change, or assembly component change requires re-evaluation and re-approval.

---

*End of Section 4.*
