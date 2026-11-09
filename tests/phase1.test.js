import test from 'node:test';
import assert from 'node:assert/strict';
import { convert, areCompatible } from '../src/lib/units.js';
import * as B from '../src/lib/billing.js';
import { CATALOGUE } from '../src/lib/catalogue.js';
import { matchProduct, searchProducts } from '../src/lib/matcher.js';

const P = (id) => CATALOGUE.find((x) => x.id === id);
const totals = (bill, o) => B.computeTotals(bill, o);
const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof B.BillingError && e.code === code);

test('unit conversions', () => {
  assert.equal(convert(500, 'g', 'kg'), 0.5);
  assert.equal(convert(2, 'kg', 'g'), 2000);
  assert.equal(convert(250, 'ml', 'l'), 0.25);
  assert.equal(convert(1, 'dozen', 'piece'), 12);
  assert.equal(areCompatible('kg', 'l'), false);
  assert.equal(areCompatible('packet', 'piece'), false);
  assert.throws(() => convert(1, 'kg', 'l'));
});

test('spec examples: rice 60/kg', () => {
  assert.equal(totals(B.addItem(B.emptyBill(), P('rice'), 2, 'kg')).grandTotalPaise, 12000);   // ₹120
  assert.equal(totals(B.addItem(B.emptyBill(), P('rice'), 500, 'g')).grandTotalPaise, 3000);   // ₹30
});

test('same product merges into one row (kg + g, and g + kg)', () => {
  let b = B.addItem(B.emptyBill(), P('rice'), 1, 'kg');
  b = B.addItem(b, P('rice'), 500, 'g');
  assert.equal(b.items.length, 1);
  assert.equal(b.items[0].quantity, 1.5); assert.equal(b.items[0].unit, 'kg');
  assert.equal(totals(b).grandTotalPaise, 9000);
  let c = B.addItem(B.emptyBill(), P('rice'), 500, 'g');
  c = B.addItem(c, P('rice'), 1, 'kg');
  assert.equal(c.items.length, 1); assert.equal(c.items[0].quantity, 1500);
  assert.equal(totals(c).grandTotalPaise, 9000);
});

test('eggs: dozen conversion and merging', () => {
  let b = B.addItem(B.emptyBill(), P('eggs'), 6, 'piece');
  b = B.addItem(b, P('eggs'), 1, 'dozen');
  assert.equal(b.items[0].quantity, 18);
  assert.equal(totals(b).grandTotalPaise, 18 * 700);
  assert.equal(totals(B.addItem(B.emptyBill(), P('eggs'), 1, 'dozen')).grandTotalPaise, 8400);
});

test('litres and millilitres', () => {
  assert.equal(totals(B.addItem(B.emptyBill(), P('cooking-oil'), 500, 'ml')).grandTotalPaise, 7000);
  assert.equal(totals(B.addItem(B.emptyBill(), P('cooking-oil'), 2, 'l')).grandTotalPaise, 28000);
});

test('edit quantity, unit, price', () => {
  let b = B.addItem(B.emptyBill(), P('sugar'), 2, 'kg');
  b = B.setQuantity(b, 'sugar', 3);
  assert.equal(totals(b).grandTotalPaise, 13500);
  b = B.setPrice(b, 'sugar', 50);
  assert.equal(totals(b).grandTotalPaise, 15000);
  b = B.setUnit(b, 'sugar', 'g'); // 3 g at 50/kg
  assert.equal(totals(b).grandTotalPaise, 15);
});

test('multi-item total, remove, clear', () => {
  let b = B.addItem(B.emptyBill(), P('rice'), 1, 'kg');
  b = B.addItem(b, P('sugar'), 2, 'kg');
  assert.equal(totals(b).subtotalPaise, 6000 + 9000);
  b = B.removeItem(b, 'rice');
  assert.equal(totals(b).grandTotalPaise, 9000);
  assert.equal(totals(B.clearBill()).isEmpty, true);
  throwsCode(() => B.removeItem(b, 'rice'), 'ITEM_NOT_FOUND');
});

test('rounding is deterministic (33.33 x 3 = 99.99; 250 g salt = 6.25)', () => {
  let b = B.setPrice(B.addItem(B.emptyBill(), P('salt'), 3, 'kg'), 'salt', 33.33);
  assert.equal(totals(b).grandTotalPaise, 9999);
  assert.equal(totals(B.addItem(B.emptyBill(), P('salt'), 250, 'g')).grandTotalPaise, 625);
});

test('optional tax (off by default)', () => {
  const b = B.addItem(B.emptyBill(), P('rice'), 2, 'kg');
  assert.equal(totals(b).taxPaise, 0);
  assert.equal(totals(b, { taxEnabled: false, taxRatePercent: 5 }).taxPaise, 0);
  const t = totals(b, { taxEnabled: true, taxRatePercent: 5 });
  assert.equal(t.taxPaise, 600); assert.equal(t.grandTotalPaise, 12600);
});

test('validation errors', () => {
  const e = B.emptyBill();
  for (const bad of [0, -1, 'abc', '', NaN, null]) throwsCode(() => B.addItem(e, P('rice'), bad, 'kg'), 'INVALID_QUANTITY');
  throwsCode(() => B.addItem(e, P('rice'), 1, 'l'), 'INCOMPATIBLE_UNIT');
  throwsCode(() => B.addItem(e, P('milk'), 1, 'kg'), 'INCOMPATIBLE_UNIT');
  throwsCode(() => B.addItem(e, P('rice'), 1, 'bag'), 'INVALID_UNIT');
  const b = B.addItem(e, P('rice'), 1, 'kg');
  for (const bad of [-5, 'x', '']) throwsCode(() => B.setPrice(b, 'rice', bad), 'INVALID_PRICE');
  throwsCode(() => B.setQuantity(b, 'rice', 0), 'INVALID_QUANTITY');
  throwsCode(() => B.setUnit(b, 'rice', 'dozen'), 'INCOMPATIBLE_UNIT');
  assert.equal(B.setPrice(b, 'rice', 0).items[0].price, 0); // free item allowed
});

test('bills are immutable (old bill unchanged)', () => {
  const b1 = B.addItem(B.emptyBill(), P('rice'), 1, 'kg');
  B.addItem(b1, P('rice'), 5, 'kg');
  assert.equal(b1.items[0].quantity, 1);
});

test('catalogue sanity: unique ids, required fields', () => {
  assert.equal(new Set(CATALOGUE.map((x) => x.id)).size, CATALOGUE.length);
  for (const x of CATALOGUE) for (const k of ['id', 'name', 'tamilName', 'tanglishName', 'category', 'unit', 'price', 'image'])
    assert.ok(x[k] !== undefined && x[k] !== '', `${x.id} missing ${k}`);
});

test('matcher: exact / Tanglish / Tamil script', () => {
  const id = (t) => matchProduct(t, CATALOGUE).product?.id;
  assert.equal(id('arisi'), 'rice'); assert.equal(id('Rice'), 'rice'); assert.equal(id('  ARISI. '), 'rice');
  assert.equal(id('sakkarai'), 'sugar'); assert.equal(id('sarkarai'), 'sugar');
  assert.equal(id('ulutham paruppu'), 'urad-dal'); assert.equal(id('thuvaram paruppu'), 'toor-dal');
  assert.equal(id('ennai'), 'cooking-oil'); assert.equal(id('milagai podi'), 'chilli-powder');
  assert.equal(id('அரிசி'), 'rice'); assert.equal(id('சர்க்கரை'), 'sugar');
  assert.equal(id('flour'), 'wheat-flour'); // unique partial match
});

test('matcher: ambiguous and unknown are never guessed', () => {
  for (const t of ['paruppu', 'dal', 'powder']) {
    const r = matchProduct(t, CATALOGUE);
    assert.equal(r.status, 'ambiguous', t); assert.ok(r.candidates.length >= 2); assert.equal(r.product, undefined);
  }
  assert.deepEqual(matchProduct('paruppu', CATALOGUE).candidates.map((c) => c.id).sort(), ['toor-dal', 'urad-dal']);
  assert.equal(matchProduct('laptop', CATALOGUE).status, 'none');
  assert.equal(matchProduct('', CATALOGUE).status, 'none');
});

test('search bar', () => {
  assert.equal(searchProducts('', CATALOGUE).length, CATALOGUE.length);
  assert.deepEqual(searchProducts('par', CATALOGUE).map((x) => x.id).sort(), ['toor-dal', 'urad-dal']);
  assert.equal(searchProducts('arisi', CATALOGUE)[0].id, 'rice');
  assert.equal(searchProducts('zzzz', CATALOGUE).length, 0);
});
