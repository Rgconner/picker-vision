import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Detect a local self-signed cert for HTTPS (enables getUserMedia on LAN).
// Generate with: mkcert -install && mkcert localhost 192.168.x.x
// Place the files at picker-vision/server/web_ui/certs/cert.pem + key.pem
const certsDir = path.resolve(__dirname, 'certs')
const hasCerts =
  fs.existsSync(path.join(certsDir, 'cert.pem')) &&
  fs.existsSync(path.join(certsDir, 'key.pem'))

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',   // listen on all interfaces so a phone on the same LAN can reach it
    port: 5173,
    ...(hasCerts
      ? {
          https: {
            cert: fs.readFileSync(path.join(certsDir, 'cert.pem')),
            key:  fs.readFileSync(path.join(certsDir, 'key.pem')),
          },
        }
      : {}),
    proxy: {
      // ── API routes ────────────────────────────────────────────────────────
      '/api':      'http://localhost:8000',
      '/control':  'http://localhost:8000',
      '/stream':   'http://localhost:8000',
      // ── Mobile client routes (picker registration + event publishing) ─────
      '/pickers':  'http://localhost:8000',
      '/events':   'http://localhost:8000',
      // ── WebSocket (picker state + supervisor feed) ────────────────────────
      '/ws': {
        target:      'ws://localhost:8000',
        ws:          true,
        changeOrigin: true,
      },
    },
  },
})
