// Yerel AI uçtan uca testi: derlenmiş llm.worker'ı başsız Chromium'da (WebGPU yok → WASM, telefondaki gibi)
// çalıştırır; her modeli indirir, oturum açar ve kısa bir Türkçe yanıt üretir.
// Kullanım: node e2e/llm-test.cjs http://localhost:4173 [model...]
const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')

const base = process.argv[2] || 'http://localhost:4173'
const models = process.argv.slice(3).length
  ? process.argv.slice(3)
  : ['onnx-community/gemma-3-270m-it-ONNX', 'onnx-community/Qwen2.5-0.5B-Instruct', 'onnx-community/Qwen3-0.6B-ONNX']
const worker = fs.readdirSync(path.join(__dirname, '..', 'dist', 'assets')).find((f) => /^llm\.worker-.*\.js$/.test(f))
if (!worker) throw new Error('dist/assets içinde llm.worker bulunamadı; önce npm run build')

;(async () => {
  const b = await chromium.launch()
  const p = await b.newPage()
  p.on('console', (m) => console.log('  [sayfa]', m.text()))
  await p.goto(base + '/')
  let failed = 0
  for (const model of models) {
    const t0 = Date.now()
    console.log(`\n=== ${model}`)
    const r = await p.evaluate(
      async ({ url, model }) => {
        const w = new Worker(url, { type: 'module' })
        const call = (msg) =>
          new Promise((res) => {
            const on = ({ data: m }) => {
              if (m.id !== msg.id) return
              if (m.type === 'token' || m.type === 'started') return
              w.removeEventListener('message', on)
              res(m)
            }
            w.addEventListener('message', on)
            w.postMessage(msg)
          })
        let lastPct = -10
        w.addEventListener('message', ({ data: m }) => {
          if (m.type === 'progress' && m.progress - lastPct >= 25) {
            lastPct = m.progress
            console.log(`indiriliyor %${Math.floor(m.progress)} (${Math.round(m.total / 1e6)} MB)`)
          }
        })
        const ready = await call({ id: 1, type: 'load', model })
        if (ready.type === 'error') return { ok: false, step: 'load', error: ready.message }
        const done = await call({
          id: 2,
          type: 'gen',
          model,
          dtype: ready.dtype,
          max: 80,
          messages: [
            { role: 'system', content: 'Türkçe, kısa ve doğrudan yaz.' },
            { role: 'user', content: 'Soru: araba nedir?\n\n[1] Otomobil — Vikipedi\nOtomobil, motorlu ve tekerlekli bir kara taşıtıdır.\n\nKaynağa göre kısaca yanıtla ve [1] ile belirt.' },
          ],
        })
        const cached = await call({ id: 3, type: 'cached', models: [model], dtypes: { [model]: ready.dtype } })
        w.terminate()
        if (done.type === 'error') return { ok: false, step: 'gen', error: done.message, dtype: ready.dtype }
        return { ok: !!done.text, dtype: ready.dtype, device: ready.device, text: done.text, cached: cached.cached?.[model] }
      },
      { url: base + '/assets/' + worker, model },
    )
    const sec = Math.round((Date.now() - t0) / 1000)
    if (r.ok) console.log(`BAŞARILI (${sec} sn) tür=${r.dtype} cihaz=${r.device} önbellekte=${r.cached}\nYanıt: ${r.text}`)
    else {
      failed++
      console.log(`HATA (${sec} sn) adım=${r.step} tür=${r.dtype || '-'}: ${r.error}`)
    }
  }
  await b.close()
  process.exit(failed ? 1 : 0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
