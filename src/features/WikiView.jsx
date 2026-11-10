import { useEffect, useMemo, useRef, useState } from 'react'
import { navigate, newTab } from '../store'
import Aura from '../components/Aura'
import './wiki.css'

// Vikipedi madde adresini çözer. Ad alanlı sayfalar (Özel:, Dosya:, Kategori:, ...) kapsam dışıdır.
const SKIP_NS = /^(special|özel|dosya|file|kategori|category|vikipedi|wikipedia|talk|tartışma):/i

export const wikiTarget = (url) => {
  let u
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const m = /^([a-z]{2,3}(?:-[a-z0-9]+)*)\.(?:m\.)?wikipedia\.org$/.exec(u.hostname)
  if (!m || m[1] === 'www' || !u.pathname.startsWith('/wiki/')) return null
  let title
  try {
    title = decodeURIComponent(u.pathname.slice('/wiki/'.length)).trim()
  } catch {
    return null
  }
  if (!title || SKIP_NS.test(title)) return null
  let hash = ''
  try {
    hash = decodeURIComponent(u.hash.slice(1))
  } catch {
    hash = u.hash.slice(1)
  }
  return { lang: m[1], title, hash }
}

// Sayfa adını karşılaştırma için normalize eder (boşluk = alt çizgi).
const norm = (t) => t.replace(/ /g, '_')
const pageOf = (u) => {
  try {
    return norm(decodeURIComponent(u.pathname.slice('/wiki/'.length)))
  } catch {
    return null
  }
}

// Sayfadaki bağlantıyı mutlak adrese çevirir. Aynı maddedeki #bölüm bağlantıları yerel kalır.
function resolveHref(h, lang, title) {
  if (h.startsWith('#')) return h
  let u
  try {
    u = new URL(h, `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`)
  } catch {
    return null
  }
  if (u.hostname.replace('.m.', '.') === `${lang}.wikipedia.org` && pageOf(u) === norm(title)) {
    if (!u.hash) return '#'
    try {
      return '#' + decodeURIComponent(u.hash.slice(1))
    } catch {
      return u.hash
    }
  }
  return u.href
}

const textOf = (html) => {
  try {
    return new DOMParser().parseFromString(html, 'text/html').body.textContent.trim()
  } catch {
    return ''
  }
}

// REST HTML'ini temizler: betik/stil/gezinme/kutu gibi öğeleri atar, bağlantı ve görselleri düzeltir.
function prepare(html, lang, title) {
  const root = new DOMParser().parseFromString(html, 'text/html').body

  root
    .querySelectorAll(
      'script, style, link, meta, .mw-editsection, .navbox, .metadata, .ambox, .mbox-small, .noprint, [role=navigation]',
    )
    .forEach((n) => n.remove())

  root.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) {
      if (/^on/i.test(a.name) || a.name === 'style') el.removeAttribute(a.name)
    }
  })

  root.querySelectorAll('a[href]').forEach((a) => {
    const h = a.getAttribute('href').trim()
    if (/^javascript:/i.test(h)) return a.removeAttribute('href')
    const next = resolveHref(h, lang, title)
    if (next == null) return a.removeAttribute('href')
    a.setAttribute('href', next)
  })

  root.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src')
    if (src && src.startsWith('//')) img.setAttribute('src', 'https:' + src)
    const ss = img.getAttribute('srcset')
    if (ss) img.setAttribute('srcset', ss.replace(/(^|,\s*)\/\//g, '$1https://'))
    img.setAttribute('loading', 'lazy')
    img.setAttribute('decoding', 'async')
  })

  root.querySelectorAll('table').forEach((t) => {
    const w = root.ownerDocument.createElement('div')
    w.className = 'wk-tblwrap' + (t.classList.contains('infobox') ? ' wk-infobox' : '')
    t.replaceWith(w)
    w.appendChild(t)
  })

  const toc = []
  root.querySelectorAll('h2').forEach((h, i) => {
    const id = h.id || `wk-s${i}`
    h.id = id
    const text = h.textContent.trim()
    if (text) toc.push({ id, text })
  })

  return { body: root.innerHTML, toc }
}

const SKEL_WIDTHS = [92, 88, 95, 70, 90, 56]

export default function WikiView({ url }) {
  const target = useMemo(() => wikiTarget(url), [url])
  const [state, setState] = useState(null)
  const scrollRef = useRef(null)
  const bodyRef = useRef(null)

  // Madde verisini çek. Adres değişince öncekini iptal eder.
  useEffect(() => {
    const t = wikiTarget(url)
    if (!t) return
    const ac = new AbortController()
    const base = `https://${t.lang}.wikipedia.org/api/rest_v1/page`
    const enc = encodeURIComponent(t.title)
    if (scrollRef.current) scrollRef.current.scrollTop = 0

    Promise.all([
      fetch(`${base}/html/${enc}`, { signal: ac.signal }).then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.text()
      }),
      fetch(`${base}/summary/${enc}`, { signal: ac.signal })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([html, sum]) => {
        if (ac.signal.aborted) return
        const { body, toc } = prepare(html, t.lang, t.title)
        setState({
          key: url,
          status: 'ok',
          body,
          toc,
          displayTitle: sum?.displaytitle ? textOf(sum.displaytitle) || t.title : t.title,
          description: sum?.description || '',
          thumb: sum?.thumbnail?.source || '',
        })
      })
      .catch(() => {
        if (!ac.signal.aborted) setState({ key: url, status: 'error' })
      })

    return () => ac.abort()
  }, [url])

  const cur = state && state.key === url ? state : null
  const ready = !!cur && cur.status === 'ok'

  // Bölüme kaydır. Kimlik yoksa sayfa başına döner.
  const jumpTo = (id, smooth = true) => {
    const behavior = smooth ? 'smooth' : 'auto'
    if (!id) return scrollRef.current?.scrollTo({ top: 0, behavior })
    const root = bodyRef.current
    if (!root) return
    const el = [...root.querySelectorAll('[id]')].find((n) => n.id === id)
    el?.scrollIntoView({ behavior, block: 'start' })
  }

  // Adreste #bölüm varsa yüklemeden sonra oraya kaydır.
  useEffect(() => {
    if (ready && target?.hash) jumpTo(target.hash, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, url])

  const onClick = (e) => {
    const a = e.target.closest?.('a[href]')
    if (!a) return
    const h = a.getAttribute('href')
    if (!/^(#|https?:)/i.test(h)) return
    e.preventDefault()
    if (h.startsWith('#')) return jumpTo(h.slice(1))
    const next = wikiTarget(h)
    if (next) {
      if (target && next.lang === target.lang && next.title === target.title) return jumpTo(next.hash)
      return navigate(h)
    }
    newTab(h)
  }

  const openRaw = () => {
    const raw = url.split('#')[0]
    newTab(raw + (raw.includes('?') ? '&' : '?') + 'anfo=raw')
  }

  const failed = !target || (cur && cur.status === 'error')

  return (
    <div className="page wiki tex">
      <Aura kind="aurora" still />
      <div className="results-inner wk-inner" ref={scrollRef}>
        <div className="wk-col">
          {failed ? (
            <section className="wk-error">
              <header className="wk-head">
                <div className="wk-hgroup">
                  <h1 className="wk-title">Madde yüklenemedi</h1>
                </div>
              </header>
              <div className="wk-error-row">
                <button type="button" className="wk-raw" onClick={openRaw}>
                  Orijinal sayfayı aç
                </button>
              </div>
            </section>
          ) : !ready ? (
            <div className="wk-skel" aria-busy="true" aria-label="Yükleniyor">
              <div className="wk-line wk-line-title ghost" />
              {SKEL_WIDTHS.map((w, i) => (
                <div key={i} className="wk-line ghost" style={{ '--i': i + 1, width: `${w}%` }} />
              ))}
            </div>
          ) : (
            <>
              <header className="wk-head">
                <div className="wk-hgroup">
                  <p className="wk-meta">{target.lang} · Vikipedi</p>
                  <h1 className="wk-title">{cur.displayTitle}</h1>
                  {cur.description && <p className="wk-desc">{cur.description}</p>}
                </div>
                {cur.thumb && <img className="wk-thumb" src={cur.thumb} alt="" loading="lazy" decoding="async" />}
              </header>

              {cur.toc.length > 0 && (
                <details className="wk-toc">
                  <summary>İçindekiler</summary>
                  <ol>
                    {cur.toc.map((s) => (
                      <li key={s.id}>
                        <button type="button" className="wk-toc-item" onClick={() => jumpTo(s.id)}>
                          {s.text}
                        </button>
                      </li>
                    ))}
                  </ol>
                </details>
              )}

              <div className="wk-raw-row">
                <button type="button" className="wk-raw" onClick={openRaw}>
                  Orijinal sayfayı aç
                </button>
              </div>

              <article
                ref={bodyRef}
                className="prose wk-body"
                onClick={onClick}
                dangerouslySetInnerHTML={{ __html: cur.body }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
