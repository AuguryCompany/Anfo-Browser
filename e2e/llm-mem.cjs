// Bellek deneyi: aynı modeli farklı ONNX Runtime oturum ayarlarıyla yükler; yükleme ve üretim sırasındaki
// tepe belleği (renderer süreçleri, MB), süreyi ve yanıtı yazar. Her deneme ayrı tarayıcıda (temiz bellek).
// Kullanım: node e2e/llm-mem.cjs http://localhost:4173 [model]
const fs = require('fs')
const path = require('path')
const os = require('os')
const { exec } = require('child_process')
const { chromium } = require('playwright')

const url0 = process.argv[2] || 'http://localhost:4173'
const model = process.argv[3] || 'onnx-community/Qwen3-0.6B-ONNX'
const worker = fs.readdirSync(path.join(__dirname, '..', 'dist', 'assets')).find((f) => /^llm\.worker-.*\.js$/.test(f))
const VARIANTS = [
  ['varsayılan', undefined],
  ['prepack kapalı', { extra: { session: { disable_prepacking: '1' } } }],
  ['prepack kapalı + arena kapalı', { enableCpuMemArena: false, extra: { session: { disable_prepacking: '1' } } }],
]

const rss = () =>
  new Promise((res) =>
    exec("ps -eo rss,args | grep -- '--type=renderer' | grep -v grep", (e, out) =>
      res(e ? 0 : Math.round(String(out).trim().split('\n').reduce((n, l) => n + (parseInt(l, 10) || 0), 0) / 1024)),
    ),
  )

;(async () => {
  const { LOCAL_SYSTEM, overviewPromptLocal } = await import('../src/ai.js')
  const messages = [
    { role: 'system', content: LOCAL_SYSTEM },
    {
      role: 'user',
      content: overviewPromptLocal('araba nedir', [
        { title: 'Otomobil - Vikipedi', snippet: 'Otomobil ya da araba, genellikle insan taşımacılığı amacıyla tasarlanmış, tekerlekli ve motorlu bir kara taşıtıdır.' },
        { title: 'Araba nedir? - TDK', snippet: 'Araba: Tekerlekli, motorlu ya da hayvanla çekilen taşıt.' },
        { title: 'Araba parçaları', snippet: 'Bir araba motor, şanzıman, fren ve tekerlek gibi parçalardan oluşur.' },
      ]),
    },
  ]
  const profile = path.join(os.tmpdir(), 'anfo-llm-profile')
  for (const [label, session] of VARIANTS) {
    const ctx = await chromium.launchPersistentContext(profile)
    const p = await ctx.newPage()
    await p.goto(url0 + '/')
    await new Promise((r) => setTimeout(r, 1500))
    const base = await rss()
    let phase = 'yükleme'
    const peaks = { yükleme: base, üretim: base }
    let on = true
    ;(async () => {
      while (on) {
        const v = await rss()
        peaks[phase] = Math.max(peaks[phase], v)
        await new Promise((r) => setTimeout(r, 300))
      }
    })()
    await p.exposeFunction('phase', (x) => (phase = x))
    const t0 = Date.now()
    const r = await p.evaluate(
      async ({ url, model, session, messages }) => {
        const w = new Worker(url, { type: 'module' })
        const call = (msg) =>
          new Promise((res) => {
            w.onerror = (e) => res({ type: 'error', message: 'worker: ' + e.message })
            const on = ({ data: m }) => {
              if (m.id !== msg.id || m.type === 'token' || m.type === 'started') return
              w.removeEventListener('message', on)
              res(m)
            }
            w.addEventListener('message', on)
            w.postMessage(msg)
          })
        const l0 = performance.now()
        const ready = await call({ id: 1, type: 'load', model, session })
        if (ready.type === 'error') return { error: ready.message }
        const loadSec = Math.round(performance.now() - l0) / 1000
        await window.phase('üretim')
        const g0 = performance.now()
        const done = await call({ id: 2, type: 'gen', model, dtype: ready.dtype, max: 120, messages })
        return { loadSec, genSec: Math.round(performance.now() - g0) / 1000, dtype: ready.dtype, text: done.text || done.message }
      },
      { url: url0 + '/assets/' + worker, model, session, messages },
    )
    on = false
    console.log(`\n### ${label}`)
    if (r.error) console.log('HATA', r.error)
    else
      console.log(
        `başlangıç ${base} MB · yükleme tepe +${peaks['yükleme'] - base} MB (${r.loadSec} sn) · üretim tepe +${peaks['üretim'] - base} MB (${r.genSec} sn) · ${r.dtype}\nYanıt: ${JSON.stringify(r.text).slice(0, 220)}`,
      )
    await ctx.close()
    await new Promise((r) => setTimeout(r, 2000))
  }
  process.exit(0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
