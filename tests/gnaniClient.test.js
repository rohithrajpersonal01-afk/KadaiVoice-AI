import test from 'node:test';
import assert from 'node:assert/strict';
import { transcribeWithGnani, GNANI_STT_URL, SttError } from '../server/gnaniClient.js';
import { makeWav, jsonRes } from './helpers.js';

const KEY = 'TEST-KEY-not-real';
const run = (fetchImpl, over = {}) => transcribeWithGnani({ apiKey: KEY, wavBuffer: makeWav(), languageCode: 'ta-IN,en-IN', model: 'prisma-v3.0', requestId: 'req-1', fetchImpl, ...over });
const rejectsWith = (p, code, status) => assert.rejects(p, (e) => e instanceof SttError && e.code === code && (!status || e.httpStatus === status), code);

test('sends the documented request (endpoint, header, multipart fields)', async () => {
  let seen;
  const out = await run(async (url, init) => { seen = { url, init }; return jsonRes({ success: true, request_id: 'abc', transcript: 'oru kilo arisi add pannu', model: 'prisma-v3.0', detected_language_code: 'ta-IN' }); });
  assert.equal(seen.url, 'https://api.vachana.ai/stt/v3'); assert.equal(seen.url, GNANI_STT_URL);
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers['X-API-Key-ID'], KEY);
  assert.equal(seen.init.headers['X-API-Request-ID'], 'req-1');
  assert.equal(seen.init.headers['Content-Type'], undefined);            // fetch must set the multipart boundary itself
  const f = seen.init.body;
  assert.ok(f instanceof FormData);
  assert.equal(f.get('audio_file').name, 'recording.wav');               // extension is validated by Gnani
  assert.equal(f.get('model'), 'prisma-v3.0'); assert.equal(f.get('language_code'), 'ta-IN,en-IN');
  assert.deepEqual(out, { transcript: 'oru kilo arisi add pannu', model: 'prisma-v3.0', detectedLanguage: 'ta-IN', requestId: 'abc' });
});

test('Prisma v2.5 preset omits the model field (documented default)', async () => {
  let form;
  await run(async (_u, init) => { form = init.body; return jsonRes({ success: true, transcript: 'x', model: 'prisma-v2.5' }); }, { model: null, languageCode: 'ta-IN' });
  assert.equal(form.has('model'), false); assert.equal(form.get('language_code'), 'ta-IN');
});

test('empty transcript is a success, not an error (docs: no speech => "")', async () => {
  const out = await run(async () => jsonRes({ success: true, request_id: 'r', transcript: '' }));
  assert.equal(out.transcript, '');
});

test('Gnani error responses map to clear codes', async () => {
  const cases = [
    [401, { detail: { error_code: 'INVALID_API_KEY', message: 'Unauthorized', status_code: 401 } }, 'GNANI_AUTH'],
    [401, { detail: { error_code: 'MISSING_API_KEY' } }, 'GNANI_AUTH'],
    [402, { detail: {} }, 'GNANI_CREDITS'],
    [403, { success: false, error: { type: 'FORBIDDEN', message: 'x' } }, 'GNANI_FORBIDDEN'],
    [403, { detail: { error_code: 'SCOPE_NOT_ALLOWED' } }, 'GNANI_FORBIDDEN'],
    [429, { detail: { error_code: 'RATE_LIMITED', status_code: 429 } }, 'GNANI_RATE_LIMITED', 429],
    [400, { success: false, error: { type: 'MAX_AUDIO_DURATION_EXCEEDED', message: 'x' } }, 'MAX_AUDIO_DURATION_EXCEEDED'],
    [400, { success: false, error: { type: 'EMPTY_AUDIO', message: 'x' } }, 'EMPTY_AUDIO'],
    [400, { success: false, error: { type: 'AUDIO_CONVERSION_ERROR', message: 'x' } }, 'AUDIO_CONVERSION_ERROR'],
    [400, { success: false, error: { type: 'INVALID_LANGUAGE_CODE', message: 'x' } }, 'GNANI_BAD_REQUEST'],
    [400, { success: false, error: { type: 'MODEL_UNSUPPORTED_LANGUAGE', message: 'x' } }, 'GNANI_BAD_REQUEST'],
    [422, { detail: [{ type: 'missing', loc: ['body', 'language_code'] }] }, 'GNANI_BAD_REQUEST'],
    [500, { success: false, error: { type: 'TRANSCRIPTION_FAILED', message: 'x' } }, 'GNANI_SERVER_ERROR'],
    [503, { success: false, error: { type: 'SERVICE_UNAVAILABLE', message: 'x' } }, 'GNANI_SERVER_ERROR'],
    [504, { error: 'Gateway Timeout', code: 'UPSTREAM_TIMEOUT', message: 'x' }, 'GNANI_TIMEOUT', 504],
  ];
  for (const [status, body, code, httpStatus] of cases) await rejectsWith(run(async () => jsonRes(body, status)), code, httpStatus);
});

test('network failure, timeout and malformed responses', async () => {
  await rejectsWith(run(async () => { throw new TypeError('fetch failed'); }), 'NETWORK_UPSTREAM');
  await rejectsWith(run(async () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); }), 'GNANI_TIMEOUT', 504);
  await rejectsWith(run(async () => new Response('<html>oops</html>', { status: 200 })), 'GNANI_BAD_RESPONSE');
  await rejectsWith(run(async () => jsonRes({ success: false })), 'GNANI_BAD_RESPONSE');
  await rejectsWith(run(async () => jsonRes({ success: true, transcript: { a: 1 } })), 'GNANI_BAD_RESPONSE');
  await rejectsWith(run(async () => new Response('gateway', { status: 502 })), 'GNANI_SERVER_ERROR');
});

test('error messages never contain the API key', async () => {
  for (const status of [401, 403, 429, 500]) {
    try { await run(async () => jsonRes({ detail: { message: 'x' } }, status)); assert.fail('should throw'); }
    catch (e) { assert.ok(!e.message.includes(KEY)); }
  }
});
