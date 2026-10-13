// Blueprint section 9.4 — AI output sanitizer
// Strips diagnostic language and prescriptive statements from LLM output.
// If >SANITIZER_STRIP_THRESHOLD of content is stripped, returns a safe fallback instead.

// 40% chosen as the point at which extensive stripping signals the model produced
// a fundamentally unsafe response rather than one with incidental violations.
// Revisit during clinical review if the fallback fires too often on benign content.
const SANITIZER_STRIP_THRESHOLD = 0.4;

const SAFE_FALLBACK =
  "I want to make sure I'm being helpful here. Can you tell me more about what you're feeling right now?";

const DIAGNOSTIC_PATTERNS = [
  /you have\s+(a\s+)?(clinical\s+)?\w+(\s+disorder)?/gi,
  /you are suffering from/gi,
  /this is (a\s+)?\w+(\s+disorder)?/gi,
  /you('ve| have) been diagnosed/gi,
  /sounds like (a\s+)?\w+(\s+disorder)/gi,
  /that('s| is) (a\s+)?symptom of/gi,
  /you('re| are) (showing signs of|exhibiting)/gi,
];

const PRESCRIPTIVE_PATTERNS = [
  /you should take\s+\w+/gi,
  /try (this |the |)medication/gi,
  /take\s+\w+\s+(mg|milligrams?|pills?|tablets?)/gi,
  /see a (doctor|psychiatrist|physician) about/gi,
  /prescribe/gi,
  /dosage of/gi,
  /i('d| would) recommend (taking|medication|a drug)/gi,
];

// Strip all HTML tags from a string — prevents raw HTML from reaching the database
function stripHtml(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '').trim();
}

function sanitize(text) {
  if (!text) return SAFE_FALLBACK;

  const original = text;
  let result = text;

  for (const pattern of [...DIAGNOSTIC_PATTERNS, ...PRESCRIPTIVE_PATTERNS]) {
    result = result.replace(pattern, '');
  }

  // Clean up double spaces / orphaned punctuation left by removals
  result = result.replace(/\s{2,}/g, ' ').replace(/\s([.,!?])/g, '$1').trim();

  const removedRatio = 1 - result.length / original.length;
  if (removedRatio > SANITIZER_STRIP_THRESHOLD) {
    return SAFE_FALLBACK;
  }

  return result || SAFE_FALLBACK;
}

module.exports = { sanitize, stripHtml, SANITIZER_STRIP_THRESHOLD };
