// Lightweight language detector for Kenyan language context.
// Uses weighted keyword matching — fast, zero dependencies, no ML.
// Returns { language, confidence } where language is one of:
//   'english' | 'swahili' | 'sheng' | 'kikuyu' | 'luo' | 'kamba' | 'unknown'

const SWAHILI_MARKERS = new Set([
  'na', 'ya', 'wa', 'ni', 'kwa', 'katika', 'lakini', 'kama', 'hii', 'hizi',
  'mimi', 'wewe', 'yeye', 'sisi', 'ninyi', 'wao', 'nini', 'kwamba', 'au',
  'pia', 'sana', 'kabla', 'baada', 'pamoja', 'bila', 'kila', 'kuwa',
  'alikuwa', 'nilikuwa', 'ulikuwa', 'tunaweza', 'ninaweza', 'unataka',
  'asante', 'karibu', 'habari', 'nzuri', 'mbaya', 'nataka', 'sijui',
  'naomba', 'pole', 'sawa', 'bado', 'tayari', 'tena', 'hata', 'pia',
  'lakini', 'bali', 'ingawa', 'kwamba', 'kweli', 'ndiyo', 'hapana',
  'ninafeel', 'ninajisikia', 'ninafikiria', 'ninajua', 'sijui', 'sijisikii',
  'naenda', 'narudi', 'ninaishi', 'ninaishi', 'kujiua', 'kujidhuru',
]);

// Sheng markers — words unique to Sheng, not found in standard Swahili or English
const SHENG_MARKERS = new Set([
  'maze', 'buda', 'msee', 'ngori', 'rada', 'fiti', 'manze', 'mtaa', 'baze',
  'mbona', 'aje', 'vibes', 'dunda', 'mchoro', 'hali yako', 'ushindwe',
  'si poa', 'poa kabisa', 'sawa kabisa', 'mambo poa', 'noma sana',
  'uliskia', 'alikuambia', 'nikuskia', 'unajua', 'unaona',
]);

// Kikuyu function words and common terms
const KIKUYU_MARKERS = new Set([
  'ndi', 'nĩ', 'gũkũ', 'thĩ', 'rĩa', 'ũyũ', 'atĩ', 'ũtũ', 'mũndũ',
  'andũ', 'nĩwe', 'mwanake', 'mũirĩtu', 'gĩkũyũ', 'kĩrĩma', 'mũtũngũ',
  'rũgendo', 'maitũ', 'baba', 'mũgũnda', 'nja', 'gĩthomo',
]);

// Luo (Dholuo) common words
const LUO_MARKERS = new Set([
  'ber', 'ahinya', 'adhi', 'abet', 'bende', 'kata', 'nyalo', 'mano',
  'nono', 'ang\'o', 'kanye', 'dholuo', 'osiep', 'yamo', 'chiemo',
  'tho', 'ngima', 'lemo', 'wach', 'puonj',
]);

// Kamba common words
const KAMBA_MARKERS = new Set([
  'nzia', 'mwatu', 'mwende', 'kĩveti', 'ũthĩ', 'mũkĩ', 'ngũu', 'mũvo',
  'kamba', 'ĩtina', 'ĩvinda', 'mũũntũ', 'andũ',
]);

function detect(text) {
  if (!text || typeof text !== 'string' || text.trim().length < 3) {
    return { language: 'unknown', confidence: 0 };
  }

  const lower = text.toLowerCase();
  const words = lower.replace(/[^\w\s'ĩũĩũĩũũĩĩũ]/g, ' ').split(/\s+/).filter(w => w.length > 1);
  if (!words.length) return { language: 'unknown', confidence: 0 };

  let swCount = 0;
  let shCount = 0;
  let kiCount = 0;
  let luoCount = 0;
  let kmbCount = 0;
  let enCount = 0;

  for (const word of words) {
    if (SHENG_MARKERS.has(word)) { shCount += 2; swCount += 0.5; } // Sheng implies Swahili base
    else if (SWAHILI_MARKERS.has(word)) swCount++;
    else if (KIKUYU_MARKERS.has(word)) kiCount++;
    else if (LUO_MARKERS.has(word)) luoCount++;
    else if (KAMBA_MARKERS.has(word)) kmbCount++;
    else if (/^[a-z]{2,}$/.test(word)) enCount++;
  }

  // Sheng: has Sheng markers + Swahili/English mix
  if (shCount >= 1 && (swCount + enCount) > 0) {
    const conf = Math.min(0.9, (shCount * 0.4 + swCount * 0.1) / words.length + 0.3);
    return { language: 'sheng', confidence: conf };
  }

  const scores = {
    swahili: swCount / words.length,
    english: enCount / words.length,
    kikuyu: kiCount / words.length,
    luo: luoCount / words.length,
    kamba: kmbCount / words.length,
  };

  const [topLang, topScore] = Object.entries(scores).reduce((a, b) => b[1] > a[1] ? b : a);

  if (topScore < 0.03) return { language: 'unknown', confidence: topScore };

  // English and Swahili share many short words — require higher confidence to call Swahili
  if (topLang === 'swahili' && topScore < 0.08 && enCount > swCount) {
    return { language: 'english', confidence: scores.english };
  }

  return { language: topLang, confidence: Math.min(0.95, topScore * 1.5) };
}

module.exports = { detect };
