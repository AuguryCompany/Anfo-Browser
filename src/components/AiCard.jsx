import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useStore, navigate } from '../store'
import { ask } from '../ai'

const TIMEOUT_MS = 45000
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
export default function AiCard({ prompt, sources = [], label = 'AI özeti', maxTokens = 1500 }) {
  const key = useStore((s) => s.settings.aiKey)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [attempt, setAttempt] = useState(0) // "Yeniden dene" sayacı

  useEffect(() => {
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
  }, [key, prompt, maxTokens, attempt])

  const parts = text.split(/(\[\d+\])/g)
  return (
    <article className="card ai" data-live={!done && !error ? '' : undefined} aria-live="polite">
      <small>
        <Sparkles size={13} /> {label}
      </small>
      {error ? (
        <>
          <p className="ai-text muted">{error}</p>
          <button className="link" onClick={() => setAttempt((v) => v + 1)}>
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
        <p className="ai-text muted">düşünüyor…</p>
      )}
    </article>
  )
}
