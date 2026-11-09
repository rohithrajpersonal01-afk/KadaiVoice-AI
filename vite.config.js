import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The browser only talks to /api/..., which Vite forwards to the local Express backend (where the API key lives).
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
});
