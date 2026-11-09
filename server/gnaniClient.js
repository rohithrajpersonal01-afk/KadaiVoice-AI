// Thin client for the documented Gnani REST STT endpoint (https://docs.gnani.ai/api/STT/speech-to-text).
// Uses only Node built-ins (fetch / FormData / Blob). `fetchImpl` is injectable so tests never call Gnani.
export const GNANI_STT_URL = 'https://api.vachana.ai/stt/v3';

export class SttError extends Error {
  constructor(code, message, httpStatus = 502, upstreamStatus) {
    super(message); this.name = 'SttError'; this.code = code; this.httpStatus = httpStatus; this.upstreamStatus = upstreamStatus;
  }
}

const AUDIO_ERRORS = {
  EMPTY_AUDIO: 'Gnani received no audio. Please record again.',
  UNSUPPORTED_AUDIO_FORMAT: 'Gnani did not accept the audio format.',
  AUDIO_CONVERSION_ERROR: 'Gnani could not decode the recording. Please try again.',
  MAX_AUDIO_DURATION_EXCEEDED: 'The recording is longer than Gnani’s 30 second limit. Record a shorter command.',
};

// Error bodies come in several documented shapes: {error:{type}}, {detail:{error_code}}, {detail:[...]}, {code:'UPSTREAM_TIMEOUT'}.
function mapHttpError(status, body) {
  const type = body?.error?.type;
  if (status === 401) return new SttError('GNANI_AUTH', 'Gnani rejected the API key (missing or invalid). Check the key in your .env file, then restart the backend.', 502, status);
  if (status === 402) return new SttError('GNANI_CREDITS', 'Gnani reports insufficient credits.', 502, status);
  if (status === 403) return new SttError('GNANI_FORBIDDEN', 'Gnani refused the request: the key may lack Speech-to-Text access, or credits are exhausted.', 502, status);
  if (status === 429) return new SttError('GNANI_RATE_LIMITED', 'Gnani is busy (only one request at a time is allowed). Wait a moment and try again.', 429, status);
  if (status === 504 || body?.code === 'UPSTREAM_TIMEOUT') return new SttError('GNANI_TIMEOUT', 'Gnani took too long to transcribe. Please try again.', 504, status);
  if (status === 400 && AUDIO_ERRORS[type]) return new SttError(type, AUDIO_ERRORS[type], 502, status);
  if (status === 400 || status === 422) return new SttError('GNANI_BAD_REQUEST', `Gnani rejected the request settings${type ? ` (${type})` : ''}. Try a different language preset.`, 502, status);
  if (status >= 500) return new SttError('GNANI_SERVER_ERROR', 'Gnani had a server problem. Please try again shortly.', 502, status);
  return new SttError('GNANI_ERROR', `Unexpected response from Gnani (HTTP ${status}).`, 502, status);
}

export async function transcribeWithGnani({ apiKey, wavBuffer, languageCode, model, requestId, fetchImpl = globalThis.fetch, timeoutMs = 20000 }) {
  const form = new FormData();
  form.append('audio_file', new Blob([wavBuffer], { type: 'audio/wav' }), 'recording.wav');
  if (model) form.append('model', model);            // omitted => Prisma v2.5 (documented default)
  form.append('language_code', languageCode);

  let res;
  try {
    res = await fetchImpl(GNANI_STT_URL, {
      method: 'POST',
      headers: { 'X-API-Key-ID': apiKey, ...(requestId && { 'X-API-Request-ID': requestId }) }, // no Content-Type: fetch adds the multipart boundary
      body: form,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw new SttError('GNANI_TIMEOUT', 'Gnani did not answer in time. Please try again.', 504);
    throw new SttError('NETWORK_UPSTREAM', 'Could not reach Gnani. Check your internet connection (or firewall/proxy) and try again.', 502);
  }

  let body = null;
  try { body = JSON.parse(await res.text()); } catch { /* handled below */ }
  if (!res.ok) throw mapHttpError(res.status, body);
  if (!body || body.success !== true || typeof body.transcript !== 'string')
    throw new SttError('GNANI_BAD_RESPONSE', 'Gnani returned a response in an unexpected format.', 502, res.status);

  return { transcript: body.transcript, model: body.model ?? null, detectedLanguage: body.detected_language_code ?? null, requestId: body.request_id ?? null };
}
