// Describes a parsed command for the confirmation prompt, and applies it using the Phase 1 billing engine.
import * as B from '../billing.js';
import { UNITS } from '../units.js';

const fmt = (n) => String(+Number(n).toFixed(3));
const u = (k) => UNITS[k].label;

export function describeCommand(c) {
  switch (c.type) {
    case 'add': return `Add ${fmt(c.quantity)} ${u(c.unit)} of ${c.productName} (${c.tamilName})`;
    case 'set_quantity': return `Change ${c.productName} quantity to ${fmt(c.quantity)} ${u(c.unit)}`;
    case 'set_price': return `Change ${c.productName} price to ₹${fmt(c.price)} per ${u(c.priceUnit)}`;
    case 'remove': return `Remove ${c.productName} from the bill`;
    case 'clear': return 'Clear the entire bill';
    case 'total': return 'Tell the bill total';
    default: return 'Unknown action';
  }
}

/** @returns {{bill, message}}  May throw BillingError (e.g. item no longer in the bill). */
export function applyCommand(bill, c, catalogue) {
  switch (c.type) {
    case 'add': {
      const product = catalogue.find((p) => p.id === c.productId);
      if (!product) throw new B.BillingError('ITEM_NOT_FOUND', 'That product is not in the catalogue.');
      return { bill: B.addItem(bill, product, c.quantity, c.unit), message: `${fmt(c.quantity)} ${u(c.unit)} ${c.productName} added.` };
    }
    case 'set_quantity': {
      const b = B.setQuantity(B.setUnit(bill, c.productId, c.unit), c.productId, c.quantity);
      return { bill: b, message: `${c.productName} quantity changed to ${fmt(c.quantity)} ${u(c.unit)}.` };
    }
    case 'set_price': return { bill: B.setPrice(bill, c.productId, c.price), message: `${c.productName} price changed to ₹${fmt(c.price)} per ${u(c.priceUnit)}.` };
    case 'remove': return { bill: B.removeItem(bill, c.productId), message: `${c.productName} removed.` };
    case 'clear': return { bill: B.clearBill(), message: 'Bill cleared.' };
    default: return { bill, message: '' };
  }
}
