import { useEffect, useId, useMemo, useState } from 'react'
import { Settings2, Plus, X, Search, RotateCcw } from 'lucide-react'
import { useStore, setSetting, navigate } from '../store'
import { loadQuotes, searchSymbols, RANGES, defaultItems, money, pct } from './market'
import { isNative } from '../native'

// Piyasa widget'ı: seçilen hisse/fon/endeksler. Her biri küçük (satır + mini çizgi) ya da grafikli (büyük grafik).
// Hiçbir şey seçilmemişse başlıca endeksler ve rastgele iki büyük hisse gösterilir.
const REFRESH = 60000

function useQuotes(syms, range) {
  const [data, setData] = useState({})
  const [err, setErr] = useState('')
  const key = syms.join(',') + '|' + range
  useEffect(() => {
    let alive = true
    const ac = new AbortController()
    const load = () => {
      if (document.hidden) return
      loadQuotes(syms, range, ac.signal).then((next) => {
        if (!alive) return
        setData(next)
        setErr(syms.length && !Object.keys(next).length ? 'Piyasa verisi alınamadı.' : '')
      })
    }
    load()
    const id = setInterval(load, REFRESH)
    return () => ((alive = false), ac.abort(), clearInterval(id))
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return [data, err]
}

// Kapanış dizisinden SVG yolu (0..w, 0..h). Önceki kapanış (ref) ölçeğe dahil edilir ki çizgi görünsün.
function pathOf(pts, w, h, ref) {
  if (pts.length < 2) return { line: '', area: '', refY: null }
  const all = ref != null ? [...pts, ref] : pts
  const min = Math.min(...all)
  const max = Math.max(...all)
  const span = max - min || 1
  const x = (i) => (i / (pts.length - 1)) * w
  const y = (v) => h - 2 - ((v - min) / span) * (h - 4)
  const line = pts.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join('')
  return { line, area: line + `L${w} ${h}L0 ${h}Z`, refY: ref != null ? y(ref) : null }
}

function Spark({ q }) {
  const { line } = pathOf(q.points, 64, 24, q.ref)
  return (
    <svg className="mk-spark" viewBox="0 0 64 24" preserveAspectRatio="none" aria-hidden>
      <path d={line} data-up={q.change >= 0 || undefined} />
    </svg>
  )
}

function Big({ q, range, setRange, open }) {
  const gid = useId()
  const { line, area, refY } = pathOf(q.points, 300, 110, range === '1d' ? q.ref : null)
  const up = q.change >= 0
  return (
    <div className="mk-big" data-up={up || undefined}>
      <button className="mk-head" onClick={open}>
        <span className="mk-badge">{q.name.charAt(0)}</span>
        <span className="mk-names">
          <b>{q.name}</b>
          <small>
            {q.sym}
            {q.exch ? ' · ' + q.exch : ''}
            {q.currency ? ' · ' + q.currency : ''}
          </small>
        </span>
      </button>
      <div className="mk-price">
        <b>{money(q.price, q.currency)}</b>
        <span className="mk-chg">
          {up ? '↑' : '↓'} {pct(q.change)}
        </span>
      </div>
      <svg className="mk-chart" viewBox="0 0 300 110" preserveAspectRatio="none" aria-label={`${q.name} grafiği`}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {refY != null && <line x1="0" x2="300" y1={refY} y2={refY} className="mk-ref" />}
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} className="mk-line" />
      </svg>
      <div className="seg mk-ranges" role="radiogroup" aria-label="Zaman aralığı">
        {Object.entries(RANGES).map(([k, r]) => (
          <button key={k} role="radio" aria-checked={range === k} onClick={() => setRange(k)}>
            {r.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Row({ q }) {
  return (
    <div className="mk-row" data-up={q.change >= 0 || undefined}>
      <span className="mk-badge">{q.name.charAt(0)}</span>
      <span className="mk-names">
        <b>{q.name}</b>
        <small>
          {q.sym}
          {q.exch ? ' · ' + q.exch : ''}
        </small>
      </span>
      <Spark q={q} />
      <span className="mk-num">
        <b>{money(q.price, q.currency)}</b>
        <small className="mk-chg">{pct(q.change)}</small>
      </span>
    </div>
  )
}

function Editor({ items, save, close }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState([])
  const [err, setErr] = useState('')
  useEffect(() => {
    const t = q.trim()
    if (t.length < 1) return setRes([])
    const ac = new AbortController()
    const id = setTimeout(
      () =>
        searchSymbols(t, ac.signal).then(
          (v) => (setRes(v), setErr(v.length ? '' : 'Sonuç yok')),
          (e) => e.name !== 'AbortError' && setErr('Arama yapılamadı'),
        ),
      250,
    )
    return () => (clearTimeout(id), ac.abort())
  }, [q])
  const has = (s) => items.some((x) => x.s === s)
  return (
    <div className="mk-edit">
      <label className="mk-search">
        <Search size={15} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hisse, fon, endeks ara (ör. NVDA, THYAO, altın)" autoComplete="off" spellCheck={false} />
      </label>
      {res.length > 0 && (
        <div className="mk-res">
          {res.map((r) => (
            <button key={r.s} className="mk-opt" disabled={has(r.s)} onClick={() => save([...items, { s: r.s, big: false }])}>
              <span className="mk-names">
                <b>{r.name}</b>
                <small>
                  {r.s} · {r.type}
                  {r.exch ? ' · ' + r.exch : ''}
                </small>
              </span>
              {has(r.s) ? <small>ekli</small> : <Plus size={16} />}
            </button>
          ))}
        </div>
      )}
      {err && q && <p className="wg-muted">{err}</p>}
      {items.length > 0 && (
        <div className="mk-mine">
          {items.map((it, i) => (
            <div key={it.s} className="mk-item">
              <b>{it.s}</b>
              <div className="seg mk-size" role="radiogroup" aria-label={`${it.s} boyutu`}>
                <button role="radio" aria-checked={!it.big} onClick={() => save(items.map((x, j) => (j === i ? { ...x, big: false } : x)))}>
                  Küçük
                </button>
                <button role="radio" aria-checked={!!it.big} onClick={() => save(items.map((x, j) => (j === i ? { ...x, big: true } : x)))}>
                  Grafikli
                </button>
              </div>
              <button className="mk-del" aria-label={`${it.s} kaldır`} onClick={() => save(items.filter((_, j) => j !== i))}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="mk-foot">
        {items.length > 0 && (
          <button className="link" onClick={() => save([])}>
            <RotateCcw size={13} /> Varsayılana dön
          </button>
        )}
        <button className="link" onClick={close}>
          Bitti
        </button>
      </div>
    </div>
  )
}

export default function Market() {
  const cfg = useStore((s) => s.settings.market) || {}
  const mine = Array.isArray(cfg.items) ? cfg.items.filter((x) => x && typeof x.s === 'string') : []
  const where = useStore((s) => s.settings.country + '|' + s.settings.lang) // bölge değişince varsayılan liste yenilenir
  const defaults = useMemo(() => defaultItems(), [where]) // eslint-disable-line react-hooks/exhaustive-deps
  const items = mine.length ? mine : defaults
  const range = RANGES[cfg.range] ? cfg.range : '1d'
  const [edit, setEdit] = useState(false)
  const syms = useMemo(() => items.map((x) => x.s), [items])
  const [data, err] = useQuotes(syms, range)
  const save = (next) => setSetting('market', { ...cfg, items: next })
  const setRange = (r) => setSetting('market', { ...cfg, range: r })

  return (
    <div className="mk">
      <button className="mk-gear" aria-label="Piyasa widget'ını düzenle" aria-pressed={edit} onClick={() => setEdit((v) => !v)}>
        <Settings2 size={15} />
      </button>
      {edit ? (
        <Editor items={mine} save={save} close={() => setEdit(false)} />
      ) : (
        <>
          {!mine.length && <p className="wg-muted mk-hint">Varsayılan liste · ⚙ ile hisse, fon ya da endeks ekle</p>}
          {items.map((it) => {
            const q = data[it.s]
            if (!q)
              return (
                <div key={it.s} className="mk-row mk-wait" aria-busy={!err || undefined}>
                  <b>{it.s}</b>
                </div>
              )
            const yahoo = /\.IS$|^\^|=/.test(it.s)
            const open = () => navigate(yahoo ? 'https://finance.yahoo.com/quote/' + encodeURIComponent(it.s) : 'https://www.cnbc.com/quotes/' + encodeURIComponent(it.s))
            // Grafikli kartın içinde aralık düğmeleri olduğu için kartın tamamı düğme değildir (iç içe düğme olmaz).
            return it.big ? (
              <Big key={it.s} q={q} range={range} setRange={setRange} open={open} />
            ) : (
              <button key={it.s} className="mk-hit" onClick={open}>
                <Row q={q} />
              </button>
            )
          })}
          {err && (
            <p className="wg-muted">
              {err} İnternet bağlantını kontrol et{isNative ? '' : ' (web sürümünde tarayıcı bu veriyi engelleyebilir)'}.
            </p>
          )}
        </>
      )}
    </div>
  )
}
