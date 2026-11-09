// Pure audio helpers: resample to 16 kHz mono, convert to 16-bit PCM, wrap in a WAV container.
export function resampleTo16k(input, inRate, outRate = 16000) {
  if (inRate === outRate) return input;
  const ratio = inRate / outRate;
  const n = Math.floor(input.length / ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (ratio > 1) {                                   // downsample: average the window (cheap anti-aliasing)
      const a = Math.floor(i * ratio), b = Math.max(a + 1, Math.min(Math.floor((i + 1) * ratio), input.length));
      let s = 0; for (let k = a; k < b; k++) s += input[k];
      out[i] = s / (b - a);
    } else {                                           // upsample: linear interpolation
      const p = i * ratio, a = Math.floor(p), f = p - a;
      out[i] = input[a] * (1 - f) + input[Math.min(a + 1, input.length - 1)] * f;
    }
  }
  return out;
}

export const peakOf = (f32) => { let m = 0; for (let i = 0; i < f32.length; i++) { const v = Math.abs(f32[i]); if (v > m) m = v; } return m; };

export function floatToInt16(f32) {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) { const s = Math.max(-1, Math.min(1, f32[i])); out[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
  return out;
}

export function encodeWav(int16, sampleRate = 16000) {
  const dataBytes = int16.length * 2, buf = new ArrayBuffer(44 + dataBytes), v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + dataBytes, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);         // PCM, mono
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, dataBytes, true);
  new Int16Array(buf, 44).set(int16);
  return new Blob([buf], { type: 'audio/wav' });
}
