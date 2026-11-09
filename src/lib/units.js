// Each unit has a dimension and an integer "base" factor (g, ml, piece, packet).
// Units can only be converted within the same dimension.
export const UNITS = {
  kg:     { dim: 'mass',   factor: 1000, label: 'kg' },
  g:      { dim: 'mass',   factor: 1,    label: 'g' },
  l:      { dim: 'volume', factor: 1000, label: 'L' },
  ml:     { dim: 'volume', factor: 1,    label: 'mL' },
  packet: { dim: 'packet', factor: 1,    label: 'packet' },
  piece:  { dim: 'piece',  factor: 1,    label: 'piece' },
  dozen:  { dim: 'piece',  factor: 12,   label: 'dozen' },
};

export const isUnit = (u) => Object.prototype.hasOwnProperty.call(UNITS, u);
export const areCompatible = (a, b) => isUnit(a) && isUnit(b) && UNITS[a].dim === UNITS[b].dim;
export const unitsInSameDimension = (u) => Object.keys(UNITS).filter((k) => areCompatible(k, u));

export function convert(qty, from, to) {
  if (!areCompatible(from, to)) throw new Error(`Cannot convert ${from} to ${to}`);
  return (qty * UNITS[from].factor) / UNITS[to].factor;
}
