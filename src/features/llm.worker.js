// Cihazda çalışan dil modeli (transformers.js + ONNX Runtime Web). Ana iş parçacığını kilitlememek için Worker'da çalışır.
// Model dosyaları Hugging Face'ten bir kez indirilir ve Cache Storage'da ('transformers-cache') saklanır;
// sonraki açılışlarda ağa gitmeden yüklenir. WebGPU varsa GPU, yoksa WASM (CPU) kullanılır.
import { pipeline, env, TextStreamer, InterruptableStoppingCriteria, ModelRegistry } from '@huggingface/transformers'

env.allowLocalModels = false

// Nicemleme türü cihaza göre seçilir. WASM (işlemci) motoru 4 bit modellerin gömme katmanındaki
// GatherBlockQuantized işlemini desteklemez; orada 8 bit kullanılır. Bir tür oturum açamazsa sıradaki denenir.
// fp16: bazı modellerin (Gemma 3) 8 bit sürümü de GatherBlockQuantized kullanır; işlemcide son çare olarak 16 bit denenir.
const CANDIDATES = { webgpu: ['q4f16', 'q4', 'q8'], wasm: ['q8', 'fp16'] }
const ALL_DTYPES = ['q4f16', 'q4', 'q8', 'int8', 'uint8', 'fp16']
const stopper = new InterruptableStoppingCriteria()
let gen = null // yüklü pipeline
let genModel = null
let loading = null // { model, promise }
let device = null
let genDtype = null

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

// Kullanılmayan türlerin (ör. açılamayan 4 bit) dosyalarını önbellekten siler.
async function clearOthers(model, keep) {
  for (const d of ALL_DTYPES) if (d !== keep) await ModelRegistry.clear_cache(model, { dtype: d }).catch(() => {})
}

// Kayıtlı türü (önceden çalışmış olan) öne alarak sırayla dener; çalışan ilk oturumu döndürür.
async function create(model, preferred, onProgress) {
  const devices = (await pickDevice()) === 'webgpu' ? ['webgpu', 'wasm'] : ['wasm']
  let last
  for (const dev of devices) {
    const list = CANDIDATES[dev]
    const order = preferred && list.includes(preferred) ? [preferred, ...list.filter((d) => d !== preferred)] : list
    for (const dtype of order) {
      try {
        const p = await pipeline('text-generation', model, { dtype, device: dev, progress_callback: onProgress })
        device = dev
        return { p, dtype }
      } catch (e) {
        last = e
        console.warn(`[anfo-llm] ${model} ${dev}/${dtype} açılamadı: ${e?.message || e}`)
        // Ağ hatasında başka tür denemenin anlamı yok.
        if (/failed to fetch|network|load resource/i.test(String(e?.message))) throw e
        await ModelRegistry.clear_cache(model, { dtype }).catch(() => {})
      }
    }
  }
  throw last
}

// Modeli yükler (gerekirse indirir). Aynı model için eşzamanlı çağrılar tek yüklemeyi paylaşır.
function load(model, preferred) {
  if (gen && genModel === model) return Promise.resolve(gen)
  if (loading?.model === model) return loading.promise
  const promise = (async () => {
    if (gen) {
      await gen.dispose?.()
      gen = genModel = null
    }
    let last = 0
    const { p, dtype } = await create(model, preferred, (info) => {
      if (info.status !== 'progress_total') return
      const now = Date.now()
      if (now - last < 200 && info.progress < 100) return // mesaj seli olmasın
      last = now
      post({ type: 'progress', model, loaded: info.loaded, total: info.total, progress: info.progress })
    })
    gen = p
    genModel = model
    genDtype = dtype
    clearOthers(model, dtype)
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
// Ayrıca kart düz metin gösterdiği için Markdown kalın/başlık işaretleri temizlenir.
const clean = (t) =>
  t
    .replace(/<think>[\s\S]*?(<\/think>|$)/g, '')
    .replace(/\*\*|__/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s+/, '')

async function generate({ id, model, dtype, messages, max }) {
  const p = await load(model, dtype)
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
  const files = await ModelRegistry.get_files(model, { dtype: CANDIDATES[await pickDevice()][0] })
  const meta = await Promise.all(files.map((f) => ModelRegistry.get_file_metadata(model, f).catch(() => null)))
  return meta.reduce((n, m) => n + (m?.size || 0), 0)
}

self.onmessage = async ({ data: m }) => {
  try {
    switch (m.type) {
      case 'load':
        await load(m.model, m.dtype)
        post({ type: 'ready', id: m.id, model: m.model, device, dtype: genDtype })
        break
      case 'gen':
        await generate(m)
        break
      case 'stop':
        stopper.interrupt()
        break
      case 'cached': {
        const out = {}
        // Kayıtlı (çalıştığı bilinen) türle bakılır; kayıt yoksa model indirilmiş sayılmaz.
        for (const model of m.models) {
          const d = m.dtypes?.[model]
          out[model] = d ? await ModelRegistry.is_cached(model, { dtype: d }).catch(() => false) : false
        }
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
        await clearOthers(m.model, null)
        post({ type: 'deleted', id: m.id, model: m.model })
        break
    }
  } catch (e) {
    post({ type: 'error', id: m.id, model: m.model, message: String(e?.message || e) })
  }
}
