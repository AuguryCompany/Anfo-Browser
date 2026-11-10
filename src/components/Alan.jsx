import { useEffect, useRef, useState } from 'react'
import { Plus, X, Search, CornerDownLeft, Settings2, Bell, Puzzle, Library } from 'lucide-react'
import { useStore, navigate, setUi, selectTab, closeTab, newTab, activeTab, isWeb, queryOf, hostOf, labelOf, takeSeed } from '../store'
import { useSuggestions } from '../features/suggest'
import { play } from '../sound'
import Aura from './Aura'
import Favicon from './Favicon'
import '../features/tabs.css'

// Bir sekme satırı: dokunma seçer, X kapatır, sola kaydırma (70px eşik) da kapatır.
function WheelRow({ t }) {
  const [dx, setDx] = useState(0)
  const [drag, setDrag] = useState(false)
  const st = useRef(null) // { x, id } — basılı parmak/fare
  const moved = useRef(false) // hareket ettiyse tık seçimi yapılmaz
  const dxRef = useRef(0)
  const put = (v) => ((dxRef.current = v), setDx(v))

  const down = (e) => {
    if (e.button > 0) return
    st.current = { x: e.clientX, id: e.pointerId }
    moved.current = false
  }
  const move = (e) => {
    const s = st.current
    if (!s) return
    if (!moved.current) {
      if (Math.abs(e.clientX - s.x) < 6) return
      moved.current = true
      setDrag(true)
      e.currentTarget.setPointerCapture?.(s.id)
    }
    put(Math.max(Math.min(0, e.clientX - s.x), -200))
  }
  const end = (cancel) => {
    if (!st.current) return
    st.current = null
    setDrag(false)
    if (!cancel && dxRef.current <= -70) return closeTab(t.id)
    put(0)
  }

  const label = labelOf(t)
  return (
    <div
      className="wheel-row"
      data-drag={drag || undefined}
      style={{ translate: `${dx}px 0`, opacity: 1 - Math.min(0.7, -dx / 140) }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={() => end(false)}
      onPointerCancel={() => end(true)}
    >
      <button
        className="wheel-x"
        aria-label={`${label} sekmesini kapat`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => (e.stopPropagation(), closeTab(t.id))}
      >
        <X size={15} />
      </button>
      <button className="wheel-main" onClick={() => !moved.current && selectTab(t.id)}>
        <span>{label}</span>
        <b data-asleep={t.asleep || undefined}>{isWeb(t.url) ? <Favicon url={t.url} size={18} /> : queryOf(t.url) != null ? <Search size={16} /> : <i className="mote" />}</b>
      </button>
    </div>
  )
}

// Sekmeler bir yay üzerinde döner; ortadaki öğe seçilidir (kaydırma CSS ile, JS yalnızca "tık" için).
function Wheel() {
  const tabs = useStore((s) => s.tabs)
  const activeId = useStore((s) => s.activeId)
  const ref = useRef(null)
  const [center, setCenter] = useState(() => Math.max(0, tabs.findIndex((t) => t.id === activeId)))
  const raf = useRef(0)
  const c = Math.min(center, tabs.length)

  const itemH = () => ref.current.firstElementChild.offsetHeight
  useEffect(() => {
    ref.current.scrollTop = center * itemH()
  }, [])

  const onScroll = () => {
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => {
      const el = ref.current
      if (!el) return
      const i = Math.max(0, Math.min(tabs.length, Math.round(el.scrollTop / itemH())))
      if (i !== center) setCenter(i), play('tick')
    })
  }

  return (
    <div className="wheel" ref={ref} onScroll={onScroll} style={{ '--wheel-h': `min(42dvh, ${(tabs.length + 2) * 4.1}rem)` }}>
      {tabs.map((t, i) => (
        <div key={t.id} className="wheel-item" data-center={i === c || undefined} data-active={t.id === activeId || undefined}>
          <WheelRow t={t} />
        </div>
      ))}
      <div className="wheel-item" data-center={center === tabs.length || undefined}>
        <button className="wheel-main" onClick={() => newTab()}>
          <span>Yeni sekme</span>
          <b>
            <Plus size={17} />
          </b>
        </button>
      </div>
    </div>
  )
}

export default function Alan() {
  const tab = useStore(activeTab)
  const pins = useStore((s) => s.pins)
  const history = useStore((s) => s.history)
  const [seeded] = useState(takeSeed)
  const auto = !tab.url || !!seeded || window.matchMedia('(pointer: fine)').matches
  const initial = isWeb(tab.url) ? tab.url : queryOf(tab.url) || ''
  const [q, setQ] = useState(seeded || initial)
  const [dirty, setDirty] = useState(!!seeded)
  const [sel, setSel] = useState(0)
  const term = q.trim()
  const typing = dirty && !!term
  const items = useSuggestions(q, typing)

  const go = (it) => navigate(it ? (it.kind === 'site' ? it.url : it.title) : q)
  const onKey = (e) => {
    if (e.key === 'ArrowDown') e.preventDefault(), setSel((s) => Math.min(s + 1, items.length - 1))
    else if (e.key === 'ArrowUp') e.preventDefault(), setSel((s) => Math.max(s - 1, 0))
    else if (e.key === 'Enter') e.preventDefault(), go(items[sel])
  }

  return (
    <div className="alan tex" onPointerDown={(e) => e.target === e.currentTarget && setUi(null)}>
      <Aura kind="aurora" still />
      <div className="alan-in">
        <input
          autoFocus={auto}
          value={q}
          onFocus={(e) => !seeded && e.target.select()}
          onChange={(e) => (setQ(e.target.value), setDirty(true), setSel(0))}
          onKeyDown={onKey}
          placeholder="Ara veya adres gir"
          aria-label="Ara veya adres gir"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
        />
      </div>

      {typing ? (
        <ul className="stack ideas">
          {items.map((it, i) => (
            <li key={it.kind + (it.url || it.title)} style={{ '--i': i }}>
              <button className={it.lead ? 'card idea lead' : 'card idea'} data-active={i === sel || undefined} onPointerMove={() => sel !== i && setSel(i)} onClick={() => go(it)}>
                {it.kind === 'site' ? <Favicon url={it.url} size={16} /> : it.kind === 'go' ? <CornerDownLeft size={16} /> : <Search size={16} />}
                <span>{it.title}</span>
                <small>{it.kind === 'site' ? hostOf(it.url) : it.kind === 'go' ? 'git' : it.lead ? 'ara' : ''}</small>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <div className="alan-tabs">
            <TabsHead />
            <Wheel />
          </div>
          <Recent pins={pins} history={history} />
        </>
      )}
      <button className="alan-x" onClick={() => setUi(null)} aria-label="Kapat">
        <X size={18} />
      </button>
    </div>
  )
}

// Çarkın üstündeki başlık: saate göre selamlama değil, burada ne olduğunu söyler.
function TabsHead() {
  const n = useStore((s) => s.tabs.length)
  const incog = useStore((s) => s.tabs.filter((t) => t.incognito).length)
  return (
    <div className="alan-tabs-head">
      <h2>Sekmeler</h2>
      <p>
        {n} açık sekme{incog ? ` · ${incog} gizli` : ''} · dokun: geç · sola kaydır: kapat
      </p>
    </div>
  )
}

// Arama boşken: son ziyaretler, kısayollar ve hızlı eylemler (boş ekran yerine).
function Recent({ pins, history }) {
  const recent = history.filter((h) => isWeb(h.url)).slice(0, 5)
  const searches = history.filter((h) => queryOf(h.url) != null).slice(0, 4)
  const actions = [
    { icon: Plus, label: 'Yeni sekme', run: () => newTab() },
    { icon: Library, label: 'Kitaplık', run: () => setUi('lib') },
    { icon: Settings2, label: 'Ayarlar', run: () => setUi('settings') },
    { icon: Bell, label: 'Bildirimler', run: () => setUi('notifs') },
    { icon: Puzzle, label: 'Eklentiler', run: () => setUi('ext') },
  ]
  return (
    <div className="alan-more">
      {pins.length > 0 && (
        <section>
          <p className="alan-h">Kısayollar</p>
          <div className="alan-pins">
            {pins.slice(0, 8).map((p, i) => (
              <button key={p.url} className="alan-pin" style={{ '--i': i }} onClick={() => navigate(p.url)}>
                <Favicon url={p.url} size={16} />
                <span>{p.title}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {recent.length > 0 && (
        <section>
          <p className="alan-h">Son ziyaretler</p>
          <div className="stack">
            {recent.map((h, i) => (
              <button key={h.url} className="card idea" style={{ '--i': i }} onClick={() => navigate(h.url)}>
                <Favicon url={h.url} size={16} />
                <span>{h.title || hostOf(h.url)}</span>
                <small>{hostOf(h.url)}</small>
              </button>
            ))}
          </div>
        </section>
      )}
      {searches.length > 0 && (
        <section>
          <p className="alan-h">Son aramalar</p>
          <div className="alan-pins">
            {searches.map((h, i) => (
              <button key={h.url} className="alan-pin" style={{ '--i': i }} onClick={() => navigate(queryOf(h.url))}>
                <Search size={14} />
                <span>{queryOf(h.url)}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <section>
        <div className="alan-pins">
          {actions.map((a, i) => (
            <button key={a.label} className="alan-pin ghost" style={{ '--i': i }} onClick={a.run}>
              <a.icon size={14} />
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
