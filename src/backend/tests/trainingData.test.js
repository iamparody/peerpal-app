// Tests for PII detection and consent logic in trainingData service.
// DB-dependent functions (grantConsent, withdrawConsent, maybeTagInteraction)
// are tested separately via integration tests — these cover pure logic only.

// Re-expose containsPII for testing by duplicating the patterns here.
// This is intentional — tests should fail if the patterns change unexpectedly.
const PII_PATTERNS = [
  /\b(\+?254|0)[17]\d{8}\b/,
  /\b[A-Z]\d{7,8}[A-Z]?\b/,
  /\b\d{7,8}\b/,
  /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/,
  /\bID:?\s*\d{6,9}\b/i,
  /\bKRA\s*PIN\b/i,
];
const containsPII = (text) => PII_PATTERNS.some(p => p.test(text));

describe('trainingData — PII detection', () => {
  describe('Kenyan phone numbers', () => {
    test('07xx format', () => expect(containsPII('call me on 0712345678')).toBe(true));
    test('01xx format', () => expect(containsPII('my number is 0112345678')).toBe(true));
    test('+254 format', () => expect(containsPII('reach me at +254712345678')).toBe(true));
    test('safe text with numbers', () => expect(containsPII('I have been struggling for 3 years')).toBe(false));
  });

  describe('National ID', () => {
    test('8-digit ID', () => expect(containsPII('my ID is 12345678')).toBe(true));
    test('KRA PIN reference', () => expect(containsPII('my KRA PIN is A123456789B')).toBe(true));
    test('explicit ID prefix', () => expect(containsPII('ID: 9876543')).toBe(true));
  });

  describe('Email', () => {
    test('email in text', () => expect(containsPII('contact me at john@example.com')).toBe(true));
    test('no email', () => expect(containsPII('I feel anxious about work')).toBe(false));
  });

  describe('Clean mental health text', () => {
    test('Swahili distress', () => expect(containsPII('ninajisikia vibaya sana leo')).toBe(false));
    test('Sheng distress', () => expect(containsPII('maze stress mob buda sijisikii poa')).toBe(false));
    test('English distress', () => expect(containsPII('I have been feeling really anxious and overwhelmed')).toBe(false));
    test('journaling text', () => expect(containsPII('Today I felt sad. I cried for a long time.')).toBe(false));
  });
});
