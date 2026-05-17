import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev the SPA runs on Vite's server; /api is proxied to the Go BFF
// (`make run` in another terminal). In prod the Go binary serves both.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
