// Route handlers (plain functions, framework-independent so they are easy to test).
import { transcribeWithGnani, SttError } from './gnaniClient.js';
import { PRESETS, DEFAULT_PRESET, MOCK_PHRASES } from './presets.js';

const isWav = (b) => b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WAVE';
const fail = (res, status, code, message) => res.status(status).json({ success: false, error: { code, message } });

export function createSttService({ env = process.env, fetchImpl = globalThis.fetch, logger = console, timeoutMs = 20000 } = {}) {
  let inFlight = false; // Gnani allows one active request per account, so we serialise.
  const apiKey = () => { const k = (env.GNANI_API_KEY || '').trim(); return !k || /your_key|placeholder|changeme/i.test(k) ? null : k; };
  const forcedMock = () => env.STT_MODE === 'mock';
  const defaultPreset = () => (PRESETS[env.STT_PRESET] ? env.STT_PRESET : DEFAULT_PRESET);

  function health(_req, res) {
    res.json({ ok: true, forcedMock: forcedMock(), apiKeyConfigured: apiKey() !== null, defaultPreset: defaultPreset(),
      presets: Object.entries(PRESETS).map(([id, p]) => ({ id, label: p.label })), mockPhrases: MOCK_PHRASES });
  }

  async function handle(req, res) {
    const audio = req.body;
    if (!Buffer.isBuffer(audio) || audio.length === 0) return fail(res, 400, 'EMPTY_AUDIO', 'No audio was received.');
    if (!isWav(audio)) return fail(res, 415, 'UNSUPPORTED_AUDIO', 'The backend expects a WAV recording.');
    const presetId = req.query?.preset || defaultPreset();
    const preset = PRESETS[presetId];
    if (!preset) return fail(res, 400, 'INVALID_PRESET', 'Unknown language preset.');

    if (forcedMock() || req.query?.mode === 'mock') {           // demo mode: no Gnani call, no credits
      const text = String(req.query?.mock_text || '').slice(0, 200).trim() || MOCK_PHRASES[0];
      return res.json({ success: true, mock: true, transcript: text, model: 'mock', detectedLanguage: null, requestId: null });
    }

    const key = apiKey();
    if (!key) return fail(res, 503, 'MISSING_API_KEY', 'The Gnani API key is not configured on the server. Add it to the .env file and restart the backend, or switch on Demo mode.');
    if (inFlight) return fail(res, 429, 'BUSY', 'A transcription is already running. Wait for it to finish.');

    inFlight = true; const t0 = Date.now();
    try {
      const out = await transcribeWithGnani({ apiKey: key, wavBuffer: audio, languageCode: preset.language_code, model: preset.model,
        requestId: globalThis.crypto.randomUUID(), fetchImpl, timeoutMs });
      logger.log(`[stt] ok ${Date.now() - t0}ms model=${out.model} request_id=${out.requestId}`);
      return res.json({ success: true, mock: false, transcript: out.transcript, model: out.model, detectedLanguage: out.detectedLanguage, requestId: out.requestId });
    } catch (e) {
      if (e instanceof SttError) { logger.warn(`[stt] failed code=${e.code} upstream_status=${e.upstreamStatus ?? 'n/a'}`); return fail(res, e.httpStatus, e.code, e.message); }
      logger.error(`[stt] unexpected error: ${e?.name}`);
      return fail(res, 500, 'SERVER_ERROR', 'Unexpected backend error.');
    } finally { inFlight = false; }                              // audio buffer is never written to disk
  }
  return { health, handle };
}
