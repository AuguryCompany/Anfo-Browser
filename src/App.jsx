import { lazy, Suspense, useEffect } from 'react'
import { useStore, activeTab, setUi, newTab, closeTab, back, forward, reload, reopenClosed, queryOf, setFull, get, registerBuiltins, togglePin, cycleTab, selectTabIndex, setZoom, setSetting, isWeb } from './store'
import { isNative } from './native'
import { BUILTINS } from './features/builtins'
import Island from './components/Island'
import Home from './components/Home'
import Results from './components/Results'
import Reader from './components/Reader'
import WebPane from './components/WebPane'
import Alan from './components/Alan'
import Welcome from './components/Welcome'
import TopBar from './components/TopBar'
import TabStrip from './components/TabStrip'
import Toolbar, { useWide } from './components/Toolbar'
import FindBar from './components/FindBar'
import { wikiTarget } from './features/WikiView'

// Güncellemeden sonra eski sayfa yeni (adı değişmiş) parçaları bulamazsa siyah ekran yerine bir kez yenilenir.
const lazyRetry = (load) =>
  lazy(() =>
    load().catch((e) => {
      if (!sessionStorage.getItem('anfo:reloaded')) {
        sessionStorage.setItem('anfo:reloaded', '1')
        location.reload()
        return new Promise(() => {})
      }
      throw e
    }),
  )

const Settings = lazyRetry(() => import('./components/Settings'))
const GitHub = lazyRetry(() => import('./features/GitHub'))
const Extensions = lazyRetry(() => import('./features/Extensions'))
const Notifs = lazyRetry(() => import('./features/Notifs'))
const Library = lazyRetry(() => import('./features/Library'))
const WikiView = lazyRetry(() => import('./features/WikiView'))
// Vikipedi maddeleri kendi koyu arayüzümüzde açılır ("?anfo=raw" ile orijinali).
export const wikiOn = (url, s) => s.wikiView !== false && !!url && !/[?&]anfo=raw/.test(url) && !!wikiTarget(url)
const PAGES = { settings: Settings, github: GitHub, ext: Extensions, notifs: Notifs, lib: Library }

// Yerleşik eklentiler açılışta yerel tarafa bildirilir (eklenti sayfası hiç açılmasa da çalışsınlar).
registerBuiltins(BUILTINS)

// Chrome benzeri kısayollar (odak bir alandayken free=false → tarayıcının kendi davranışı kalır).
// Döner: kısayol işlendiyse true.
function chromeKey(e, mod, k, free) {
  if (!free) return false
  const on = (fn) => (e.preventDefault(), fn(), true)
  if (k === 'f5') return on(() => reload())
  if (!mod || e.altKey) return false
  if (k === 'pagedown' || k === 'pageup') return on(() => cycleTab(k === 'pagedown' ? 1 : -1))
  if (k === 'tab') return on(() => cycleTab(e.shiftKey ? -1 : 1))
  if (k === '=' || k === '+') return on(() => setZoom(0.1))
  if (k === '-') return on(() => setZoom(-0.1))
  if (k === '0') return on(() => setZoom('reset'))
  if (/^[1-9]$/.test(k) && !e.shiftKey) return on(() => selectTabIndex(+k))
  if (k === 'r') return on(() => reload())
  if (e.shiftKey) {
    if (k === 'n') return on(() => newTab(undefined, { incognito: true }))
    if (k === 'b') return on(() => setSetting('bookmarksBar', get().settings.bookmarksBar === false))
    if (k === 'o') return on(() => setUi('lib'))
    return false
  }
  if (k === 't') return on(() => newTab())
  if (k === 'w') return on(() => closeTab(get().activeId))
  if (k === 'd') {
    const t = activeTab()
    return isWeb(t.url) ? on(() => togglePin(t.url, t.title)) : false
  }
  if (k === 'f') return on(() => setUi('find'))
  if (k === 'j') return on(() => setUi('lib'))
  return false
}

const FONTS = {
  sora: "'Sora Variable'",
  manrope: "'Manrope Variable'",
  grotesk: "'Space Grotesk Variable'",
  system: 'system-ui',
}

export default function App() {
  const ui = useStore((s) => s.ui)
  const tab = useStore(activeTab)
  const full = useStore((s) => s.full)
  const tabCount = useStore((s) => s.tabs.length)
  // Render için gereken ayarlar ayrı seçicilerle okunur; tüm settings nesnesine abone olunmaz.
  const dock = useStore((s) => s.settings.dock)
  const ghToken = useStore((s) => s.settings.ghToken)
  const webmcp = useStore((s) => s.settings.webmcp)
  const wikiView = useStore((s) => s.settings.wikiView)
  // CSS değişkenlerine yazılan görünüm ayarları.
  const accent = useStore((s) => s.settings.accent)
  const shift = useStore((s) => s.settings.shift)
  const glow = useStore((s) => s.settings.glow)
  const radius = useStore((s) => s.settings.radius)
  const font = useStore((s) => s.settings.font)
  const auraStrength = useStore((s) => s.settings.auraStrength)
  const grain = useStore((s) => s.settings.grain)
  const blur = useStore((s) => s.settings.blur)
  const islandWidth = useStore((s) => s.settings.islandWidth)
  const auraSpeed = useStore((s) => s.settings.auraSpeed)
  const scale = useStore((s) => s.settings.scale)
  const motion = useStore((s) => s.settings.motion)
  const perf = useStore((s) => s.settings.perf)
  const toolbar = useStore((s) => s.settings.toolbar !== false)
  const wide = useWide()
  const query = queryOf(tab.url)
  const Page = PAGES[ui]
  const onboarded = useStore((s) => s.settings.onboarded)
  // Tablet/PC'de araç çubuğu açıkken bir sitedeyken ada gereksizdir (geri, ileri, adres, menü üstte): gizlenir,
  // sayfa ekranın altına kadar uzanır. Ana sayfada, aramada, panellerde ve tam ekranda ada kalır.
  const noIsland = wide && toolbar && !full && isWeb(tab.url) && !tab.reader && !Page && ui !== 'arc' && ui !== 'alan'

  // Özelleştirmeler tek noktadan CSS değişkenlerine yazılır; bileşenler yeniden çizilmez.
  useEffect(() => {
    const r = document.documentElement
    r.style.setProperty('--accent', accent)
    r.style.setProperty('--shift', shift)
    r.style.setProperty('--glow', glow)
    // Açık vurgu renginde (kar) üstteki yazı koyu olur, koyu vurguda beyaz.
    const hex = accent.replace('#', '')
    const [R, G, B] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    r.style.setProperty('--on-accent', 0.2126 * R + 0.7152 * G + 0.0722 * B > 0.6 ? '#0c0e12' : '#fff')
    r.style.setProperty('--radius', radius + 'px')
    r.style.setProperty('--font', FONTS[font] || FONTS.sora)
    r.style.setProperty('--aura', auraStrength / 100)
    r.style.setProperty('--grain', (grain / 100) * 0.22)
    r.style.setProperty('--blur', blur + 'px')
    r.style.setProperty('--island-w', islandWidth + 'rem')
    r.style.setProperty('--tempo', auraSpeed > 0 ? 100 / auraSpeed : 1)
    r.toggleAttribute('data-still', auraSpeed === 0)
    r.style.fontSize = (16 * scale) / 100 + 'px'
    r.dataset.motion = motion ? 'on' : 'off'
    r.dataset.perf = perf
  }, [accent, shift, glow, radius, font, auraStrength, grain, blur, islandWidth, auraSpeed, scale, motion, perf])

  // Uygulama görünmezken ışık animasyonu durur (pil ve GPU).
  useEffect(() => {
    const vis = () => document.documentElement.toggleAttribute('data-hidden', document.hidden)
    document.addEventListener('visibilitychange', vis)
    return () => document.removeEventListener('visibilitychange', vis)
  }, [])

  // Web sürümü: uygulama kabuğu servis çalışanıyla önbelleğe alınır; ikinci açılış ağ beklemez.
  useEffect(() => {
    if (!isNative && import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {})
  }, [])

  // WebMCP: tarayıcı yapay zekâ ajanlarına Anfo araçlarını sun (destek varsa ve ayar açıksa).
  useEffect(() => {
    import('./features/webmcp').then((m) => (webmcp ? m.startWebMcp() : m.stopWebMcp()))
  }, [webmcp])

  // GitHub bildirimleri arka planda yoklanır (yalnızca bağlıysa).
  useEffect(() => {
    if (ghToken) import('./features/gh').then((m) => m.startGitHubPoll())
  }, [ghToken])

  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      const typing = /^(input|textarea|select)$/i.test(e.target.tagName) || e.target.isContentEditable
      // Alan içindeyken harf kısayolları (Alt+harf, Ctrl+H, Ctrl+,) yazıyı bozmasın diye devre dışıdır.
      const free = !typing
      if (chromeKey(e, mod, k, free)) return
      if (mod && (k === 'l' || k === 'k')) e.preventDefault(), setUi('alan')
      else if (mod && e.shiftKey && k === 't') e.preventDefault(), reopenClosed()
      else if (free && e.altKey && k === 't') e.preventDefault(), newTab()
      else if (free && e.altKey && k === 'w') e.preventDefault(), closeTab(get().activeId)
      else if (e.altKey && k === 'arrowleft') e.preventDefault(), back()
      else if (e.altKey && k === 'arrowright') e.preventDefault(), forward()
      else if (free && e.altKey && k === 'r') e.preventDefault(), reload()
      else if (free && e.altKey && k === 'n') e.preventDefault(), setUi('notifs')
      else if (free && e.altKey && k === 'g') e.preventDefault(), setUi('github')
      else if (free && e.altKey && k === 'e') e.preventDefault(), setUi('ext')
      else if (free && ((mod && k === 'h') || (e.altKey && k === 'h'))) e.preventDefault(), setUi('lib')
      else if (free && mod && k === ',') e.preventDefault(), setUi('settings')
      // Esc: alan kendi Esc işini yaptıysa (defaultPrevented) panel kapanmaz.
      else if (k === 'escape' && get().ui) {
        if (!(typing && e.defaultPrevented)) setUi(null)
      } else if (k === 'f11' || (k === 'escape' && get().full)) e.preventDefault(), setFull(!get().full)
      // Boş alanda yazmaya başlamak doğrudan aramayı açar.
      else if (!get().ui && !typing && !mod && !e.altKey && e.key.length === 1 && e.key !== ' ') e.preventDefault(), setUi('alan', e.key)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app" data-dock={dock} data-ui={ui || undefined} data-full={full || undefined} data-noisland={noIsland || undefined} data-native={isNative}>
      <section className="stage">
        <WebPane />
        {!tab.url && <Home />}
        {query != null && <Results key={tab.id + query} q={query} rev={tab.rev || 0} />}
        {wikiOn(tab.url, { wikiView }) && !tab.reader && (
          <Suspense fallback={null}>
            <WikiView key={tab.url} url={tab.url} />
          </Suspense>
        )}
        {tab.reader && <Reader key={tab.id + tab.reader.url} doc={tab.reader} />}
        {Page && (
          <Suspense fallback={null}>
            <Page />
          </Suspense>
        )}
        {/* Masaüstünde araç çubuğu açıkken geri/ana sayfa düğmeleri gereksizdir; panel (Page) açıksa geri oku kalır. */}
        {!full && ui !== 'alan' && !(wide && toolbar && !Page) && <TopBar tab={tab} ui={ui} />}
        {!full && (toolbar || tabCount > 1) && <TabStrip />}
        {!full && <Toolbar />}
      </section>
      {!noIsland && <Island tab={tab} ui={ui} />}
      {ui === 'alan' && <Alan key={tab.id} />}
      {ui === 'find' && <FindBar tabId={tab.id} onClose={() => setUi(null)} />}
      {!onboarded && <Welcome />}
    </div>
  )
}
