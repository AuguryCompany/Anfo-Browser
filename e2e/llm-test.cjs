// Yerel AI uçtan uca testi: derlenmiş llm.worker'ı başsız Chromium'da (WebGPU yok → WASM, telefondaki gibi)
// çalıştırır; her modeli indirir, oturum açar ve kısa bir Türkçe yanıt üretir.
// Kullanım: node e2e/llm-test.cjs http://localhost:4173 [model...]
const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')

const base = process.argv[2] || 'http://localhost:4173'
const models = process.argv.slice(3).length
  ? process.argv.slice(3)
  : ['onnx-community/Qwen2.5-0.5B-Instruct', 'onnx-community/Qwen3-0.6B-ONNX']
const worker = fs.readdirSync(path.join(__dirname, '..', 'dist', 'assets')).find((f) => /^llm\.worker-.*\.js$/.test(f))
if (!worker) throw new Error('dist/assets içinde llm.worker bulunamadı; önce npm run build')

;(async () => {
  const { LOCAL_SYSTEM, overviewPromptLocal } = await import('../src/ai.js')
  const sources = [
    { title: 'Otomobil - Vikipedi', snippet: 'Otomobil ya da araba, genellikle insan taşımacılığı amacıyla tasarlanmış, tekerlekli ve motorlu bir kara taşıtıdır. Çoğunlukla dört tekerlekli olup bir ila sekiz kişi taşır.' },
    { title: 'Araba nedir? - TDK', snippet: 'Araba: Tekerlekli, motorlu ya da hayvanla çekilen taşıt. Günlük dilde otomobil anlamında kullanılır.' },
    { title: 'Araba parçaları ve görevleri', snippet: 'Bir araba motor, şanzıman, süspansiyon, fren, direksiyon ve tekerlek gibi parçalardan oluşur. Benzin, dizel ya da elektrikle çalışır.' },
  ]
  const messages = [
    { role: 'system', content: LOCAL_SYSTEM },
    { role: 'user', content: overviewPromptLocal('araba nedir', sources) },
  ]
  // Kalıcı profil: telefondaki gibi önbelleğin kalıcı olup olmadığını da sınar.
  const ctx = await chromium.launchPersistentContext(path.join(require('os').tmpdir(), 'anfo-llm-profile'))
  const b = ctx
  const p = await ctx.newPage()
  p.on('console', (m) => console.log('  [sayfa]', m.text()))
  await p.goto(base + '/')
  let failed = 0
  for (const model of models) {
    const t0 = Date.now()
    console.log(`\n=== ${model}`)
    const r = await p.evaluate(
      async ({ url, model, messages }) => {
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
        const g0 = performance.now()
        const done = await call({ id: 2, type: 'gen', model, dtype: ready.dtype, max: 160, messages })
        const genSec = Math.round((performance.now() - g0) / 100) / 10
        const cached = await call({ id: 3, type: 'cached', models: [model], dtypes: { [model]: ready.dtype } })
        w.terminate()
        // Yeni bir worker ile yeniden yükleme: ağa gitmeden önbellekten açılmalı.
        const w2 = new Worker(url, { type: 'module' })
        let netHits = 0
        w2.addEventListener('message', ({ data: m }) => m.type === 'progress' && netHits++)
        const r0 = performance.now()
        const again = await new Promise((res) => {
          w2.addEventListener('message', ({ data: m }) => (m.id === 9 && m.type !== 'started' ? res(m) : 0))
          w2.postMessage({ id: 9, type: 'load', model, dtype: ready.dtype })
        })
        const reloadSec = Math.round((performance.now() - r0) / 100) / 10
        w2.terminate()
        if (done.type === 'error') return { ok: false, step: 'gen', error: done.message, dtype: ready.dtype }
        return {
          ok: !!done.text,
          dtype: ready.dtype,
          device: ready.device,
          text: done.text,
          cached: cached.cached?.[model],
          genSec,
          reloadSec,
          reload: again.type,
        }
      },
      { url: base + '/assets/' + worker, model, messages },
    )
    const sec = Math.round((Date.now() - t0) / 1000)
    if (r.ok)
      console.log(
        `BAŞARILI (${sec} sn) tür=${r.dtype} cihaz=${r.device} üretim=${r.genSec} sn önbellekte=${r.cached} yeniden-yükleme=${r.reload} ${r.reloadSec} sn\nYanıt: ${JSON.stringify(r.text)}`,
      )
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
