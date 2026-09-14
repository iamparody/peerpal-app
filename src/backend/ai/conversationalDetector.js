'use strict';

const { v4: uuidv4 } = require('uuid');
const Groq           = require('groq-sdk');
const THRESHOLDS     = require('./thresholds');

const DETECTOR_VERSION  = 'conversational-state-detector@1.0.0';
const DETECTION_MODEL   = process.env.GROQ_DETECTION_MODEL || 'llama-3.1-8b-instant';

const VALID_SUPPORT_NEED = new Set(['EMOTIONAL_VALIDATION','PRACTICAL_GUIDANCE','PSYCHOEDUCATION','SAFETY_ESCALATION','PEER_BRIDGE','CHECK_IN','NONE_IDENTIFIED']);
const VALID_URGENCY      = new Set(['NONE','LOW','MODERATE','HIGH','CRITICAL']);
const VALID_EMOTION      = new Set(['DISTRESS','SADNESS','ANXIETY','ANGER','POSITIVE','NEUTRAL','MIXED','UNCLEAR']);

let _groq = null;
function getGroq() {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
}

// Prompt is a policy artefact — changes to wording require re-evaluation (Section 4.10).
const SYSTEM_PROMPT = `You are a precise conversational-state classifier for a mental health support platform. Classify the user's message and return valid JSON only.

Output format (no other text):
{"support_need":{"value":"<string>","confidence":<0.0–1.0>},"urgency":{"value":"<string>","confidence":<0.0–1.0>},"expressed_emotion":{"value":"<string or null>","confidence":<0.0–1.0 or null>}}

SUPPORT_NEED — pick exactly one:
EMOTIONAL_VALIDATION: user needs to feel heard and understood; distress present but not crisis-level
PRACTICAL_GUIDANCE: user wants concrete steps or advice for a specific problem
PSYCHOEDUCATION: user is asking to understand a mental health topic or concept
SAFETY_ESCALATION: message indicates the user needs safety resources or support
PEER_BRIDGE: user explicitly wants peer connection or community
CHECK_IN: brief or routine message; no strong support need
NONE_IDENTIFIED: no clear support need detectable

URGENCY — pick exactly one:
NONE: routine; no time sensitivity
LOW: mild distress or mild time-sensitivity
MODERATE: significant distress; timely response needed
HIGH: high distress; prompt attention required
CRITICAL: immediate attention required
Note: urgency is operational response priority, not risk level.

EXPRESSED_EMOTION — pick exactly one, or null:
DISTRESS: explicit emotional pain or suffering
SADNESS: grief, loss, or low mood
ANXIETY: worry, fear, or nervousness
ANGER: frustration, irritation, or rage
POSITIVE: happiness, gratitude, or relief
NEUTRAL: calm and factual; no clear emotional valence
MIXED: two or more distinct emotions clearly and simultaneously present (not just vaguely mixed)
UNCLEAR: emotional content is present but cannot be classified above threshold
null: no emotional content at all (e.g. a purely factual question)

Rules:
1. expressed_emotion = null only if the message contains zero emotional content
2. MIXED = multiple emotions clearly co-present; UNCLEAR = emotion exists but is ambiguous
3. SAFETY_ESCALATION routes to safety resources — use for messages suggesting need for support or resources, not for ordinary sadness or worry
4. confidence reflects certainty of classification, not severity of content
5. Output the JSON object only — no explanation, preamble, or trailing text`;

function buildUserMessage(text, sessionContext) {
  if (!sessionContext?.length) return text;
  const recent = sessionContext
    .slice(-4)
    .map(m => `${m.role === 'user' ? 'User' : 'Companion'}: ${m.content}`)
    .join('\n');
  return `[Recent session context]\n${recent}\n\n[Current message]\n${text}`;
}

function makeDeterministicField(value, observed) {
  const now  = new Date().toISOString();
  const prov = { source_type: observed.source, id: observed.record_id };
  return {
    value,
    status:            'DETERMINISTIC',
    confidence_status: 'NOT_APPLICABLE',
    confidence:        null,
    uncertainty_flag:  null,
    provenance:        prov,
    detector_version:  DETECTOR_VERSION,
    created_at:        now,
  };
}

// Returns a fallback ConversationalStateSourceSchema-shaped record with deterministic values.
// _fallback and _fallback_reason are internal — stripped by the pipeline before DB persistence.
function buildFallback(observed, reason) {
  return {
    source_id:         uuidv4(),
    observed_ref:      observed.record_id,
    detector_version:  DETECTOR_VERSION,
    detected_at:       new Date().toISOString(),
    support_need:      makeDeterministicField('NONE_IDENTIFIED', observed),
    urgency:           makeDeterministicField('NONE', observed),
    expressed_emotion: null,
    _fallback:         true,
    _fallback_reason:  reason,
  };
}

function makeInferredField(value, confidence, threshold, observed) {
  const now  = new Date().toISOString();
  const prov = { source_type: observed.source, id: observed.record_id };
  return {
    value,
    status:            'INFERRED',
    confidence_status: 'AVAILABLE',
    confidence,
    uncertainty_flag:  confidence < threshold,
    provenance:        prov,
    detector_version:  DETECTOR_VERSION,
    created_at:        now,
  };
}

/**
 * LLM-based conversational-state detector (Section 4).
 * Produces support_need, urgency, and expressed_emotion DETECTED_SOURCE fields.
 *
 * On any failure (LLM unavailable, schema violation, invalid enum):
 *   returns deterministic fallback per Section 4.8 with _fallback=true.
 *
 * @param {string} text           - Sanitized message text
 * @param {object} observed       - ObservedSchema record
 * @param {object} options
 * @param {Array}  options.sessionContext - Prior session messages [{role, content}]
 * @returns ConversationalStateSourceSchema-shaped object (with _fallback internal field)
 */
async function run(text, observed, { sessionContext = [] } = {}) {
  let raw;
  try {
    const completion = await getGroq().chat.completions.create({
      model:           DETECTION_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: buildUserMessage(text, sessionContext) },
      ],
      response_format: { type: 'json_object' },
      max_tokens:      200,
      temperature:     0, // deterministic classification
    });
    raw = JSON.parse(completion.choices[0]?.message?.content || '{}');
  } catch (err) {
    return buildFallback(observed, `CLASSIFIER_UNAVAILABLE: ${err.message}`);
  }

  const needVal  = raw?.support_need?.value;
  const urgVal   = raw?.urgency?.value;
  const emotVal  = raw?.expressed_emotion?.value ?? null;
  const needConf = typeof raw?.support_need?.confidence  === 'number' ? raw.support_need.confidence  : null;
  const urgConf  = typeof raw?.urgency?.confidence       === 'number' ? raw.urgency.confidence       : null;
  const emotConf = typeof raw?.expressed_emotion?.confidence === 'number' ? raw.expressed_emotion.confidence : null;

  // Required fields missing or invalid enum → fallback (Section 4.8, Section 1.10)
  if (!VALID_SUPPORT_NEED.has(needVal) || !VALID_URGENCY.has(urgVal)) {
    return buildFallback(observed, 'SCHEMA_VIOLATION: invalid or missing required enum value');
  }
  if (needConf === null || urgConf === null) {
    return buildFallback(observed, 'SCHEMA_VIOLATION: missing confidence on required field');
  }

  // Optional expressed_emotion — invalid enum or missing confidence → UNCLEAR (Section 4.8)
  let expressedEmotion = null;
  if (emotVal !== null) {
    if (!VALID_EMOTION.has(emotVal) || emotConf === null) {
      expressedEmotion = makeInferredField('UNCLEAR', emotConf ?? 0, THRESHOLDS.EMOTION_UNCERTAINTY_THRESHOLD, observed);
    } else {
      expressedEmotion = makeInferredField(emotVal, emotConf, THRESHOLDS.EMOTION_UNCERTAINTY_THRESHOLD, observed);
    }
  }

  return {
    source_id:         uuidv4(),
    observed_ref:      observed.record_id,
    detector_version:  DETECTOR_VERSION,
    detected_at:       new Date().toISOString(),
    support_need:      makeInferredField(needVal,  needConf, THRESHOLDS.SUPPORT_NEED_UNCERTAINTY_THRESHOLD, observed),
    urgency:           makeInferredField(urgVal,   urgConf,  THRESHOLDS.URGENCY_UNCERTAINTY_THRESHOLD,      observed),
    expressed_emotion: expressedEmotion,
    _fallback:         false,
  };
}

module.exports = { DETECTOR_VERSION, run };
