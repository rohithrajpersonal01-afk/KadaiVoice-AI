// Full HTTP test through real Express. Runs only when dependencies are installed (npm install); skipped otherwise.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWav, jsonRes, silentLogger } from './helpers.js';

let createApp = null;
try { ({ createApp } = await import('../server/app.js')); } catch { /* express not installed */ }
const opts = { skip: createApp ? false : 'express not installed here — run "npm install" then "npm test"' };
const KEY = 'ROUTE-TEST-KEY-999';

async function withServer(fetchImpl, env, fn) {
  const server = createApp({ env, fetchImpl, logger: silentLogger() }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { await new Promise((r) => server.close(r)); }
}
const post = (base, qs = '', body = makeWav()) => fetch(`${base}/api/stt${qs}`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body });

test('HTTP: health, transcription, key never leaked', opts, async () => {
  const gnani = async () => jsonRes({ success: true, request_id: 'r', transcript: 'bill total sollu', model: 'prisma-v3.0' });
  await withServer(gnani, { GNANI_API_KEY: KEY }, async (base) => {
    const h = await (await fetch(`${base}/api/health`)).json();
    assert.equal(h.ok, true); assert.equal(h.apiKeyConfigured, true);
    const res = await post(base); const text = await res.text();
    assert.equal(res.status, 200); assert.equal(JSON.parse(text).transcript, 'bill total sollu'); assert.ok(!text.includes(KEY));
  });
});

test('HTTP: demo mode, missing key, empty body, oversize and unknown route', opts, async () => {
  await withServer(async () => { throw new Error('no upstream expected'); }, {}, async (base) => {
    const demo = await (await post(base, `?mode=mock&mock_text=${encodeURIComponent('ஒரு கிலோ அரிசி')}`)).json();
    assert.equal(demo.mock, true); assert.equal(demo.transcript, 'ஒரு கிலோ அரிசி');
    const noKey = await post(base); assert.equal(noKey.status, 503); assert.equal((await noKey.json()).error.code, 'MISSING_API_KEY');
    assert.equal((await post(base, '', Buffer.alloc(0))).status, 400);
    assert.equal((await post(base, '', Buffer.concat([makeWav(), Buffer.alloc(6 * 1024 * 1024)]))).status, 413);
    assert.equal((await fetch(`${base}/api/nope`)).status, 404);
  });
});
