import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useStore, navigate } from '../store'
import { ask, LOCAL_SYSTEM } from '../ai'
import { askLocal, modelName, crashedModel, clearCrash } from '../features/local-ai'

const TIMEOUT_MS = 45000
const LOCAL_IDLE_MS = 120000 // yerel model: ilk yükleme uzun sürebilir; her yeni parçada süre yenilenir
const MIN_KEY_LEN = 20
const CACHE_MAX = 20

// Aynı prompt için sonuç modül düzeyinde tutulur (en fazla 20; en eski silinir). Yalnızca başarılı yanıtlar yazılır.
const cache = new Map()
function cacheGet(k) {
  if (!cache.has(k)) return undefined
  const v = cache.get(k)
  cache.delete(k)
  cache.set(k, v)
  return v
}
function cachePut(k, v) {
  cache.delete(k)
  cache.set(k, v)
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value)
}

// Akan AI yanıtı. [1] gibi kaynak işaretleri, verilen kaynak listesine bağlanan küçük düğmelere dönüşür.
// Yerel modda (cihazda çalışan model) localPrompt kullanılır; verilmezse prompt kısaltılarak gönderilir.
export default function AiCard({ prompt, localPrompt, sources = [], label = 'AI özeti', maxTokens = 1500 }) {
  const key = useStore((s) => s.settings.aiKey)
  const local = useStore((s) => s.settings.aiEngine === 'local')
  const model = useStore((s) => s.settings.localModel)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [warm, setWarm] = useState(false) // yerel model belleğe yüklenirken
  const [attempt, setAttempt] = useState(0) // "Yeniden dene" sayacı

  useEffect(() => {
    if (!local) return
    setError('')
    setDone(false)
    setWarm(true)
    const p = localPrompt || prompt.slice(0, 4000)
    const ck = model + '\n' + p
    const hit = cacheGet(ck)
    if (hit !== undefined) {
      setText(hit)
      setDone(true)
      setWarm(false)
      return
    }
    setText('')
    if (!model) {
      setError('Ayarlar › AI modu bölümünden bir model indir.')
      return
    }
    if (crashedModel() === model) {
      setWarm(false)
      setError(`${modelName(model)} son kullanımda bu cihazın belleğini aştı ve uygulama kapandı. Daha küçük bir model seç ya da yeniden dene.`)
      return
    }
    const ac = new AbortController()
    let timer
    let timedOut = false
    const arm = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        timedOut = true
        ac.abort()
      }, LOCAL_IDLE_MS)
    }
    arm()
    askLocal({
      model,
      system: LOCAL_SYSTEM,
      prompt: p,
      maxTokens: Math.min(maxTokens, 200), // işlemcide yavaş: kısa yanıt
      signal: ac.signal,
      onStart: () => (setWarm(false), arm()),
      onText: (t) => (setText(t), arm()),
    }).then(
      (full) => {
        clearTimeout(timer)
        if (full) cachePut(ck, full)
        else setError('Model bir yanıt üretmedi.')
        setDone(true)
      },
      (e) => {
        clearTimeout(timer)
        setWarm(false)
        if (timedOut) setError('Model zamanında yanıt vermedi.')
        else if (e.name !== 'AbortError') setError(e.message || 'Model çalıştırılamadı.')
      },
    )
    return () => {
      clearTimeout(timer)
      ac.abort()
    }
  }, [local, model, prompt, localPrompt, maxTokens, attempt])

  useEffect(() => {
    if (local) return
    setError('')
    setDone(false)
    const hit = cacheGet(prompt)
    if (hit !== undefined) {
      setText(hit)
      setDone(true)
      return
    }
    setText('')
    if (!key || key.trim().length < MIN_KEY_LEN) {
      setError('AI için geçerli bir API anahtarı gerekli.')
      return
    }

    // İstek iptal edilebilir: kart kapanınca ya da prompt değişince ac.abort() çalışır.
    const ac = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      ac.abort()
    }, TIMEOUT_MS)
    ask({ key, prompt, maxTokens, onText: setText, signal: ac.signal }).then(
      (full) => {
        clearTimeout(timer)
        cachePut(prompt, full)
        setDone(true)
      },
      (e) => {
        clearTimeout(timer)
        if (timedOut) setError('Yanıt 45 saniye içinde gelmedi.')
        else if (e.name !== 'AbortError') setError(e.message || 'AI yanıt veremedi.')
      },
    )
    return () => {
      clearTimeout(timer)
      ac.abort()
    }
  }, [local, key, prompt, maxTokens, attempt])

  const parts = text.split(/(\[\d+\])/g)
  return (
    <article className="card ai" data-live={!done && !error ? '' : undefined} aria-live="polite">
      <small>
        <Sparkles size={13} /> {label}
        {local && model && <span className="ai-model"> · {modelName(model)} · cihazda</span>}
      </small>
      {error ? (
        <>
          <p className="ai-text muted">{error}</p>
          <button className="link" onClick={() => (clearCrash(), setAttempt((v) => v + 1))}>
            Yeniden dene
          </button>
        </>
      ) : text ? (
        <p className="ai-text">
          {parts.map((p, i) => {
            const n = /^\[(\d+)\]$/.exec(p)?.[1]
            const src = n && sources[n - 1]
            return src ? (
              <button key={i} className="cite" title={src.title} onClick={() => navigate(src.url)}>
                {n}
              </button>
            ) : (
              p
            )
          })}
        </p>
      ) : (
        <p className="ai-text muted">{local && warm ? 'model yükleniyor…' : 'düşünüyor…'}</p>
      )}
    </article>
  )
}
