import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' → çıktı her alt dizinde ve Capacitor (APK) içinde çalışır.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2020', cssMinify: true, chunkSizeWarningLimit: 400 },
})
