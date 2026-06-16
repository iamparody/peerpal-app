const { classify } = require('../utils/riskClassifier');

describe('riskClassifier', () => {
  describe('English — critical', () => {
    test('suicidal ideation', () => {
      const r = classify('I want to kill myself');
      expect(r.severity).toBe('critical');
      expect(r.category).toBe('suicidal_ideation');
    });
    test('self harm', () => {
      const r = classify('I keep cutting myself');
      expect(r.severity).toBe('critical');
      expect(r.category).toBe('self_harm');
    });
    test('want to disappear', () => {
      const r = classify('I just want to disappear');
      expect(r.severity).toBe('critical');
    });
  });

  describe('Swahili — critical', () => {
    test('nataka kujiua', () => {
      const r = classify('nataka kujiua sina sababu ya kuishi');
      expect(r.severity).toBe('critical');
      expect(r.category).toBe('suicidal_ideation');
    });
    test('kujiua standalone', () => {
      const r = classify('nimekuwa nikidhani kujiua');
      expect(r.severity).toBe('critical');
    });
    test('nataka kufa', () => {
      const r = classify('ninataka kufa leo');
      expect(r.severity).toBe('critical');
    });
    test('self harm in Swahili', () => {
      const r = classify('ninajidhuru kila siku');
      expect(r.severity).toBe('critical');
      expect(r.category).toBe('self_harm');
    });
    test('kumaliza maisha', () => {
      const r = classify('nataka kumaliza maisha yangu');
      expect(r.severity).toBe('critical');
    });
  });

  describe('Sheng — critical', () => {
    test('sheng suicidal', () => {
      const r = classify('maze nataka kujiua buda');
      expect(r.severity).toBe('critical');
    });
    test('sheng want to die', () => {
      const r = classify('buda nataka kufa sana');
      expect(r.severity).toBe('critical');
    });
  });

  describe('High severity', () => {
    test('English severe distress', () => {
      const r = classify("I can't cope anymore and feel completely broken");
      expect(r.severity).toBe('high');
      expect(r.category).toBe('severe_distress');
    });
    test('Swahili broken', () => {
      const r = classify('nimevunjika kabisa siwezi kuendelea');
      expect(r.severity).toBe('high');
    });
    test('Swahili no hope', () => {
      const r = classify('sina tumaini tena');
      expect(r.severity).toBe('high');
    });
    test('overdose', () => {
      const r = classify('I took too many pills');
      expect(r.severity).toBe('high');
      expect(r.category).toBe('substance_crisis');
    });
    test('abuse disclosure', () => {
      const r = classify('he hits me every night');
      expect(r.severity).toBe('high');
      expect(r.category).toBe('abuse_disclosure');
    });
    test('Swahili abuse', () => {
      const r = classify('ananipiga kila siku');
      expect(r.severity).toBe('high');
      expect(r.category).toBe('abuse_disclosure');
    });
  });

  describe('Medium severity', () => {
    test('English moderate', () => {
      const r = classify("I'm really struggling and feel hopeless");
      expect(r.severity).toBe('medium');
    });
    test('Swahili struggling', () => {
      const r = classify('nahisi vibaya sana leo');
      expect(r.severity).toBe('medium');
    });
    test('Sheng down', () => {
      const r = classify('buda niko down stress mob');
      expect(r.severity).toBe('medium');
    });
  });

  describe('No risk', () => {
    test('normal Swahili → null', () => {
      expect(classify('habari yako leo')).toBeNull();
    });
    test('normal English → null', () => {
      expect(classify('I had a good day today')).toBeNull();
    });
    test('normal Sheng → null', () => {
      expect(classify('maze mambo poa sana buda')).toBeNull();
    });
    test('empty string → null', () => {
      expect(classify('')).toBeNull();
    });
    test('null input → null', () => {
      expect(classify(null)).toBeNull();
    });
  });

  describe('Case insensitivity', () => {
    test('uppercase keywords caught', () => {
      expect(classify('NATAKA KUJIUA')).not.toBeNull();
    });
    test('mixed case', () => {
      expect(classify('I Want To Kill Myself')).not.toBeNull();
    });
  });
});
