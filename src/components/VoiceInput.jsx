import { useEffect, useRef, useState } from 'react';
import { createRecorder, MAX_SECONDS, MIN_PEAK } from '../lib/audio/recorder.js';
import { fetchHealth, transcribeAudio, SttClientError } from '../lib/sttClient.js';

// Microphone -> WAV -> our backend -> Gnani -> transcript. The transcript is handed to the Phase 2 parser (which still asks for Confirm).
export default function VoiceInput({ onTranscript }) {
  const [health, setHealth] = useState(null);
  const [phase, setPhase] = useState('idle');         // idle | recording | processing
  const [secs, setSecs] = useState(0);
  const [demo, setDemo] = useState(false);
  const [preset, setPreset] = useState('');
  const [mockText, setMockText] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const rec = useRef(null), tick = useRef(null), abort = useRef(null);

  useEffect(() => {
    fetchHealth()
      .then((h) => { setHealth(h); setPreset(h.defaultPreset); setMockText(h.mockPhrases[0]); if (h.forcedMock) setDemo(true); })
      .catch((e) => setHealth({ error: e.message }));
    return () => { rec.current?.cancel(); abort.current?.abort(); clearInterval(tick.current); };
  }, []);

  const start = async () => {
    setError(null); setResult(null);
    const r = createRecorder({ onAutoStop: () => stop() });
    try { await r.start(); } catch (e) { setError({ code: e.code || 'MIC_ERROR', message: e.message }); return; }
    rec.current = r; setPhase('recording'); setSecs(0);
    const t0 = Date.now(); tick.current = setInterval(() => setSecs(Math.floor((Date.now() - t0) / 1000)), 250);
  };

  const stop = async () => {
    clearInterval(tick.current);
    const r = rec.current; if (!r) return;
    rec.current = null; setPhase('processing');
    try {
      const a = await r.stop();
      if (a.durationMs < 400) throw new SttClientError('TOO_SHORT', 'The recording was too short. Press Start, speak, then press Stop.');
      if (!demo && a.peak < MIN_PEAK) throw new SttClientError('NO_SPEECH', 'No sound was picked up. Check the selected microphone and speak closer to it.');
      abort.current = new AbortController();
      const res = await transcribeAudio(a.blob, { preset, mock: demo, mockText, signal: abort.current.signal });
      const text = (res.transcript || '').trim();
      if (!text) throw new SttClientError('NO_SPEECH', 'No speech was recognised. Please try again.');
      setResult({ text, mock: res.mock, model: res.model, lang: res.detectedLanguage });
      onTranscript(text);
    } catch (e) {
      if (e.code !== 'ABORTED') setError({ code: e.code || 'ERROR', message: e.message || 'Something went wrong.' });
    } finally { setPhase('idle'); abort.current = null; }
  };

  const ready = health && !health.error;
  const status = !health ? 'Checking backend…' : health.error ? 'Backend not reachable'
    : phase === 'recording' ? `🔴 Recording… ${secs}s (auto-stops at ${MAX_SECONDS}s)`
    : phase === 'processing' ? (demo ? 'Processing (demo mode)…' : 'Processing — sending to Gnani…')
    : 'Ready — press Start recording, speak, then Stop';

  return (
    <div className="card voicebox">
      <div className="vrow">
        <button className={`mic ${phase === 'recording' ? 'rec' : ''} ${phase === 'processing' ? 'proc' : ''}`}
          onClick={phase === 'recording' ? stop : start} disabled={!ready || phase === 'processing'}
          aria-label={phase === 'recording' ? 'Stop recording' : 'Start recording'}>{phase === 'recording' ? '⏹' : '🎤'}</button>
        <div>
          <div className="vstatus"><b>{status}</b></div>
          <div className="vbtns">
            <button className="primary" onClick={start} disabled={!ready || phase !== 'idle'}>● Start recording</button>
            <button onClick={stop} disabled={phase !== 'recording'}>■ Stop recording</button>
          </div>
        </div>
      </div>

      {health?.error && <div className="msg error">{health.error}</div>}
      {ready && (
        <div className="vsettings">
          <label><input type="checkbox" checked={demo} disabled={health.forcedMock || phase !== 'idle'} onChange={(e) => setDemo(e.target.checked)} /> Demo mode (no Gnani call, no credits)</label>
          {demo ? (
            <select value={mockText} disabled={phase !== 'idle'} onChange={(e) => setMockText(e.target.value)}>
              {health.mockPhrases.map((p) => <option key={p}>{p}</option>)}
            </select>
          ) : (
            <select value={preset} disabled={phase !== 'idle'} onChange={(e) => setPreset(e.target.value)}>
              {health.presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          )}
          <div className="muted">
            {demo ? 'DEMO: the text below is simulated — it does NOT come from your voice.'
              : health.apiKeyConfigured ? 'Real mode: audio is sent via the backend to Gnani Prisma.'
              : '⚠ No API key configured on the backend. Add it to .env and restart the backend, or use Demo mode.'}
          </div>
        </div>
      )}

      {result && (
        <div className="heardbox">Recognised speech: <b>“{result.text}”</b>{' '}
          {result.mock ? <span className="tag">simulated</span> : <span className="tag ok">{result.model}{result.lang ? ` · ${result.lang}` : ''}</span>}
        </div>
      )}
      {error && <div className="msg error"><b>{error.code}</b> — {error.message}</div>}
    </div>
  );
}
