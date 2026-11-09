import { useEffect, useState } from 'react';
import { CATALOGUE } from '../lib/catalogue.js';
import { parseCommand } from '../lib/voice/commandParser.js';
import { describeCommand, applyCommand } from '../lib/voice/commandActions.js';
import * as B from '../lib/billing.js';

const EXAMPLES = [
  'oru kilo arisi add pannu', '500 gram sakkarai add pannu', 'kadugu rendu kilo add pannu', 'Half kilo ulutham paruppu',
  'One packet oil add pannunga', 'Arisi quantity three kilo change pannu', 'Sugar price 50 rupees change pannu',
  'sarkkarai remove pannu', 'paruppu add pannu', 'bill total sollu', 'ஒரு கிலோ அரிசி சேர்க்கவும்', 'bill clear pannu',
];

// Shows the interpreted command and asks for Confirm. Fed by typed text (fallback) or by a voice transcript.
export default function CommandTester({ bill, totals, onApply, incoming }) {
  const [text, setText] = useState('');
  const [res, setRes] = useState(null);

  const interpret = (t = text, product) => setRes(parseCommand(t, CATALOGUE, bill, product ? { product } : {}));
  // A new voice transcript arrives: show it in the box and interpret it. Nothing changes until Confirm.
  useEffect(() => { if (incoming) { setText(incoming.text); interpret(incoming.text); } }, [incoming]); // eslint-disable-line react-hooks/exhaustive-deps
  const confirm = () => {
    try {
      const { bill: next, message } = applyCommand(bill, res.command, CATALOGUE);
      onApply(next, message); setRes(null); setText('');
    } catch (e) {
      if (!(e instanceof B.BillingError)) throw e;
      setRes({ status: 'error', code: e.code, message: e.message });
    }
  };

  return (
    <div className="card tester">
      <h3>Text command tester <span className="tag">typed fallback · voice transcripts appear here too</span></h3>
      <div className="trow">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && interpret()}
          placeholder='Type a command, e.g. "oru kilo arisi add pannu"' />
        <button className="primary" onClick={() => interpret()}>Interpret</button>
      </div>
      <div className="chips">
        {EXAMPLES.map((ex) => <button key={ex} className="chip" onClick={() => { setText(ex); interpret(ex); }}>{ex}</button>)}
      </div>

      {res?.status === 'error' && <div className="msg error"><b>{res.code}</b> — {res.message}</div>}

      {res?.status === 'ambiguous' && (
        <div className="msg warn">
          {res.message}
          <div className="chips">
            {res.candidates.map((p) => <button key={p.id} className="chip pick" onClick={() => interpret(res.transcript, p)}>{p.name} · {p.tamilName}</button>)}
          </div>
        </div>
      )}

      {res?.status === 'ok' && res.readOnly && (
        <div className="msg ok">Bill total: <b>{B.formatRupees(totals.grandTotalPaise)}</b> ({totals.lines.length} item{totals.lines.length === 1 ? '' : 's'})</div>
      )}

      {res?.status === 'ok' && !res.readOnly && (
        <div className="confirm">
          <div className="heard">Heard: “{res.transcript}”</div>
          <div className="understood">I understood: <b>{describeCommand(res.command)}</b></div>
          {res.command.notes.map((n) => <div className="muted" key={n}>ℹ {n}</div>)}
          <div className="trow">
            <button className="primary" onClick={confirm}>✔ Confirm</button>
            <button onClick={() => setRes(null)}>✖ Cancel</button>
          </div>
          <details><summary>Interpreted command (debug)</summary><pre>{JSON.stringify(res.command, null, 2)}</pre></details>
        </div>
      )}
    </div>
  );
}
