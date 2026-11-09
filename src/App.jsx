import { useEffect, useMemo, useState } from 'react';
import { CATALOGUE } from './lib/catalogue.js';
import { searchProducts } from './lib/matcher.js';
import { UNITS, unitsInSameDimension } from './lib/units.js';
import * as B from './lib/billing.js';
import CommandTester from './components/CommandTester.jsx';
import VoiceInput from './components/VoiceInput.jsx';

const COLORS = { Grains: '#c58b3a', Essentials: '#3b82a0', Spices: '#c2410c', Pulses: '#7c6a0a', 'Dairy & Eggs': '#6d6fb5' };

function ProductImage({ item, size = 52 }) {
  const [bad, setBad] = useState(false);
  const box = { width: size, height: size };
  if (bad) return <div className="ph" style={{ ...box, background: COLORS[item.category] || '#777' }}>{item.name[0]}</div>;
  return <img className="pimg" style={box} src={`/images/${item.image}`} alt={item.name} onError={() => setBad(true)} />;
}

// Commits on blur / Enter so half-typed numbers never break the bill.
function NumInput({ value, onCommit, className }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => { if (draft !== String(value)) onCommit(draft, () => setDraft(String(value))); };
  return (
    <input className={className} type="number" step="any" value={draft}
      onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
  );
}

export default function App() {
  const [bill, setBill] = useState(B.emptyBill());
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState(null); // {type:'ok'|'error', text}
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState(5);
  const [incoming, setIncoming] = useState(null); // latest voice transcript -> command parser

  const totals = useMemo(() => B.computeTotals(bill, { taxEnabled, taxRatePercent: taxRate }), [bill, taxEnabled, taxRate]);
  const products = useMemo(() => searchProducts(query, CATALOGUE), [query]);

  // Run a billing change; show any validation error instead of crashing.
  const run = (fn, okText, onFail) => {
    try { setBill((b) => fn(b)); if (okText) setMessage({ type: 'ok', text: okText }); else setMessage(null); }
    catch (e) {
      if (!(e instanceof B.BillingError)) throw e;
      setMessage({ type: 'error', text: e.message }); onFail?.();
    }
  };

  return (
    <div className="app">
      <header className="top">
        <div>
          <div className="shop">Demo Kadai · Sample Provision Store</div>
          <h1>KadaiVoice AI</h1>
          <div className="sub">Speak. Bill. Print.</div>
        </div>
        <div className="note">Prices shown are <b>sample demo prices</b>, not real market prices. Edit any price in the bill.</div>
      </header>

      <main className="grid">
        <section className="left">
          <VoiceInput onTranscript={(text) => setIncoming({ id: Date.now(), text })} />

          <CommandTester incoming={incoming} bill={bill} totals={totals} onApply={(next, text) => { setBill(next); setMessage({ type: 'ok', text }); }} />

          <input className="search" placeholder="Search products — English, Tamil or Tanglish (e.g. arisi, sugar, paruppu)"
            value={query} onChange={(e) => setQuery(e.target.value)} />

          <div className="catalogue">
            {products.map((p) => (
              <button key={p.id} className="pcard" onClick={() => run((b) => B.addItem(b, p, 1, p.unit), `${p.name}: 1 ${UNITS[p.unit].label} added.`)}>
                <ProductImage item={p} size={64} />
                <div className="pname">{p.name}</div>
                <div className="ptamil">{p.tamilName} · {p.tanglishName}</div>
                <div className="pprice">₹{p.price} / {UNITS[p.unit].label}</div>
              </button>
            ))}
            {products.length === 0 && <div className="muted">No product matches “{query}”.</div>}
          </div>
        </section>

        <aside className="card bill">
          <h2>Billing cart</h2>
          {message && <div className={`msg ${message.type}`}>{message.text}</div>}
          {totals.isEmpty ? <div className="empty">The bill is empty. Tap a product to add it.</div> : (
            <div className="lines">
              {totals.lines.map((l) => (
                <div className="line" key={l.productId}>
                  <ProductImage item={l} size={44} />
                  <div className="lname"><b>{l.name}</b><span>{l.tamilName}</span></div>
                  <div className="ctrl">
                    <label>Qty</label>
                    <NumInput className="num" value={l.quantity} onCommit={(v, revert) => run((b) => B.setQuantity(b, l.productId, v), null, revert)} />
                    <select value={l.unit} onChange={(e) => run((b) => B.setUnit(b, l.productId, e.target.value))}>
                      {unitsInSameDimension(l.priceUnit).map((u) => <option key={u} value={u}>{UNITS[u].label}</option>)}
                    </select>
                  </div>
                  <div className="ctrl">
                    <label>₹ / {UNITS[l.priceUnit].label}</label>
                    <NumInput className="num" value={l.price} onCommit={(v, revert) => run((b) => B.setPrice(b, l.productId, v), null, revert)} />
                  </div>
                  <div className="amt">{B.formatRupees(l.amountPaise)}</div>
                  <button className="x" title="Remove" onClick={() => run((b) => B.removeItem(b, l.productId), `${l.name} removed.`)}>✕</button>
                </div>
              ))}
            </div>
          )}

          <div className="totals">
            <div><span>Subtotal</span><b>{B.formatRupees(totals.subtotalPaise)}</b></div>
            <div className="taxrow">
              <label><input type="checkbox" checked={taxEnabled} onChange={(e) => setTaxEnabled(e.target.checked)} /> Add tax</label>
              <input className="num small" type="number" min="0" step="any" value={taxRate} disabled={!taxEnabled} onChange={(e) => setTaxRate(e.target.value)} /> %
              <b>{B.formatRupees(totals.taxPaise)}</b>
            </div>
            <div className="grand"><span>Grand total</span><b>{B.formatRupees(totals.grandTotalPaise)}</b></div>
          </div>

          <div className="actions">
            <button className="danger" onClick={() => { setBill(B.clearBill()); setMessage({ type: 'ok', text: 'Bill cleared.' }); }} disabled={totals.isEmpty}>Clear bill</button>
            <label className="toggle muted"><input type="checkbox" disabled /> Speak confirmations (Phase 4)</label>
            <button disabled title="Added in Phase 4">🔊 Repeat voice</button>
            <button className="primary"onClick={()=>window.print()}disabled={totals.isEmpty}>🖨 Print receipt</button>
          </div>
        </aside>
      </main>
    </div>
  );
}
