import { createApp } from './app.js';

try { process.loadEnvFile('.env'); } catch { /* no .env file yet: /api/health reports the key as not configured */ }
if (process.argv.includes('--mock')) process.env.STT_MODE = 'mock';

const port = Number(process.env.PORT) || 8787;
createApp().listen(port, '127.0.0.1', () => {
  console.log(`KadaiVoice backend listening on http://127.0.0.1:${port}`);
  console.log(`STT mode: ${process.env.STT_MODE === 'mock' ? 'DEMO (simulated, no Gnani calls)' : 'REAL (Gnani Prisma)'}`);
  console.log(`API key configured: ${(process.env.GNANI_API_KEY || '').trim() ? 'yes' : 'NO — add it to .env'}`);  // never prints the key
});
