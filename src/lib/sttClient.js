// Talks ONLY to our own backend (/api/...). The Gnani key never exists in the browser.
export class SttClientError extends Error { constructor(code, message) { super(message); this.code = code; } }

const BACKEND_HINT = 'Could not reach the KadaiVoice backend. Start it in a second terminal with: npm run server';

export async function fetchHealth(fetchImpl = globalThis.fetch) {
  let res;
  try { res = await fetchImpl('/api/health'); } catch { throw new SttClientError('NETWORK_BACKEND', BACKEND_HINT); }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) throw new SttClientError('BACKEND_DOWN', BACKEND_HINT);
  return body;
}

export async function transcribeAudio(wavBlob, { preset, mock = false, mockText, signal, fetchImpl = globalThis.fetch } = {}) {
  const qs = new URLSearchParams();
  if (preset) qs.set('preset', preset);
  if (mock) { qs.set('mode', 'mock'); if (mockText) qs.set('mock_text', mockText); }
  let res;
  try { res = await fetchImpl(`/api/stt?${qs}`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wavBlob, signal }); }
  catch (e) {
    if (e?.name === 'AbortError') throw new SttClientError('ABORTED', 'Cancelled.');
    throw new SttClientError('NETWORK_BACKEND', BACKEND_HINT);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    if (body?.error) throw new SttClientError(body.error.code || `HTTP_${res.status}`, body.error.message || 'The backend reported an error.');
    throw new SttClientError(`HTTP_${res.status}`, `${BACKEND_HINT} (HTTP ${res.status})`);
  }
  return body;
}
