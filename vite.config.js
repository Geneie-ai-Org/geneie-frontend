import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    allowedHosts: true,
    // Proxy API calls to the local backend so a SINGLE ngrok tunnel (on the FE) serves
    // remote teammates - no second tunnel, no CORS, no baking a backend URL. The FE must
    // call same-origin '/api/...' for this to apply: set VITE_API_URL='' (empty) so
    // apiUrl() produces relative paths that hit this proxy.
    // Proxy targets are env-driven so this works BOTH native-local (localhost defaults)
    // AND in Docker (compose sets DEV_BACKEND_URL=http://backend:8000 etc. = service names).
    proxy: {
      '/api': {
        target: process.env.DEV_BACKEND_URL || 'http://localhost:8000',
        changeOrigin: true,
      },
      // Exploratory SSE stream goes straight to the Strands service, same-origin to the
      // browser. Kept off the Python backend hop so streaming isn't buffered.
      '/exploratory': {
        target: process.env.DEV_EXPLORATORY_URL || 'http://localhost:8100',
        changeOrigin: true,
        // If the upstream is unreachable (e.g. a dead SSH tunnel behind a
        // host.docker.internal target), the proxy would otherwise return a bare empty 502
        // and the FE would show a stuck cursor with no clue why. Surface it as a real SSE
        // error frame so the failure is VISIBLE, not a silent hang, and logged loudly.
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            try {
              if (res.writableEnded || res.headersSent) return;
              res.writeHead(502, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
              res.end(`data: ${JSON.stringify({ type: 'error', label: `exploratory upstream unreachable: ${err.code || err.message}`, data: {} })}\n\n`);
            } catch { /* response already gone */ }
          });
        },
      },
    },
  },
  build: {
    outDir: 'build',
    sourcemap: true,
  },
})
