# PeerPal AI Specification
## Section 0: Scope & Assumptions

*Status: Locked*
*Version: 1.0*

---

### 0.1 Production Scope

PeerPal AI is a conversational support system embedded in a mobile mental health platform serving adults aged 18 and above, primarily in Kenya.

**Intended role:**
- Provide adaptive emotional support through structured conversation
- Detect support needs and select appropriate response strategies
- Deliver guided exercises within clinically reviewed boundaries
- Offer contextually relevant psychoeducation from approved content
- Detect safety signals and escalate deterministically

**Population:** Adults 18+ who have completed consent and onboarding. Primary language environments: English, Swahili, Sheng, code-switching. Cultural context: Kenyan and East African.

---

### 0.2 Non-Goals and Clinical Boundaries

The following are explicit non-goals. No component may pursue them directly or by inference:

| Prohibited | Reason |
|---|---|
| Diagnosis of any condition | Clinical function; requires licensed professional |
| Medication recommendation | Clinical function; risk of harm |
| Clinical treatment | Outside scope |
| Autonomous crisis resolution | Human escalation required |
| Inference of clinical condition from conversation | Requires clinical assessment |
| Wellbeing outcome claims | Insufficient evidence basis |
| Replacing human peer, therapist, or clinical support | Complementary role only |

**Conditionally Restricted Capabilities**

The following capabilities are outside the default production capability set and may only be deployed after capability-specific written SAFETY_REVIEW approval. Approval must explicitly cover the capability's intended use, boundaries, failure modes, evaluation evidence, and permitted operating conditions.

| Capability | Restriction |
|---|---|
| Cognitive restructuring | High clinical risk; requires capability-specific SAFETY_REVIEW approval covering intended use, failure modes, and operating boundaries before deployment |

Future capabilities with intervention-like characteristics are added here during the clinical review process and are subject to the same gate.

---

### 0.3 Shared Schema

All components — Safety, AI, and Evaluation — share a single canonical schema. Enumerations, reason codes, risk levels, strategy identifiers, and policy outcomes come only from the controlled definitions in Section 1.

**Pipeline stages:**

```
OBSERVED
Data that exists in the system independent of AI inference.
Source:   database records, user inputs, session events
Examples: mood entries, journal content, session history, message text
Rule:     see immutability rule below

DETECTED
AI-inferred properties of the current interaction.
Source:   classifier output on OBSERVED data
Rule:     uncertainty is a first-class value; inferred fields are
          estimates, not facts; provenance must be logged
Examples: emotion, support_need, urgency, risk_signal, confidence

DECIDED
Policy-determined response parameters.
Source:   deterministic policy engine operating on OBSERVED + DETECTED
Rule:     deterministic given same inputs; versioned; may not be
          overridden by the LLM or any downstream component
Examples: permitted strategy, response constraints, escalation action

GENERATED
LLM output produced within the constraints of DECIDED.
Source:   LLM generation given strategy contract and context
Rule:     must be validated against DECIDED constraints before
          delivery to user
Examples: response text, exercise prompt, check-in question
```

**Immutability rule:** Inference must never overwrite, reinterpret, or silently mutate the source OBSERVED record. Derived state may legitimately trigger downstream events, but the OBSERVED record remains the authoritative source of what the user actually said or did.

These stage labels are used in capability section contracts (see 0.4) to identify the provenance and mutability constraints of each input and output.

---

### 0.4 Per-Section Contract

Every capability section (3–8) specifies the following minimum contract:

```
Purpose         — what this component does and why it exists
Inputs          — what data it receives (with stage label)
Outputs         — what data it produces (with stage label)
Constraints     — what it must and must not do
Failure modes   — named failure states and required handling
Evaluation      — how correctness is measured
Observability   — what is logged and when
Approval gate   — review type required and criteria for production eligibility
```

A capability that cannot specify all eight elements is not production-ready.

---

### 0.5 Approval Types

Three approval types are defined. Every capability section names its required type.

```
SAFETY_REVIEW
Reviewer:  Clinical safety reviewer (see A1)
Scope:     Safety taxonomy, escalation thresholds, intervention boundaries,
           crisis flows, safety evaluation cases
Authority: May block production deployment of any safety-relevant capability

AI_SAFETY_REVIEW
Reviewer:  Named AI Safety owner (internal)
Scope:     Detection contracts, strategy contracts, context/memory rules,
           generation constraints, observability, release gates
Authority: Deployment veto for all AI capabilities

DUAL_REVIEW
Reviewers: Both of the above, independently
Scope:     Capabilities that cross safety and AI boundaries — risk taxonomy,
           escalation behaviour, generation output safety,
           multilingual safety evaluation
Authority: Both reviewers must approve independently before production
```

Approval is version-specific. A new model version, prompt version, or policy version requires re-approval for affected capabilities.

**Approval is recorded as a written sign-off referencing the capability name, capability version, and review type. The approval record is retained for the life of the deployment and remains associated with the corresponding evaluation and policy versions.**

---

### 0.6 Core Safety Invariants

The following invariants apply to the entire system. No component, prompt, update, or model change may weaken them.

**I1 — Monotonic safety:**
No component may weaken a stronger safety decision made earlier in the pipeline. If the safety rules determine escalation is required, no downstream component — detection, strategy selection, or generation — may override or circumvent that decision. "Stronger" is defined by the safety decision precedence hierarchy specified in Section 3. Where two stages produce conflicting decisions, the higher-precedence decision applies. Section 3 is the authoritative tie-breaker.

**I2 — Deterministic crisis path:**
Responses to explicit imminent-danger signals follow a deterministic, non-LLM path. The crisis escalation flow is defined in code and policy, not inferred by a model.

**I3 — Strategy contract enforcement:**
The LLM generates within the constraints defined by DECIDED. A response that violates its strategy contract must not be delivered to the user.

**I4 — Inferred data is marked:**
DETECTED fields are estimates. They must be stored and logged as inferred, never promoted to the status of clinical fact or ground truth. Inferred data does not carry greater retention rights than the OBSERVED data from which it was derived.

**I5 — Human escalation path exists:**
Every interaction state has a reachable path toward human support. This guarantees that escalation pathways are available and surfaced — it does not guarantee a human response within a specified time. PeerPal is accountable for making escalation options accessible; it is not operationally responsible for the availability or response time of external services (e.g. Befrienders Kenya).

**I6 — Deletion governance:**
All user data — OBSERVED records, DETECTED histories, memory summaries, feedback, and session content — is governed by the data deletion policy. Audit logs are subject to a separately defined retention and deletion policy; that policy must minimise linkage to user content and exclude user-generated content wherever technically possible.

**I7 — Fail-safe degradation:**
When a safety-critical component is unavailable, malformed, produces output inconsistent with its schema, or operates outside its permitted uncertainty boundary, the system follows the predefined safer fallback path. An unavailable AI component must never be treated as equivalent to a negative safety finding. Non-safety capabilities may degrade to logging-only mode; safety-critical capabilities must fail closed to a deterministic safe response.

---

### 0.7 Assumptions

The following are recorded constraints on the programme. Each must be validated before production deployment of the capability it governs.

**A1 — Clinical safety reviewer:**
A Kenya-context mental health clinician with crisis and suicide-risk assessment experience is formally appointed under a documented engagement arrangement as **clinical safety reviewer** before production deployment of safety policy (Section 3), escalation boundaries, intervention contracts, and safety evaluation cases. This reviewer holds SAFETY_REVIEW authority over the specified product safety boundaries. PeerPal remains accountable for the product's operational decisions; the reviewer's role is to assess whether defined safety boundaries and policies meet clinical standards, not to direct product decisions.

**A2 — Language and cultural review:**
A joint workstream comprising AI/engineering, the clinical safety reviewer, and Kenyan language/context reviewers produces and maintains the multilingual evaluation corpus. The corpus covers English, Swahili, Sheng, code-switching, indirect distress, metaphor, colloquial text, misspellings, and culturally contextualised scenarios. The same underlying scenario is evaluated across language variants to detect differential failure rates. Translation alone is not sufficient.

**A3 — Model governance:**
The production AI model is version-pinned. Any model change — version upgrade, provider change, or prompt change — triggers re-evaluation of affected capabilities before deployment. The fallback model is explicitly specified and is treated as a distinct production capability: it requires its own evaluation pass and approval before it may be used in production. It must not be assumed equivalent to the primary model. The following failure conditions are explicitly in scope and must have defined handling: provider outage, rate-limit exhaustion, request timeout, malformed or schema-invalid output, and model unavailable. Each condition maps to a defined fallback path (see I7).

**A4 — AI Safety owner:**
A named individual holds AI_SAFETY_REVIEW authority and deployment veto for AI capabilities. This role is assigned before any capability reaches production.

**A5 — Evaluation infrastructure precedes capability deployment:**
The evaluation corpus (Section 2) and the logging and observability infrastructure (Sections 4.6, 5.6, 6.6, 8.5, 9.1) are operational before any adaptive AI capability is deployed to production users.

---

### 0.8 Production Eligibility

A capability is production-eligible when all of the following are met:

```
1. Failure modes defined
2. Safety boundary defined
3. Evaluation criteria met against the Section 2 corpus
4. Required approval obtained (SAFETY_REVIEW / AI_SAFETY_REVIEW / DUAL_REVIEW)
5. Observability operational
6. Rollback mechanism in place
```

**Degradation modes:**
Two distinct failure modes are defined. The applicable mode for each capability is specified in that capability's failure modes section.

```
GRACEFUL_DEGRADATION
Applies to:  non-safety-critical capabilities
Behaviour:   capability suspends; interaction continues without it;
             failure is logged; user experience degrades but is not unsafe

FAIL_CLOSED
Applies to:  safety-critical capabilities
Behaviour:   capability unavailable → deterministic safe fallback executes;
             fallback path is pre-specified and does not depend on
             the unavailable component; failure is logged
```

A safety-critical capability must never silently log and continue. It must either function within specification or execute its defined fail-closed path.

**Gate ownership:**
- AI Safety owner confirms criteria 1–3 and 5–6
- Clinical safety reviewer confirms criterion 4 for SAFETY_REVIEW components
- Both confirm independently for DUAL_REVIEW components

---

*End of Section 0.*
