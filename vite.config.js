import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // In development the browser talks to this dev server only; /api and /media go on to the Social API,
    // so there is no cross-origin setup (same as production, where the API serves the app).
    proxy: {
      '/api': { target: process.env.VITE_DEV_API_TARGET || 'http://localhost:4000', changeOrigin: true },
      '/media': { target: process.env.VITE_DEV_API_TARGET || 'http://localhost:4000', changeOrigin: true },
    },
  },
})
