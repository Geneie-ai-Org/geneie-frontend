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
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      // Exploratory SSE stream goes straight to the Strands service (:8100), same-origin
      // to the browser. Kept off the Python backend hop so streaming isn't buffered.
      '/exploratory': {
        target: 'http://localhost:8100',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'build',
    sourcemap: true,
  },
})
