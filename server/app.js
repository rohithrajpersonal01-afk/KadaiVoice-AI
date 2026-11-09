import express from 'express';
import { createSttService } from './sttService.js';

export function createApp(opts = {}) {
  const app = express();
  const stt = createSttService(opts);
  app.disable('x-powered-by');
  app.get('/api/health', stt.health);
  // Raw WAV bytes are held in memory only (max 5 MB); nothing is stored on disk.
  app.post('/api/stt', express.raw({ type: () => true, limit: '5mb' }), stt.handle);
  app.use('/api', (_req, res) => res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Unknown API route.' } }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.too.large') return res.status(413).json({ success: false, error: { code: 'AUDIO_TOO_LARGE', message: 'The recording is too large.' } });
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Could not read the request.' } });
  });
  return app;
}
