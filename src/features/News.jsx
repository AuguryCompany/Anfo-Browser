import { useEffect, useState } from 'react'
import { RotateCw } from 'lucide-react'
import { useStore, setSetting, navigate } from '../store'
import { getText } from './net'
import { isNative } from '../native'

// Haberler widget'ı: seçilen konuyla ilgili güncel başlıklar (Google Haberler RSS, Türkçe).
// Yalnızca konu metni gönderilir; çerez gönderilmez (Android'de yerel HTTP).
export const TOPICS = ['Gündem', 'Ekonomi', 'Teknoloji', 'Bilim', 'Spor', 'Dünya', 'Borsa', 'Yapay zekâ']
const TTL = 10 * 60000
const cache = new Map() // konu → { t, v }

const feedUrl = (topic) =>
  topic === 'Gündem'
    ? 'https://news.google.com/rss?hl=tr&gl=TR&ceid=TR:tr'
    : 'https://news.google.com/rss/search?q=' + encodeURIComponent(topic + ' when:2d') + '&hl=tr&gl=TR&ceid=TR:tr'

async function fetchNews(topic, signal) {
  const hit = cache.get(topic)
  if (hit && Date.now() - hit.t < TTL) return hit.v
  const xml = await getText(feedUrl(topic), null, signal)
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const v = [...doc.querySelectorAll('item')].slice(0, 8).map((it) => {
    const source = it.querySelector('source')?.textContent || ''
    let title = it.querySelector('title')?.textContent || ''
    // Google başlığın sonuna " - Kaynak" ekler; kaynak ayrıca gösterildiği için kesilir.
    if (source && title.endsWith(' - ' + source)) title = title.slice(0, -(source.length + 3))
    return { title, link: it.querySelector('link')?.textContent || '', source, at: Date.parse(it.querySelector('pubDate')?.textContent || '') || 0 }
  })
  cache.set(topic, { t: Date.now(), v })
  return v
}

const ago = (t) => {
  if (!t) return ''
  const m = Math.max(1, Math.round((Date.now() - t) / 60000))
  if (m < 60) return m + ' dk'
  const h = Math.round(m / 60)
  return h < 24 ? h + ' sa' : Math.round(h / 24) + ' g'
}

export default function News() {
  const cfg = useStore((s) => s.settings.news) || {}
  const topic = (cfg.topic || 'Gündem').trim() || 'Gündem'
  const count = cfg.count === 3 || cfg.count === 8 ? cfg.count : 5
  const [items, setItems] = useState(null)
  const [err, setErr] = useState('')
  const [draft, setDraft] = useState('')
  const [rev, setRev] = useState(0)

  useEffect(() => {
    const ac = new AbortController()
    setErr('')
    fetchNews(topic, ac.signal).then(
      (v) => (setItems(v), setErr(v.length ? '' : 'Bu konuda yeni haber yok.')),
      (e) => e.name !== 'AbortError' && (setItems([]), setErr('Haberler alınamadı.' + (isNative ? '' : ' Web sürümünde tarayıcı bu kaynağı engelleyebilir.'))),
    )
    return () => ac.abort()
  }, [topic, rev])

  const setTopic = (t) => setSetting('news', { ...cfg, topic: t })
  const custom = !TOPICS.includes(topic)

  return (
    <div className="nw">
      <div className="nw-topics" role="radiogroup" aria-label="Haber konusu">
        {[...TOPICS, ...(custom ? [topic] : [])].map((t) => (
          <button key={t} role="radio" aria-checked={t === topic} className="nw-chip" onClick={() => setTopic(t)}>
            {t}
          </button>
        ))}
        <form
          className="nw-own"
          onSubmit={(e) => {
            e.preventDefault()
            if (draft.trim()) setTopic(draft.trim())
            setDraft('')
          }}
        >
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Kendi konun…" aria-label="Kendi haber konun" enterKeyHint="done" />
        </form>
        <button className="nw-chip" aria-label="Yenile" onClick={() => (cache.delete(topic), setRev((v) => v + 1))}>
          <RotateCw size={12} />
        </button>
      </div>
      {items === null && <p className="wg-muted">Yükleniyor…</p>}
      {err && <p className="wg-muted">{err}</p>}
      <div className="nw-list">
        {(items || []).slice(0, count).map((n) => (
          <button key={n.link || n.title} className="nw-item" onClick={() => n.link && navigate(n.link)}>
            <span>{n.title}</span>
            <small>
              {n.source}
              {n.at ? ' · ' + ago(n.at) : ''}
            </small>
          </button>
        ))}
      </div>
      <div className="seg nw-count" role="radiogroup" aria-label="Haber sayısı">
        {[3, 5, 8].map((n) => (
          <button key={n} role="radio" aria-checked={count === n} onClick={() => setSetting('news', { ...cfg, count: n })}>
            {n} haber
          </button>
        ))}
      </div>
    </div>
  )
}
