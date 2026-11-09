// Deterministic billing engine. Pure functions: every change returns a NEW bill.
// Money is calculated in integer paise to avoid floating-point errors.
import { isUnit, areCompatible, convert } from './units.js';

export class BillingError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const round6 = (n) => Math.round(n * 1e6) / 1e6;
const toNumber = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));

function checkQty(v) {
  const n = toNumber(v);
  if (!Number.isFinite(n) || n <= 0) throw new BillingError('INVALID_QUANTITY', 'Quantity must be a number greater than 0.');
  return n;
}
function checkPrice(v) {
  const n = toNumber(v);
  if (!Number.isFinite(n) || n < 0) throw new BillingError('INVALID_PRICE', 'Price must be a number, 0 or more.');
  return n;
}
function findItem(bill, productId) {
  const item = bill.items.find((i) => i.productId === productId);
  if (!item) throw new BillingError('ITEM_NOT_FOUND', 'That item is not in the bill.');
  return item;
}
const replace = (bill, productId, patch) => ({
  items: bill.items.map((i) => (i.productId === productId ? { ...i, ...patch } : i)),
});

export const emptyBill = () => ({ items: [] });

export function addItem(bill, product, quantity, unit = product.unit) {
  const qty = checkQty(quantity);
  if (!isUnit(unit)) throw new BillingError('INVALID_UNIT', `Unknown unit "${unit}".`);
  if (!areCompatible(unit, product.unit))
    throw new BillingError('INCOMPATIBLE_UNIT', `${product.name} is priced per ${product.unit}; it cannot be sold in ${unit}.`);
  const existing = bill.items.find((i) => i.productId === product.id);
  if (existing) {
    // Same product again: merge into the existing row (converted to that row's unit).
    return replace(bill, product.id, { quantity: round6(existing.quantity + convert(qty, unit, existing.unit)) });
  }
  return {
    items: [...bill.items, {
      productId: product.id, name: product.name, tamilName: product.tamilName,
      category: product.category, image: product.image,
      quantity: qty, unit, price: product.price, priceUnit: product.unit,
    }],
  };
}

export function setQuantity(bill, productId, quantity) {
  findItem(bill, productId);
  return replace(bill, productId, { quantity: checkQty(quantity) });
}
export function setUnit(bill, productId, unit) {
  const item = findItem(bill, productId);
  if (!isUnit(unit) || !areCompatible(unit, item.priceUnit))
    throw new BillingError('INCOMPATIBLE_UNIT', `${item.name} cannot be sold in ${unit}.`);
  return replace(bill, productId, { unit });
}
export function setPrice(bill, productId, price) {
  findItem(bill, productId);
  return replace(bill, productId, { price: checkPrice(price) });
}
export function removeItem(bill, productId) {
  findItem(bill, productId);
  return { items: bill.items.filter((i) => i.productId !== productId) };
}
export const clearBill = () => emptyBill();

export const lineAmountPaise = (item) =>
  Math.round(item.price * 100 * convert(item.quantity, item.unit, item.priceUnit));

export function computeTotals(bill, { taxEnabled = false, taxRatePercent = 0 } = {}) {
  const lines = bill.items.map((i) => ({ ...i, amountPaise: lineAmountPaise(i) }));
  const subtotalPaise = lines.reduce((s, l) => s + l.amountPaise, 0);
  const rate = Number(taxRatePercent);
  const taxPaise = taxEnabled && Number.isFinite(rate) && rate > 0 ? Math.round((subtotalPaise * rate) / 100) : 0;
  return { lines, subtotalPaise, taxPaise, grandTotalPaise: subtotalPaise + taxPaise, isEmpty: lines.length === 0 };
}

export const formatRupees = (paise) => `₹${(paise / 100).toFixed(2)}`;
