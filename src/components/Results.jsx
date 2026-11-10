import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, Map as MapIcon, Sparkles, X } from 'lucide-react'
import { useStore, navigate, newTab, setUi, hostOf, engineUrl, ENGINES, warm, aiReady } from '../store'
import { search } from '../search'
import { overviewPrompt, overviewPromptLocal } from '../ai'
import { facts, images, related, groupResults, quickAnswer } from '../features/knowledge'
import AiCard from './AiCard'
import Aura from './Aura'
import Favicon from './Favicon'
import '../features/results.css'

// Arama sonuçları: motorun sayfası yerine kendi kart yığınımız.
const open = (url) => (e) => {
  if (e.button === 2) return // sağ tık: tarayıcının bağlam menüsü kalsın
  e.preventDefault()
  if (e.button === 1 || e.ctrlKey || e.metaKey) newTab(url)
  else navigate(url)
}

const SEARCH_MS = 9000

// AbortSignal.any varsa onu kullanır; yoksa iki sinyalden biri iptal olunca birleşik sinyali iptal eden bir sinyal döner.
function anySignal(...sigs) {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(sigs)
  const c = new AbortController()
  sigs.forEach((s) => s.addEventListener('abort', () => c.abort(), { once: true }))
  return c.signal
}

const mapUrl = ({ lat, lon }) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=12/${lat}/${lon}`
const CITE = /(\[\d+\])/g
const NONE = { facts: null, images: null, related: null }
const TABS = [
  ['all', 'Tümü'],
  ['img', 'Görseller'],
  ['info', 'Bilgi'],
]

function Card({ r, i, lead }) {
  return (
    <a className={lead ? 'card answer' : 'card result'} style={{ '--i': i }} href={r.url} onClick={open(r.url)} onAuxClick={open(r.url)} onPointerEnter={() => warm(r.url)} onPointerDown={() => warm(r.url)}>
      <div className="card-body">
        <small>
          {!lead && <Favicon url={r.url} size={14} cachedOnly />}
          {lead ? 'Özet · Vikipedi' : hostOf(r.url)}
        </small>
        <h2>{r.title}</h2>
        {r.snippet && <p>{r.snippet}</p>}
      </div>
      {lead && r.image && <img className="disc" src={r.image} alt="" loading="lazy" decoding="async" />}
    </a>
  )
}

// AI kapalıyken ya da anahtar yokken, bulunan sonuçlardan derlenen hızlı yanıt.
function QuickAnswer({ qa, sources }) {
  const parts = qa.text.split(CITE)
  return (
    <article className="card ai rs-qa rs-in" style={{ '--i': 0 }} aria-live="polite">
      <small>
        <Sparkles size={13} /> Hızlı yanıt
      </small>
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
      <p className="rs-qa-foot">
        Sonuçlardan derlendi · AI özeti için{' '}
        <button className="link" onClick={() => setUi('settings')}>
          anahtar ekle
        </button>
      </p>
    </article>
  )
}

function KV({ x }) {
  return (
    <div className="rs-kv">
      <span className="rs-k">{x.label}</span>
      {x.url ? (
        <a className="rs-v link" href={x.url} onClick={open(x.url)} onAuxClick={open(x.url)}>
          {x.value}
        </a>
      ) : (
        <span className="rs-v">{x.value}</span>
      )}
    </div>
  )
}

// Bilgi paneli: büyük değilse Tümü'nde özet, büyükse Bilgi sekmesinde tam liste.
function InfoPanel({ f, big = false, limit = Infinity, onMore, i = 0 }) {
  const [bad, setBad] = useState(null) // yüklenemeyen görselin adresi; görsel alanı gizlenir
  const list = f.facts.slice(0, limit)
  return (
    <section className="card rs-info rs-in" style={{ '--i': i }} aria-label={f.label}>
      <div className="rs-info-top">
        {f.image && bad !== f.image && (
          <img className={big ? 'rs-info-img is-big' : 'rs-info-img'} src={f.image} alt="" loading="lazy" decoding="async" onError={() => setBad(f.image)} />
        )}
        <div className="rs-info-head">
          <h2 className="rs-info-title">{f.label}</h2>
          {f.description && <p className="rs-info-desc">{f.description}</p>}
        </div>
      </div>
      {list.length > 0 && (
        <div className="rs-grid">
          {list.map((x, k) => (
            <KV key={k} x={x} />
          ))}
        </div>
      )}
      <div className="rs-links">
        {onMore && (
          <button className="link" onClick={onMore}>
            Tümünü gör
          </button>
        )}
        {f.website && (
          <a className="link" href={f.website} onClick={open(f.website)} onAuxClick={open(f.website)}>
            {hostOf(f.website)}
          </a>
        )}
        {f.coords && (
          <button className="link rs-map" onClick={() => navigate(mapUrl(f.coords))}>
            <MapIcon size={14} /> Haritada aç
          </button>
        )}
      </div>
    </section>
  )
}

// Aynı siteden gelen sonuçlar tek kartta; fazlası açılır listede.
function Group({ g, i }) {
  const [more, setMore] = useState(false)
  const m = g.main
  return (
    <div className="card rs-group rs-in" style={{ '--i': i }}>
      <small className="rs-site">
        <Favicon url={m.url} size={14} cachedOnly />
        {g.host}
      </small>
      <a className="rs-main" href={m.url} onClick={open(m.url)} onAuxClick={open(m.url)} onPointerEnter={() => warm(m.url)} onPointerDown={() => warm(m.url)}>
        <h2>{m.title}</h2>
        {m.snippet && <p>{m.snippet}</p>}
      </a>
      {g.more?.length > 0 && (
        <>
          <button className="rs-more-btn" aria-expanded={more} onClick={() => setMore((v) => !v)}>
            {more ? 'Daha az göster' : `+${g.more.length} sonuç daha bu siteden`}
          </button>
          {more && (
            <div className="rs-sub">
              {g.more.map((r) => (
                <a key={r.url} href={r.url} onClick={open(r.url)} onAuxClick={open(r.url)}>
                  {r.title}
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Tam ekran görüntüleyici: Esc, ok tuşları, dokunmatik yatay kaydırma.
function Viewer({ list, i, setI, close }) {
  const n = list.length
  const im = list[i] || list[0]
  const touch = useRef(null)
  const dialog = useRef(null)
  const closeBtn = useRef(null)
  const nRef = useRef(n)
  nRef.current = n
  const prev = () => setI((k) => (k - 1 + n) % n)
  const next = () => setI((k) => (k + 1) % n)

  // Açılınca kapat düğmesine odaklan; kapanınca (bileşen kalkınca) önceki odak geri döner.
  useEffect(() => {
    const before = document.activeElement
    closeBtn.current?.focus()
    return () => before?.focus?.()
  }, [])

  // Klavye: tek abonelik (close useCallback ile kararlı). Tab, diyalog içinde döner (basit odak tuzağı).
  useEffect(() => {
    const trap = (e) => {
      const root = dialog.current
      const els = root ? [...root.querySelectorAll('button:not([disabled]), a[href]')] : []
      if (!els.length) return
      const first = els[0]
      const last = els[els.length - 1]
      const at = document.activeElement
      const inside = root.contains(at)
      if (e.shiftKey && (!inside || at === first)) (e.preventDefault(), last.focus())
      else if (!e.shiftKey && (!inside || at === last)) (e.preventDefault(), first.focus())
    }
    const key = (e) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowLeft') setI((k) => (k - 1 + nRef.current) % nRef.current)
      else if (e.key === 'ArrowRight') setI((k) => (k + 1) % nRef.current)
      else if (e.key === 'Tab') trap(e)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [close, setI])

  const src = im.full || im.thumb
  return (
    <div className="rs-viewer" ref={dialog} role="dialog" aria-modal="true" aria-label={im.title || 'Görsel'}>
      <div className="rs-view-top">
        <button className="rs-x" ref={closeBtn} onClick={close} aria-label="Kapat">
          <X size={20} />
        </button>
      </div>
      <div
        className="rs-view-stage"
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touch.current == null) return
          const dx = e.changedTouches[0].clientX - touch.current
          touch.current = null
          if (dx > 50) prev()
          else if (dx < -50) next()
        }}
      >
        <img key={src} className="rs-view-img" src={src} alt={im.title || ''} />
        {n > 1 && (
          <button className="rs-nav prev" onClick={prev} aria-label="Önceki">
            <ChevronLeft size={22} />
          </button>
        )}
        {n > 1 && (
          <button className="rs-nav next" onClick={next} aria-label="Sonraki">
            <ChevronRight size={22} />
          </button>
        )}
      </div>
      <div className="rs-view-cap">
        {im.title && <p className="rs-view-title">{im.title}</p>}
        <div className="rs-view-meta">
          <span>
            {i + 1} / {n}
          </span>
          {im.page && (
            <button className="link" onClick={() => navigate(im.page)}>
              Kaynağı aç <ExternalLink size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Results({ q, rev }) {
  const [s, setS] = useState({ status: 'loading' })
  const [extra, setExtra] = useState(NONE)
  const [qa, setQa] = useState(null)
  const [tab, setTab] = useState('all')
  const [viewer, setViewer] = useState(null)
  const [retry, setRetry] = useState(0)
  const aiOn = useStore((st) => st.settings.ai)
  const local = useStore((st) => st.settings.aiEngine === 'local')
  const aiOk = useStore((st) => aiReady(st.settings))
  const ok = s.status === 'ok'
  const closeViewer = useCallback(() => setViewer(null), [])

  useEffect(() => {
    const ac = new AbortController() // temizlik: sorgu/yeniden deneme değişince ya da kapanınca
    const tc = new AbortController() // 9 sn zaman aşımı
    const sig = anySignal(ac.signal, tc.signal)
    const timer = setTimeout(() => {
      tc.abort()
      setS({ status: 'error', timeout: true })
    }, SEARCH_MS)
    setS({ status: 'loading' })
    setExtra(NONE)
    setTab('all')
    setViewer(null)
    search(q, sig).then(
      (d) => {
        clearTimeout(timer)
        if (!sig.aborted) setS({ status: 'ok', ...d })
      },
      () => {
        clearTimeout(timer)
        if (!sig.aborted) setS({ status: 'error' })
      },
    )
    return () => {
      clearTimeout(timer)
      ac.abort()
    }
  }, [q, rev, retry])

  // Bilgi, görseller ve ilgili aramalar paralel gelir; her biri geldiğinde kendi bloğunda belirir.
  useEffect(() => {
    if (s.status !== 'ok') return
    const ac = new AbortController()
    const sig = ac.signal
    const put = (k, fallback) => (job) =>
      Promise.resolve()
        .then(job)
        .then(
          (v) => sig.aborted || setExtra((e) => ({ ...e, [k]: v ?? fallback })),
          () => sig.aborted || setExtra((e) => ({ ...e, [k]: fallback })),
        )
    const first = s.results[0]
    const title = s.answer?.title || (first && /tr\.wikipedia\.org/.test(first.url) ? first.title : '')
    put('facts', null)(() => (title ? facts(title, 'tr', sig) : null))
    put('images', [])(() => images(q, sig))
    put('related', [])(() => related(q, sig))
    return () => ac.abort()
  }, [s, q])

  const empty = ok && !s.answer && !s.results.length
  // AI özeti, bulunan sonuçları kaynak olarak kullanır.
  const sources = useMemo(() => (ok ? [...(s.answer ? [s.answer] : []), ...s.results].slice(0, 8) : []), [s, ok])
  const prompt = useMemo(() => (sources.length ? overviewPrompt(q, sources) : ''), [q, sources])
  const localPrompt = useMemo(() => (sources.length ? overviewPromptLocal(q, sources) : ''), [q, sources])
  const useAi = !!(aiOk && prompt)

  useEffect(() => {
    setQa(null)
    if (!ok || useAi || !sources.length) return
    let live = true
    Promise.resolve()
      .then(() => quickAnswer(q, sources))
      .then(
        (v) => live && setQa(v?.text ? v : null),
        () => {},
      )
    return () => {
      live = false
    }
  }, [s, q, ok, useAi, sources])

  const hasInfo = !!extra.facts
  const groups = useMemo(() => {
    if (!ok) return []
    const rest = s.results.filter((r) => !(hasInfo && s.answer && r.url === s.answer.url))
    return groupResults(rest)
  }, [s, ok, hasInfo])

  const cur = tab === 'info' && !hasInfo ? 'all' : tab
  const tabs = TABS.filter(([k]) => k !== 'info' || hasInfo)
  const imgs = extra.images

  const elsewhere = (
    <p className="foot">
      {ok && !s.full && !empty && 'Bunlar ansiklopedi sonuçları. '}
      Tüm web için:{' '}
      {['google', 'duckduckgo', 'bing'].map((k) => (
        <button key={k} className="link" onClick={() => navigate(engineUrl(k, q))}>
          {ENGINES[k].label}
        </button>
      ))}
    </p>
  )

  return (
    <div className="page results tex">
      <Aura kind="aurora" still />
      <div className="results-inner">
        <header className="q-head">
          <h1>{q}</h1>
          <p>
            {s.status === 'loading' && 'aranıyor'}
            {s.status === 'error' && 'bağlantı kurulamadı'}
            {ok && (empty ? 'sonuç yok' : `${s.results.length + (s.answer ? 1 : 0)} sonuç`)}
          </p>
        </header>

        {ok && (
          <div className="seg rs-tabs" role="radiogroup" aria-label="Sonuç türü">
            {tabs.map(([k, label]) => (
              <button key={k} role="radio" aria-checked={cur === k} onClick={() => setTab(k)}>
                {label}
              </button>
            ))}
          </div>
        )}

        {s.status === 'loading' && (
          <div className="stack" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="card ghost" style={{ '--i': i }} />
            ))}
          </div>
        )}

        {s.status === 'error' && (
          <div className="card rs-error rs-in" style={{ '--i': 0 }} role="alert">
            <p className="rs-err-title">Bağlantı kurulamadı</p>
            <p className="rs-err-sub">{s.timeout ? 'Arama 9 saniyede yanıt vermedi.' : 'Sonuçlar şu an alınamadı.'}</p>
            <button className="rs-retry" onClick={() => setRetry((v) => v + 1)}>
              Yeniden dene
            </button>
          </div>
        )}

        {ok && cur === 'all' && (
          // Geniş ekranda iki sütun: solda yanıt + sonuçlar, sağda bilgi paneli + ilgili aramalar.
          // Telefonda sütunlar çözülür ve bloklar sırayla akar (order ile).
          <div className="rs-all">
           <div className="rs-col main">
            <div className="rs-o1">
              {useAi && <AiCard prompt={prompt} localPrompt={localPrompt} sources={sources} maxTokens={1200} />}
              {!useAi && qa && <QuickAnswer qa={qa} sources={sources} />}
            </div>

            {imgs?.length > 0 && (
              <div className="rs-in rs-o3" style={{ '--i': 1 }}>
                <div className="rs-strip">
                  {imgs.slice(0, 10).map((im, k) => (
                    <button key={k} className="rs-thumb" onClick={() => setViewer(k)} aria-label={im.title || 'Görsel'}>
                      <img src={im.thumb} alt="" loading="lazy" decoding="async" />
                    </button>
                  ))}
                  <button className="rs-more-box" onClick={() => setTab('img')}>
                    Tümü →
                  </button>
                </div>
              </div>
            )}

            {groups.length > 0 && (
              <div className="stack rs-o4">
                {groups.map((g, k) => (
                  <Group key={g.host} g={g} i={k + 2} />
                ))}
              </div>
            )}
           </div>
           <aside className="rs-col side">
            <div className="rs-o2">
              {hasInfo ? <InfoPanel f={extra.facts} limit={8} onMore={() => setTab('info')} /> : s.answer && <Card r={s.answer} i={0} lead />}
            </div>

            {extra.related?.length > 0 && (
              <div className="rs-in rs-o5" style={{ '--i': 3 }}>
                <p className="rs-label">İlgili aramalar</p>
                <div className="rs-chips">
                  {extra.related.slice(0, 12).map((t) => (
                    <button key={t} className="rs-chip" onClick={() => navigate(t)}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}
           </aside>
          </div>
        )}

        {ok && cur === 'img' &&
          (imgs === null ? (
            <div className="rs-masonry" aria-hidden>
              {[0, 1, 2, 3, 4, 5].map((k) => (
                <div key={k} className="rs-tile rs-ph ghost" />
              ))}
            </div>
          ) : imgs.length === 0 ? (
            <p className="foot">Görsel bulunamadı.</p>
          ) : (
            <div className="rs-masonry">
              {imgs.map((im, k) => (
                <button key={k} className="rs-tile rs-in" style={{ '--i': Math.min(k, 8) }} onClick={() => setViewer(k)} aria-label={im.title || 'Görsel'}>
                  <img src={im.thumb} alt={im.title || ''} loading="lazy" decoding="async" />
                </button>
              ))}
            </div>
          ))}

        {ok && cur === 'info' && hasInfo && <InfoPanel f={extra.facts} big />}

        {s.status !== 'loading' && elsewhere}
        {ok && aiOn && !aiOk && !empty && (
          <p className="foot">
            AI özeti için{' '}
            <button className="link" onClick={() => setUi('settings')}>
              {local ? 'cihaza bir model indir' : 'bir API anahtarı ekle'}
            </button>
          </p>
        )}
      </div>

      {viewer !== null && imgs?.length > 0 && <Viewer list={imgs} i={viewer} setI={setViewer} close={closeViewer} />}
    </div>
  )
}
