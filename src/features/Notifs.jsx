import { useEffect, useMemo } from 'react'
import { GitPullRequest, ShieldCheck, Timer, Bell, X } from 'lucide-react'
import { useStore, markAllRead, dismissNotif, clearNotifs, navigate } from '../store'
import Aura from '../components/Aura'
import './panels.css'

// lucide-react 1.x marka ikonlarını (Github) içermez; GitHub için PR ikonu kullanılır.
const ICONS = { github: GitPullRequest, shield: ShieldCheck, focus: Timer, system: Bell }

const dayKey = (t) => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
const dayLabel = (key) => {
  if (key === dayKey(Date.now())) return 'Bugün'
  if (key === dayKey(Date.now() - 864e5)) return 'Dün'
  return new Date(key).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
}
const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60000)
  if (m < 1) return 'şimdi'
  if (m < 60) return m + ' dk önce'
  return new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

export default function Notifs() {
  const list = useStore((s) => s.notifs)

  // Sayfa açıldıktan kısa süre sonra her şey okunmuş sayılır; noktalar bir an görünür kalır.
  useEffect(() => {
    const t = setTimeout(markAllRead, 1200)
    return () => clearTimeout(t)
  }, [])

  const groups = useMemo(() => {
    const m = new Map()
    for (const n of list) {
      const k = dayKey(n.t)
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(n)
    }
    return [...m]
  }, [list])

  let i = 0
  return (
    <div className="page notifs tex">
      <Aura kind="aurora" still />
      <div className="settings-inner">
        <div className="nf-head">
          <h1>Bildirimler</h1>
          {list.length > 0 && (
            <button className="link" onClick={() => clearNotifs()}>
              Tümünü temizle
            </button>
          )}
        </div>

        {list.length === 0 ? (
          <div className="nf-empty">
            <p className="nf-quiet">Sessiz.</p>
            <p>GitHub’ı bağlarsan bildirimlerin burada toplanır.</p>
          </div>
        ) : (
          groups.map(([k, items]) => (
            <section key={k} className="nf-group">
              <h2 className="nf-day">{dayLabel(k)}</h2>
              <ul className="stack">
                {items.map((n) => {
                  const Icon = ICONS[n.kind] || Bell
                  // Adresi olmayan bildirim tıklanabilir görünmez.
                  const Tag = n.url ? 'button' : 'div'
                  return (
                    <li key={n.id}>
                      <div className="card nf-item" style={{ '--i': i++ }}>
                        {!n.read && <i className="nf-dot" aria-label="okunmamış" />}
                        <Tag className="nf-main" {...(n.url ? { type: 'button', onClick: () => navigate(n.url) } : { style: { cursor: 'default' } })}>
                          <span className="nf-ico">
                            <Icon size={18} strokeWidth={1.8} />
                          </span>
                          <span className="nf-text">
                            <span className="nf-title">{n.title}</span>
                            {n.body && <span className="nf-body">{n.body}</span>}
                            <span className="nf-time">{ago(n.t)}</span>
                          </span>
                        </Tag>
                        <button className="nf-x" aria-label="Bildirimi kaldır" onClick={() => dismissNotif(n.id)}>
                          <X size={16} />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
