import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const api = process.env.API_ORIGIN ?? 'http://localhost:3001'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': api },
    // Vite 403s any Host header it does not recognise (DNS-rebinding guard), which is exactly what a
    // cloudflared quick tunnel sends. The leading dot allows that domain and its random subdomains
    // WITHOUT turning the check off for everything else.
    allowedHosts: ['.trycloudflare.com'],
  },
  preview: {
    proxy: { '/api': api },
    allowedHosts: ['.trycloudflare.com'],
  },
})
