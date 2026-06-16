// Training data consent and eligibility service.
// Determines whether an ai_interaction should be tagged as training-eligible
// based on: user consent, session privacy flag, crisis content, and basic PII check.

const { query } = require('../db');

const CONSENT_VERSION = 'v1.0';

// Kenyan-context PII patterns: phone numbers, national ID, email addresses.
const PII_PATTERNS = [
  /\b(\+?254|0)[17]\d{8}\b/,               // Kenyan mobile (+254 or 07xx/01xx)
  /\b[A-Z]\d{7,8}[A-Z]?\b/,               // Kenyan national ID / passport format
  /\b\d{7,8}\b/,                            // Bare ID number (7-8 digits)
  /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/, // Email
  /\bID:?\s*\d{6,9}\b/i,                   // Explicit ID references
  /\bKRA\s*PIN\b/i,                         // KRA PIN reference
];

function containsPII(text) {
  if (!text) return false;
  return PII_PATTERNS.some(p => p.test(text));
}

async function checkConsent(userId) {
  const { rows } = await query(
    'SELECT training_consent FROM users WHERE id = $1',
    [userId]
  );
  return rows[0]?.training_consent === true;
}

// Called after an interaction is persisted. Tags it as training-eligible if:
// - user has consented
// - session is not private
// - interaction was not flagged as critical/crisis
// - input + output passes PII check
async function maybeTagInteraction({ interactionId, userId, sessionId, inputText, outputText, flagged, languageDetected }) {
  const consented = await checkConsent(userId);
  if (!consented) return;

  // Check session privacy flag
  const { rows: sessionRows } = await query(
    'SELECT is_private FROM sessions WHERE id = $1',
    [sessionId]
  );
  if (sessionRows[0]?.is_private) return;

  // Never tag crisis interactions
  if (flagged) return;

  // Skip if PII detected in either turn
  if (containsPII(inputText) || containsPII(outputText)) return;

  await query(
    `UPDATE ai_interactions
     SET language_detected = $1, training_eligible = true
     WHERE id = $2`,
    [languageDetected || null, interactionId]
  );
}

// Grant training consent for a user.
async function grantConsent(userId) {
  await query(
    `UPDATE users
     SET training_consent = true,
         training_consented_at = NOW(),
         training_consent_version = $1
     WHERE id = $2`,
    [CONSENT_VERSION, userId]
  );
}

// Withdraw training consent — untags all existing records for this user.
async function withdrawConsent(userId) {
  await query(
    `UPDATE users
     SET training_consent = false,
         training_consented_at = NULL,
         training_consent_version = NULL
     WHERE id = $1`,
    [userId]
  );
  await query(
    `UPDATE ai_interactions SET training_eligible = false WHERE user_id = $1`,
    [userId]
  );
}

module.exports = { grantConsent, withdrawConsent, maybeTagInteraction, checkConsent, CONSENT_VERSION };
