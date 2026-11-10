import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useStore, setSetting, notify } from '../store'
import { play } from '../sound'
import { GitHubWidget } from './GitHub'
import Market from './Market'
import News from './News'
import {
  Sun,
  Moon,
  CloudSun,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  CloudLightning,
  LocateFixed,
  X,
  Play,
  Pause,
  RotateCcw,
} from 'lucide-react'
import './widgets.css'

export const WIDGETS = {
  weather: 'Hava durumu',
  focus: 'Odak sayacı',
  notes: 'Notlar',
  github: 'GitHub',
  stats: 'İstatistik',
  date: 'Takvim',
  market: 'Piyasa',
  news: 'Haberler',
}

const two = (n) => String(n).padStart(2, '0')
const CACHE_TTL = 20 * 60 * 1000
const GEO_KEY = 'anfo:geo'

/* ---------- hava durumu ---------- */

const readCache = (k) => {
  try {
    const e = JSON.parse(localStorage.getItem('anfo.wx:' + k))
    return e && Date.now() - e.t < CACHE_TTL ? e : null
  } catch {
    return null
  }
}
// Hava önbelleği en fazla WX_MAX kayıt tutar; en eski (ve bozuk) kayıtlar silinir.
const WX_MAX = 5
const pruneWx = () => {
  try {
    const rows = Object.keys(localStorage)
      .filter((k) => k.startsWith('anfo.wx:'))
      .map((k) => {
        let t = 0
        try {
          t = JSON.parse(localStorage.getItem(k))?.t || 0
        } catch {}
        return { k, t }
      })
      .sort((a, b) => b.t - a.t)
    rows.slice(WX_MAX).forEach((r) => localStorage.removeItem(r.k))
  } catch {}
}
const writeCache = (k, e) => {
  try {
    localStorage.setItem('anfo.wx:' + k, JSON.stringify(e))
    pruneWx()
  } catch {}
}
pruneWx()
const readGeo = () => {
  try {
    const g = JSON.parse(localStorage.getItem(GEO_KEY))
    return g && Number.isFinite(g.lat) && Number.isFinite(g.lon) ? g : null
  } catch {
    return null
  }
}
const writeGeo = (g) => {
  try {
    localStorage.setItem(GEO_KEY, JSON.stringify(g))
  } catch {}
}
const getJson = async (url, signal) => {
  const r = await fetch(url, { signal })
  if (!r.ok) throw new Error(String(r.status))
  return r.json()
}
const forecastUrl = (lat, lon) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
  `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,is_day` +
  `&hourly=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset` +
  `&timezone=auto&forecast_days=5`

function wmo(code, day) {
  if (code === 0) return { t: 'Açık', I: day ? Sun : Moon }
  if (code <= 2) return { t: 'Parçalı bulutlu', I: CloudSun }
  if (code === 3) return { t: 'Bulutlu', I: Cloud }
  if (code === 45 || code === 48) return { t: 'Sisli', I: CloudFog }
  if (code >= 51 && code <= 57) return { t: 'Çiseleme', I: CloudDrizzle }
  if (code >= 61 && code <= 67) return { t: 'Yağmurlu', I: CloudRain }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { t: 'Karlı', I: CloudSnow }
  if (code >= 80 && code <= 82) return { t: 'Sağanak', I: CloudRain }
  if (code >= 95) return { t: 'Gök gürültülü', I: CloudLightning }
  return { t: 'Bulutlu', I: Cloud }
}

// şehir kutusu + konum düğmesi (tek satır)
function CityForm({ locating, onLocate }) {
  const [draft, setDraft] = useState('')
  return (
    <div className="wg-form">
      <input
        className="text wg-city"
        placeholder="Şehir yaz"
        aria-label="Şehir yaz"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          const v = draft.trim()
          if (e.key === 'Enter' && v) {
            setSetting('city', v)
            setDraft('')
          }
        }}
      />
      <button
        type="button"
        className="wg-locate"
        onClick={onLocate}
        disabled={locating}
        aria-label="Konumumu kullan"
        title="Konumumu kullan"
      >
        <LocateFixed size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </div>
  )
}

function Weather() {
  const city = useStore((s) => s.settings.city)
  const [geo, setGeo] = useState(readGeo)
  const [locating, setLocating] = useState(false)
  const [geoFail, setGeoFail] = useState(false)
  const [status, setStatus] = useState('idle') // idle | loading | ready | notfound | error
  const [wx, setWx] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const [changing, setChanging] = useState(false)
  const [retry, setRetry] = useState(0)
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // şehir değişince "şehri değiştir" kutusunu kapat
  useEffect(() => {
    setChanging(false)
  }, [city])

  // yalnızca kullanıcı tıklayınca konum iste
  const locate = () => {
    if (!navigator.geolocation) {
      setGeoFail(true)
      return
    }
    setLocating(true)
    setGeoFail(false)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (!mounted.current) return
        const g = { lat: p.coords.latitude, lon: p.coords.longitude }
        writeGeo(g)
        setGeo(g)
        setLocating(false)
        if (city) setSetting('city', '') // konum seçildi: şehir yerine konumu kullan
      },
      () => {
        if (!mounted.current) return
        setLocating(false)
        setGeoFail(true)
      },
      { timeout: 8000, maximumAge: 3600000 }
    )
  }

  // veriyi getir (önbellekten ya da ağdan); istekler iptal edilebilir
  useEffect(() => {
    const key = city
      ? 'c:' + city.trim().toLowerCase()
      : geo
        ? `g:${geo.lat.toFixed(2)},${geo.lon.toFixed(2)}`
        : ''
    if (!key) {
      setStatus('idle')
      return
    }
    const hit = readCache(key)
    if (hit) {
      setWx(hit)
      setStatus('ready')
      return
    }
    const ac = new AbortController()
    setStatus('loading')
    ;(async () => {
      try {
        let loc
        if (city) {
          const g = await getJson(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city.trim())}&count=1&language=tr`,
            ac.signal
          )
          const r = g.results && g.results[0]
          if (!r) {
            if (!ac.signal.aborted) setStatus('notfound')
            return
          }
          loc = { name: r.name, lat: r.latitude, lon: r.longitude }
        } else {
          loc = { name: 'Konumun', lat: geo.lat, lon: geo.lon }
        }
        const d = await getJson(forecastUrl(loc.lat, loc.lon), ac.signal)
        const entry = { t: Date.now(), loc, d }
        writeCache(key, entry)
        setWx(entry)
        setStatus('ready')
      } catch {
        if (!ac.signal.aborted) setStatus('error')
      }
    })()
    return () => ac.abort()
  }, [city, geo, retry])

  const hasSrc = Boolean(city || geo)
  const hint = geoFail ? <small className="wg-hint">Konum alınamadı, şehir yaz</small> : null
  const form = <CityForm locating={locating} onLocate={locate} />

  if (!hasSrc) {
    return (
      <div className="wg-wx">
        <div className="wg-row">
          <span className="wg-muted wg-lead">Hava durumu</span>
          {form}
        </div>
        {hint}
      </div>
    )
  }
  if (status === 'notfound') {
    return (
      <div className="wg-wx">
        <div className="wg-row">
          <span className="wg-muted wg-lead">Şehir bulunamadı</span>
          {form}
        </div>
        {hint}
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="wg-wx">
        <div className="wg-row">
          <span className="wg-muted">
            Hava durumu alınamadı ·{' '}
            <button type="button" className="wg-link" onClick={() => setRetry((n) => n + 1)}>
              Yeniden dene
            </button>
          </span>
        </div>
      </div>
    )
  }
  if (status !== 'ready' || !wx) {
    return (
      <div className="wg-wx">
        <div className="wg-row" role="status" aria-label="Yükleniyor">
          <span className="wg-skel" />
        </div>
      </div>
    )
  }

  const d = wx.d
  const c = d.current
  const w = wmo(c.weather_code, c.is_day === 1)
  const NowIcon = w.I

  const h = d.hourly
  const nowKey = c.time.slice(0, 13)
  let start = h.time.findIndex((t) => t.slice(0, 13) >= nowKey)
  if (start < 0) start = 0
  const hours = h.time.slice(start, start + 6).map((t, k) => {
    const hr = Number(t.slice(11, 13))
    const hw = wmo(h.weather_code[start + k], hr >= 6 && hr < 20)
    return { key: start + k, t: t.slice(11, 16), temp: h.temperature_2m[start + k], I: hw.I }
  })

  const dl = d.daily
  const lo = Math.min(...dl.temperature_2m_min)
  const hi = Math.max(...dl.temperature_2m_max)
  const span = Math.max(hi - lo, 1)
  const days = dl.time.map((t, k) => {
    const min = dl.temperature_2m_min[k]
    const max = dl.temperature_2m_max[k]
    return {
      key: t,
      label: k === 0 ? 'Bugün' : new Date(t + 'T12:00:00').toLocaleDateString('tr-TR', { weekday: 'short' }),
      I: wmo(dl.weather_code[k], true).I,
      min,
      max,
      left: ((min - lo) / span) * 100,
      width: Math.max(((max - min) / span) * 100, 4),
    }
  })

  return (
    <div className="wg-wx">
      <button
        type="button"
        className="wg-row wg-row-btn"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="wg-main">
          <NowIcon size={20} strokeWidth={1.5} className="wg-ico" aria-hidden="true" />
          <span className="wg-temp">{Math.round(c.temperature_2m)}°</span>
          <span className="wg-status">{w.t}</span>
        </span>
        <span className="wg-side">
          <span className="wg-place">{wx.loc.name}</span>
          <span className="wg-mm">
            ↑{Math.round(dl.temperature_2m_max[0])}° ↓{Math.round(dl.temperature_2m_min[0])}°
          </span>
        </span>
      </button>
      <div className={'wg-more' + (expanded ? ' is-open' : '')}>
        <div className="wg-more-in">
          <div className="wg-hours">
            {hours.map((x) => (
              <div key={x.key} className="wg-hour">
                <span>{x.t}</span>
                <x.I size={18} strokeWidth={1.5} aria-hidden="true" />
                <b>{Math.round(x.temp)}°</b>
              </div>
            ))}
          </div>
          <ol className="wg-days">
            {days.map((x) => (
              <li key={x.key} className="wg-day-row">
                <span>{x.label}</span>
                <x.I size={16} strokeWidth={1.5} aria-hidden="true" />
                <span className="wg-min">{Math.round(x.min)}°</span>
                <span className="wg-bar">
                  <i style={{ left: x.left + '%', width: x.width + '%' }} />
                </span>
                <span className="wg-max">{Math.round(x.max)}°</span>
              </li>
            ))}
          </ol>
          <div className="wg-foot">
            {changing ? (
              form
            ) : (
              <button type="button" className="wg-link" onClick={() => setChanging(true)}>
                Şehri değiştir
              </button>
            )}
          </div>
        </div>
      </div>
      {hint}
    </div>
  )
}

/* ---------- odak sayacı ---------- */

const BREAK_SEC = 300
const R = 52
const C = 2 * Math.PI * R
const FOCUS_KEY = 'anfo:focus'
const LENS = [15, 25, 50]

// Sayaç durumu modül düzeyinde ve localStorage'da tutulur: ana sayfa yeniden açılınca kaldığı yerden sürer.
const freshFocus = () => ({ mode: 'focus', len: 25, left: 25 * 60, endAt: null })
function loadFocus() {
  try {
    const s = JSON.parse(localStorage.getItem(FOCUS_KEY))
    if (!s || !['focus', 'break'].includes(s.mode) || !LENS.includes(s.len)) return freshFocus()
    return {
      mode: s.mode,
      len: s.len,
      left: Number.isFinite(s.left) ? Math.max(0, s.left) : s.len * 60,
      endAt: Number.isFinite(s.endAt) ? s.endAt : null,
    }
  } catch {
    return freshFocus()
  }
}
let focus = loadFocus()
const focusSubs = new Set()
const subFocus = (f) => (focusSubs.add(f), () => focusSubs.delete(f))
const getFocus = () => focus
let focusTimer = 0

// Süre dolunca bildirim ve mod geçişi. Bileşen dışında, tek zamanlayıcıyla çalışır.
function finishFocus() {
  const { mode, len, endAt } = focus
  if (endAt == null) return
  play('open')
  if (mode === 'focus') {
    notify({ kind: 'focus', title: 'Odak süresi bitti', body: '5 dakika mola', key: 'focus-' + endAt })
    setFocus({ mode: 'break', len, left: BREAK_SEC, endAt: null })
  } else {
    notify({ kind: 'focus', title: 'Mola bitti', body: 'Yeni bir odak turu için başlat', key: 'break-' + endAt })
    setFocus({ mode: 'focus', len, left: len * 60, endAt: null })
  }
}

// Her değişiklikte kaydeder, abonelere haber verir ve bitiş zamanlayıcısını yeniden kurar.
function setFocus(patch) {
  focus = { ...focus, ...(typeof patch === 'function' ? patch(focus) : patch) }
  try {
    localStorage.setItem(FOCUS_KEY, JSON.stringify(focus))
  } catch {}
  focusSubs.forEach((f) => f())
  clearTimeout(focusTimer)
  if (focus.endAt != null) focusTimer = setTimeout(finishFocus, Math.max(0, focus.endAt - Date.now()) + 30)
}
// Açılışta: sayaç çalışıyorsa bitiş zamanlanır (bileşen görünmese de bildirim gelir).
setFocus({})

function Focus() {
  const st = useSyncExternalStore(subFocus, getFocus)
  const running = st.endAt != null
  const [, tick] = useState(0)
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => tick((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [running])

  const left = running ? Math.max(0, Math.ceil((st.endAt - Date.now()) / 1000)) : st.left
  const total = st.mode === 'focus' ? st.len * 60 : BREAK_SEC
  const start = () => setFocus((p) => ({ endAt: Date.now() + p.left * 1000 }))
  const pause = () => setFocus((p) => ({ left: Math.max(0, Math.ceil((p.endAt - Date.now()) / 1000)), endAt: null }))
  const reset = () => setFocus((p) => ({ mode: 'focus', left: p.len * 60, endAt: null }))
  const pick = (n) => setFocus({ mode: 'focus', len: n, left: n * 60, endAt: null })

  const frac = 1 - left / total
  const mm = two(Math.floor(left / 60))
  const ss = two(left % 60)

  return (
    <div className="wg-focus">
      <div className="wg-ring-box">
        <svg className="wg-ring" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r={R} className="wg-ring-bg" />
          <circle
            cx="60"
            cy="60"
            r={R}
            className="wg-ring-fg"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - frac)}
          />
        </svg>
        <div className="wg-ring-time">
          <b>
            {mm}:{ss}
          </b>
          <span className="wg-mode">{st.mode === 'focus' ? 'Odak' : 'Mola'}</span>
        </div>
      </div>
      <div className="wg-focus-side">
        <div className="seg" role="radiogroup" aria-label="Odak süresi">
          {[15, 25, 50].map((n) => (
            <button
              key={n}
              role="radio"
              aria-checked={st.len === n}
              disabled={running}
              onClick={() => pick(n)}
            >
              {n} dk
            </button>
          ))}
        </div>
        <div className="wg-controls">
          {running ? (
            <button className="wg-btn is-main" onClick={pause} aria-label="Duraklat">
              <Pause size={18} />
            </button>
          ) : (
            <button className="wg-btn is-main" onClick={start} aria-label="Başlat">
              <Play size={18} />
            </button>
          )}
          <button className="wg-btn" onClick={reset} aria-label="Sıfırla">
            <RotateCcw size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------- hızlı not ---------- */

function Notes() {
  const saved = useStore((s) => s.settings.notes) ?? ''
  const [v, setV] = useState(saved)
  const pend = useRef(null)

  // bileşen kapanırken bekleyen notu yaz
  useEffect(
    () => () => {
      if (pend.current !== null) setSetting('notes', pend.current)
    },
    []
  )

  useEffect(() => {
    if (v === saved) return
    pend.current = v
    const id = setTimeout(() => {
      setSetting('notes', v)
      pend.current = null
    }, 300)
    return () => clearTimeout(id)
  }, [v, saved])

  return (
    <textarea
      className="wg-notes"
      value={v}
      rows={4}
      placeholder="Bir şey not al…"
      aria-label="Hızlı not"
      onChange={(e) => setV(e.target.value)}
    />
  )
}

/* ---------- istatistik ---------- */

function Stats() {
  const blocked = useStore((s) => s.blockedTotal)
  const tabs = useStore((s) => s.tabs.length)
  const hist = useStore((s) => s.history.length)
  const items = [
    [blocked, 'Engellenen istek'],
    [tabs, 'Açık sekme'],
    [hist, 'Geçmiş site'],
  ]
  return (
    <div className="wg-stats">
      {items.map(([n, label]) => (
        <div key={label} className="wg-stat">
          <b>{n}</b>
          <small>{label}</small>
        </div>
      ))}
    </div>
  )
}

/* ---------- takvim ---------- */

function DateWidget() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])
  const y = now.getFullYear()
  const start = new Date(y, 0, 1)
  const doy = Math.round((new Date(y, now.getMonth(), now.getDate()) - start) / 86400000) + 1
  const total = Math.round((new Date(y + 1, 0, 1) - start) / 86400000)
  const pct = (doy / total) * 100
  return (
    <div className="wg-date">
      <div className="wg-date-top">
        <b>{now.getDate()}</b>
        <div>
          <span>{now.toLocaleDateString('tr-TR', { month: 'long' })}</span>
          <em>{now.toLocaleDateString('tr-TR', { weekday: 'long' })}</em>
        </div>
      </div>
      <div className="wg-bar" role="progressbar" aria-label="Yıl ilerlemesi" aria-valuemin={1} aria-valuemax={total} aria-valuenow={doy}>
        <i style={{ left: 0, width: pct + '%' }} />
      </div>
      <small>
        {y} · {doy}. gün / {total}
      </small>
    </div>
  )
}

/* ---------- kayıt ve düzen ---------- */

const RENDER = {
  weather: Weather,
  focus: Focus,
  notes: Notes,
  github: GitHubWidget,
  stats: Stats,
  date: DateWidget,
  market: Market,
  news: News,
}

export default function Widgets() {
  const ids = useStore((s) => s.settings.widgets) || []
  const remove = (id) => {
    setSetting(
      'widgets',
      ids.filter((x) => x !== id)
    )
    play('close')
  }
  return (
    <div className="widgets">
      {ids.map((id, i) => {
        if (!Object.prototype.hasOwnProperty.call(RENDER, id)) return null
        const C = RENDER[id]
        return (
          <section key={id} className={`card wg wg-${id}`} style={{ '--i': i }} aria-label={WIDGETS[id]}>
            <small className="wg-label">{WIDGETS[id]}</small>
            <button
              type="button"
              className="wg-x"
              onClick={() => remove(id)}
              aria-label="Widget’ı kaldır"
              title="Kaldır"
            >
              <X size={14} strokeWidth={1.5} aria-hidden="true" />
            </button>
            <C />
          </section>
        )
      })}
    </div>
  )
}
