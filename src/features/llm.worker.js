// Cihazda çalışan dil modeli (transformers.js + ONNX Runtime Web). Ana iş parçacığını kilitlememek için Worker'da çalışır.
// Model dosyaları Hugging Face'ten bir kez indirilir ve Cache Storage'da ('transformers-cache') saklanır;
// sonraki açılışlarda ağa gitmeden yüklenir. WebGPU varsa GPU, yoksa WASM (CPU) kullanılır.
import { pipeline, env, TextStreamer, InterruptableStoppingCriteria, ModelRegistry } from '@huggingface/transformers'

env.allowLocalModels = false

const DTYPE = 'q4' // 4 bit nicemlenmiş ağırlıklar: hem WebGPU hem WASM'da çalışır
const stopper = new InterruptableStoppingCriteria()
let gen = null // yüklü pipeline
let genModel = null
let loading = null // { model, promise }
let device = null

const post = (m) => self.postMessage(m)

async function pickDevice() {
  if (device) return device
  try {
    if (self.navigator?.gpu && (await self.navigator.gpu.requestAdapter())) return (device = 'webgpu')
  } catch {
    /* WebGPU yok */
  }
  return (device = 'wasm')
}

async function create(model, onProgress) {
  const opts = { dtype: DTYPE, device: await pickDevice(), progress_callback: onProgress }
  try {
    return await pipeline('text-generation', model, opts)
  } catch (e) {
    // Bazı cihazlarda WebGPU adaptörü var ama oturum açılamıyor: CPU'ya düş.
    if (opts.device !== 'webgpu') throw e
    device = 'wasm'
    return pipeline('text-generation', model, { ...opts, device: 'wasm' })
  }
}

// Modeli yükler (gerekirse indirir). Aynı model için eşzamanlı çağrılar tek yüklemeyi paylaşır.
function load(model) {
  if (gen && genModel === model) return Promise.resolve(gen)
  if (loading?.model === model) return loading.promise
  const promise = (async () => {
    if (gen) {
      await gen.dispose?.()
      gen = genModel = null
    }
    let last = 0
    const p = await create(model, (info) => {
      if (info.status !== 'progress_total') return
      const now = Date.now()
      if (now - last < 200 && info.progress < 100) return // mesaj seli olmasın
      last = now
      post({ type: 'progress', model, loaded: info.loaded, total: info.total, progress: info.progress })
    })
    gen = p
    genModel = model
    return p
  })()
  loading = { model, promise }
  promise
    .finally(() => {
      if (loading?.promise === promise) loading = null
    })
    .catch(() => {}) // hata çağırana iletilir; burada yalnızca yakalanmamış ret uyarısı önlenir
  return promise
}

// Qwen3 düşünme bölümünü (<think>…</think>) çıktıdan ayıklar.
const clean = (t) => t.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').replace(/^\s+/, '')

async function generate({ id, model, messages, max }) {
  const p = await load(model)
  post({ type: 'started', id })
  stopper.reset()
  let raw = ''
  const streamer = new TextStreamer(p.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (t) => {
      raw += t
      post({ type: 'token', id, text: clean(raw) })
    },
  })
  await p(messages, {
    max_new_tokens: max,
    do_sample: false,
    repetition_penalty: 1.1,
    streamer,
    stopping_criteria: stopper,
    tokenizer_encode_kwargs: { enable_thinking: false }, // Qwen3: doğrudan yanıt
  })
  post({ type: 'done', id, text: clean(raw).trim() })
}

async function sizeOf(model) {
  const files = await ModelRegistry.get_files(model, { dtype: DTYPE })
  const meta = await Promise.all(files.map((f) => ModelRegistry.get_file_metadata(model, f).catch(() => null)))
  return meta.reduce((n, m) => n + (m?.size || 0), 0)
}

self.onmessage = async ({ data: m }) => {
  try {
    switch (m.type) {
      case 'load':
        await load(m.model)
        post({ type: 'ready', id: m.id, model: m.model, device })
        break
      case 'gen':
        await generate(m)
        break
      case 'stop':
        stopper.interrupt()
        break
      case 'cached': {
        const out = {}
        for (const model of m.models) out[model] = await ModelRegistry.is_cached(model, { dtype: DTYPE }).catch(() => false)
        post({ type: 'cached', id: m.id, cached: out })
        break
      }
      case 'size':
        post({ type: 'size', id: m.id, model: m.model, bytes: await sizeOf(m.model) })
        break
      case 'delete':
        if (genModel === m.model) {
          await gen?.dispose?.()
          gen = genModel = null
        }
        await ModelRegistry.clear_cache(m.model, { dtype: DTYPE })
        post({ type: 'deleted', id: m.id, model: m.model })
        break
    }
  } catch (e) {
    post({ type: 'error', id: m.id, model: m.model, message: String(e?.message || e) })
  }
}
