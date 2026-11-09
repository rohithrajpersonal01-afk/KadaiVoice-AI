// Turns a text transcript into a structured billing command. Never touches the bill.
// parseCommand() -> {status:'ok', command} | {status:'ambiguous', candidates} | {status:'error', code, message}
import { matchProduct, termsOf, normalize } from '../matcher.js';
import { UNITS, areCompatible } from '../units.js';
import { classify } from './lexicon.js';

const TAMIL_DIGITS = '௦௧௨௩௪௫௬௭௮௯';

export function tokenize(text) {
  return String(text ?? '').normalize('NFC').toLowerCase()
    .replace(/[௦-௯]/g, (d) => TAMIL_DIGITS.indexOf(d))
    .replace(/(\d),(\d)/g, '$1$2')
    .replace(/₹/g, ' ₹ ')
    .replace(/\.(?!\d)/g, ' ')
    .replace(/[,!?'"“”;:()\-–]/g, ' ')
    .replace(/(\d)([^\d\s.])/g, '$1 $2').replace(/([^\d\s.])(\d)/g, '$1 $2')
    .split(/\s+/).filter(Boolean);
}

const lev = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
const stripSuffix = (w) => w.replace(/(யை|ஐ)$/, '').replace(/(yai|ya|ai)$/, '');

/** exact/partial -> Tamil/Tanglish suffix removal -> small-typo fuzzy match */
function findProduct(phrase, catalogue) {
  let m = matchProduct(phrase, catalogue);
  if (m.status !== 'none') return m;
  const stripped = phrase.split(' ').map(stripSuffix).join(' ');
  if (stripped !== phrase) { m = matchProduct(stripped, catalogue); if (m.status !== 'none') return m; }
  const q = normalize(phrase);
  if (q.length < 5) return { status: 'none', candidates: [] };
  let best = Infinity, found = [];
  for (const pr of catalogue) {
    const d = Math.min(...termsOf(pr).map((t) => lev(q, t)));
    if (d < best) { best = d; found = [pr]; } else if (d === best) found.push(pr);
  }
  if (best > (q.length >= 9 ? 2 : 1)) return { status: 'none', candidates: [] };
  return { status: found.length === 1 ? 'match' : 'ambiguous', product: found[0], candidates: found, fuzzy: true };
}

const label = (u) => UNITS[u].label;

export function parseCommand(text, catalogue, bill, { product: forced } = {}) {
  const raw = String(text ?? '').trim();
  const err = (code, message) => ({ status: 'error', code, message, transcript: raw });
  if (!raw) return err('EMPTY_COMMAND', 'Nothing to interpret — type or say a command first.');
  if (/(^|\s)[-−–]\s*\d/.test(raw)) return err('INVALID_NUMBER', 'Numbers cannot be negative.');

  // classify words; merge "<number> and half" -> number + 0.5
  const toks = [];
  const words = tokenize(raw);
  for (let i = 0; i < words.length; i++) {
    const c = classify(words[i]);
    if (words[i] === 'and' && words[i + 1] === 'half' && toks.at(-1)?.c?.kind === 'number') { toks.at(-1).c = { kind: 'number', value: toks.at(-1).c.value + 0.5 }; i++; continue; }
    toks.push({ t: words[i], c });
  }
  const kinds = (k) => toks.filter((x) => x.c?.kind === k);
  const flag = (name) => toks.some((x) => x.c?.kind === 'kw' && x.c.name === name);
  const phrase = toks.filter((x) => !x.c).map((x) => x.t).join(' ');
  const hasRupee = kinds('rupee').length > 0;
  const numIdx = toks.map((x, i) => (x.c?.kind === 'number' ? i : -1)).filter((i) => i >= 0);
  const nextToRupee = (i) => toks[i - 1]?.c?.kind === 'rupee' || toks[i + 1]?.c?.kind === 'rupee';

  // quantity + unit ("oru kilo", "500 gram", "kadugu rendu kilo")
  let qty = null, unit = null;
  const ui = toks.findIndex((x) => x.c?.kind === 'unit');
  if (ui >= 0) {
    unit = toks[ui].c.unit;
    if (toks[ui - 1]?.c?.kind === 'number') qty = toks[ui - 1].c.value;
    else if (toks[ui + 1]?.c?.kind === 'number') qty = toks[ui + 1].c.value;
  } else {
    const i = numIdx.find((k) => !nextToRupee(k));
    if (i !== undefined) qty = toks[i].c.value;
  }

  // ---- intent ----
  let intent = null;
  if (flag('print')) intent = 'print';
  else if (flag('total') && !phrase && numIdx.length === 0) intent = 'total';
  else if (flag('remove')) intent = 'remove';
  else if (flag('clear')) intent = phrase || forced ? 'remove' : 'clear';
  else if (flag('price') || (hasRupee && numIdx.length)) intent = 'set_price';
  else if ((flag('change') || flag('qty')) && !flag('add')) intent = 'set_quantity';
  else if (flag('add') || ((phrase || forced) && (qty !== null || unit))) intent = 'add';

  if (intent === 'print') return err('UNSUPPORTED', 'Printing is not available yet — receipt printing arrives in Phase 5.');
  if (intent === 'total') return bill.items.length ? { status: 'ok', transcript: raw, readOnly: true, command: { type: 'total', notes: [] } }
    : err('EMPTY_BILL', 'The bill is empty, so the total is ₹0.00.');
  if (intent === 'clear') return bill.items.length ? { status: 'ok', transcript: raw, command: { type: 'clear', notes: [] } }
    : err('EMPTY_BILL', 'The bill is already empty.');

  if (!intent) {
    if (phrase && findProduct(phrase, catalogue).status !== 'none')
      return err('MISSING_ACTION', `What should I do with "${phrase}"? Try e.g. "add 1 kg ${phrase}".`);
    return err('UNKNOWN_COMMAND', 'I did not understand that. Try "oru kilo arisi add pannu", "sugar price 50 rupees change pannu" or "bill total sollu".');
  }

  // ---- product ----
  const needsInBill = intent !== 'add';
  const inBill = (p) => bill.items.some((i) => i.productId === p.id);
  const notes = [];
  let product = forced, ambiguous = null;
  if (!product) {
    if (!phrase) return err('MISSING_PRODUCT', 'Which product? For example: "add 1 kg rice".');
    const m = findProduct(phrase, catalogue);
    if (m.status === 'none') return err('PRODUCT_NOT_FOUND', `I could not find a product called "${phrase}".`);
    let cands = m.candidates;
    if (needsInBill) {
      const inB = cands.filter(inBill);
      if (!inB.length) return err('NOT_IN_BILL', `${cands.map((c) => c.name).join(' / ')} ${cands.length > 1 ? 'are' : 'is'} not in the bill.`);
      if (inB.length < cands.length && inB.length === 1) notes.push(`"${phrase}" could mean several products; only ${inB[0].name} is in the bill.`);
      cands = inB;
    }
    if (cands.length > 1) ambiguous = cands;
    else { product = cands[0]; if (m.fuzzy) notes.push(`Approximate match: heard "${phrase}", understood ${product.name}. Please check.`); }
  }
  if (ambiguous) return { status: 'ambiguous', transcript: raw, intent, candidates: ambiguous,
    message: `"${phrase}" could mean more than one product. Which one do you mean?` };
  if (needsInBill && !inBill(product)) return err('NOT_IN_BILL', `${product.name} is not in the bill.`);

  const base = { productId: product.id, productName: product.name, tamilName: product.tamilName, priceUnit: product.unit };
  const done = (command) => ({ status: 'ok', transcript: raw, command: { ...base, ...command, notes } });

  // converts "packet" using the product's sample pack size, and checks unit compatibility
  const fit = (q, u) => {
    if (u === 'packet' && product.packSize) {
      notes.push(`1 packet = ${product.packSize.qty} ${label(product.packSize.unit)} (sample pack size).`);
      return { quantity: q * product.packSize.qty, unit: product.packSize.unit };
    }
    if (!areCompatible(u, product.unit))
      return { error: err('INCOMPATIBLE_UNIT', `${product.name} is sold by ${label(product.unit)}, so it cannot be used in ${label(u)}.`) };
    return { quantity: q, unit: u };
  };

  if (intent === 'remove') return done({ type: 'remove' });

  if (intent === 'set_price') {
    const pi = numIdx.find(nextToRupee) ?? numIdx.at(-1);
    if (pi === undefined) return err('MISSING_PRICE', `What is the new price for ${product.name}? e.g. "${product.name} price 50 rupees".`);
    const price = toks[pi].c.value;
    if (unit && unit !== product.unit) return err('PRICE_UNIT', `${product.name} is priced per ${label(product.unit)}. Please give the price per ${label(product.unit)}.`);
    return done({ type: 'set_price', price });
  }

  // add / set_quantity
  if (unit && qty === null) return err('MISSING_QUANTITY', `How many ${label(unit)} of ${product.name}?`);
  if (qty === null) {
    if (intent === 'set_quantity') return err('MISSING_QUANTITY', `What is the new quantity for ${product.name}?`);
    qty = 1; notes.push(`No quantity heard — assuming 1 ${label(product.unit)}.`);
  }
  if (!(qty > 0)) return err('INVALID_QUANTITY', 'Quantity must be greater than 0.');
  if (!unit) {
    unit = intent === 'set_quantity' ? bill.items.find((i) => i.productId === product.id).unit : product.unit;
    if (qty !== 1 || !notes.length) notes.push(`No unit heard — assuming ${label(unit)}.`);
  }
  const f = fit(qty, unit);
  if (f.error) return f.error;
  return done({ type: intent, quantity: f.quantity, unit: f.unit });
}
