import { useEffect, useRef } from 'react'
import { ExternalLink } from 'lucide-react'
import { useStore, loaded, isWeb, get, webLive, hostOf, setUi, back, useSleepTick } from '../store'
import { isNative, WebTabs } from '../native'
import Aura from './Aura'
import Favicon from './Favicon'
import { wikiTarget } from '../features/WikiView'

const wiki = (url) => get().settings.wikiView !== false && !/[?&]anfo=raw/.test(url) && !!wikiTarget(url)

// Kendini çerçeve içinde gösterilmeye kapatan (X-Frame-Options / CSP frame-ancestors) yaygın siteler.
// Web sürümünde bunlar için kırık sayfa yerine kendi kartımız gösterilir. (Android'de gerçek WebView var, sorun yok.)
const NO_FRAME = /(^|\.)(github\.com|google\.[a-z.]+|youtube\.com|x\.com|twitter\.com|facebook\.com|instagram\.com|reddit\.com|linkedin\.com|amazon\.[a-z.]+|stackoverflow\.com|netflix\.com|spotify\.com|discord\.com|whatsapp\.com|microsoft\.com|apple\.com|chatgpt\.com|claude\.ai|notion\.so|figma\.com|medium\.com|twitch\.tv|tiktok\.com|pinterest\.com|yandex\.[a-z.]+|bing\.com|duckduckgo\.com)$/i
export const frameBlocked = (url) => {
  try {
    const u = new URL(url)
    if (/google\./.test(u.hostname) && u.searchParams.get('igu') === '1') return false
    return NO_FRAME.test(u.hostname)
  } catch {
    return false
  }
}

function Blocked({ t }) {
  const host = hostOf(t.url)
  return (
    <div className="page blocked tex">
      <Aura />
      <div className="blocked-in">
        <Favicon url={t.url} size={28} />
        <h1>{host}</h1>
        <p>Bu site kendini başka uygulamaların içinde açılmaya kapatıyor. Web sürümünde ayrı pencerede açılır; Android uygulamasında doğrudan burada açılır.</p>
        <div className="blocked-act">
          <button className="blocked-btn" onClick={() => window.open(t.url, '_blank', 'noopener')}>
            <ExternalLink size={16} /> Yeni pencerede aç
          </button>
          {/github\.com$/.test(host) && (
            <button className="blocked-btn ghost" onClick={() => setUi('github')}>
              Anfo GitHub arayüzü
            </button>
          )}
          <button className="blocked-btn ghost" onClick={() => back()}>
            Geri dön
          </button>
        </div>
      </div>
    </div>
  )
}

// Web: son kullanılan birkaç sekme kendi iframe'inde canlı kalır; diğerleri boşaltılır,
// seçilince yeniden yüklenir (Android'deki uyuyan sekmelerin karşılığı).
function Frames() {
  const tabs = useStore((s) => s.tabs)
  const activeId = useStore((s) => s.activeId)
  useStore((s) => s.settings.liveTabs)
  useSleepTick() // dakikalık uyutma denetimi yeniden hesaplatır
  const keep = webLive()
  return tabs.map((t) =>
    !isWeb(t.url) || !keep.includes(t.id) || wiki(t.url) ? null : frameBlocked(t.url) ? (
      t.id === activeId && <Blocked key={t.id} t={t} />
    ) : (
        <iframe
          key={t.id + ':' + t.idx + ':' + (t.rev || 0)}
          className="frame"
          src={t.url}
          title={t.title}
          hidden={t.id !== activeId}
          onLoad={() => loaded(t.id)}
          referrerPolicy="no-referrer"
          allow="fullscreen; clipboard-write"
        />
      ),
  )
}

// APK: bu boş alanın konumu yerel WebView'a bildirilir; sayfa onun üzerinde çizilir.
function NativeSlot() {
  const ref = useRef(null)
  const activeId = useStore((s) => s.activeId)
  const url = useStore((s) => s.tabs.find((t) => t.id === s.activeId)?.url)
  const reading = useStore((s) => !!s.tabs.find((t) => t.id === s.activeId)?.reader)
  const full = useStore((s) => s.full)
  const ui = useStore((s) => s.ui)
  const pop = useStore((s) => s.pop > 0)
  const radius = useStore((s) => s.settings.radius)
  const scale = useStore((s) => s.settings.scale)
  const dock = useStore((s) => s.settings.dock)

  useEffect(() => {
    const el = ref.current
    const sync = () => {
      const r = el.getBoundingClientRect()
      WebTabs.setBounds({ x: r.left, y: r.top, width: r.width, height: r.height, radius: get().full ? 0 : get().settings.radius })
    }
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    window.addEventListener('resize', sync)
    sync()
    return () => (ro.disconnect(), window.removeEventListener('resize', sync))
  }, [radius, scale, dock, full])

  // Yerel WebView, uygulama arayüzünün ÜSTÜNDE çizilir: yay menüsü ve araç çubuğundaki açılır menüler (⋮)
  // dahil her katman açıkken gizlenmeli, yoksa menü sayfanın altında kalır ve yalnızca ilk satırı
  // ("Yeni sekme") görünür. Yalnızca "sayfada bul" açıkken sayfa görünür kalır (çerçeve kısalır).
  const covered = (!!ui && ui !== 'find') || pop
  useEffect(() => {
    if (isWeb(url) && !covered && !reading && !wiki(url)) WebTabs.show({ id: activeId })
    else WebTabs.hideAll()
  }, [activeId, url, covered, reading])

  return <div ref={ref} className="frame" />
}

export default isNative ? NativeSlot : Frames
