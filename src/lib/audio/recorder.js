// Browser microphone capture (Web Audio). Audio stays in memory; mic, nodes and context are released after use.
// Output is a 16 kHz mono WAV, a format Gnani documents as supported (browsers' MediaRecorder WebM is not).
import { resampleTo16k, floatToInt16, encodeWav, peakOf } from './wav.js';

export const MAX_SECONDS = 15;     // well under Gnani's 30 s limit
export const MIN_PEAK = 0.005;     // below this the clip is treated as silence (saves a wasted API call)

export class RecorderError extends Error { constructor(code, message) { super(message); this.code = code; } }

function mapMicError(e) {
  switch (e?.name) {
    case 'NotAllowedError': case 'SecurityError':
      return new RecorderError('MIC_DENIED', 'Microphone access was blocked. Click the lock icon in the address bar, allow the microphone, then try again.');
    case 'NotFoundError': case 'OverconstrainedError':
      return new RecorderError('NO_MIC', 'No microphone was found. Connect one and try again.');
    case 'NotReadableError': case 'AbortError':
      return new RecorderError('MIC_BUSY', 'The microphone is in use by another application. Close it and try again.');
    default: return new RecorderError('MIC_ERROR', 'Could not start the microphone.');
  }
}

export function createRecorder({ maxSeconds = MAX_SECONDS, onAutoStop } = {}) {
  let stream, ctx, source, proc, timer, chunks = [], startedAt = 0, rate = 16000;
  const release = () => {
    clearTimeout(timer);
    try { proc?.disconnect(); source?.disconnect(); } catch { /* already disconnected */ }
    stream?.getTracks().forEach((t) => t.stop());            // turns the browser's mic indicator off
    ctx?.close?.().catch(() => {});
    stream = ctx = source = proc = null;
  };
  return {
    async start() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!navigator.mediaDevices?.getUserMedia || !AC)
        throw new RecorderError('MIC_UNSUPPORTED', 'This browser cannot record audio here. Use a current Chrome, Edge or Firefox and open the app at http://localhost:5173.');
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }); }
      catch (e) { throw mapMicError(e); }
      ctx = new AC(); await ctx.resume(); rate = ctx.sampleRate;
      source = ctx.createMediaStreamSource(stream);
      proc = ctx.createScriptProcessor(4096, 1, 1);
      chunks = []; proc.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      source.connect(proc); proc.connect(ctx.destination);   // must be connected for the processor to run (it outputs silence)
      startedAt = performance.now();
      timer = setTimeout(() => onAutoStop?.(), maxSeconds * 1000);
    },
    /** @returns {{blob:Blob, durationMs:number, peak:number}} */
    async stop() {
      const durationMs = performance.now() - startedAt;
      const all = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
      let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
      chunks = []; release();
      const pcm = resampleTo16k(all, rate);
      return { blob: encodeWav(floatToInt16(pcm), 16000), durationMs, peak: peakOf(pcm) };
    },
    cancel() { chunks = []; release(); },
  };
}
