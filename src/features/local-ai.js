// Cihazda çalışan küçük dil modelleri: indirme, silme, durum ve metin üretimi.
// Ağır iş llm.worker.js'te yapılır; bu modül yalnızca mesajlaşmayı ve arayüz durumunu yönetir.
import { useSyncExternalStore } from 'react'

// Yalnızca 800M parametrenin altındaki, nicemlenmiş (GPU'da 4 bit, işlemcide 8 bit) birkaç model. Liste kasıtlı olarak kısa tutulur.
export const LOCAL_MODELS = [
  { id: 'onnx-community/Qwen3-0.6B-ONNX', name: 'Qwen3 0.6B', params: '600M', note: 'En iyi Türkçe ve en tutarlı özet. Önerilen.' },
  { id: 'onnx-community/Qwen2.5-0.5B-Instruct', name: 'Qwen2.5 0.5B', params: '500M', note: 'Biraz daha hızlı, Türkçesi iyi.' },
  { id: 'onnx-community/gemma-3-270m-it-ONNX', name: 'Gemma 3 270M', params: '270M', note: 'En küçük ve en hızlı; zayıf cihazlar için.' },
]
export const modelName = (id) => LOCAL_MODELS.find((m) => m.id === id)?.name || id

let worker = null
let seq = 0
const pending = new Map() // id → { resolve, reject, onText }

// Arayüz durumu: { [model]: { status: 'idle'|'downloading'|'ready'|'error', progress, loaded, total, size, error } }
let state = {}
let device = null
const subs = new Set()
const emit = () => subs.forEach((f) => f())
const patch = (model, p) => {
  state = { ...state, [model]: { ...state[model], ...p } }
  emit()
}
const subscribe = (f) => (subs.add(f), () => subs.delete(f))
export const useLocalModels = () => useSyncExternalStore(subscribe, () => state)
export const localDevice = () => device

const SIZE_KEY = 'anfo:llm-size2' // 2: boyut, cihaza uygun türe göre ölçülür
try {
  const sizes = JSON.parse(localStorage.getItem(SIZE_KEY) || '{}')
  for (const [k, v] of Object.entries(sizes)) state[k] = { size: v }
} catch {
  /* yok say */
}
function saveSize(model, bytes) {
  try {
    const s = JSON.parse(localStorage.getItem(SIZE_KEY) || '{}')
    s[model] = bytes
    localStorage.setItem(SIZE_KEY, JSON.stringify(s))
  } catch {
    /* yok say */
  }
}

// Her model için bu cihazda çalıştığı doğrulanan nicemleme türü (q4f16, q8…).
const DTYPE_KEY = 'anfo:llm-dtype'
const readDtypes = () => {
  try {
    return JSON.parse(localStorage.getItem(DTYPE_KEY) || '{}') || {}
  } catch {
    return {}
  }
}
function saveDtype(model, dtype) {
  try {
    const d = readDtypes()
    if (dtype) d[model] = dtype
    else delete d[model]
    localStorage.setItem(DTYPE_KEY, JSON.stringify(d))
  } catch {
    /* yok say */
  }
}

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('./llm.worker.js', import.meta.url), { type: 'module' })
  worker.onmessage = ({ data: m }) => {
    if (m.type === 'progress') return patch(m.model, { status: 'downloading', progress: m.progress, loaded: m.loaded, total: m.total })
    const p = pending.get(m.id)
    switch (m.type) {
      case 'token':
        p?.onText?.(m.text)
        return
      case 'started':
        p?.onStart?.()
        return
      case 'ready':
        device = m.device
        saveDtype(m.model, m.dtype)
        patch(m.model, { status: 'ready', progress: 100, error: '' })
        break
      case 'deleted':
        saveDtype(m.model, null)
        patch(m.model, { status: 'idle', progress: 0, loaded: 0 })
        break
      case 'size':
        patch(m.model, { size: m.bytes })
        saveSize(m.model, m.bytes)
        break
      case 'error':
        if (m.model && state[m.model]?.status === 'downloading') patch(m.model, { status: 'error', error: m.message })
        break
    }
    if (!p) return
    pending.delete(m.id)
    if (m.type === 'error') p.reject(new Error(m.message))
    else p.resolve(m)
  }
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || 'Model çalıştırılamadı.'))
    pending.clear()
    worker = null
  }
  return worker
}

function call(msg, extra = {}) {
  const id = ++seq
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, ...extra })
    getWorker().postMessage({ ...msg, id })
  })
}

// Hangi modellerin önbellekte olduğunu denetler ve durumu günceller. İndirilmiş model kimliklerini döndürür.
export async function refreshLocal() {
  const { cached, dtypes } = await call({ type: 'cached', models: LOCAL_MODELS.map((m) => m.id), dtypes: readDtypes() })
  for (const [model, d] of Object.entries(dtypes || {})) saveDtype(model, d)
  for (const [model, ok] of Object.entries(cached)) {
    const cur = state[model]?.status
    if (cur === 'downloading') continue
    if (ok && cur !== 'ready') patch(model, { status: 'ready', progress: 100 })
    if (!ok && cur === 'ready') patch(model, { status: 'idle', progress: 0 })
  }
  return Object.keys(cached).filter((k) => cached[k])
}

// İndirme boyutunu (bayt) ağdan ölçer; sonuç saklanır.
export async function measureLocal(model) {
  if (state[model]?.size) return state[model].size
  const { bytes } = await call({ type: 'size', model })
  return bytes
}

export async function downloadLocal(model) {
  patch(model, { status: 'downloading', progress: 0, loaded: 0, error: '' })
  try {
    setBusy(model)
    await call({ type: 'load', model, dtype: readDtypes()[model] }).finally(() => setBusy(null))
  } catch (e) {
    const net = /fetch|network|load resource/i.test(e.message)
    const unsupported = /session|implementation|backend/i.test(e.message)
    const err = new Error(
      net
        ? 'İndirilemedi: internet bağlantısını kontrol edip yeniden dene.'
        : unsupported
          ? 'Bu model bu cihazda çalıştırılamadı. Başka bir model dene.'
          : 'İndirilemedi: ' + e.message,
    )
    patch(model, { status: 'error', error: err.message })
    throw err
  }
}

export const deleteLocal = (model) => call({ type: 'delete', model })

// Model çalışırken uygulama kapanırsa (bellek yetmezliği) bir sonraki açılışta aynı model kendiliğinden
// yeniden çalıştırılmaz; yoksa her aramada çökme döngüsü olur. Kullanıcı "Yeniden dene" ile bayrağı kaldırır.
const BUSY_KEY = 'anfo:llm-busy'
let crashed = null
try {
  crashed = localStorage.getItem(BUSY_KEY)
  localStorage.removeItem(BUSY_KEY)
} catch {
  /* yok say */
}
export const crashedModel = () => crashed
export const clearCrash = () => (crashed = null)
const setBusy = (model) => {
  try {
    if (model) localStorage.setItem(BUSY_KEY, model)
    else localStorage.removeItem(BUSY_KEY)
  } catch {
    /* yok say */
  }
}

// Yerel modelle metin üretir. onText her parçada o ana kadarki tam metni alır.
export async function askLocal({ model, system, prompt, onText, onStart, signal, maxTokens = 320 }) {
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
  const stop = () => worker?.postMessage({ type: 'stop' })
  signal?.addEventListener('abort', stop, { once: true })
  try {
    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ]
    setBusy(model)
    const { text } = await call({ type: 'gen', model, dtype: readDtypes()[model], messages, max: maxTokens }, { onText, onStart }).finally(() =>
      setBusy(null),
    )
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
    return text
  } finally {
    signal?.removeEventListener('abort', stop)
  }
}

export const fmtMB = (b) => (b >= 1e9 ? (b / 1e9).toFixed(2).replace('.', ',') + ' GB' : Math.round(b / 1e6) + ' MB')
