const { sanitize, stripHtml } = require('../utils/sanitizer');

describe('stripHtml', () => {
  test('strips tags', () => expect(stripHtml('<b>hello</b>')).toBe('hello'));
  test('strips nested tags', () => expect(stripHtml('<div><p>text</p></div>')).toBe('text'));
  test('leaves plain text', () => expect(stripHtml('plain text')).toBe('plain text'));
  test('empty string', () => expect(stripHtml('')).toBe(''));
  test('null input', () => expect(stripHtml(null)).toBe(''));
});

describe('sanitize', () => {
  test('passes clean text through', () => {
    const text = 'That sounds really hard. How are you feeling right now?';
    expect(sanitize(text)).toBe(text);
  });

  test('removes diagnostic language', () => {
    const result = sanitize('You have a clinical anxiety disorder based on what you said.');
    expect(result).not.toMatch(/you have a clinical anxiety disorder/i);
  });

  test('removes prescriptive language', () => {
    const result = sanitize('You should take 20mg of this medication daily.');
    expect(result).not.toMatch(/take.*mg/i);
  });

  test('returns fallback if >40% stripped', () => {
    // Construct a string that is almost entirely diagnostic/prescriptive
    const badText = 'You have a disorder. You are suffering from depression. You have been diagnosed. You are showing signs of bipolar.';
    const result = sanitize(badText);
    expect(result).toContain("I want to make sure I'm being helpful");
  });

  test('returns fallback for empty input', () => {
    expect(sanitize('')).toContain("I want to make sure I'm being helpful");
  });

  test('returns fallback for null', () => {
    expect(sanitize(null)).toContain("I want to make sure I'm being helpful");
  });
});
