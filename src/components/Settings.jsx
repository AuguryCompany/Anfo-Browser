import { useEffect, useState } from 'react'
import { useStore, setSetting, setUi, ENGINES, clearHistory, resetSettings, liveCount, sleepBackground, clearCaches, memoryInfo, exportData, importData } from '../store'
import { play, SOUND_PACKS } from '../sound'
import { isNative } from '../native'
import { ChevronUp, ChevronDown, X } from 'lucide-react'
import Aura from './Aura'
import { THEMES } from '../features/themes'
import { WIDGETS } from '../features/Widgets'
import { useGhInvalid } from '../features/gh'
import LocalModels from '../features/LocalModels'
import '../features/settings-extra.css'

// İmza palet: kiraz. Diğerleri aynı doygunlukta yan tonlar.
const ACCENTS = { '#c9d4e3': 'Kar', '#9fb3cc': 'Buz', '#e5385f': 'Kiraz', '#b81f4b': 'Vişne', '#ff7a93': 'Gül', '#ff9a76': 'Şeftali', '#b392ff': 'Leylak', '#8fc2ff': 'Gök', '#6fe3d4': 'Nane' }
const AURAS = { mist: 'Sis', space: 'Uzay', rain: 'Yağmur', snow: 'Kar', stars: 'Yıldızlar', glow: 'Işık', horizon: 'Ufuk', aurora: 'Aurora', orb: 'Küre', off: 'Yalın' }
const SCENES = ['space', 'rain', 'snow', 'stars']
// arka plan ışığının tek rengi: soğuk tonlar
const GLOWS = { '#7d8ca1': 'Arduvaz', '#8e9bb0': 'Kurşun', '#a9c4ff': 'Buz mavisi', '#9fb7c9': 'Buzul', '#a7a3c9': 'Alacakaranlık', '#c9d4e3': 'Kar' }
const FONTS = { sora: ['Sora', "'Sora Variable'"], manrope: ['Manrope', "'Manrope Variable'"], grotesk: ['Grotesk', "'Space Grotesk Variable'"], system: ['Sistem', 'system-ui'] }
const CLOCKS = { split: 'İki renk', thin: 'İnce', bold: 'Kalın' }
const ALIGNS = { center: 'Orta', left: 'Sol' }
const PIN_SHAPES = { circle: 'Daire', squircle: 'Yumuşak', square: 'Kare' }
const START_PAGES = { session: 'Son oturum', home: 'Ana sayfa' }

const PERF = { high: 'Yüksek', balanced: 'Dengeli', saver: 'Tasarruf' }
const SLEEP = { 0: 'Asla', 5: '5 dk', 15: '15 dk', 30: '30 dk' }
const CACHE = { normal: 'Normal', aggressive: 'Agresif', off: 'Kapalı' }

// Yıkıcı işlemler: ilk tık onaylatır, 3 sn içinde ikinci tık yapar.
function Confirm({ label, sure, onConfirm, disabled }) {
  const [arm, setArm] = useState(false)
  useEffect(() => {
    if (!arm) return
    const t = setTimeout(() => setArm(false), 3000)
    return () => clearTimeout(t)
  }, [arm])
  return (
    <button
      className="link"
      disabled={disabled}
      onClick={() => {
        if (!arm) return setArm(true)
        setArm(false)
        onConfirm()
      }}
    >
      {arm ? sure : label}
    </button>
  )
}

// Anahtar alanları her tuşta değil, odak çıkınca ya da Enter'da kaydolur.
function SaveField({ value, onSave, ...rest }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  const commit = () => {
    const t = v.trim()
    if (t !== value) onSave(t)
  }
  return (
    <input
      className="text"
      {...rest}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        }
      }}
    />
  )
}

// Gizli dosya girişi: görünmez ama odaklanabilir; Enter ya da Space ile seçici açılır.
const openOnKey = (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    e.currentTarget.click()
  }
}

// Performans ve bellek: canlı bellek okuması, uyutma, önbellek temizliği.
function PerfCard({ s, i }) {
  const [mem, setMem] = useState(null)
  const [msg, setMsg] = useState(null) // { text, err }
  const live = useStore(() => liveCount())
  const tabs = useStore((st) => st.tabs.length)
  useEffect(() => {
    let on = true
    const read = () => memoryInfo().then((m) => on && setMem(m)).catch(() => {})
    read()
    const id = setInterval(read, 3000)
    return () => ((on = false), clearInterval(id))
  }, [])
  return (
    <section className="card" style={{ '--i': i }}>
      <h2>Performans ve bellek</h2>
      <p className="stat">
        <b>
          {live}/{tabs}
        </b>{' '}
        sekme bellekte{mem ? ` · ${mem.usedMB} MB kullanımda` : ''}
        {mem?.systemAvailMB ? ` · cihazda ${mem.systemAvailMB} MB boş` : ''}
      </p>
      <div className="field">
        <span>
          Akıcılık profili <small>tasarruf: ışık sabit, buğu ve doku kapalı</small>
        </span>
        <Seg k="perf" value={s.perf} options={PERF} />
      </div>
      <div className="field">
        <span>
          Bellekte tutulan sekme <small>diğerleri uyur, seçilince yeniden yüklenir</small>
        </span>
        <Seg k="liveTabs" value={s.liveTabs} options={{ 1: '1', 2: '2', 4: '4', 8: '8' }} />
      </div>
      <div className="field">
        <span>Arka plandaki sekmeyi uyut</span>
        <Seg k="sleepAfter" value={s.sleepAfter} options={SLEEP} />
      </div>
      {isNative && (
        <div className="field">
          <span>
            Sayfa önbelleği <small>agresif: önce önbellek, sonra ağ (hızlı ama eski olabilir)</small>
          </span>
          <Seg k="cacheMode" value={s.cacheMode} options={CACHE} />
        </div>
      )}
      <Toggle k="prewarm" value={s.prewarm} label="Bağlantıları önceden ısıt" hint="üzerine gelince sunucuya erken bağlanır" />
      <p className="links">
        <button
          className="link"
          onClick={() => {
            const n = sleepBackground()
            play('close')
            setMsg({ text: isNative ? `${n} sekme uyutuldu` : 'Web sürümünde sekmeler otomatik boşaltılır' })
          }}
        >
          Arka plan sekmelerini uyut
        </button>
        <button
          className="link"
          onClick={async () => {
            try {
              const mb = await clearCaches()
              play('close')
              setMsg({ text: mb ? `${mb} MB önbellek temizlendi` : 'Önbellek temizlendi' })
            } catch {
              setMsg({ text: 'Önbellek temizlenemedi. Tekrar dene.', err: true })
            }
          }}
        >
          Önbelleği temizle
        </button>
      </p>
      {msg && (
        <p role={msg.err ? 'alert' : 'status'} className={msg.err ? 'sx-err' : undefined}>
          {msg.text}
        </p>
      )}
    </section>
  )
}

const pick = (k, v, sound = 'toggle') => {
  setSetting(k, v)
  play(sound)
}

const Seg = ({ k, value, options, sound }) => (
  <div className="seg" role="radiogroup">
    {Object.entries(options).map(([v, label]) => (
      <button key={v} role="radio" aria-checked={String(value) === v} onClick={() => pick(k, typeof value === 'number' ? +v : v, sound)}>
        {label}
      </button>
    ))}
  </div>
)

const Toggle = ({ k, value, label, hint }) => (
  <label className="field line">
    <span>
      {label}
      {hint && <small>{hint}</small>}
    </span>
    <button className="switch" role="switch" aria-checked={value} onClick={() => pick(k, !value)}>
      <i />
    </button>
  </label>
)

const Range = ({ k, value, label, min, max, step = 1, unit = '' }) => (
  <label className="field">
    <span>
      {label} <small>{value + unit}</small>
    </span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => setSetting(k, +e.target.value)} onPointerUp={() => play('tick')} />
  </label>
)

// Seçilen görseli en fazla 1600px genişliğe küçültüp JPEG dataURL döndürür.
function readWallpaper(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const scale = Math.min(1, 1600 / img.naturalWidth)
        const c = document.createElement('canvas')
        c.width = Math.round(img.naturalWidth * scale)
        c.height = Math.round(img.naturalHeight * scale)
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
        resolve(c.toDataURL('image/jpeg', 0.82))
      } catch (err) {
        reject(err)
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('görsel okunamadı'))
    }
    img.src = url
  })
}

export default function Settings() {
  const s = useStore((st) => st.settings)
  const historyCount = useStore((st) => st.history.length)
  const blockedTotal = useStore((st) => st.blockedTotal)
  const ghBad = useGhInvalid()
  const [nb, setNb] = useState({ k: '', label: '', url: '' })
  const [wallErr, setWallErr] = useState('')
  const [bk, setBk] = useState(null) // yedekleme sonucu: { text, err }
  // Kısaltma boşluk içeremez ve mevcut bir kısaltmayla çakışamaz.
  const kTrim = nb.k.trim()
  const kSpace = /\s/.test(kTrim)
  const kTaken = !!kTrim && s.bangs.some((b) => b.k.toLowerCase() === kTrim.toLowerCase())
  const bangOk = Boolean(kTrim && !kSpace && !kTaken && nb.label.trim() && nb.url.includes('%s'))

  // Widget'lar: açık olanlar kendi sırasıyla, kapalı olanlar sonda.
  const widgetIds = [...s.widgets.filter((id) => WIDGETS[id]), ...Object.keys(WIDGETS).filter((id) => !s.widgets.includes(id))]
  const moveWidget = (id, dir) => {
    const list = [...s.widgets]
    const from = list.indexOf(id)
    const to = from + dir
    if (from < 0 || to < 0 || to >= list.length) return
    ;[list[from], list[to]] = [list[to], list[from]]
    setSetting('widgets', list)
    play('tick')
  }
  const toggleWidget = (id, on) => {
    setSetting('widgets', on ? [...s.widgets, id] : s.widgets.filter((x) => x !== id))
    play('toggle')
  }

  // Tema arka plan ışığına dokunmaz: arka plan her zaman tek, küçük, soğuk ışık olarak kalır.
  const themeKeys = (t) => Object.entries(t.settings).filter(([k]) => k !== 'aura' && k !== 'auraStrength')
  const applyTheme = (t) => {
    themeKeys(t).forEach(([k, v]) => setSetting(k, v))
    play('toggle')
  }
  const isActive = (t) => themeKeys(t).every(([k, v]) => s[k] === v)

  const addBang = (e) => {
    e.preventDefault()
    if (!bangOk) return
    setSetting('bangs', [...s.bangs, { k: nb.k.trim(), label: nb.label.trim(), url: nb.url.trim() }])
    setNb({ k: '', label: '', url: '' })
    play('tap')
  }
  const removeBang = (n) => {
    setSetting('bangs', s.bangs.filter((_, x) => x !== n))
    play('close')
  }

  const onWallpaper = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setSetting('wallpaper', await readWallpaper(file))
      setWallErr('')
      play('toggle')
    } catch {
      setWallErr('Görsel okunamadı. Başka bir dosya dene.')
    }
  }

  const exportBackup = async () => {
    try {
      const d = await exportData()
      const json = typeof d === 'string' ? d : JSON.stringify(d, null, 2)
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `anfo-yedek-${new Date().toLocaleDateString('sv-SE')}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setBk({ text: 'Yedek indirildi.' })
      play('toggle')
    } catch {
      setBk({ text: 'Yedek dışa aktarılamadı.', err: true })
    }
  }

  const importBackup = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const ok = importData(await file.text())
      if (ok) {
        setBk({ text: 'Yedek içe aktarıldı. Mevcut veriler korundu, eksikler eklendi.' })
        play('toggle')
      } else {
        setBk({ text: 'Bu dosya bir Anfo yedeği değil ya da bozuk.', err: true })
      }
    } catch {
      setBk({ text: 'Dosya okunamadı.', err: true })
    }
  }

  let i = 0
  return (
    <div className="page settings tex">
      <Aura kind="aurora" still />
      <div className="settings-inner">
        <h1>Ayarlar</h1>

        <section className="card" style={{ '--i': i++ }}>
          <h2>Temalar</h2>
          <div className="sx-themes">
            {THEMES.map((t) => (
              <button key={t.id} className="sx-theme" aria-pressed={isActive(t)} onClick={() => applyTheme(t)}>
                <span className="sx-theme-view" style={{ '--accent': t.settings.accent }}>
                  <i className="sx-theme-dot" style={{ background: t.settings.accent }} />
                </span>
                <span className="sx-theme-name">{t.name}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="card" style={{ '--i': i++ }}>
          <h2>Renk</h2>
          <div className="swatches">
            {Object.entries(ACCENTS).map(([c, name]) => (
              <button key={c} className="swatch" style={{ background: c }} title={name} aria-label={`Vurgu rengi: ${name}`} aria-pressed={s.accent === c} onClick={() => pick('accent', c)} />
            ))}
            <label className="swatch custom" title="Özel renk">
              <input type="color" value={s.accent} onChange={(e) => setSetting('accent', e.target.value)} aria-label="Özel vurgu rengi" />
            </label>
          </div>
          <Range k="shift" value={s.shift} label="Ton kayması" min={0} max={120} step={2} unit="°" />
        </section>

        <section className="card" style={{ '--i': i++ }}>
          <h2>Atmosfer</h2>
          <div className="tiles" role="radiogroup">
            {Object.entries(AURAS).map(([k, label]) => (
              <button key={k} className="tile" role="radio" aria-checked={s.aura === k} onClick={() => pick('aura', k)}>
                <span className="tile-view">
                  <Aura kind={k} still preview />
                </span>
                {label}
              </button>
            ))}
          </div>
          {s.aura !== 'off' && (
            <div className="field">
              <span>Işık rengi</span>
              <div className="swatches">
                {Object.entries(GLOWS).map(([c, name]) => (
                  <button key={c} className="swatch" style={{ background: c }} title={name} aria-label={`Işık rengi: ${name}`} aria-pressed={s.glow === c} onClick={() => pick('glow', c)} />
                ))}
                <label className="swatch custom" title="Özel ışık rengi">
                  <input type="color" value={s.glow} onChange={(e) => setSetting('glow', e.target.value)} aria-label="Özel ışık rengi" />
                </label>
              </div>
            </div>
          )}
          {s.aura !== 'off' && <Range k="auraStrength" value={s.auraStrength} label="Işık" min={10} max={100} step={5} unit="%" />}
          {s.aura !== 'off' && <Range k="auraSpeed" value={s.auraSpeed} label="Işık hızı" min={0} max={200} step={10} unit="%" />}
          {SCENES.includes(s.aura) && <Range k="sceneDensity" value={s.sceneDensity} label="Yoğunluk" min={20} max={150} step={10} />}
          {s.aura === 'rain' && (
            <>
              <Range k="rainBlur" value={s.rainBlur} label="Yağmur bulanıklığı" min={0} max={8} step={0.5} unit="px" />
              <Range k="rainAngle" value={s.rainAngle} label="Eğim" min={-30} max={30} step={2} unit="°" />
              <Range k="rainSpeed" value={s.rainSpeed} label="Hız" min={50} max={200} step={10} unit="%" />
              <Range k="rainLength" value={s.rainLength} label="Damla boyu" min={50} max={200} step={10} unit="%" />
              <Range k="rainOpacity" value={s.rainOpacity} label="Görünürlük" min={10} max={100} step={5} unit="%" />
            </>
          )}
          <Range k="grain" value={s.grain} label="Doku" min={0} max={100} step={5} unit="%" />
        </section>

        <section className="card" style={{ '--i': i++ }}>
          <h2>Biçim</h2>
          <div className="tiles" role="radiogroup">
            {Object.entries(FONTS).map(([k, [label, family]]) => (
              <button key={k} className="tile" role="radio" aria-checked={s.font === k} onClick={() => pick('font', k)}>
                <span className="tile-view type" style={{ fontFamily: family }}>
                  Ağ
                </span>
                {label}
              </button>
            ))}
          </div>
          <Range k="radius" value={s.radius} label="Yumuşaklık" min={4} max={36} step={2} unit="px" />
          <Range k="scale" value={s.scale} label="Ölçek" min={85} max={125} step={5} unit="%" />
          <Range k="blur" value={s.blur} label="Buğu" min={0} max={40} step={1} unit="px" />
          <Range k="islandWidth" value={s.islandWidth} label="Ada genişliği" min={16} max={36} step={1} unit="rem" />
          <div className="field">
            <span>Ada konumu</span>
            <Seg k="dock" value={s.dock} options={{ bottom: 'Altta', top: 'Üstte' }} />
          </div>
          <Toggle k="clock" value={s.clock} label="Ana sayfada saat" />
          <Toggle k="motion" value={s.motion} label="Animasyonlar" />
        </section>

        <section className="card" style={{ '--i': i++ }}>
          <h2>Ana sayfa</h2>
          <div className="field">
            <span>Widget’lar</span>
            <div className="sx-list">
              {widgetIds.map((id) => {
                const on = s.widgets.includes(id)
                const pos = s.widgets.indexOf(id)
                return (
                  <div className="field line sx-row" key={id}>
                    <span>{WIDGETS[id]}</span>
                    <span className="sx-ctl">
                      <button className="sx-icon" disabled={!on || pos <= 0} aria-label={`${WIDGETS[id]} yukarı taşı`} onClick={() => moveWidget(id, -1)}>
                        <ChevronUp size={16} />
                      </button>
                      <button className="sx-icon" disabled={!on || pos >= s.widgets.length - 1} aria-label={`${WIDGETS[id]} aşağı taşı`} onClick={() => moveWidget(id, 1)}>
                        <ChevronDown size={16} />
                      </button>
                      <button className="switch" role="switch" aria-checked={on} aria-label={`${WIDGETS[id]} göster`} onClick={() => toggleWidget(id, !on)}>
                        <i />
                      </button>
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="field">
            <span>Saat stili</span>
            <Seg k="clockStyle" value={s.clockStyle} options={CLOCKS} />
          </div>
          <div className="field">
            <span>Hizalama</span>
            <Seg k="homeAlign" value={s.homeAlign} options={ALIGNS} />
          </div>
          <div className="field">
            <span>Sabit şekli</span>
            <Seg k="pinShape" value={s.pinShape} options={PIN_SHAPES} />
          </div>
          <Range k="pinCount" value={s.pinCount} label="Sabit sayısı" min={3} max={10} step={1} />
          <div className="field">
            <span>Duvar kâğıdı</span>
            <div className="sx-wall">
              {s.wallpaper && <img src={s.wallpaper} alt="" />}
              <label className="link sx-file">
                {s.wallpaper ? 'Değiştir' : 'Görsel seç'}
                <input type="file" accept="image/*" className="sx-sr" onChange={onWallpaper} onKeyDown={openOnKey} />
              </label>
              {s.wallpaper && (
                <button className="link" onClick={() => (setSetting('wallpaper', ''), setWallErr(''), play('close'))}>
                  Kaldır
                </button>
              )}
            </div>
            {wallErr && (
              <p role="alert" className="sx-err">
                {wallErr}
              </p>
            )}
          </div>
          {s.wallpaper && <Range k="wallDim" value={s.wallDim} label="Karartma" min={0} max={90} step={5} unit="%" />}
          <div className="field">
            <span>Açılışta</span>
            <Seg k="startPage" value={s.startPage} options={START_PAGES} />
          </div>
        </section>

        {isNative ? (
          <section className="card" style={{ '--i': i++ }}>
            <h2>Kalkan ve hız</h2>
            <p className="stat">
              <b>{blockedTotal.toLocaleString('tr-TR')}</b> reklam ve izleyici isteği engellendi
            </p>
            <Toggle k="shield" value={s.shield} label="Reklam ve izleyici engelleme" />
            <Toggle k="lite" value={s.lite} label="Hafif mod" hint="web fontları ve sayfa animasyonları kapalı" />
            <Toggle k="noImages" value={s.noImages} label="Görselleri yükleme" hint="veri tasarrufu" />
            <Toggle k="darkPages" value={s.darkPages} label="Sayfaları karart" />
            <Toggle k="desktop" value={s.desktop} label="Masaüstü görünümü iste" />
          </section>
        ) : (
          <section className="card" style={{ '--i': i++ }}>
            <h2>Kalkan ve hız</h2>
            <p>
              Reklam engelleme, hafif mod, okuma modu, sayfa karartma ve uyuyan sekmeler Android uygulamasında çalışır. Web sürümü sayfaları çerçeve içinde gösterdiği için
              sayfa içeriğine müdahale edemez.
            </p>
          </section>
        )}

        <PerfCard s={s} i={i++} />

        <section className="card" style={{ '--i': i++ }}>
          <h2>AI modu</h2>
          <Toggle k="ai" value={s.ai} label="Aramada AI özeti" />
          {s.ai && <Seg k="aiEngine" value={s.aiEngine} options={{ local: 'Cihazda (ücretsiz)', cloud: 'Claude (API anahtarı)' }} />}
          {s.ai && s.aiEngine === 'local' && <LocalModels />}
          {s.ai && s.aiEngine !== 'local' && (
            <label className="field">
              <span>Anthropic API anahtarı</span>
              <SaveField
                value={s.aiKey}
                onSave={(t) => setSetting('aiKey', t)}
                type="password"
                placeholder="sk-ant-…"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          )}
          <p>
            Arama sonuçlarının üstünde kaynak numaralı kısa bir yanıt üretir{isNative ? '; yay menüsündeki “AI özeti” açık sayfayı özetler' : ''}.
            {s.aiEngine === 'local'
              ? ' Cihazda modu küçük bir modeli bu tarayıcının içinde çalıştırır; yanıtlar Claude kadar ayrıntılı olmayabilir.'
              : ' Anahtar yalnızca bu cihazda saklanır ve yalnızca Anthropic’e gönderilir; kullanım kendi hesabından ücretlendirilir.'}
          </p>
        </section>

        <section className="card" style={{ '--i': i++ }}>
          <h2>Bağlantılar</h2>
          <div className="field">
            <span>
              GitHub {s.ghToken && <small>{ghBad ? 'Bağlantı geçersiz — yeniden bağlan' : 'Bağlı'}</small>}
            </span>
            {s.ghToken ? (
              <>
                <p className="links">
                  <button className="link" onClick={() => setUi('github')}>
                    GitHub arayüzünü aç
                  </button>
                  <button className="link" onClick={() => setSetting('ghToken', '')}>
                    Bağlantıyı kes
                  </button>
                </p>
                <Toggle k="ghTakeover" value={s.ghTakeover} label="github.com’u Anfo arayüzünde aç" />
              </>
            ) : (
              <>
                <SaveField
                  value={s.ghToken}
                  onSave={(t) => setSetting('ghToken', t)}
                  type="password"
                  placeholder="kişisel erişim anahtarı"
                  aria-label="GitHub anahtarı"
                  autoComplete="off"
                  spellCheck={false}
                />
                <p>Anahtar yalnızca bu cihazda saklanır.</p>
              </>
            )}
          </div>
          <label className="field">
            <span>Hava durumu şehri</span>
            <input className="text" value={s.city} maxLength={40} placeholder="boşsa konum kullanılır" onChange={(e) => setSetting('city', e.target.value)} />
          </label>
        </section>

        <section className="card" style={{ '--i': i++ }}>
          <h2>Ses</h2>
          <Toggle k="sound" value={s.sound} label="Ses efektleri" />
          {s.sound && (
            <>
              <Seg k="soundPack" value={s.soundPack} options={SOUND_PACKS} sound="nav" />
              <Range k="volume" value={s.volume} label="Düzey" min={0} max={100} step={5} unit="%" />
            </>
          )}
          {'vibrate' in navigator && <Toggle k="haptics" value={s.haptics} label="Dokunsal geri bildirim" />}
        </section>

        <section className="card" style={{ '--i': i++ }}>
          <h2>Arama</h2>
          <label className="field">
            <span>Adın</span>
            <input className="text" value={s.name} maxLength={24} placeholder="karşılama için" onChange={(e) => setSetting('name', e.target.value)} />
          </label>
          <div className="field">
            <span>Sonuçlar</span>
            <Seg k="engine" value={s.engine} options={Object.fromEntries(Object.entries(ENGINES).map(([k, v]) => [k, v.label]))} />
          </div>
          <Toggle k="suggest" value={s.suggest} label="Yazarken öneriler" />
          <p>
            “Anfo” seçiliyken sonuçlar kendi arayüzümüzde listelenir.{' '}
            {isNative
              ? 'Web sonuçları DuckDuckGo’dan, özetler Vikipedi’den alınır.'
              : 'Web sürümünde tarayıcı kısıtı yüzünden yalnızca Vikipedi sonuçları gelir; Android uygulamasında tam web sonuçları vardır.'}
          </p>
        </section>

        <section className="card" style={{ '--i': i++ }}>
          <h2>Kısayollar</h2>
          <p className="sx-note">
            Adres çubuğuna <code>yt kedi</code> yaz → YouTube’da ara.
          </p>
          <div className="sx-bangs">
            {s.bangs.map((b, n) => (
              <div className="sx-bang" key={`${b.k}-${n}`}>
                <kbd className="sx-k">{b.k}</kbd>
                <span className="sx-label">{b.label}</span>
                <span className="sx-url" title={b.url}>
                  {b.url}
                </span>
                <button className="sx-icon" aria-label={`${b.label} kısayolunu sil`} onClick={() => removeBang(n)}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          <form className="sx-form" onSubmit={addBang}>
            <input className="text" placeholder="kısaltma" aria-label="Kısaltma" maxLength={12} value={nb.k} onChange={(e) => setNb({ ...nb, k: e.target.value })} />
            <input className="text" placeholder="ad" aria-label="Ad" maxLength={24} value={nb.label} onChange={(e) => setNb({ ...nb, label: e.target.value })} />
            <input
              className="text sx-wide"
              placeholder="https://…/ara?q=%s"
              aria-label="Adres, %s içermeli"
              spellCheck={false}
              value={nb.url}
              onChange={(e) => setNb({ ...nb, url: e.target.value })}
            />
            <button type="submit" className="link" disabled={!bangOk}>
              Ekle
            </button>
          </form>
          {(kSpace || kTaken) && (
            <p className="sx-err" role="status">
              {kSpace ? 'Kısaltma boşluk içeremez.' : 'Bu kısaltma zaten var. Farklı bir kısaltma seç.'}
            </p>
          )}
        </section>

        <section className="card" style={{ '--i': i++ }}>
          <h2>Eklentiler ve bildirimler</h2>
          <p className="links">
            <button className="link" onClick={() => setUi('ext')}>
              Eklentileri yönet
            </button>
            <button className="link" onClick={() => setUi('notifs')}>
              Bildirim merkezi
            </button>
          </p>
        </section>

        <section className="card" style={{ '--i': i++ }}>
          <h2>Gelişmiş</h2>
          <Toggle k="wikiView" value={s.wikiView} label="Vikipedi’yi Anfo arayüzünde aç" />
          <Toggle
            k="webmcp"
            value={s.webmcp}
            label="WebMCP: yapay zekâ ajanlarına Anfo araçlarını sun"
            hint="Destekleyen tarayıcılarda (ör. Chrome deneysel) sayfa araçlarını ajanlara açar"
          />
          <Toggle k="tabStrip" value={s.tabStrip} label="Tablet/PC sekme şeridi" />
          <Toggle k="toolbar" value={s.toolbar !== false} label="Tablet/PC araç çubuğu" hint="geri, ileri, adres alanı ve menü — Chrome gibi" />
          <Toggle k="bookmarksBar" value={s.bookmarksBar !== false} label="Yer imleri çubuğu" hint="Ctrl+Shift+B" />
          <Toggle k="favicons" value={s.favicons !== false} label="Site simgeleri" hint="Simgeler DuckDuckGo’dan alınır; kapatırsan baş harf gösterilir" />
        </section>

        <section className="card" style={{ '--i': i++ }}>
          <h2>Veri</h2>
          <p>Her şey yalnızca bu cihazda saklanır. Sabitlenmiş bir siteyi kaldırmak için ana sayfada üzerine basılı tut.</p>
          <p className="links">
            <Confirm label={`Geçmişi temizle (${historyCount})`} sure="Emin misin? Temizle" disabled={!historyCount} onConfirm={() => (clearHistory(), play('close'))} />
            <Confirm label="Ayarları sıfırla" sure="Emin misin? Sıfırla" onConfirm={() => (resetSettings(), play('close'))} />
          </p>
          <p>Ctrl+L ara · Alt+T yeni sekme · Alt+W kapat · Alt+←/→ geri, ileri · Alt+R yenile · F11 tam ekran</p>
        </section>

        <section className="card" style={{ '--i': i++ }}>
          <h2>Yedekleme</h2>
          <p>Ayarlar, kısayollar, geçmiş ve notlar tek bir JSON dosyasında. Dosya yalnızca bu cihazda oluşur.</p>
          <p className="links">
            <button className="link" onClick={exportBackup}>
              Dışa aktar
            </button>
            <label className="link sx-file">
              İçe aktar
              <input type="file" accept="application/json,.json" className="sx-sr" onChange={importBackup} onKeyDown={openOnKey} />
            </label>
          </p>
          {bk && (
            <p role={bk.err ? 'alert' : 'status'} className={bk.err ? 'sx-err' : undefined}>
              {bk.text}
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
