// Language/model presets offered to the UI. Every value below is taken from the Gnani STT docs
// (prisma-v3.0 accepts "indic-auto" or a comma-separated list of 1-4 languages; omitting `model` = Prisma v2.5).
export const PRESETS = {
  'v3-ta-en': { label: 'Prisma v3.0 · Tamil + English (ta-IN,en-IN)', model: 'prisma-v3.0', language_code: 'ta-IN,en-IN' },
  'v3-auto':  { label: 'Prisma v3.0 · Auto-detect (indic-auto)',     model: 'prisma-v3.0', language_code: 'indic-auto' },
  'v25-ta':   { label: 'Prisma v2.5 · Tamil (ta-IN)',                model: null,          language_code: 'ta-IN' },
  'v25-en':   { label: 'Prisma v2.5 · English (en-IN)',              model: null,          language_code: 'en-IN' },
};
export const DEFAULT_PRESET = 'v3-ta-en';

// Used ONLY by demo/mock mode. These are simulated results, not speech recognition.
export const MOCK_PHRASES = [
  'oru kilo arisi add pannu', 'rendu kilo sakkarai add pannu', 'Half kilo ulutham paruppu',
  'Arisi quantity three kilo change pannu', 'Sugar price 50 rupees change pannu', 'ulutham paruppu remove pannu',
  'paruppu add pannu', 'bill total sollu', 'ஒரு கிலோ அரிசி சேர்க்கவும்',
];
