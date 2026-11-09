// Words the command parser understands: numbers, units, rupee words, action keywords.
// To support a new spoken word, add it here — no parser changes needed.
const n = (s) => s.normalize('NFC');
const NUM = {
  // English
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, half: 0.5, quarter: 0.25,
  // Tanglish
  oru: 1, onnu: 1, ondru: 1, rendu: 2, irandu: 2, moonu: 3, munu: 3, naalu: 4, nalu: 4, anju: 5, ainthu: 5,
  aaru: 6, ezhu: 7, ettu: 8, onbathu: 9, ombathu: 9, pathu: 10, patthu: 10, arai: 0.5, kaal: 0.25,
  onnara: 1.5, ondrara: 1.5, rendara: 2.5,
  // Tamil script
  'ஒரு': 1, 'ஒன்று': 1, 'ஒண்ணு': 1, 'இரண்டு': 2, 'ரெண்டு': 2, 'மூன்று': 3, 'மூணு': 3, 'நான்கு': 4, 'நாலு': 4,
  'ஐந்து': 5, 'அஞ்சு': 5, 'ஆறு': 6, 'ஏழு': 7, 'எட்டு': 8, 'ஒன்பது': 9, 'ஒம்பது': 9, 'பத்து': 10,
  'அரை': 0.5, 'கால்': 0.25, 'ஒன்றரை': 1.5, 'ஒன்னரை': 1.5, 'இரண்டரை': 2.5,
};
const NUMBER_WORDS = new Map(Object.entries(NUM).map(([k, v]) => [n(k), v]));

const UNIT_WORDS = {
  kg: ['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms', 'கிலோ', 'கிலோகிராம்'],
  g: ['g', 'gm', 'gms', 'gram', 'grams', 'கிராம்'],
  l: ['l', 'lt', 'ltr', 'litre', 'litres', 'liter', 'liters', 'லிட்டர்'],
  ml: ['ml', 'mls', 'millilitre', 'millilitres', 'milliliter', 'மில்லி'],
  packet: ['packet', 'packets', 'pack', 'பாக்கெட்', 'பொட்டலம்'],
  piece: ['piece', 'pieces', 'pc', 'pcs', 'nos', 'பீஸ்'],
  dozen: ['dozen', 'dozens', 'டஜன்'],
};
const UNIT_LOOKUP = new Map(Object.entries(UNIT_WORDS).flatMap(([u, ws]) => ws.map((w) => [n(w), u])));

const RUPEE = new Set(['rupees', 'rupee', 'rs', '₹', 'inr', 'rupaa', 'rupai', 'rubai', 'ரூபாய்', 'ரூபா', 'ரூ'].map(n));

const kw = (words, roots = []) => ({ words: new Set(words.map(n)), roots: roots.map(n) });
// roots = prefix match (handles endings like pannunga / சேர்க்கவும்)
const KEYWORDS = {
  print: kw(['print'], ['ப்ரிண்ட்', 'பிரிண்ட்', 'அச்சு']),
  total: kw(['total', 'mothham', 'motham', 'mottham', 'evlo', 'evvalavu', 'evalo', 'amount', 'much'], ['மொத்த', 'டோட்ட', 'எவ்வள']),
  remove: kw(['remove', 'delete', 'vendam', 'vendaam'], ['neek', 'நீக்', 'வேண்டா', 'ரிமூவ்', 'டெலீட்']),
  clear: kw(['clear', 'reset', 'empty'], ['azhi', 'அழி', 'க்ளியர்', 'கிளியர்', 'ரீசெட்']),
  price: kw(['price', 'rate', 'vilai'], ['விலை', 'ப்ரைஸ்', 'பிரைஸ்', 'ரேட்']),
  change: kw(['change', 'update', 'set', 'modify'], ['maath', 'maat', 'mat', 'மாற்', 'மாத்', 'சேஞ்ச்']),
  qty: kw(['quantity', 'qty', 'alavu', 'count'], ['அளவு', 'எண்ணிக்கை', 'குவாண்டிட்டி']),
  add: kw(['add', 'put', 'give', 'podu', 'podunga', 'poduga', 'kudu', 'kodu', 'venum', 'vendum', 'veenum'],
    ['sert', 'serk', 'சேர்', 'போடு', 'கொடு', 'வேணும்', 'வேண்டு', 'ஆட்']),
};
const FILLER = kw(['please', 'pls', 'the', 'of', 'to', 'my', 'bill', 'for', 'and', 'in', 'is', 'what', 'tell', 'me', 'show',
  'now', 'per', 'ku', 'kku', 'la', 'ippo', 'ellam', 'all', 'everything', 'how', 'do', 'can', 'you', 'ok', 'okay',
  'பில்', 'ப்ளீஸ்', 'என்ன', 'எல்லாம்', 'இப்போ'], ['pann', 'panu', 'soll', 'பண்ண', 'செய்', 'சொல்']);

const NUM_RE = /^(\d+\.?\d*|\.\d+)$/;
const hit = (k, t) => k.words.has(t) || k.roots.some((r) => t.startsWith(r));

/** @returns {{kind:string, ...}|null}  null = not a known word, so it is part of a product name */
export function classify(t) {
  if (NUM_RE.test(t)) return { kind: 'number', value: Number(t) };
  if (NUMBER_WORDS.has(t)) return { kind: 'number', value: NUMBER_WORDS.get(t) };
  if (UNIT_LOOKUP.has(t)) return { kind: 'unit', unit: UNIT_LOOKUP.get(t) };
  if (RUPEE.has(t)) return { kind: 'rupee' };
  for (const [name, k] of Object.entries(KEYWORDS)) if (hit(k, t)) return { kind: 'kw', name };
  if (hit(FILLER, t)) return { kind: 'filler' };
  return null;
}
