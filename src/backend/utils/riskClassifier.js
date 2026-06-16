// Blueprint section 9.3 — keyword risk classifier
// classify(text) → { severity: 'critical'|'high'|'medium', category, keyword } or null
// Covers: English, Swahili, and Sheng.

const KEYWORDS = {
  critical: [
    { category: 'self_harm', keywords: [
      // English
      'hurt myself', 'hurting myself', 'cut myself', 'cutting myself',
      'self harm', 'self-harm',
      'end it all', 'ending it all',
      "don't want to be here", 'dont want to be here',
      'want to disappear', 'wish i was dead',
      // Swahili
      'kujidhuru', 'ninajidhuru', 'ninajikata', 'kujikata',
      'kutaka kutoweka', 'nataka kutoweka', 'nataka kupotea',
      'sijali kuishi', 'sitaki kuishi',
      // Sheng
      'najidhuru', 'najikata', 'maze nataka kutoweka',
    ]},
    { category: 'suicidal_ideation', keywords: [
      // English
      'kill myself', 'killing myself', 'want to die', 'wanted to die',
      'suicide', 'suicidal', 'no reason to live', 'end my life',
      'ending my life', 'take my life', 'rather be dead',
      'better off dead', 'thinking of suicide',
      // Swahili
      'kujiua', 'nataka kujiua', 'ninataka kujiua', 'nilikuwa nafikiri kujiua',
      'kuua nafsi yangu', 'kumaliza maisha', 'nataka kumaliza maisha',
      'nataka kufa', 'ninataka kufa', 'sina sababu ya kuishi',
      'maisha hayana maana', 'sitaki maisha haya', 'naomba niue',
      'nilikuwa karibu kujisalimisha',
      // Sheng
      'maze nataka kujiua', 'nilikuwa nafikiri kujiua', 'buda nataka kufa',
      'naenda kujiua', 'nataka kumaliza', 'sina reason ya kuishi',
    ]},
  ],
  high: [
    { category: 'abuse_disclosure', keywords: [
      // English
      'being abused', 'he hits me', 'she hits me', 'they hurt me',
      'being hurt by', 'domestic violence', 'sexual abuse',
      'being assaulted', 'he abuses me',
      // Swahili
      'ananipiga', 'wananipiga', 'ninapigwa', 'unyanyasaji wa nyumbani',
      'unyanyasaji wa kingono', 'nilidhulumiwa', 'wananikumba',
      'ananidhulumu', 'wananisumbua',
      // Sheng
      'ananipiga buda', 'wananisumbua sana', 'maze wananidharau',
    ]},
    { category: 'severe_distress', keywords: [
      // English
      "can't cope", 'cannot cope', 'falling apart', 'breaking down',
      'losing my mind', 'completely broken', "can't go on", 'cannot go on',
      'giving up on life', 'no way out', 'feel trapped', 'absolutely hopeless',
      // Swahili
      'siwezi kuendelea', 'nimevunjika', 'sina tumaini', 'hali ni mbaya sana',
      'nimechoka sana', 'siwezi kuhimili', 'sijaona njia', 'niko trapped',
      'nahisi nimefungwa', 'hakuna njia ya kutoka',
      // Sheng
      'maze nimevunjika', 'buda siwezi', 'si poa kabisa', 'nimechoka maze',
      'hakuna hope', 'ngori sana buda', 'sina nguvu tena',
    ]},
    { category: 'substance_crisis', keywords: [
      // English
      'overdose', 'took too many', 'took too much', 'drunk and scared',
      'mixed pills', 'swallowed a lot', "can't stop drinking",
      // Swahili
      'nimemeza dawa nyingi', 'nimekula dawa mob', 'siwezi kuacha kunywa',
      'nilichanganya dawa',
      // Sheng
      'nimemeza mob', 'dawa nyingi maze', 'siwezi kuacha buda',
    ]},
  ],
  medium: [
    { category: 'moderate_distress', keywords: [
      // English
      'really struggling', 'so anxious', "can't sleep", 'cannot sleep',
      'feel hopeless', 'feeling hopeless', 'totally overwhelmed',
      "can't handle", 'so depressed', 'very depressed', 'feel worthless',
      'exhausted and sad', 'nothing matters', "what's the point",
      // Swahili
      'nahisi vibaya sana', 'sijalala', 'sijali tena', 'niko depressed',
      'ninateseka', 'ninajisikia vibaya', 'nimechoka', 'ninahangaika',
      'sina nguvu', 'hali yangu si nzuri', 'ninajisikia peke yangu',
      'sijui la kufanya', 'kila kitu ni bure',
      // Sheng
      'nahisi ngori sana', 'maze sijali', 'buda niko down', 'vibes mbaya sana',
      'nimechoka maze', 'stress mob', 'niko stressed sana', 'sijisikii poa',
    ]},
  ],
};

function classify(text) {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase();

  for (const severity of ['critical', 'high', 'medium']) {
    for (const group of KEYWORDS[severity]) {
      for (const keyword of group.keywords) {
        if (lower.includes(keyword)) {
          return { severity, category: group.category, keyword };
        }
      }
    }
  }
  return null;
}

module.exports = { classify };
