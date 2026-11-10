import { useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, RotateCw, Star, SlidersHorizontal, X, BookOpen, Sparkles, Maximize, ShieldCheck, ShieldOff, Share2, Bell, Puzzle, GitBranch, BookmarkPlus, BookmarkCheck, TextSearch } from 'lucide-react'
import {
  useStore,
  back,
  forward,
  reload,
  canBack,
  canFwd,
  togglePin,
  isPinned,
  setUi,
  isWeb,
  queryOf,
  hostOf,
  openReader,
  share,
  setFull,
  shieldOn,
  toggleShieldHere,
  unreadCount,
  inReadLater,
  toggleReadLater,
} from '../store'

// Tam sayfa paneller: açıkken ada onları kapatır.
const PANELS = { settings: 'Ayarlar', github: 'GitHub', ext: 'Eklentiler', notifs: 'Bildirimler', lib: 'Kitaplık' }
import { play } from '../sound'
import { isNative } from '../native'
import Favicon from './Favicon'

const SWIPE = 56 // geri/ileri için yatay eşik (px)
const HOLD = 340 // yay menüsü için basılı tutma (ms)
const INNER = 6.1 // iç yay yarıçapı (rem): gezinme
const OUTER = 10.3 // dış yay yarıçapı (rem): sayfa araçları
const spread = (n, from, to) => Array.from({ length: n }, (_, i) => (n === 1 ? 90 : from - ((from - to) * i) / (n - 1)))

// Tek kontrol: dokun → Alan, yatay kaydır → geri/ileri, basılı tut → yay menüsü.
export default function Island({ tab, ui }) {
  const tabs = useStore((s) => s.tabs)
  const pinned = useStore((s) => isPinned(tab.url, s))
  const top = useStore((s) => s.settings.dock === 'top')
  const shield = useStore((s) => shieldOn(tab, s))
  const full = useStore((s) => s.full)
  const unread = useStore(unreadCount)
  const gh = useStore((s) => !!s.settings.ghToken)
  const saved = useStore((s) => inReadLater(tab.url, s))
  const panel = PANELS[ui]
  const ref = useRef(null)
  const g = useRef(null)
  const done = useRef(false)
  const [dx, setDx] = useState(0)
  const [hot, setHot] = useState(-1)
  const arc = ui === 'arc'
  const site = isWeb(tab.url)

  const nav = [
    { icon: ArrowLeft, label: 'Geri', run: back, on: canBack(tab) || !!tab.reader },
    { icon: ArrowRight, label: 'İleri', run: forward, on: canFwd(tab) },
    { icon: RotateCw, label: 'Yenile', run: reload, on: !!tab.url },
    { icon: Star, label: pinned ? 'Sabiti kaldır' : 'Sabitle', run: () => togglePin(tab.url, tab.title), on: site, fill: pinned },
    { icon: SlidersHorizontal, label: 'Ayarlar', run: () => setUi('settings'), on: true, keep: true },
  ]
  // Sayfa araçları yalnızca gerçekten çalışacakları yerde görünür.
  const tools = [
    isNative && site && { icon: BookOpen, label: 'Okuma modu', run: () => openReader(false), keep: true },
    isNative && site && { icon: TextSearch, label: 'Sayfada bul', run: () => setUi('find'), keep: true },
    isNative && site && { icon: Sparkles, label: 'AI özeti', run: () => openReader(true), keep: true },
    { icon: Maximize, label: 'Tam ekran', run: () => setFull(true), keep: true },
    isNative && site && { icon: shield ? ShieldCheck : ShieldOff, label: shield ? `Kalkan açık · ${tab.blocked || 0} engellendi` : 'Kalkan bu sitede kapalı', run: toggleShieldHere },
    site && { icon: saved ? BookmarkCheck : BookmarkPlus, label: saved ? 'Okuma listesinde' : 'Sonra oku', run: () => toggleReadLater(tab.url, tab.title) },
    site && { icon: Share2, label: 'Paylaş', run: share },
    { icon: Bell, label: unread ? `Bildirimler · ${unread} yeni` : 'Bildirimler', run: () => setUi('notifs'), keep: true, dot: unread > 0 },
    { icon: Puzzle, label: 'Eklentiler', run: () => setUi('ext'), keep: true },
    { icon: GitBranch, label: gh ? 'GitHub' : "GitHub'ı bağla", run: () => setUi('github'), keep: true },
  ].filter(Boolean)
  const wide = tools.length > 5

  const items = [
    ...nav.map((a, i) => ({ ...a, deg: spread(5, 160, 20)[i], r: INNER })),
    ...tools.map((a, i) => ({ ...a, on: true, deg: spread(tools.length, wide ? 164 : 142, wide ? 16 : 38)[i], r: OUTER })),
  ]

  const fire = (i) => {
    const a = items[i]
    setHot(-1)
    if (!a?.on) return setUi(null)
    if (!a.keep) setUi(null)
    a.run()
  }

  // Parmağın altındaki yay öğesini bul (öğelerin konumu geometriden hesaplanır).
  const nearest = (x, y) => {
    const r = ref.current.getBoundingClientRect()
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    let best = -1
    let bestD = 42
    items.forEach((it, i) => {
      const a = (it.deg * Math.PI) / 180
      const d = Math.hypot(x - (cx + Math.cos(a) * it.r * rem), y - (cy + Math.sin(a) * it.r * rem * (top ? 1 : -1)))
      if (d < bestD) (bestD = d), (best = i)
    })
    return best
  }

  const down = (e) => {
    if (panel || full) return
    try {
      ref.current.setPointerCapture(e.pointerId)
    } catch {}
    done.current = false
    g.current = { x: e.clientX, y: e.clientY, moved: false, wasArc: arc }
    if (!arc) g.current.timer = setTimeout(() => !g.current?.moved && setUi('arc'), HOLD)
  }
  const move = (e) => {
    const s = g.current
    if (!s) return
    const mx = e.clientX - s.x
    const my = e.clientY - s.y
    if (Math.hypot(mx, my) > 9) s.moved = true
    if (arc) {
      const n = nearest(e.clientX, e.clientY)
      if (n !== hot) setHot(n), n >= 0 && play('tick')
    } else if (s.moved) {
      clearTimeout(s.timer)
      const can = mx > 0 ? canBack(tab) || !!tab.reader : canFwd(tab)
      setDx(Math.max(-96, Math.min(96, mx)) * (can ? 1 : 0.25))
    }
  }
  const up = () => {
    const s = g.current
    if (!s) return
    g.current = null
    done.current = true
    clearTimeout(s.timer)
    if (arc) {
      if (hot >= 0) fire(hot)
      else if (s.moved || s.wasArc) setUi(null)
      return
    }
    const d = dx
    setDx(0)
    if (d >= SWIPE) back()
    else if (d <= -SWIPE) forward()
    else if (!s.moved) setUi('alan')
  }

  const q = queryOf(tab.url)
  const text =
    panel
      ? panel
      : arc
        ? hot >= 0
          ? items[hot].label
          : 'Kaydır ve bırak'
        : dx >= SWIPE
          ? 'Geri'
          : dx <= -SWIPE
            ? 'İleri'
            : tab.reader
              ? 'Okuma modu'
              : (q ?? hostOf(tab.url)) || 'Ara veya adres gir'

  if (full) {
    return (
      <div className="dock slim">
        <button className="grip" onClick={() => setFull(false)} aria-label="Tam ekrandan çık" />
      </div>
    )
  }

  return (
    <div className="dock">
      {arc && <div className="veil" onPointerDown={() => setUi(null)} />}
      {ui !== 'alan' && (
        <button
          ref={ref}
          className="island"
          data-loading={tab.loading || undefined}
          data-drag={dx ? '' : undefined}
          style={{ translate: dx ? `${dx * 0.5}px 0` : undefined }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onContextMenu={(e) => (e.preventDefault(), ui || setUi('arc'))}
          onClick={() => {
            if (panel) setUi(null)
            else if (!done.current) setUi('alan')
            done.current = false
          }}
          aria-label={panel ? `${panel} kapat` : 'Ara, sekmeler ve eylemler'}
        >
          <span className="orb" data-site={site || undefined} data-unread={unread && !site ? '' : undefined}>
            {site && <Favicon url={tab.url} size={15} />}
          </span>
          <span className="island-text" key={text}>
            {text}
          </span>
          {panel ? (
            <X size={14} className="island-x" aria-hidden />
          ) : (
            <span className="dots" aria-hidden>
              {tabs.length}
            </span>
          )}
        </button>
      )}
      {arc && (
        <div className="arc" role="menu">
          {items.map((a, i) => (
            <button
              key={a.label}
              role="menuitem"
              className="arc-item"
              style={{ '--a': `${(top ? 1 : -1) * a.deg}deg`, '--r': `${a.r}rem`, '--i': i }}
              data-hot={hot === i || undefined}
              data-outer={a.r === OUTER || undefined}
              disabled={!a.on}
              aria-label={a.label}
              onPointerEnter={() => setHot(i)}
              onPointerLeave={() => setHot(-1)}
              onClick={() => fire(i)}
            >
              <a.icon size={18} fill={a.fill ? 'currentColor' : 'none'} />
              {a.dot && <i className="arc-dot" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
