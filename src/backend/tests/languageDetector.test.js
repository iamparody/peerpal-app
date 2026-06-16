const { detect } = require('../utils/languageDetector');

describe('languageDetector', () => {
  describe('English', () => {
    test('plain English sentence', () => {
      expect(detect('I am really struggling today with anxiety').language).toBe('english');
    });
    test('short English', () => {
      expect(detect('feeling lost').language).toBe('english');
    });
  });

  describe('Swahili', () => {
    test('pure Swahili', () => {
      expect(detect('ninajisikia vibaya sana leo').language).toBe('swahili');
    });
    test('Swahili with common function words', () => {
      expect(detect('sijui la kufanya na nimechoka sana').language).toBe('swahili');
    });
    test('crisis phrase in Swahili', () => {
      expect(detect('nataka kujiua sina sababu ya kuishi').language).toBe('swahili');
    });
  });

  describe('Sheng', () => {
    test('Sheng with markers', () => {
      expect(detect('maze buda sijisikii poa sana leo').language).toBe('sheng');
    });
    test('Sheng code-switch', () => {
      expect(detect('manze stress mob sana ngori kabisa').language).toBe('sheng');
    });
    test('Sheng with English mix', () => {
      expect(detect('maze I am so stressed buda si poa').language).toBe('sheng');
    });
  });

  describe('Kikuyu', () => {
    test('Kikuyu sentence', () => {
      expect(detect('nĩ mũndũ mwega gĩkũyũ nĩwe').language).toBe('kikuyu');
    });
  });

  describe('Luo', () => {
    test('Luo sentence', () => {
      expect(detect('ber ahinya bende nyalo adhi').language).toBe('luo');
    });
  });

  describe('Edge cases', () => {
    test('empty string → unknown', () => {
      expect(detect('').language).toBe('unknown');
    });
    test('very short text → unknown', () => {
      expect(detect('hi').language).toBe('unknown');
    });
    test('numbers only → unknown', () => {
      expect(detect('12345 678').language).toBe('unknown');
    });
    test('returns confidence between 0 and 1', () => {
      const { confidence } = detect('I am feeling really anxious today');
      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
    });
  });
});
