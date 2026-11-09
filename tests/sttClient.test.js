import test from 'node:test';
import assert from 'node:assert/strict';
import { transcribeAudio, fetchHealth, SttClientError } from '../src/lib/sttClient.js';
import { jsonRes } from './helpers.js';

const blob = new Blob(['RIFFxxxxWAVE'], { type: 'audio/wav' });
const code = (p, c) => assert.rejects(p, (e) => e instanceof SttClientError && e.code === c, c);

test('posts the WAV to our own backend (relative /api path, no secrets)', async () => {
  let seen;
  const out = await transcribeAudio(blob, { preset: 'v3-auto', fetchImpl: async (u, i) => { seen = { u, i }; return jsonRes({ success: true, transcript: 'hi' }); } });
  assert.equal(seen.u, '/api/stt?preset=v3-auto'); assert.equal(seen.i.method, 'POST'); assert.equal(seen.i.body, blob);
  assert.deepEqual(Object.keys(seen.i.headers), ['Content-Type']);   // no auth headers from the browser
  assert.equal(out.transcript, 'hi');
});

test('demo mode adds mode=mock and url-encodes Tamil text', async () => {
  let url;
  await transcribeAudio(blob, { mock: true, mockText: 'ஒரு கிலோ அரிசி', fetchImpl: async (u) => { url = u; return jsonRes({ success: true, transcript: 'x', mock: true }); } });
  assert.ok(url.includes('mode=mock')); assert.equal(new URLSearchParams(url.split('?')[1]).get('mock_text'), 'ஒரு கிலோ அரிசி');
});

test('backend JSON errors keep their code and message', async () => {
  await assert.rejects(transcribeAudio(blob, { fetchImpl: async () => jsonRes({ success: false, error: { code: 'MISSING_API_KEY', message: 'Add the key' } }, 503) }),
    (e) => e.code === 'MISSING_API_KEY' && e.message === 'Add the key');
});

test('network failure / backend not running gives a helpful message', async () => {
  await assert.rejects(transcribeAudio(blob, { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }),
    (e) => e.code === 'NETWORK_BACKEND' && /npm run server/.test(e.message));
  await assert.rejects(transcribeAudio(blob, { fetchImpl: async () => new Response('', { status: 500 }) }),
    (e) => e.code === 'HTTP_500' && /npm run server/.test(e.message));   // Vite proxy error when backend is down
  await code(transcribeAudio(blob, { fetchImpl: async () => { throw Object.assign(new Error('a'), { name: 'AbortError' }); } }), 'ABORTED');
  await code(fetchHealth(async () => { throw new TypeError('x'); }), 'NETWORK_BACKEND');
  await code(fetchHealth(async () => new Response('', { status: 500 })), 'BACKEND_DOWN');
});
