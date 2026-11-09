// Product name matching. Never guesses: returns match / ambiguous / none.
export const normalize = (s) =>
  String(s ?? '').normalize('NFC').toLowerCase().replace(/[.,!?'"]/g, '').replace(/\s+/g, ' ').trim();

export const termsOf = (product) =>
  [...new Set([product.name, product.tamilName, product.tanglishName, ...(product.aliases || [])].filter(Boolean).map(normalize))];

/** @returns {{status:'match'|'ambiguous'|'none', product?:object, candidates:object[], matchType?:string}} */
export function matchProduct(text, catalogue) {
  const q = normalize(text);
  if (!q) return { status: 'none', candidates: [] };

  const result = (list, matchType) =>
    list.length === 1 ? { status: 'match', product: list[0], candidates: list, matchType }
    : { status: 'ambiguous', candidates: list, matchType };

  const exact = catalogue.filter((pr) => termsOf(pr).includes(q));
  if (exact.length) return result(exact, 'exact');

  const qTokens = q.split(' ');
  const partial = catalogue.filter((pr) =>
    termsOf(pr).some((t) => { const tt = t.split(' '); return qTokens.every((w) => tt.includes(w)); }));
  if (partial.length) return result(partial, 'partial');

  return { status: 'none', candidates: [] };
}

/** For the search bar: substring search, best matches first. */
export function searchProducts(query, catalogue) {
  const q = normalize(query);
  if (!q) return catalogue;
  const score = (pr) => {
    const t = termsOf(pr);
    if (t.includes(q)) return 0;
    if (t.some((x) => x.startsWith(q))) return 1;
    if (t.some((x) => x.includes(q))) return 2;
    return 9;
  };
  return catalogue.map((pr) => [score(pr), pr]).filter(([s]) => s < 9).sort((a, b) => a[0] - b[0]).map(([, pr]) => pr);
}
