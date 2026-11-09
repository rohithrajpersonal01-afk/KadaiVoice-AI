import test from 'node:test';
import assert from 'node:assert/strict';
import { resampleTo16k, floatToInt16, encodeWav, peakOf } from '../src/lib/audio/wav.js';

test('encodeWav writes a valid 16 kHz mono PCM header', async () => {
  const dv = new DataView(await encodeWav(new Int16Array([0, 1000, -1000, 32767]), 16000).arrayBuffer());
  const tag = (o) => String.fromCharCode(...[0, 1, 2, 3].map((i) => dv.getUint8(o + i)));
  assert.equal(tag(0), 'RIFF'); assert.equal(tag(8), 'WAVE'); assert.equal(tag(12), 'fmt '); assert.equal(tag(36), 'data');
  assert.equal(dv.getUint16(20, true), 1);          // PCM
  assert.equal(dv.getUint16(22, true), 1);          // mono
  assert.equal(dv.getUint32(24, true), 16000);      // sample rate
  assert.equal(dv.getUint16(34, true), 16);         // bits
  assert.equal(dv.getUint32(40, true), 8);          // data bytes = 4 samples * 2
  assert.equal(dv.byteLength, 44 + 8);
  assert.equal(dv.getInt16(46, true), 1000);
});

test('resample 48 kHz and 44.1 kHz down to 16 kHz', () => {
  assert.equal(resampleTo16k(new Float32Array(48000), 48000).length, 16000);
  assert.equal(resampleTo16k(new Float32Array(44100), 44100).length, 16000);
  assert.equal(resampleTo16k(new Float32Array(100), 16000).length, 100);
  const out = resampleTo16k(new Float32Array(48000).fill(0.5), 48000);
  assert.ok(out.every((v) => Math.abs(v - 0.5) < 1e-6));   // constant signal stays constant
});

test('float -> int16 clamps and peak detects silence', () => {
  assert.deepEqual([...floatToInt16(new Float32Array([0, 1, -1, 2, -2]))], [0, 32767, -32768, 32767, -32768]);
  assert.equal(peakOf(new Float32Array(100)), 0);
  assert.equal(peakOf(new Float32Array([0.1, -0.7, 0.3])), Math.fround(0.7));
});
