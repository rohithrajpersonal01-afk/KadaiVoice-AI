import test from 'node:test';
import assert from 'node:assert/strict';
import { createSttService } from '../server/sttService.js';
import { PRESETS, MOCK_PHRASES } from '../server/presets.js';
import { makeWav, mkRes, jsonRes, silentLogger } from './helpers.js';

const KEY = 'SECRET-TEST-KEY-123456';
const ok = (t = 'rendu kilo sakkarai add pannu') => async () => jsonRes({ success: true, request_id: 'r1', transcript: t, model: 'prisma-v3.0', detected_language_code: 'ta-IN' });
const call = async (svc, { body = makeWav(), query = {} } = {}) => { const res = mkRes(); await svc.handle({ body, query }, res); return res; };

test('real mode: calls Gnani once with the server-side key and returns the transcript', async () => {
  let calls = 0, headers;
  const svc = createSttService({ env: { GNANI_API_KEY: KEY }, logger: silentLogger(), fetchImpl: async (u, i) => { calls++; headers = i.headers; return ok()(); } });
  const res = await call(svc);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, mock: false, transcript: 'rendu kilo sakkarai add pannu', model: 'prisma-v3.0', detectedLanguage: 'ta-IN', requestId: 'r1' });
  assert.equal(calls, 1); assert.equal(headers['X-API-Key-ID'], KEY);
});

test('preset selection is validated and mapped', async () => {
  let form;
  const svc = createSttService({ env: { GNANI_API_KEY: KEY }, logger: silentLogger(), fetchImpl: async (_u, i) => { form = i.body; return ok()(); } });
  await call(svc, { query: { preset: 'v25-en' } });
  assert.equal(form.get('language_code'), 'en-IN'); assert.equal(form.has('model'), false);
  await call(svc, { query: { preset: 'v3-auto' } });
  assert.equal(form.get('language_code'), 'indic-auto'); assert.equal(form.get('model'), 'prisma-v3.0');
  const bad = await call(svc, { query: { preset: 'hack' } }); assert.equal(bad.statusCode, 400); assert.equal(bad.body.error.code, 'INVALID_PRESET');
  assert.ok(Object.values(PRESETS).every((p) => p.language_code));
});

test('demo mode never calls Gnani and needs no key', async () => {
  const svc = createSttService({ env: {}, logger: silentLogger(), fetchImpl: async () => { throw new Error('must not be called'); } });
  const res = await call(svc, { query: { mode: 'mock', mock_text: 'ஒரு கிலோ அரிசி சேர்க்கவும்' } });
  assert.equal(res.statusCode, 200); assert.equal(res.body.mock, true); assert.equal(res.body.transcript, 'ஒரு கிலோ அரிசி சேர்க்கவும்');
  assert.equal((await call(svc, { query: { mode: 'mock' } })).body.transcript, MOCK_PHRASES[0]);
});

test('STT_MODE=mock on the server forces demo mode', async () => {
  const svc = createSttService({ env: { STT_MODE: 'mock', GNANI_API_KEY: KEY }, logger: silentLogger(), fetchImpl: async () => { throw new Error('must not be called'); } });
  assert.equal((await call(svc)).body.mock, true);
});

test('missing or placeholder API key -> clear 503, Gnani not called', async () => {
  for (const env of [{}, { GNANI_API_KEY: '' }, { GNANI_API_KEY: '   ' }, { GNANI_API_KEY: 'your_key_goes_here' }]) {
    const svc = createSttService({ env, logger: silentLogger(), fetchImpl: async () => { throw new Error('must not be called'); } });
    const res = await call(svc);
    assert.equal(res.statusCode, 503); assert.equal(res.body.error.code, 'MISSING_API_KEY');
  }
});

test('bad uploads are rejected before any Gnani call', async () => {
  const svc = createSttService({ env: { GNANI_API_KEY: KEY }, logger: silentLogger(), fetchImpl: async () => { throw new Error('must not be called'); } });
  for (const body of [null, {}, Buffer.alloc(0)]) assert.equal((await call(svc, { body })).body.error.code, 'EMPTY_AUDIO');
  const res = await call(svc, { body: Buffer.from('this is not a wav file at all') });
  assert.equal(res.statusCode, 415); assert.equal(res.body.error.code, 'UNSUPPORTED_AUDIO');
});

test('upstream failures become clear JSON errors', async () => {
  const mk = (f) => createSttService({ env: { GNANI_API_KEY: KEY }, logger: silentLogger(), fetchImpl: f });
  let r = await call(mk(async () => jsonRes({ detail: { error_code: 'INVALID_API_KEY' } }, 401)));
  assert.equal(r.statusCode, 502); assert.equal(r.body.error.code, 'GNANI_AUTH');
  r = await call(mk(async () => { throw new TypeError('fetch failed'); }));
  assert.equal(r.body.error.code, 'NETWORK_UPSTREAM');
  r = await call(mk(async () => jsonRes({ detail: { error_code: 'RATE_LIMITED' } }, 429)));
  assert.equal(r.statusCode, 429); assert.equal(r.body.error.code, 'GNANI_RATE_LIMITED');
  r = await call(mk(async () => { throw new Error('boom'); }));          // any fetch rejection counts as a network failure
  assert.equal(r.statusCode, 502); assert.equal(r.body.error.code, 'NETWORK_UPSTREAM');
  const brokenLogger = { log() { throw new Error('logger bug'); }, warn() {}, error() {} };   // unexpected internal error path
  r = await call(createSttService({ env: { GNANI_API_KEY: KEY }, logger: brokenLogger, fetchImpl: ok() }));
  assert.equal(r.statusCode, 500); assert.equal(r.body.error.code, 'SERVER_ERROR');
  assert.equal((await call(createSttService({ env: { GNANI_API_KEY: KEY }, logger: silentLogger(), fetchImpl: ok() }))).statusCode, 200); // lock released after errors
});

test('empty transcript is passed through as success (UI shows "no speech")', async () => {
  const svc = createSttService({ env: { GNANI_API_KEY: KEY }, logger: silentLogger(), fetchImpl: ok('') });
  const r = await call(svc); assert.equal(r.statusCode, 200); assert.equal(r.body.transcript, '');
});

test('only one Gnani request at a time (account limit); lock is released afterwards', async () => {
  let release; const gate = new Promise((r) => { release = r; });
  const svc = createSttService({ env: { GNANI_API_KEY: KEY }, logger: silentLogger(), fetchImpl: async () => { await gate; return ok()(); } });
  const first = call(svc);
  await new Promise((r) => setTimeout(r, 10));
  const second = await call(svc);
  assert.equal(second.statusCode, 429); assert.equal(second.body.error.code, 'BUSY');
  release(); assert.equal((await first).statusCode, 200);
  assert.equal((await call(svc)).statusCode, 200);
});

test('the API key never appears in any response, health output or log line', async () => {
  const logger = silentLogger(); const outputs = [];
  const mk = (f) => createSttService({ env: { GNANI_API_KEY: KEY }, logger, fetchImpl: f });
  for (const f of [ok(), async () => jsonRes({ detail: { error_code: 'INVALID_API_KEY', message: KEY } }, 401), async () => { throw new Error(`failed with ${KEY}`); }])
    outputs.push((await call(mk(f))).body);
  const h = mkRes(); mk(ok()).health({}, h); outputs.push(h.body);
  assert.equal(h.body.apiKeyConfigured, true);
  assert.ok(!JSON.stringify(outputs).includes(KEY), 'key leaked into a response');
  assert.ok(!logger.lines.join('\n').includes(KEY), 'key leaked into logs');
});

test('health: reports mode and configuration without secrets', () => {
  const h = mkRes(); createSttService({ env: { STT_MODE: 'mock', STT_PRESET: 'v25-ta' } }).health({}, h);
  assert.equal(h.body.ok, true); assert.equal(h.body.forcedMock, true); assert.equal(h.body.apiKeyConfigured, false);
  assert.equal(h.body.defaultPreset, 'v25-ta'); assert.ok(h.body.presets.length >= 4); assert.ok(h.body.mockPhrases.length > 0);
});
