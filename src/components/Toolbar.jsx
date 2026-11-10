import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Star,
  Clock,
  Library,
  Puzzle,
  EllipsisVertical,
  Search,
  Plus,
  Ghost,
  Undo2,
  History,
  Bookmark,
  BookOpen,
  Check,
  ZoomIn,
  ZoomOut,
  Maximize,
  Share2,
  Upload,
  Settings2,
  ChevronsRight,
  ExternalLink,
  Trash2,
  CornerDownLeft,
} from 'lucide-react'
import {
  useStore,
  activeTab,
  navigate,
  back,
  forward,
  reload,
  canBack,
  canFwd,
  newTab,
  reopenClosed,
  togglePin,
  isPinned,
  toggleReadLater,
  inReadLater,
  setUi,
  setSetting,
  setZoom,
  setFull,
  share,
  hostOf,
  isWeb,
  queryOf,
  importBookmarksHtml,
  notify,
  popOpen,
  popClose,
} from '../store'
import Favicon from './Favicon'
import { useSuggestions } from '../features/suggest'
import '../features/toolbar.css'

// ≥900px: tablet ve masaüstü. Araç çubuğu yalnızca bu genişlikte çizilir.
const WIDE = '(min-width: 900px)'
const subWide = (f) => {
  const m = window.matchMedia(WIDE)
  m.addEventListener('change', f)
  return () => m.removeEventListener('change', f)
}
export const useWide = () => useSyncExternalStore(subWide, () => window.matchMedia(WIDE).matches)

// Menü dışına tıklayınca ya da Esc ile kapanır. Açıkken yerel WebView gizlenir (Android'de sayfa
// arayüzün üstünde çizildiği için menü aksi halde sayfanın altında kırpılır).
function useDismiss(open, ref, close) {
  useEffect(() => {
    if (!open) return
    popOpen()
    return popClose
  }, [open])
  useEffect(() => {
    if (!open) return
    const down = (e) => {
      if (!ref.current?.contains(e.target)) close()
    }
    const key = (e) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', down)
    window.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', down)
      window.removeEventListener('keydown', key)
    }
  }, [open, ref, close])
}

const pathOf = (u) => {
  try {
    const x = new URL(u)
    return (x.pathname === '/' ? '' : decodeURI(x.pathname)) + x.search + x.hash
  } catch {
    return ''
  }
}
const shortTitle = (p) => p.title || hostOf(p.url)

export default function Toolbar() {
  const wide = useWide()
  const on = useStore((s) => s.settings.toolbar !== false)
  const bm = useStore((s) => s.settings.bookmarksBar !== false)
  const full = useStore((s) => s.full)
  const tab = useStore(activeTab)
  if (!wide || !on || full) return null
  return (
    <div className="tb2-bar" role="toolbar" aria-label="Araç çubuğu">
      <div className="tb2-row">
        <button className="tb2-ib" onClick={() => back()} disabled={!canBack(tab) && !tab.reader} aria-label="Geri" title="Geri (Alt+←)">
          <ArrowLeft size={17} />
        </button>
        <button className="tb2-ib" onClick={() => forward()} disabled={!canFwd(tab)} aria-label="İleri" title="İleri (Alt+→)">
          <ArrowRight size={17} />
        </button>
        <button className="tb2-ib" onClick={() => reload()} disabled={!tab.url} aria-label="Yenile" title="Yenile (Ctrl+R)">
          <RotateCw size={16} />
        </button>
        <Addr tab={tab} />
        <button className="tb2-ib" onClick={() => setUi('lib')} aria-label="Kitaplık" title="Kitaplık (Ctrl+Shift+O)">
          <Library size={17} />
        </button>
        <button className="tb2-ib" onClick={() => setUi('ext')} aria-label="Eklentiler" title="Eklentiler (Alt+E)">
          <Puzzle size={17} />
        </button>
        <MoreMenu tab={tab} />
      </div>
      {bm && <BookmarkBar />}
    </div>
  )
}

// Adres alanı: görünümde host kalın, yol soluk; tıklayınca ya da odaklanınca gerçek giriş alanına döner.
function Addr({ tab }) {
  const web = isWeb(tab.url)
  const q = queryOf(tab.url)
  const pinned = useStore((s) => isPinned(tab.url, s))
  const later = useStore((s) => inReadLater(tab.url, s))
  const [edit, setEdit] = useState(false)
  const [val, setVal] = useState('')
  const [typed, setTyped] = useState(false) // yalnızca kullanıcı yazınca öneri göster (mevcut adres değil)
  const [sel, setSel] = useState(0)
  const items = useSuggestions(val, edit && typed && !!val.trim())
  const open = items.length > 0
  // Öneri listesi sayfanın üstüne açılır; Android'de yerel WebView arayüzün üstünde çizildiği için gizlenir.
  useEffect(() => {
    if (!open) return
    popOpen()
    return popClose
  }, [open])

  const begin = () => {
    setVal(q ?? tab.url ?? '')
    setTyped(false)
    setSel(0)
    setEdit(true)
  }
  const go = (it) => {
    const v = it ? (it.kind === 'site' ? it.url : it.title) : val.trim()
    setEdit(false)
    if (v) navigate(v)
  }

  if (edit)
    return (
      <div className="tb2-url" data-open={open || undefined}>
        <input
          className="tb2-input"
          autoFocus
          value={val}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          enterKeyHint="go"
          aria-label="Adres veya arama"
          aria-autocomplete="list"
          aria-expanded={open}
          onChange={(e) => (setVal(e.target.value), setTyped(true), setSel(0))}
          onFocus={(e) => e.target.select()}
          onBlur={() => setEdit(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              go(open ? items[sel] : null)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              setEdit(false)
            } else if (e.key === 'ArrowDown' && open) {
              e.preventDefault()
              setSel((i) => Math.min(i + 1, items.length - 1))
            } else if (e.key === 'ArrowUp' && open) {
              e.preventDefault()
              setSel((i) => Math.max(i - 1, 0))
            }
          }}
        />
        {open && (
          // Öneriye basarken giriş alanı odağı kaybedip kapanmasın diye pointerdown engellenir.
          <div className="tb2-sug" role="listbox" onPointerDown={(e) => e.preventDefault()}>
            {items.map((it, i) => (
              <button
                key={it.kind + (it.url || it.title)}
                className="tb2-mi"
                role="option"
                aria-selected={i === sel}
                onPointerMove={() => sel !== i && setSel(i)}
                onClick={() => go(it)}
              >
                {it.kind === 'site' ? <Favicon url={it.url} size={16} /> : it.kind === 'go' ? <CornerDownLeft size={16} /> : <Search size={16} />}
                <span className="tb2-mt">
                  <span>{it.title}</span>
                </span>
                <kbd>{it.kind === 'site' ? hostOf(it.url) : it.kind === 'go' ? 'git' : it.lead ? 'ara' : ''}</kbd>
              </button>
            ))}
          </div>
        )}
      </div>
    )

  return (
    <div className="tb2-url">
      <button className="tb2-text" onClick={begin} onFocus={begin} title={tab.url || 'Adres'}>
        {web ? <Favicon url={tab.url} size={15} /> : q != null ? <Search size={14} /> : null}
        {web ? (
          <span className="tb2-txt">
            <b>{hostOf(tab.url)}</b>
            <span>{pathOf(tab.url)}</span>
          </span>
        ) : q != null ? (
          <span className="tb2-txt tb2-q">{q}</span>
        ) : (
          <span className="tb2-ph">Arama yap veya adres gir</span>
        )}
      </button>
      {tab.incognito && <i className="tb2-tag">Gizli</i>}
      {web && (
        <span className="tb2-acts">
          <button
            className="tb2-ib sm"
            aria-pressed={pinned}
            aria-label={pinned ? 'Yer imlerinden kaldır' : 'Yer imlerine ekle'}
            title="Yer imi (Ctrl+D)"
            onClick={() => togglePin(tab.url, tab.title)}
          >
            <Star size={15} fill={pinned ? 'currentColor' : 'none'} />
          </button>
          <button
            className="tb2-ib sm"
            aria-pressed={later}
            aria-label="Sonra oku"
            title="Sonra oku"
            onClick={() => toggleReadLater(tab.url, tab.title)}
          >
            <Clock size={15} />
          </button>
        </span>
      )}
    </div>
  )
}

// Sağ taraftaki menü: kenarsız, buğulu açılır liste.
function MoreMenu({ tab }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const file = useRef(null)
  const bm = useStore((s) => s.settings.bookmarksBar !== false)
  const full = useStore((s) => s.full)
  const hasClosed = useStore((s) => s.closedTabs.length > 0)
  const web = isWeb(tab.url)
  const close = () => setOpen(false)
  useDismiss(open, ref, close)

  const run = (fn) => {
    setOpen(false)
    fn()
  }
  const pct = Math.round((tab.zoom ?? 1) * 100)

  const onFile = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      const n = importBookmarksHtml(await f.text())
      notify({ kind: 'system', title: 'Yer imleri içe aktarıldı', body: n + ' yer imi eklendi' })
    } catch {
      notify({ kind: 'system', title: 'Yer imleri içe aktarılamadı', body: 'Dosya okunamadı' })
    }
  }

  return (
    <div className="tb2-more" ref={ref}>
      <button className="tb2-ib" aria-label="Menü" aria-expanded={open} title="Menü" onClick={() => setOpen((o) => !o)}>
        <EllipsisVertical size={17} />
      </button>
      <input ref={file} type="file" accept=".html,text/html" hidden onChange={onFile} />
      {open && (
        <div className="tb2-menu" role="menu">
          <Mi icon={Plus} label="Yeni sekme" kbd="Ctrl+T" onClick={() => run(() => newTab())} />
          <Mi icon={Ghost} label="Gizli sekme" kbd="Ctrl+Shift+N" onClick={() => run(() => newTab(undefined, { incognito: true }))} />
          <Mi icon={Undo2} label="Kapatılanı geri aç" kbd="Ctrl+Shift+T" disabled={!hasClosed} onClick={() => run(reopenClosed)} />
          <Mi icon={History} label="Geçmiş" kbd="Ctrl+H" onClick={() => run(() => setUi('lib'))} />
          <Mi icon={Bookmark} label="Yer imleri çubuğu" kbd="Ctrl+Shift+B" check={bm} onClick={() => run(() => setSetting('bookmarksBar', !bm))} />
          <Mi icon={BookOpen} label="Okuma listesi" onClick={() => run(() => setUi('lib'))} />
          <div className="tb2-zoom">
            <span>Yakınlaştır</span>
            <span className="tb2-zc">
              <button className="tb2-ib sm" aria-label="Uzaklaştır" onClick={() => setZoom(-0.1)}>
                <ZoomOut size={15} />
              </button>
              <button className="tb2-zp" onClick={() => setZoom('reset')} title="Sıfırla (Ctrl+0)">
                {pct}%
              </button>
              <button className="tb2-ib sm" aria-label="Yakınlaştır" onClick={() => setZoom(0.1)}>
                <ZoomIn size={15} />
              </button>
            </span>
          </div>
          <Mi icon={Search} label="Sayfada bul" kbd="Ctrl+F" onClick={() => run(() => setUi('find'))} />
          <Mi icon={Share2} label="Paylaş" disabled={!web} onClick={() => run(() => share())} />
          <Mi icon={Maximize} label="Tam ekran" kbd="F11" onClick={() => run(() => setFull(!full))} />
          <Mi
            icon={Upload}
            label="Chrome yer imlerini içe aktar…"
            sub="Chrome → Yer imleri → Yer imi yöneticisi → ⋮ → Yer imlerini dışa aktar"
            onClick={() => {
              setOpen(false)
              file.current?.click()
            }}
          />
          <Mi icon={Settings2} label="Ayarlar" kbd="Ctrl+," onClick={() => run(() => setUi('settings'))} />
        </div>
      )}
    </div>
  )
}

function Mi({ icon: Icon, label, kbd, sub, disabled, check, onClick }) {
  return (
    <button className="tb2-mi" role="menuitem" disabled={disabled} onClick={onClick}>
      <Icon size={16} />
      <span className="tb2-mt">
        <span>{label}</span>
        {sub && <small>{sub}</small>}
      </span>
      {check && <Check size={15} className="tb2-ck" />}
      {kbd && <kbd>{kbd}</kbd>}
    </button>
  )
}

// Yer imleri çubuğu: sığmayanlar sağdaki » listesinde. Genişlik ölçümü önbelleğe alınır.
const GAP = 4 // chip'ler arası boşluk (px)
const MORE = 36 // » düğmesi için ayrılan alan (px)
const GUESS = 130 // henüz ölçülmemiş chip için tahmin (px)
function BookmarkBar() {
  const pins = useStore((s) => s.pins)
  const [n, setN] = useState(pins.length)
  const [more, setMore] = useState(false)
  const [ctx, setCtx] = useState(null) // { p, x, y } — sağ tık menüsü (bar koordinatları)
  const chips = useRef(null)
  const bar = useRef(null)
  const moreRef = useRef(null)
  const ctxRef = useRef(null)
  const cache = useRef({})
  useDismiss(more, moreRef, () => setMore(false))
  useDismiss(!!ctx, ctxRef, () => setCtx(null))

  useLayoutEffect(() => {
    const el = chips.current
    if (!el) return
    const fit = () => {
      el.querySelectorAll('[data-url]').forEach((c) => {
        cache.current[c.dataset.url] = c.offsetWidth + GAP
      })
      const avail = el.clientWidth
      const w = pins.map((p) => cache.current[p.url] ?? GUESS + GAP)
      let k = pins.length
      if (w.reduce((a, b) => a + b, 0) > avail) {
        let acc = 0
        k = 0
        for (const x of w) {
          if (acc + x + MORE > avail) break
          acc += x
          k++
        }
      }
      setN(k)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [pins])

  const openCtx = (e, p) => {
    e.preventDefault()
    const r = bar.current.getBoundingClientRect()
    setCtx({ p, x: e.clientX - r.left, y: e.clientY - r.top })
  }

  return (
    <div className="tb2-bm" ref={bar}>
      <div className="tb2-chips" ref={chips}>
        {pins.slice(0, n).map((p) => (
          <button
            key={p.url}
            data-url={p.url}
            className="tb2-chip"
            title={p.url}
            onClick={() => navigate(p.url)}
            onMouseDown={(e) => e.button === 1 && e.preventDefault()}
            onAuxClick={(e) => e.button === 1 && newTab(p.url)}
            onContextMenu={(e) => openCtx(e, p)}
          >
            <Favicon url={p.url} size={14} />
            <span>{shortTitle(p)}</span>
          </button>
        ))}
        {!pins.length && <span className="tb2-hint">Yer imi yok: adres çubuğundaki yıldızla ekleyebilirsin</span>}
      </div>
      {pins.length > n && (
        <div className="tb2-more" ref={moreRef}>
          <button className="tb2-chip tb2-chev" aria-label="Sığmayan yer imleri" aria-expanded={more} onClick={() => setMore((m) => !m)}>
            <ChevronsRight size={14} />
          </button>
          {more && (
            <div className="tb2-menu tb2-list" role="menu">
              {pins.slice(n).map((p) => (
                <button
                  key={p.url}
                  className="tb2-mi"
                  role="menuitem"
                  onClick={() => {
                    setMore(false)
                    navigate(p.url)
                  }}
                >
                  <Favicon url={p.url} size={14} />
                  <span className="tb2-mt">
                    <span>{shortTitle(p)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {ctx && (
        <div className="tb2-menu tb2-ctx" role="menu" ref={ctxRef} style={{ left: ctx.x, top: ctx.y + 4 }}>
          <button
            className="tb2-mi"
            role="menuitem"
            onClick={() => {
              setCtx(null)
              newTab(ctx.p.url)
            }}
          >
            <ExternalLink size={15} />
            <span className="tb2-mt">
              <span>Yeni sekmede aç</span>
            </span>
          </button>
          <button
            className="tb2-mi"
            role="menuitem"
            onClick={() => {
              setCtx(null)
              togglePin(ctx.p.url)
            }}
          >
            <Trash2 size={15} />
            <span className="tb2-mt">
              <span>Kaldır</span>
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
