import { useMemo } from 'react'
import { useStore } from '../store'
import '../features/scenes.css'

// Arka plan ışığı: tek renk (--glow), bulanıklık filtresi yok (ucuz).
// Kullanıcı "Işık" seçtiyse (glow) her sayfada aynı küçük ışık kullanılır; sayfaların
// verdiği `kind` yalnızca diğer atmosferlerde geçerlidir. `preview` ayar önizlemesi içindir.
// Sahne türleri (space, rain, snow, stars) parçacıklarını bileşen ilk render'ında bir kez üretir;
// canvas ve JS animasyon döngüsü yoktur, hareket yalnızca CSS transform/opacity ile olur.

const SCENES = ['space', 'rain', 'snow', 'stars']

// Sabit tohumlu sözde-rastgele sayı üreteci (mulberry32): her render aynı sahneyi verir.
function mulberry32(seed) {
  let a = seed
  return function next() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Ayar değerini sayıya çevirir, sınırlar; geçersizse varsayılana düşer.
const num = (v, d, lo, hi) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d)

// Parçacık verisi. Konumlar yüzde, süreler saniye cinsindendir; CSS değişkenlerine aktarılır.
function build(kind, n) {
  const r = mulberry32(7)
  const f = (a, b) => a + (b - a) * r()

  if (kind === 'space') {
    // Üç katman; her katman 0–50 aralığında yerleşir ve iki kopyayla 0–100 olur (kesintisiz kayma).
    const layers = [
      { cls: 'sc-far', n: Math.round(n * 0.5) },
      { cls: 'sc-mid', n: Math.round(n * 0.3) },
      { cls: 'sc-near', n: Math.max(1, Math.round(n * 0.2)) },
    ]
    return layers.map((L) => {
      const stars = []
      for (let i = 0; i < L.n; i++) {
        const x = f(0, 50)
        const y = f(0, 100)
        const t = f(3, 7)
        const d = f(0, t)
        stars.push({ x, y, t, d }, { x: x + 50, y, t, d })
      }
      return { cls: L.cls, stars }
    })
  }

  if (kind === 'rain') {
    // Üç derinlik katmanı: uzak (ince, soluk, çok bulanık), orta, yakın (uzun, net, hızlı).
    // Bulanıklık ve hız katman kapsayıcısında/CSS'te verilir; parçacık başına filtre yoktur.
    const layers = [
      { cls: 'sc-rl-far', share: 0.4 },
      { cls: 'sc-rl-mid', share: 0.35 },
      { cls: 'sc-rl-near', share: 0.25 },
    ]
    return layers.map((L) => ({
      cls: L.cls,
      drops: Array.from({ length: Math.max(1, Math.round(n * L.share)) }, () => {
        const x = f(0, 100)
        const y = f(0, 100)
        const h = f(40, 90)
        const t = f(0.6, 1.4)
        const d = f(0, t)
        return { x, y, h, t, d }
      }),
    }))
  }

  if (kind === 'snow') {
    return Array.from({ length: n }, () => {
      const x = f(0, 100)
      const y = f(0, 100)
      const s = f(2, 5)
      const o = f(0.35, 0.95)
      const t = f(8, 18)
      const d = f(0, t)
      const w = f(3, 10)
      const k = f(3, 6)
      return { x, y, s, o, t, d, w, k }
    })
  }

  // stars: hareketsiz ama parıldayan yıldızlar
  return Array.from({ length: n }, () => {
    const x = f(0, 100)
    const y = f(0, 100)
    const s = f(1, 2.5)
    const t = f(3, 7)
    const d = f(0, t)
    return { x, y, s, t, d }
  })
}

function renderScene(kind, parts) {
  if (kind === 'space') {
    return (
      <>
        <div className="sc-bob">
          {parts.map((L) => (
            <div key={L.cls} className={`sc-layer ${L.cls}`}>
              {L.stars.map((p, i) => (
                <div key={i} className="sc-star" style={{ '--x': p.x, '--y': p.y, '--t': p.t, '--d': p.d }} />
              ))}
            </div>
          ))}
        </div>
        <div className="sc-nebula" />
        <div className="sc-shoot" />
      </>
    )
  }

  if (kind === 'rain') {
    return (
      <>
        <div className="sc-rainwrap">
          {parts.map((L) => (
            <div key={L.cls} className={`sc-rainlayer ${L.cls}`}>
              {L.drops.map((p, i) => (
                <div key={i} className="sc-drop" style={{ '--x': p.x, '--y': p.y, '--h': p.h, '--t': p.t, '--d': p.d }} />
              ))}
            </div>
          ))}
        </div>
        <div className="sc-rainmist" />
      </>
    )
  }

  if (kind === 'snow') {
    return parts.map((p, i) => (
      <div
        key={i}
        className="sc-flake"
        style={{ '--x': p.x, '--y': p.y, '--s': p.s, '--o': p.o, '--t': p.t, '--d': p.d, '--w': p.w, '--k': p.k }}
      >
        <div />
      </div>
    ))
  }

  // stars
  return (
    <>
      <div className="sc-cloud" />
      <div className="sc-field">
        {parts.map((p, i) => (
          <div key={i} className="sc-star" style={{ '--x': p.x, '--y': p.y, '--sz': p.s + 'px', '--t': p.t, '--d': p.d }} />
        ))}
      </div>
    </>
  )
}

export default function Aura({ kind, still, preview }) {
  const set = useStore((s) => s.settings.aura)
  // Parçacık sayısı ayardan gelir (20–150, varsayılan 60); önizlemede 25.
  const density = useStore((s) => s.settings.sceneDensity)
  // Yağmur ayarları (yoksa varsayılan): bulanıklık px, açı derece, hız %, uzunluk %, opaklık %.
  const rainBlur = useStore((s) => s.settings.rainBlur)
  const rainAngle = useStore((s) => s.settings.rainAngle)
  const rainSpeed = useStore((s) => s.settings.rainSpeed)
  const rainLength = useStore((s) => s.settings.rainLength)
  const rainOpacity = useStore((s) => s.settings.rainOpacity)
  // Arka plan her sayfada kullanıcının seçtiği atmosferdir; yalnızca ayar önizlemeleri kendi türünü çizer.
  const k = preview ? kind : set
  const scene = SCENES.includes(k)
  const n = preview ? 25 : Math.min(150, Math.max(20, Number.isFinite(density) ? density : 60))
  const parts = useMemo(() => (scene ? build(k, n) : null), [k, n, scene])

  if (k === 'off') return null
  const calm = still && k !== 'glow' && k !== 'mist'
  const dataStill = calm || (preview && still) || undefined

  if (k === 'rain') {
    const rainStyle = {
      '--rain-blur': num(rainBlur, 2.5, 0, 8) + 'px',
      '--rain-angle': num(rainAngle, 12, -30, 30),
      '--rain-speed': 100 / num(rainSpeed, 100, 50, 200),
      '--rain-len': num(rainLength, 100, 50, 200) / 100,
      '--rain-op': num(rainOpacity, 45, 10, 100) / 100,
    }
    return (
      <div className="aura scene" data-kind={k} data-still={dataStill} style={rainStyle} aria-hidden>
        {renderScene(k, parts)}
      </div>
    )
  }

  if (scene) {
    return (
      <div className="aura scene" data-kind={k} data-still={dataStill} aria-hidden>
        {renderScene(k, parts)}
      </div>
    )
  }

  return (
    <div className="aura" data-kind={k} data-still={dataStill} aria-hidden>
      <i />
      <i />
      <i />
    </div>
  )
}
