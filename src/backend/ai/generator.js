'use strict';

const { v4: uuidv4 }      = require('uuid');
const Groq                 = require('groq-sdk');
const { sanitize, stripHtml } = require('../utils/sanitizer');

const GENERATION_MODEL    = process.env.GROQ_PRIMARY_MODEL  || 'llama-3.3-70b-versatile';
const FALLBACK_MODEL      = process.env.GROQ_FALLBACK_MODEL || 'llama-3.1-8b-instant';
const GENERATION_MODEL_ID = 'groq/llama-3.3-70b-versatile@1.0.0';
const SCHEMA_VERSION      = '1.0.0';

// Crisis response template — governed policy artefact (Section 3.6).
// Changes require DUAL_REVIEW. Do not modify without sign-off.
const CRISIS_TEMPLATE_VERSION = 'crisis-template@1.0.0';
const CRISIS_TEMPLATE = `I can hear that you're going through something really difficult right now. Please reach out for support — in Kenya, call Befrienders Kenya free on 0800 723 253, available 24/7. You can also tap the Emergency button in the app to connect immediately. You are not alone in this.`;

// Per-strategy LLM instructions injected into the system prompt at generation time.
const STRATEGY_INSTRUCTIONS = {
  VALIDATION_FOCUS: 'Acknowledge and validate the user first. Do not offer advice or solutions. Ask at most one gentle clarifying question.',
  OPEN_SUPPORT:     'Respond with warmth and openness. Ask one question to understand the user before suggesting anything.',
  PSYCHOEDUCATION:  'Provide clear, accessible information about what the user is asking. Keep it factual and supportive. No jargon.',
  GUIDED_EXERCISE:  'Guide the user through a brief, concrete exercise. Simple, step-by-step instructions only.',
  SAFETY_HOLD:      'Acknowledge the user warmly and let them know you are present. Hold space — no advice or suggestions.',
};

let _groq = null;
function getGroq() {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
}

// ─── Validation ───────────────────────────────────────────────────────────────

const EXERCISE_PATTERN = /\b(breathing exercise|take a breath|box breath|grounding exercise|body scan|progressive relaxation|mindfulness exercise|visuali[sz]ation exercise)/i;

/**
 * Validates generated content against the constraints in a DECIDED record.
 * Returns an array of GenerationViolation enum values. Pure function.
 */
function validateContent(content, decided) {
  const violations = [];
  if (content.length > decided.max_response_length) {
    violations.push('RESPONSE_LENGTH_EXCEEDED');
  }
  const questionCount = (content.match(/\?/g) || []).length;
  if (questionCount > decided.question_limit) {
    violations.push('QUESTION_LIMIT_EXCEEDED');
  }
  if (!decided.may_suggest_exercises && EXERCISE_PATTERN.test(content)) {
    violations.push('EXERCISE_NOT_PERMITTED');
  }
  return violations;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildConstraints(decided) {
  return [
    `[STRATEGY] ${STRATEGY_INSTRUCTIONS[decided.strategy] || STRATEGY_INSTRUCTIONS.OPEN_SUPPORT}`,
    `[LIMIT] Ask at most ${decided.question_limit} question${decided.question_limit !== 1 ? 's' : ''} in your response.`,
    `[LIMIT] Keep your response under ${decided.max_response_length} characters.`,
    decided.escalation_action === 'SURFACE_RESOURCES'
      ? '[REQUIRED] Mention crisis or mental health resources (e.g. Befrienders Kenya 0800 723 253) naturally in your response.'
      : null,
    decided.escalation_action === 'ESCALATE_TO_HUMAN'
      ? '[REQUIRED] Gently encourage the user to use the Emergency button or call Befrienders Kenya on 0800 723 253.'
      : null,
    !decided.may_suggest_exercises
      ? '[PROHIBITED] Do not suggest breathing exercises, grounding techniques, body scans, or mindfulness exercises.'
      : null,
  ].filter(Boolean).join('\n');
}

// Truncate to max_response_length at a sentence boundary where possible.
function truncate(content, limit) {
  const sliced   = content.slice(0, limit);
  const lastBreak = Math.max(sliced.lastIndexOf('. '), sliced.lastIndexOf('! '), sliced.lastIndexOf('? '));
  return lastBreak > limit * 0.6 ? sliced.slice(0, lastBreak + 1).trimEnd() : sliced.trimEnd();
}

function failedRecord(decisionId) {
  return {
    generation_id:     uuidv4(),
    decision_ref:      decisionId,
    model_id:          GENERATION_MODEL_ID,
    generated_at:      new Date().toISOString(),
    content:           '',
    validation_status: 'FAILED',
    violations:        ['PROHIBITED_CONTENT'],
    schema_version:    SCHEMA_VERSION,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generates a response within the constraints defined by the DECIDED record.
 *
 * CRISIS_RESPONSE: returns the deterministic crisis template; LLM is not invoked (Section 3.6).
 * All other strategies: calls Groq with strategy-specific constraint instructions.
 *
 * @param {object} decided  - Validated DECIDED record (DecidedSchema)
 * @param {object} context  - { systemPrompt, messages, userMessage }
 * @returns GENERATED record (GeneratedSchema-shaped)
 */
async function generate(decided, { systemPrompt, messages = [], userMessage }) {
  const now = new Date().toISOString();

  // ── CRISIS_RESPONSE: deterministic path — LLM not invoked (Section 3.6) ──
  if (decided.strategy === 'CRISIS_RESPONSE') {
    const violations = validateContent(CRISIS_TEMPLATE, decided);
    return {
      generation_id:     uuidv4(),
      decision_ref:      decided.decision_id,
      model_id:          CRISIS_TEMPLATE_VERSION,
      generated_at:      now,
      content:           CRISIS_TEMPLATE,
      validation_status: violations.length === 0 ? 'PASSED' : 'FAILED',
      violations,
      schema_version:    SCHEMA_VERSION,
    };
  }

  // ── LLM path ─────────────────────────────────────────────────────────────
  const groqMessages = [
    { role: 'system', content: `${systemPrompt}\n\n${buildConstraints(decided)}` },
    ...messages,
    { role: 'user',   content: userMessage },
  ];
  const maxTokens = Math.ceil(decided.max_response_length / 3);

  let rawContent = '';
  try {
    const primary = await getGroq().chat.completions.create({ model: GENERATION_MODEL, messages: groqMessages, max_tokens: maxTokens });
    rawContent = primary.choices[0]?.message?.content?.trim() || '';
  } catch {
    try {
      const fb = await getGroq().chat.completions.create({ model: FALLBACK_MODEL, messages: groqMessages, max_tokens: maxTokens });
      rawContent = fb.choices[0]?.message?.content?.trim() || '';
    } catch {
      return failedRecord(decided.decision_id);
    }
  }

  // ── Sanitize ──────────────────────────────────────────────────────────────
  const stripped   = stripHtml(rawContent);
  const sanitized  = sanitize(stripped);
  const wasCleaned = sanitized !== stripped;

  // If >40% of content was removed, sanitize() returns a safe fallback phrase —
  // treat as PROHIBITED_CONTENT (Section 1.10 FAIL_CLOSED for prohibited output).
  if (wasCleaned && sanitized.length < stripped.length * 0.6) {
    return {
      generation_id:     uuidv4(),
      decision_ref:      decided.decision_id,
      model_id:          GENERATION_MODEL_ID,
      generated_at:      now,
      content:           sanitized,
      validation_status: 'FAILED',
      violations:        ['PROHIBITED_CONTENT'],
      schema_version:    SCHEMA_VERSION,
    };
  }

  // ── Constraint validation ─────────────────────────────────────────────────
  let content    = sanitized;
  const rawViolations = validateContent(content, decided);
  const allViolations = [...rawViolations];

  // Truncate length violations (SANITIZED)
  if (rawViolations.includes('RESPONSE_LENGTH_EXCEEDED')) {
    content = truncate(content, decided.max_response_length);
  }

  // Re-check after truncation for any remaining violations
  const postViolations = validateContent(content, decided).filter(v => v !== 'RESPONSE_LENGTH_EXCEEDED');
  const hasCritical    = postViolations.length > 0;

  const validation_status =
    allViolations.length === 0 && !wasCleaned ? 'PASSED'  :
    hasCritical                                ? 'FAILED'  :
                                                 'SANITIZED';

  return {
    generation_id:     uuidv4(),
    decision_ref:      decided.decision_id,
    model_id:          GENERATION_MODEL_ID,
    generated_at:      now,
    content,
    validation_status,
    violations: allViolations,
    schema_version:    SCHEMA_VERSION,
  };
}

module.exports = {
  generate,
  validateContent,
  CRISIS_TEMPLATE,
  CRISIS_TEMPLATE_VERSION,
  GENERATION_MODEL_ID,
};
