import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const api = process.env.API_ORIGIN ?? 'http://localhost:3001'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': api },
  },
  preview: {
    proxy: { '/api': api },
  },
})
