import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1', // dev server is local-only too
    port: 5173,
    // In "npm run dev", pass /api requests on to the real server.
    proxy: { '/api': 'http://127.0.0.1:4000' },
  },
});
