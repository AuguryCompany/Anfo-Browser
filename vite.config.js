import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ONNX Runtime'ın ~27 MB'lık .wasm dosyası pakete kopyalanmasın: transformers.js bu dosyayı
// ilk kullanımda CDN'den indirip modelle birlikte önbelleğe alır (bkz. features/llm.worker.js).
const dropOrtWasm = {
  name: 'drop-ort-wasm',
  generateBundle(_, bundle) {
    for (const f of Object.keys(bundle)) if (/ort-wasm.*\.wasm$/.test(f)) delete bundle[f]
  },
}

// base './' → çıktı her alt dizinde ve Capacitor (APK) içinde çalışır.
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es', plugins: () => [dropOrtWasm] },
  build: { target: 'es2020', cssMinify: true, chunkSizeWarningLimit: 400 },
})
