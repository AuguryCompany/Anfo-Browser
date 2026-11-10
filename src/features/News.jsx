import { useEffect, useState } from 'react'
import { RotateCw } from 'lucide-react'
import { useStore, setSetting, navigate } from '../store'
import { getText } from './net'
import { isNative } from '../native'
import { newsParams, AI_WORD, COUNTRIES, region } from './region'

// Haberler widget'ı: seçilen konuyla ilgili güncel başlıklar (Google Haberler RSS, Türkçe).
// Yalnızca konu metni gönderilir; çerez gönderilmez (Android'de yerel HTTP).
// Konular Google Haberler'in dile bağımsız bölümlerine eşlenir; böylece seçilen dil/ülkede doğru haberler gelir.
// Bölümü olmayanlar (Yapay zekâ, kendi konun) arama olarak, seçili dilde sorulur.
const SECTIONS = {
  Gündem: null,
  Ülke: 'NATION',
  Dünya: 'WORLD',
  Ekonomi: 'BUSINESS',
  Teknoloji: 'TECHNOLOGY',
  Bilim: 'SCIENCE',
  Sağlık: 'HEALTH',
  Spor: 'SPORTS',
  Eğlence: 'ENTERTAINMENT',
  'Yapay zekâ': 'search:ai',
}
export const TOPICS = Object.keys(SECTIONS)
const TTL = 10 * 60000
const cache = new Map() // `${ceid}|${konu}` → { t, v }

function feedUrl(topic) {
  const np = newsParams()
  const qs = `hl=${np.hl}&gl=${np.gl}&ceid=${encodeURIComponent(np.ceid)}`
  const sec = Object.prototype.hasOwnProperty.call(SECTIONS, topic) ? SECTIONS[topic] : 'search:' + topic
  if (sec === null) return 'https://news.google.com/rss?' + qs
  if (!sec.startsWith('search:')) return `https://news.google.com/rss/headlines/section/topic/${sec}?` + qs
  const q = sec === 'search:ai' ? AI_WORD[np.hl] || AI_WORD.en : sec.slice(7)
  return 'https://news.google.com/rss/search?q=' + encodeURIComponent(q + ' when:2d') + '&' + qs
}

async function fetchNews(topic, signal) {
  const key = newsParams().ceid + '|' + topic
  const hit = cache.get(key)
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
  cache.set(key, { t: Date.now(), v })
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
  const where = useStore((s) => s.settings.country + '|' + s.settings.lang) // bölge değişince yeniden yüklenir
  const country = region().country

  useEffect(() => {
    const ac = new AbortController()
    setErr('')
    fetchNews(topic, ac.signal).then(
      (v) => (setItems(v), setErr(v.length ? '' : 'Bu konuda yeni haber yok.')),
      (e) => e.name !== 'AbortError' && (setItems([]), setErr('Haberler alınamadı.' + (isNative ? '' : ' Web sürümünde tarayıcı bu kaynağı engelleyebilir.'))),
    )
    return () => ac.abort()
  }, [topic, rev, where])

  const setTopic = (t) => setSetting('news', { ...cfg, topic: t })
  const custom = !TOPICS.includes(topic)

  return (
    <div className="nw">
      <div className="nw-topics" role="radiogroup" aria-label="Haber konusu">
        {[...TOPICS, ...(custom ? [topic] : [])].map((t) => (
          <button key={t} role="radio" aria-checked={t === topic} className="nw-chip" onClick={() => setTopic(t)}>
            {t === 'Ülke' ? (country ? COUNTRIES[country].name : 'Ülke') : t}
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
        <button className="nw-chip" aria-label="Yenile" onClick={() => (cache.delete(newsParams().ceid + '|' + topic), setRev((v) => v + 1))}>
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
