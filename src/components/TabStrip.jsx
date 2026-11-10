import { useEffect, useRef, useState } from 'react'
import { Plus, X, Search } from 'lucide-react'
import { useStore, set, newTab, selectTab, closeTab, labelOf, isWeb, queryOf } from '../store'
import Favicon from './Favicon'
import '../features/tabs.css'

// Tablet/PC'de sahnenin üstünde ince sekme şeridi. CSS ile yalnızca geniş ekranda görünür.
export default function TabStrip() {
  const on = useStore((s) => s.settings.tabStrip)
  const tabs = useStore((s) => s.tabs)
  const activeId = useStore((s) => s.activeId)
  const ref = useRef(null)
  const [drag, setDrag] = useState(null) // { id, dx } — sürüklenen sekme
  const g = useRef(null) // sürükleme durumu
  const suppress = useRef(false) // sürüklemeden sonra gelen tıklamayı yut

  // Aktif sekme görünür alana kaydırılır.
  useEffect(() => {
    ref.current?.querySelector('[data-active]')?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [activeId, tabs.length])

  if (on === false) return null

  const swap = (d, n, left, nr) => {
    const nid = n.dataset.tab
    set((s) => {
      const a = s.tabs.findIndex((t) => t.id === d.id)
      const b = s.tabs.findIndex((t) => t.id === nid)
      if (a < 0 || b < 0) return {}
      const next = [...s.tabs]
      ;[next[a], next[b]] = [next[b], next[a]]
      return { tabs: next }
    })
    // Komşu artık sürüklenenin eski yerinde; sürüklenen öğe komşunun eski yerine geçti.
    d.dx = left - nr.left
  }

  const down = (e, t) => {
    if (e.button !== 0) return
    suppress.current = false
    const r = e.currentTarget.getBoundingClientRect()
    g.current = { id: t.id, el: e.currentTarget, pid: e.pointerId, x0: e.clientX, grab: e.clientX - r.left, dx: 0, moved: false }
  }
  const move = (e) => {
    const d = g.current
    if (!d) return
    if (!d.moved) {
      if (Math.abs(e.clientX - d.x0) < 6) return
      d.moved = true
      d.el.setPointerCapture?.(d.pid)
    }
    const r = d.el.getBoundingClientRect()
    const natural = r.left - d.dx // dönüşüm uygulanmamış konum
    const left = e.clientX - d.grab
    const cx = left + r.width / 2
    const sib = (step) => {
      const n = step > 0 ? d.el.nextElementSibling : d.el.previousElementSibling
      return n?.dataset.tab ? n : null
    }
    const n = sib(1)
    if (n) {
      const nr = n.getBoundingClientRect()
      if (cx > nr.left + nr.width / 2) return swap(d, n, left, nr), setDrag({ id: d.id, dx: d.dx })
    }
    const p = sib(-1)
    if (p) {
      const pr = p.getBoundingClientRect()
      if (cx < pr.left + pr.width / 2) return swap(d, p, left, pr), setDrag({ id: d.id, dx: d.dx })
    }
    d.dx = left - natural
    setDrag({ id: d.id, dx: d.dx })
  }
  const up = () => {
    const d = g.current
    g.current = null
    setDrag(null)
    if (d?.moved) suppress.current = true
  }
  const cancel = () => {
    g.current = null
    setDrag(null)
  }
  const middle = (e) => e.button === 1 && e.preventDefault()

  return (
    <div className="ts-strip" ref={ref} aria-label="Sekmeler">
      {tabs.map((t) => {
        const act = t.id === activeId
        const dragging = drag?.id === t.id
        return (
          <div
            key={t.id}
            className="ts-tab"
            data-tab={t.id}
            data-active={act || undefined}
            data-asleep={t.asleep || undefined}
            data-drag={dragging || undefined}
            style={dragging ? { translate: `${drag.dx}px 0` } : undefined}
            title={labelOf(t)}
            onPointerDown={(e) => down(e, t)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={cancel}
            onMouseDown={middle}
            onAuxClick={(e) => e.button === 1 && closeTab(t.id)}
          >
            <button className="ts-main" aria-current={act || undefined} onClick={() => !suppress.current && selectTab(t.id)}>
              {isWeb(t.url) ? <Favicon url={t.url} size={14} /> : queryOf(t.url) != null ? <Search size={13} /> : <i className="ts-mote" />}
              <span>{labelOf(t)}</span>
            </button>
            <button
              className="ts-x"
              aria-label={`${labelOf(t)} sekmesini kapat`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => (e.stopPropagation(), closeTab(t.id))}
            >
              <X size={13} />
            </button>
          </div>
        )
      })}
      <button className="ts-add" aria-label="Yeni sekme" onClick={() => newTab()}>
        <Plus size={16} />
      </button>
    </div>
  )
}
