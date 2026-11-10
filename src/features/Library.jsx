import { useEffect, useMemo, useState } from 'react'
import { Search, Star, X, Pencil, ChevronUp, ChevronDown } from 'lucide-react'
import { useStore, set, navigate, removeReadLater, togglePin, updatePin, movePin, addPin, clearHistory, queryOf, hostOf, newTab, reopenClosed } from '../store'
import Aura from '../components/Aura'
import Favicon from '../components/Favicon'
import './library.css'

const norm = (s) => (s || '').toLocaleLowerCase('tr-TR')
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
const clock = (t) => new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
// Kademeli giriş animasyonu uzun listelerde sınırlı kalsın.
const delay = (i) => Math.min(i, 12)

const TABS = [
  ['hist', 'Geçmiş'],
  ['pins', 'Yer imleri'],
  ['later', 'Okuma listesi'],
]
const PH = { hist: 'Geçmişte ara…', pins: 'Yer imlerinde ara…', later: 'Okuma listesinde ara…' }

export default function Library() {
  const [tab, setTab] = useState('hist')
  const [q, setQ] = useState('')

  return (
    <div className="page lib tex">
      <Aura kind="aurora" still />
      <div className="settings-inner">
        <div className="lib-head">
          <h1>Kitaplık</h1>
        </div>

        <div className="seg lib-seg" role="radiogroup" aria-label="Kitaplık bölümü">
          {TABS.map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={tab === k} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>

        <input
          className="text lib-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={PH[tab]}
          aria-label={PH[tab].replace('…', '')}
        />

        {tab === 'hist' ? <History q={q} /> : tab === 'pins' ? <Pins q={q} /> : <Later q={q} />}
      </div>
    </div>
  )
}

function History({ q }) {
  const history = useStore((s) => s.history)
  const pins = useStore((s) => s.pins)
  const closedRaw = useStore((s) => s.closedTabs)
  const closed = useMemo(() => (closedRaw || []).filter((c) => c && c.url).slice(0, 5), [closedRaw])
  const [arm, setArm] = useState(false)

  // Temizleme onayı 3 sn sonra kendiliğinden geri döner.
  useEffect(() => {
    if (!arm) return
    const t = setTimeout(() => setArm(false), 3000)
    return () => clearTimeout(t)
  }, [arm])

  const pinned = useMemo(() => new Set(pins.map((p) => p.url)), [pins])
  const needle = norm(q).trim()

  const list = useMemo(
    () => (needle ? history.filter((h) => norm(`${h.title || ''} ${h.url}`).includes(needle)) : history),
    [history, needle],
  )

  const groups = useMemo(() => {
    const m = new Map()
    for (const h of list) {
      const k = dayKey(h.t)
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(h)
    }
    return [...m]
  }, [list])

  const clear = () => {
    if (!arm) return setArm(true)
    clearHistory()
    setArm(false)
  }

  let i = 0
  return (
    <>
      {!needle && closed.length > 0 && (
        <section className="lib-group">
          <div className="lib-closed-head">
            <h2 className="lib-day">Son kapatılanlar</h2>
            <button type="button" className="link lib-clear" onClick={() => reopenClosed()}>
              Geri aç
            </button>
          </div>
          <ul className="stack lib-list">
            {closed.map((c, k) => (
              <li key={`${c.url}-${k}`}>
                <div className="card lib-row" style={{ '--i': delay(k) }}>
                  <button type="button" className="lib-main" onClick={() => newTab(c.url)}>
                    <span className="lib-ico">
                      <Favicon url={c.url} size={16} />
                    </span>
                    <span className="lib-text">
                      <span className="lib-title">{c.title || hostOf(c.url) || c.url}</span>
                      <span className="lib-sub">{hostOf(c.url) || c.url}</span>
                    </span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {history.length > 0 && (
        <div className="lib-bar">
          <button type="button" className={'link lib-clear' + (arm ? ' arm' : '')} onClick={clear}>
            {arm ? 'Emin misin? Temizle' : 'Geçmişi temizle'}
          </button>
        </div>
      )}

      {list.length === 0 ? (
        <div className="lib-empty">
          {needle ? (
            <p className="lib-note">Sonuç yok.</p>
          ) : (
            <>
              <p className="lib-quiet">Henüz iz yok.</p>
              <p>Gezdiğin sayfalar burada görünür.</p>
            </>
          )}
        </div>
      ) : (
        groups.map(([k, items]) => (
          <section key={k} className="lib-group">
            <h2 className="lib-day">{dayLabel(k)}</h2>
            <ul className="stack lib-list">
              {items.map((h) => {
                const sq = queryOf(h.url)
                const isSearch = sq !== null
                const isPin = !isSearch && pinned.has(h.url)
                const label = isSearch ? sq : h.title || hostOf(h.url) || h.url
                const sub = isSearch ? 'Anfo araması' : hostOf(h.url) || h.url
                return (
                  <li key={h.url}>
                    <div className="card lib-row" style={{ '--i': delay(i++) }}>
                      <button type="button" className="lib-main" onClick={() => navigate(isSearch ? sq : h.url)}>
                        <span className="lib-ico">
                          {isSearch ? <Search size={16} strokeWidth={1.8} /> : <Favicon url={h.url} size={16} />}
                        </span>
                        <span className="lib-text">
                          <span className="lib-title">{label}</span>
                          <span className="lib-sub">{sub}</span>
                        </span>
                        <time className="lib-time" dateTime={new Date(h.t).toISOString()}>
                          {clock(h.t)}
                        </time>
                      </button>
                      <button
                        type="button"
                        className="lib-act"
                        aria-pressed={isPin}
                        aria-label={isSearch ? 'Arama yer imine eklenemez' : isPin ? 'Yer imlerinden kaldır' : 'Yer imine ekle'}
                        title={isSearch ? 'Arama yer imine eklenemez' : undefined}
                        disabled={isSearch}
                        onClick={() => togglePin(h.url, h.title)}
                      >
                        <Star size={17} strokeWidth={1.8} fill={isPin ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        type="button"
                        className="lib-act"
                        aria-label="Geçmişten kaldır"
                        onClick={() => set((s) => ({ history: s.history.filter((x) => x.url !== h.url) }))}
                      >
                        <X size={17} strokeWidth={1.8} />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}
    </>
  )
}

function Pins({ q }) {
  const pins = useStore((s) => s.pins)
  const [editUrl, setEditUrl] = useState(null)
  const [draft, setDraft] = useState('')
  const [addr, setAddr] = useState('')
  const [name, setName] = useState('')
  const needle = norm(q).trim()

  const list = useMemo(
    () => (needle ? pins.filter((p) => norm(`${p.title || ''} ${p.url}`).includes(needle)) : pins),
    [pins, needle],
  )

  const startEdit = (p) => {
    setEditUrl(p.url)
    setDraft(p.title || hostOf(p.url))
  }
  const saveEdit = (url) => {
    updatePin(url, { title: draft.trim() || hostOf(url) })
    setEditUrl(null)
  }

  const submit = (e) => {
    e.preventDefault()
    if (!addr.trim()) return
    addPin(addr.trim(), name)
    setAddr('')
    setName('')
  }

  let i = 0
  return (
    <>
      {list.length === 0 ? (
        <div className="lib-empty">
          <p className="lib-note">{needle ? 'Sonuç yok.' : 'Henüz yer imi yok.'}</p>
          {!needle && <p>Adres ekleyerek ya da sayfada yıldıza dokunarak ekleyebilirsin.</p>}
        </div>
      ) : (
        <section className="lib-group">
          <ul className="stack lib-list">
            {list.map((p) => {
              const idx = pins.findIndex((x) => x.url === p.url)
              const editing = editUrl === p.url
              return (
                <li key={p.url}>
                  <div className="card lib-row" style={{ '--i': delay(i++) }}>
                    {editing ? (
                      <form
                        className="lib-edit"
                        onSubmit={(e) => {
                          e.preventDefault()
                          saveEdit(p.url)
                        }}
                      >
                        <input
                          className="text"
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              e.preventDefault()
                              e.stopPropagation()
                              setEditUrl(null)
                            }
                          }}
                          aria-label="Yer imi adı"
                        />
                      </form>
                    ) : (
                      <button type="button" className="lib-main" onClick={() => navigate(p.url)}>
                        <span className="lib-ico">
                          <Favicon url={p.url} size={16} />
                        </span>
                        <span className="lib-text">
                          <span className="lib-title">{p.title || hostOf(p.url)}</span>
                          <span className="lib-sub">{hostOf(p.url) || p.url}</span>
                        </span>
                      </button>
                    )}

                    {editing ? (
                      <button type="button" className="lib-act" aria-label="Düzenlemeyi kaydet" onClick={() => saveEdit(p.url)}>
                        <span className="lib-ok">Kaydet</span>
                      </button>
                    ) : (
                      <button type="button" className="lib-act" aria-label="Adını düzenle" onClick={() => startEdit(p)}>
                        <Pencil size={16} strokeWidth={1.8} />
                      </button>
                    )}
                    {!needle && (
                      <>
                        <button
                          type="button"
                          className="lib-act"
                          aria-label="Yukarı taşı"
                          disabled={idx <= 0}
                          onClick={() => movePin(p.url, -1)}
                        >
                          <ChevronUp size={18} strokeWidth={1.8} />
                        </button>
                        <button
                          type="button"
                          className="lib-act"
                          aria-label="Aşağı taşı"
                          disabled={idx >= pins.length - 1}
                          onClick={() => movePin(p.url, 1)}
                        >
                          <ChevronDown size={18} strokeWidth={1.8} />
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="lib-act"
                      aria-label="Yer imini kaldır"
                      onClick={() => togglePin(p.url, p.title)}
                    >
                      <X size={17} strokeWidth={1.8} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <form className="card lib-add" onSubmit={submit}>
        <h2 className="lib-day">Yer imi ekle</h2>
        <input
          className="text"
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          placeholder="Adres (örn. example.com)"
          aria-label="Adres"
          inputMode="url"
          autoCapitalize="off"
          autoComplete="off"
        />
        <input
          className="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ad (isteğe bağlı)"
          aria-label="Ad"
          autoComplete="off"
        />
        <div className="lib-add-acts">
          <button type="submit" className="link" disabled={!addr.trim()}>
            Ekle
          </button>
        </div>
      </form>
    </>
  )
}

// Okuma listesi: "Sonra oku" ile kaydedilen sayfalar. Açınca listede kalır; bitince kaldırılır.
function Later({ q }) {
  const list = useStore((s) => s.readLater)
  const shown = useMemo(() => list.filter((r) => !q || norm(r.title + ' ' + r.url).includes(norm(q))), [list, q])
  if (!list.length)
    return (
      <div className="lib-empty">
        <p className="lib-empty-big">Okunacak bir şey yok.</p>
        <p>Bir sayfadayken adaya basılı tutup “Sonra oku”ya dokun; burada birikir.</p>
      </div>
    )
  return (
    <div className="stack">
      {shown.map((r, i) => (
        <div key={r.url} className="card lib-row" style={{ '--i': delay(i) }}>
          <button className="lib-main" onClick={() => navigate(r.url)}>
            <Favicon url={r.url} size={16} />
            <span className="lib-text">
              <b>{r.title}</b>
              <small>
                {hostOf(r.url)} · {dayLabel(dayKey(r.t))}
              </small>
            </span>
          </button>
          <button className="lib-icon" onClick={() => removeReadLater(r.url)} aria-label="Okundu, listeden kaldır">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}
