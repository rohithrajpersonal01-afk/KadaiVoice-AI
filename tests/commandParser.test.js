import test from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../src/lib/billing.js';
import { CATALOGUE } from '../src/lib/catalogue.js';
import { parseCommand, tokenize } from '../src/lib/voice/commandParser.js';
import { describeCommand, applyCommand } from '../src/lib/voice/commandActions.js';

const P = (id) => CATALOGUE.find((x) => x.id === id);
const mk = (...rows) => rows.reduce((b, [id, q, u]) => B.addItem(b, P(id), q, u), B.emptyBill());
const EMPTY = B.emptyBill();
const parse = (t, bill = EMPTY, o) => parseCommand(t, CATALOGUE, bill, o);
const ok = (t, bill, o) => { const r = parse(t, bill, o); assert.equal(r.status, 'ok', `${t} -> ${JSON.stringify(r)}`); return r.command; };
const fails = (t, code, bill) => { const r = parse(t, bill); assert.equal(r.status, 'error', `${t} -> ${JSON.stringify(r)}`); assert.equal(r.code, code, t); return r; };
const addOf = (t, product, quantity, unit) => {
  const c = ok(t); assert.deepEqual([c.type, c.productId, c.quantity, c.unit], ['add', product, quantity, unit], t);
};

test('tokenizer: attached units, decimals, Tamil digits', () => {
  assert.deepEqual(tokenize('500g Rice, 1.5kg!'), ['500', 'g', 'rice', '1.5', 'kg']);
  assert.deepEqual(tokenize('௫௦௦ கிராம்'), ['500', 'கிராம்']);
});

test('Tanglish add commands (the spec examples)', () => {
  addOf('oru kilo arisi add pannu', 'rice', 1, 'kg');
  addOf('500 gram sakkarai add pannu', 'sugar', 500, 'g');
  addOf('kadugu rendu kilo add pannu', 'mustard', 2, 'kg');
  addOf('Rendu kilo sakkarai add pannu', 'sugar', 2, 'kg');
  addOf('Half kilo ulutham paruppu', 'urad-dal', 0.5, 'kg');
  addOf('arai kilo thuvaram paruppu add pannu', 'toor-dal', 0.5, 'kg');
  addOf('one packet oil add pannunga', 'cooking-oil', 1, 'l');
  assert.match(ok('one packet oil add pannunga').notes.join(' '), /sample pack size/);
});

test('English add commands, numbers and units', () => {
  addOf('add two kg rice', 'rice', 2, 'kg');
  addOf('Add 2 kilos of rice please', 'rice', 2, 'kg');
  addOf('rice 500g', 'rice', 500, 'g');
  addOf('add 1.5 kg sugar', 'sugar', 1.5, 'kg');
  addOf('one and half kilo arisi', 'rice', 1.5, 'kg');
  addOf('quarter kilo salt', 'salt', 0.25, 'kg');
  addOf('250 ml oil add', 'cooking-oil', 250, 'ml');
  addOf('two litre oil add pannu', 'cooking-oil', 2, 'l');
  addOf('oru dozen muttai add pannu', 'eggs', 1, 'dozen');
  addOf('6 piece eggs add', 'eggs', 6, 'piece');
  addOf('two packet milk add', 'milk', 2, 'packet');
  addOf('rendara kilo arisi', 'rice', 2.5, 'kg');
});

test('defaults are announced, never silent', () => {
  const c = ok('milk add pannu'); assert.equal(c.quantity, 1); assert.equal(c.unit, 'packet'); assert.ok(c.notes.length);
  const e = ok('6 eggs add'); assert.equal(e.unit, 'piece'); assert.ok(e.notes.length);
});

test('Tamil script commands', () => {
  addOf('ஒரு கிலோ அரிசி சேர்க்கவும்', 'rice', 1, 'kg');
  addOf('இரண்டு கிலோ சர்க்கரை போடு', 'sugar', 2, 'kg');
  addOf('500 கிராம் கடுகு சேர்', 'mustard', 500, 'g');
  addOf('ரெண்டு டஜன் முட்டை சேர்', 'eggs', 2, 'dozen');
  addOf('ஒரு லிட்டர் எண்ணெய் போடு', 'cooking-oil', 1, 'l');
  addOf('௨ கிலோ உப்பு சேர்', 'salt', 2, 'kg');
  const bill = mk(['rice', 2, 'kg'], ['sugar', 1, 'kg']);
  assert.equal(ok('அரிசியை நீக்கு', bill).productId, 'rice');            // Tamil suffix "-ஐ"
  assert.equal(ok('மொத்தம் எவ்வளவு', bill).type, 'total');
  const q = ok('அரிசி அளவு மூன்று கிலோ மாற்று', bill); assert.deepEqual([q.type, q.quantity, q.unit], ['set_quantity', 3, 'kg']);
  const p = ok('சர்க்கரை விலை 50 ரூபாய் மாற்று', bill); assert.deepEqual([p.type, p.price], ['set_price', 50]);
  assert.equal(ok('பில் கிளியர் பண்ணு', bill).type, 'clear');
});

test('change quantity', () => {
  const bill = mk(['rice', 2, 'kg']);
  let c = ok('Arisi quantity three kilo change pannu', bill);
  assert.deepEqual([c.type, c.productId, c.quantity, c.unit], ['set_quantity', 'rice', 3, 'kg']);
  c = ok('rice quantity 500 gram change', bill); assert.deepEqual([c.quantity, c.unit], [500, 'g']);
  c = ok('rice quantity 4 change pannu', bill); assert.deepEqual([c.quantity, c.unit], [4, 'kg']); // keeps row unit
  fails('change quantity rice', 'MISSING_QUANTITY', bill);
  fails('sugar quantity 3 kilo change pannu', 'NOT_IN_BILL', bill);
  fails('rice quantity 0 kilo change', 'INVALID_QUANTITY', bill);
});

test('change price', () => {
  const bill = mk(['sugar', 1, 'kg'], ['rice', 1, 'kg']);
  let c = ok('Sugar price 50 rupees change pannu', bill); assert.deepEqual([c.type, c.productId, c.price], ['set_price', 'sugar', 50]);
  c = ok('arisi vilai 70 rupees maathu', bill); assert.deepEqual([c.productId, c.price], ['rice', 70]);
  c = ok('sugar rate 55', bill); assert.equal(c.price, 55);
  c = ok('sugar 52.5 rupees', bill); assert.equal(c.price, 52.5);
  c = ok('sugar price 50 per kilo', bill); assert.equal(c.price, 50);
  fails('rice price change pannu', 'MISSING_PRICE', bill);
  fails('sugar price 50 rupees per gram', 'PRICE_UNIT', bill);
  fails('salt price 20 rupees', 'NOT_IN_BILL', bill);
});

test('remove, with typo tolerance', () => {
  const bill = mk(['urad-dal', 1, 'kg'], ['sugar', 1, 'kg']);
  assert.equal(ok('ulutham paruppu remove pannu', bill).productId, 'urad-dal');
  const exact = ok('sarkkarai remove pannu', bill);                  // spec example: known spelling, no warning
  assert.equal(exact.productId, 'sugar'); assert.equal(exact.notes.length, 0);
  const c = ok('sarkaarai remove pannu', bill);                      // genuine typo -> fuzzy, flagged
  assert.equal(c.productId, 'sugar'); assert.match(c.notes.join(' '), /Approximate match/);
  fails('sugr zzzz remove', 'PRODUCT_NOT_FOUND', bill);
  assert.equal(ok('sugar neekkidu', bill).type, 'remove');
  assert.equal(ok('delete sugar', bill).type, 'remove');
  fails('remove salt', 'NOT_IN_BILL', bill);
  fails('remove', 'MISSING_PRODUCT', bill);
});

test('clear bill and total', () => {
  const bill = mk(['rice', 1, 'kg']);
  for (const t of ['bill clear pannu', 'clear the bill', 'reset bill']) assert.equal(ok(t, bill).type, 'clear', t);
  for (const t of ['bill total sollu', 'what is the total', 'total', 'bill evlo']) {
    const r = parse(t, bill); assert.equal(r.status, 'ok', t); assert.equal(r.command.type, 'total'); assert.equal(r.readOnly, true);
  }
  fails('clear bill', 'EMPTY_BILL'); fails('bill total sollu', 'EMPTY_BILL');
});

test('ambiguity: asks instead of guessing', () => {
  for (const t of ['paruppu add pannu', 'one kilo paruppu', 'dal add', 'பருப்பு சேர்', 'powder add 1 kg']) {
    const r = parse(t); assert.equal(r.status, 'ambiguous', t); assert.ok(r.candidates.length >= 2); assert.equal(r.command, undefined);
  }
  assert.deepEqual(parse('paruppu add pannu').candidates.map((c) => c.id).sort(), ['toor-dal', 'urad-dal']);
  // choosing one option completes the SAME command
  const c = ok('one kilo paruppu add', EMPTY, { product: P('toor-dal') });
  assert.deepEqual([c.type, c.productId, c.quantity, c.unit], ['add', 'toor-dal', 1, 'kg']);
  // only one candidate is in the bill -> narrowed, and says so
  const narrowed = ok('dal remove pannu', mk(['urad-dal', 1, 'kg'])); assert.equal(narrowed.productId, 'urad-dal'); assert.ok(narrowed.notes.length);
  assert.equal(parse('dal remove pannu', mk(['urad-dal', 1, 'kg'], ['toor-dal', 1, 'kg'])).status, 'ambiguous');
});

test('invalid / unsupported / incomplete commands', () => {
  fails('', 'EMPTY_COMMAND'); fails('   ', 'EMPTY_COMMAND');
  fails('banana add pannu', 'PRODUCT_NOT_FOUND');
  fails('asdf qwer', 'UNKNOWN_COMMAND'); fails('hello there', 'UNKNOWN_COMMAND');
  fails('rice', 'MISSING_ACTION');
  fails('add pannu', 'MISSING_PRODUCT');
  fails('kilo add pannu', 'MISSING_PRODUCT');
  fails('rice kilo add pannu', 'MISSING_QUANTITY');
  fails('add 0 kilo rice', 'INVALID_QUANTITY');
  fails('add -2 kilo rice', 'INVALID_NUMBER');
  fails('milk add 2 kg', 'INCOMPATIBLE_UNIT');
  fails('rice add 1 litre', 'INCOMPATIBLE_UNIT');
  fails('eggs add 1 kg', 'INCOMPATIBLE_UNIT');
  fails('bill print pannu', 'UNSUPPORTED');
});

test('end-to-end: parse -> confirm -> apply with the Phase 1 billing engine', () => {
  let bill = B.emptyBill();
  const run = (t) => { const c = ok(t, bill); const r = applyCommand(bill, c, CATALOGUE); bill = r.bill; return r.message; };
  assert.equal(run('oru kilo arisi add pannu'), '1 kg Rice added.');
  run('rendu kilo sakkarai add pannu');
  assert.equal(B.computeTotals(bill).grandTotalPaise, 6000 + 9000);
  run('one kilo arisi add');                                        // same product merges
  assert.equal(bill.items.length, 2); assert.equal(bill.items[0].quantity, 2);
  run('Arisi quantity three kilo change pannu');
  run('Sugar price 50 rupees change pannu');
  assert.equal(B.computeTotals(bill).grandTotalPaise, 3 * 6000 + 2 * 5000);   // ₹280
  run('500 gram arisi quantity change');                            // unit change kg -> g
  assert.equal(bill.items[0].unit, 'g');
  run('arisi remove pannu');
  assert.equal(B.computeTotals(bill).grandTotalPaise, 10000);
  run('bill clear pannu');
  assert.equal(bill.items.length, 0);
});

test('parser never modifies the bill; describeCommand is readable', () => {
  const bill = mk(['rice', 1, 'kg']); const before = JSON.stringify(bill);
  ok('rice remove', bill); ok('oru kilo arisi add pannu', bill);
  assert.equal(JSON.stringify(bill), before);
  assert.equal(describeCommand(ok('500 gram sakkarai add pannu')), 'Add 500 g of Sugar (சர்க்கரை)');
  assert.equal(describeCommand(ok('sugar price 50 rupees', mk(['sugar', 1, 'kg']))), 'Change Sugar price to ₹50 per kg');
});
