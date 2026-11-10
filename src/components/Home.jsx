import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Check, X } from 'lucide-react'
import { useStore, navigate, togglePin, addPin, warm, setSetting, updatePin, newTab, hostOf } from '../store'
import { play } from '../sound'
import Aura from './Aura'
import Favicon from './Favicon'

const Widgets = lazy(() => import('../features/Widgets'))

const greeting = (h) => (h < 6 ? 'İyi geceler' : h < 12 ? 'Günaydın' : h < 18 ? 'İyi günler' : 'İyi akşamlar')
const two = (n) => String(n).padStart(2, '0')
const HOLD_MS = 550
const HOLD_SLOP = 8 // bu kadar piksel hareket basılı tutmayı iptal eder

function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let id
    const tick = () => {
      setNow(new Date())
      id = setTimeout(tick, 60000 - (Date.now() % 60000) + 50)
    }
    id = setTimeout(tick, 60000 - (Date.now() % 60000) + 50)
    return () => clearTimeout(id)
  }, [])
  return now
}

// Sabit ekleme: "+" yerinde açılan tek satırlık giriş. Geçersiz adreste titrer ve ipucu gösterir.
function AddPin({ i, onBad }) {
  const [open, setOpen] = useState(false)
  const [v, setV] = useState('')
  const box = useRef(null)
  const done = () => {
    if (!v.trim()) {
      setV('')
      setOpen(false)
      return
    }
    if (addPin(v)) {
      setV('')
      setOpen(false)
      onBad(false)
      return
    }
    onBad(true)
    box.current?.animate?.(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }],
      { duration: 320, easing: 'ease-out' },
    )
  }
  if (!open)
    return (
      <button className="pinorb add" style={{ '--d': 0, '--i': i }} onClick={() => setOpen(true)} aria-label="Kısayol ekle">
        <b>
          <Plus size={18} />
        </b>
        <span>Ekle</span>
      </button>
    )
  return (
    <form className="pin-add" onSubmit={(e) => (e.preventDefault(), done())}>
      <input
        ref={box}
        autoFocus
        value={v}
        onChange={(e) => (setV(e.target.value), onBad(false))}
        onBlur={() => !v && setOpen(false)}
        placeholder="site.com"
        spellCheck={false}
        aria-label="Kısayol adresi"
      />
      <button type="submit" aria-label="Ekle">
        <Check size={16} />
      </button>
    </form>
  )
}

// Dar ekranda (telefon) widget'lar ayrı bir sayfada: yatay kaydırılır, uzun dikey kaydırma yok.
const mq = window.matchMedia('(max-width: 700px)')
function useNarrow() {
  const [n, setN] = useState(mq.matches)
  useEffect(() => {
    const f = () => setN(mq.matches)
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [])
  return n
}

// Sabit eylem menüsü (basılı tut / sağ tık).
const MENU_W = 220
const MENU_H = 180
const menuItem = {
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  minHeight: 40,
  padding: '0 0.8rem',
  border: 0,
  borderRadius: 'var(--r-sm)',
  background: 'none',
  color: 'var(--text)',
  font: 'inherit',
  fontSize: '0.875rem',
  textAlign: 'left',
  cursor: 'pointer',
}

export default function Home() {
  const s = useStore((st) => st.settings)
  const pins = useStore((st) => st.pins)
  const fresh = useStore((st) => st.history.length === 0)
  const now = useNow()
  const narrow = useNarrow()
  const [pane, setPane] = useState(0)
  const [addBad, setAddBad] = useState(false)
  const [menu, setMenu] = useState(null) // { url, title, left, top, rename, draft }
  const ref = useRef(null)
  const menuRef = useRef(null)
  const press = useRef({ t: 0, x: 0, y: 0, hold: false })
  const shown = pins.slice(0, s.pinCount)
  const mid = (shown.length - (shown.length < s.pinCount ? 0 : 1)) / 2
  const pager = narrow && s.widgets.length > 0
  const go = (i) => ref.current?.scrollTo({ left: i * ref.current.clientWidth, behavior: 'smooth' })
  // Yeni widget eklenince telefonda widget sayfasına kendiliğinden kayılır.
  const count = useRef(s.widgets.length)
  useEffect(() => {
    if (pager && s.widgets.length > count.current) requestAnimationFrame(() => go(1))
    count.current = s.widgets.length
  }, [s.widgets.length, pager])

  // Menü dışına dokunulunca ya da Esc'e basılınca kapanır.
  const menuOpen = menu !== null
  useEffect(() => {
    if (!menuOpen) return
    const out = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenu(null)
    }
    const esc = (e) => {
      if (e.key === 'Escape') setMenu(null)
    }
    document.addEventListener('pointerdown', out)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', out)
      document.removeEventListener('keydown', esc)
    }
  }, [menuOpen])

  // Menü, sabitin üstüne ya da altına yerleşir; ekran dışına taşmaz.
  const openMenu = (p, el) => {
    const r = el.getBoundingClientRect()
    const left = Math.min(Math.max(8, r.left + r.width / 2 - MENU_W / 2), window.innerWidth - MENU_W - 8)
    const below = r.bottom + 8
    const top = below + MENU_H < window.innerHeight ? below : Math.max(8, r.top - 8 - MENU_H)
    setMenu({ url: p.url, title: p.title, left, top, rename: false, draft: p.title || hostOf(p.url) })
  }

  // Basılı tutma: 550 ms sonra menü; parmak 8 px'den fazla kayarsa iptal.
  const holdStart = (p, e) => {
    if (e.button !== 0) return
    const pr = press.current
    clearTimeout(pr.t)
    pr.hold = false
    pr.x = e.clientX
    pr.y = e.clientY
    const el = e.currentTarget
    pr.t = setTimeout(() => {
      pr.hold = true
      if (s.haptics && navigator.vibrate) navigator.vibrate(12)
      openMenu(p, el)
    }, HOLD_MS)
  }
  const holdMove = (e) => {
    const pr = press.current
    if (Math.hypot(e.clientX - pr.x, e.clientY - pr.y) > HOLD_SLOP) clearTimeout(pr.t)
  }
  const holdEnd = () => clearTimeout(press.current.t)
  // Basılı tutmadan sonra gelen tıklama yok sayılır.
  const pinClick = (p) => {
    if (press.current.hold) {
      press.current.hold = false
      return
    }
    navigate(p.url)
  }

  const saveName = () => {
    updatePin(menu.url, { title: menu.draft.trim() || hostOf(menu.url) })
    setMenu(null)
  }

  const main = (
    <>
      <header className="home-head">
        <p className="hello">
          {greeting(now.getHours())}
          {s.name && <em>, {s.name}</em>}
        </p>
        {s.clock ? (
          <h1 className="clock" data-style={s.clockStyle} aria-label={`Saat ${two(now.getHours())}:${two(now.getMinutes())}`}>
            {two(now.getHours())}
            <span>{two(now.getMinutes())}</span>
          </h1>
        ) : (
          <h1 className="lead">bugün neyi keşfediyoruz?</h1>
        )}
        <p className="date">{now.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </header>

      <div className="pins" data-shape={s.pinShape}>
        {shown.map((p, i) => (
          <button
            key={p.url}
            className="pinorb"
            style={{ '--d': i - mid, '--i': i }}
            onClick={() => pinClick(p)}
            onPointerEnter={() => warm(p.url)}
            onPointerDown={(e) => (warm(p.url), holdStart(p, e))}
            onPointerMove={holdMove}
            onPointerUp={holdEnd}
            onPointerLeave={holdEnd}
            onPointerCancel={holdEnd}
            onContextMenu={(e) => (e.preventDefault(), openMenu(p, e.currentTarget))}
            title={`${p.title} — basılı tut ya da sağ tıkla: eylemler`}
          >
            <b>
              <Favicon url={p.url} size={20} />
            </b>
            <span>{p.title}</span>
          </button>
        ))}
        {shown.length < s.pinCount && <AddPin i={shown.length} onBad={setAddBad} />}
      </div>
      {addBad && (
        <p className="hint" role="status">
          Geçerli bir adres yaz
        </p>
      )}
      {fresh && <p className="hint">adaya dokun: ara · kaydır: geri, ileri · basılı tut: eylemler</p>}
    </>
  )
  const side = (
    <>
      {s.widgets.length > 0 && (
        <Suspense fallback={null}>
          <Widgets />
        </Suspense>
      )}
      <AddWidget have={s.widgets} />
    </>
  )

  return (
    <div className="page home tex" data-align={s.homeAlign} data-wall={s.wallpaper ? '' : undefined}>
      {s.wallpaper ? <div className="wall" style={{ backgroundImage: `url(${s.wallpaper})`, '--dim': s.wallDim / 100 }} /> : <Aura />}
      {pager ? (
        <>
          <div
            className="home-pager"
            ref={ref}
            onScroll={(e) => {
              const i = Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth)
              if (i !== pane) setPane(i)
            }}
          >
            <section className="home-inner home-pane">{main}</section>
            <section className="home-inner home-pane side">{side}</section>
          </div>
          <div className="pager-dots" role="tablist">
            {['Ana', 'Widget'].map((l, i) => (
              <button key={l} role="tab" aria-selected={pane === i} aria-label={l} onClick={() => go(i)} />
            ))}
          </div>
        </>
      ) : (
        <div className="home-inner" data-split={s.widgets.length > 0 || undefined}>
          <div className="home-main">{main}</div>
          <aside className="home-side">{side}</aside>
        </div>
      )}
      {menu &&
        createPortal(
          <div
            ref={menuRef}
            className="card"
            role="menu"
            aria-label={`${menu.title} eylemleri`}
            style={{ position: 'fixed', left: menu.left, top: menu.top, width: MENU_W, zIndex: 60, padding: 6, display: 'flex', flexDirection: 'column', gap: 2 }}
          >
            {menu.rename ? (
              <form style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 4 }} onSubmit={(e) => (e.preventDefault(), saveName())}>
                <input
                  className="text"
                  autoFocus
                  value={menu.draft}
                  onChange={(e) => setMenu({ ...menu, draft: e.target.value })}
                  aria-label="Yeni ad"
                  style={{ flex: 1, minWidth: 0, height: 40 }}
                />
                <button type="submit" aria-label="Kaydet" style={{ ...menuItem, width: 40, padding: 0, justifyContent: 'center', flex: 'none' }}>
                  <Check size={18} />
                </button>
              </form>
            ) : (
              <>
                <button
                  role="menuitem"
                  style={menuItem}
                  onClick={() => (togglePin(menu.url, menu.title), setMenu(null))}
                >
                  Kaldır
                </button>
                <button role="menuitem" style={menuItem} onClick={() => setMenu({ ...menu, rename: true })}>
                  Yeniden adlandır
                </button>
                <button
                  role="menuitem"
                  style={menuItem}
                  onClick={() => (newTab(menu.url), setMenu(null))}
                >
                  Yeni sekmede aç
                </button>
              </>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}

// Hiçbir şey kendiliğinden gelmez: widget'ı kullanıcı buradan ekler.
const WIDGET_NAMES = { weather: 'Hava durumu', focus: 'Odak sayacı', notes: 'Notlar', date: 'Takvim', stats: 'İstatistik', github: 'GitHub' }
function AddWidget({ have }) {
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const left = Object.entries(WIDGET_NAMES).filter(([k]) => !have.includes(k))
  // Açıkken dışarı dokunmak ya da Esc listeyi kapatır.
  useEffect(() => {
    if (!open) return
    const out = (e) => box.current && !box.current.contains(e.target) && setOpen(false)
    const esc = (e) => e.key === 'Escape' && (e.preventDefault(), setOpen(false))
    document.addEventListener('pointerdown', out)
    window.addEventListener('keydown', esc)
    return () => (document.removeEventListener('pointerdown', out), window.removeEventListener('keydown', esc))
  }, [open])
  if (!left.length) return null
  return (
    <div className="wadd" ref={box}>
      {open ? (
        <div className="wadd-list" role="menu">
          {left.map(([k, label], i) => (
            <button
              key={k}
              role="menuitem"
              className="wadd-chip"
              style={{ '--i': i }}
              onClick={() => {
                setSetting('widgets', [...have, k])
                play('open')
                setOpen(false) // seçim yapılınca liste kapanır; yeniden yalnızca "+ Widget" ile açılır
              }}
            >
              <Plus size={13} /> {label}
            </button>
          ))}
          <button className="wadd-chip ghost" onClick={() => setOpen(false)} aria-label="Kapat">
            <X size={13} />
          </button>
        </div>
      ) : (
        <button className="wadd-open" onClick={() => (setOpen(true), play('tap'))}>
          <Plus size={14} /> Widget
        </button>
      )}
    </div>
  )
}
