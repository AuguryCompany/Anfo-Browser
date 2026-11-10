import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { isNative, WebTabs } from './native'
import { play } from './sound'
import { cloudReady } from './features/providers'
import { putFav, clearFavs } from './features/favicons'

const KEY = 'anfo:v3'

export const DEFAULT_SETTINGS = {
  name: '',
  accent: '#c9d4e3', // kar: soğuk, açık arduvaz
  shift: 30, // ikincil tonların vurgu renginden sapması (derece)
  aura: 'mist', // mist | glow | horizon | aurora | orb | off
  glow: '#7d8ca1', // arka plan ışığının tek rengi (soğuk arduvaz sis)
  theme: 'snow',
  sceneDensity: 60, // uzay/yağmur/kar sahnelerinde parçacık sayısı
  rainBlur: 2.5, // yağmur bulanıklığı (px)
  rainAngle: 12, // yağmur eğimi (derece)
  rainSpeed: 100, // %
  rainLength: 100, // %
  rainOpacity: 45, // %
  tabStrip: true, // tablet/PC üst sekme şeridi
  wikiView: true, // Vikipedi maddelerini Anfo arayüzünde göster
  webmcp: true,
  toolbar: true, // tablet/PC Chrome tarzı araç çubuğu
  bookmarksBar: true, // araç çubuğunun altında yer imleri çubuğu
  favicons: true, // site simgeleri: cihazdaki önbellekten ya da doğrudan sitenin kendisinden (üçüncü taraf yok) // WebMCP: tarayıcı yapay zekâ ajanlarına Anfo araçlarını sun
  auraStrength: 80,
  grain: 55,
  radius: 26,
  font: 'sora', // sora | manrope | grotesk | system
  scale: 100,
  dock: 'bottom', // bottom | top
  clock: true,
  motion: true,
  sound: true,
  volume: 55,
  soundPack: 'deep', // deep | velvet | ice
  haptics: true,
  engine: 'anfo',
  suggest: true,
  // Android uygulamasında geçerli olanlar:
  shield: true, // reklam ve izleyici engelleme
  shieldOff: [], // kalkanın kapalı olduğu siteler
  lite: false, // hafif mod: web fontları ve animasyonlar kapalı
  noImages: false, // veri tasarrufu
  darkPages: false,
  desktop: false,
  thirdPartyCookies: false, // üçüncü taraf çerezler: kapalıyken siteler arası takip engellenir
  clearOnStart: false, // uygulama her açıldığında geçmiş, çerezler ve site verileri silinir
  safeNet: true, // engelleri aş: şifreli DNS (DoH) + site adını bölerek gönderme (yerel vekil)
  liveTabs: 4, // aynı anda bellekte tutulan sekme sayısı
  // AI modu
  ai: true,
  aiEngine: 'local', // local: cihazda çalışan küçük model | cloud: Claude (API anahtarı)
  aiProvider: 'anthropic', // anthropic | openrouter | openai | gemini | groq | custom
  aiKeys: {}, // sağlayıcı → API anahtarı (yalnızca bu cihazda)
  aiModels: {}, // sağlayıcı → seçili model (boşsa sağlayıcının varsayılanı)
  aiRegion: 'intl', // Alibaba Cloud bölgesi: intl (uluslararası) | cn (Çin)
  aiBases: {}, // sağlayıcı → adres (Azure, Alibaba Cloud bölgesi, özel OpenAI uyumlu sunucu)
  localModel: '', // seçili ve indirilmiş yerel model (boşsa yerel AI hazır değil)
  // ana sayfa ve görünüm
  market: { items: [], range: '1d' }, // Piyasa widget'ı: [{ s: sembol, big: grafikli mi }]; boşsa varsayılan liste
  news: { topic: 'Gündem', count: 5 }, // Haberler widget'ı
  widgets: [], // gösterilen widget'lar, sırasıyla — kullanıcı eklemeden hiçbiri görünmez
  pinShape: 'circle', // circle | squircle | square
  pinCount: 6,
  homeAlign: 'center', // center | left
  clockStyle: 'split', // split | thin | bold
  blur: 18, // buğu miktarı (px)
  auraSpeed: 100, // ışık hareket hızı (%)
  islandWidth: 21, // ada genişliği (rem)
  wallpaper: '', // dataURL; boşsa ışık kullanılır
  wallDim: 45, // duvar kâğıdı karartma (%)
  startPage: 'session', // session | home
  // bağlantılar
  city: '', // hava durumu şehri (boşsa konum sorulur)
  ghToken: '', // GitHub kişisel erişim anahtarı
  ghTakeover: true, // github.com açılınca Anfo'nun GitHub arayüzünü göster
  // kısayollar: "yt kedi" → YouTube'da "kedi"
  bangs: [
    { k: 'yt', label: 'YouTube', url: 'https://www.youtube.com/results?search_query=%s' },
    { k: 'g', label: 'Google', url: 'https://www.google.com/search?q=%s' },
    { k: 'w', label: 'Vikipedi', url: 'https://tr.wikipedia.org/w/index.php?search=%s' },
    { k: 'gh', label: 'GitHub', url: 'https://github.com/search?q=%s' },
    { k: 'm', label: 'Harita', url: 'https://www.openstreetmap.org/search?query=%s' },
    { k: 'tr', label: 'Çeviri', url: 'https://translate.google.com/?sl=auto&tl=tr&text=%s' },
  ],
  // eklentiler (Android'de sayfalara enjekte edilir)
  builtinExt: {}, // { [id]: true }
  extensions: [], // [{ id, name, match, css, js, on }]
  notes: '',
  // performans ve bellek
  perf: 'balanced', // high | balanced | saver
  sleepAfter: 15, // arka plandaki sekmeyi N dakika sonra uyut (0 = asla)
  cacheMode: 'normal', // normal | aggressive | off (Android HTTP önbelleği)
  prewarm: false, // bağlantıların üzerine gelince sunucuya önceden bağlan (tıklamadan siteye IP gider)
}
const NATIVE_KEYS = ['shield', 'shieldOff', 'lite', 'noImages', 'darkPages', 'desktop', 'safeNet', 'thirdPartyCookies', 'builtinExt', 'extensions', 'cacheMode']

// Eklentilerin yerel tarafa gidecek hali; yerleşikler ./features/builtins.js'ten kaydedilir.
let BUILTINS = []
export const registerBuiltins = (list) => {
  BUILTINS = list
  syncNative()
}
const activeScripts = (s) => [
  ...BUILTINS.filter((b) => s.builtinExt[b.id]),
  ...s.extensions.filter((e) => e.on),
].map(({ match = '', css = '', js = '' }) => ({ match, css, js }))

// "anfo" = sonuçlar kendi arayüzümüzde. Diğerleri sayfayı doğrudan o motorda açar.
export const ENGINES = {
  anfo: { label: 'Anfo' },
  google: { label: 'Google', url: isNative ? 'https://www.google.com/search?q=' : 'https://www.google.com/search?igu=1&q=' },
  duckduckgo: { label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  bing: { label: 'Bing', url: 'https://www.bing.com/search?q=' },
  brave: { label: 'Brave', url: 'https://search.brave.com/search?q=' },
}

const SEARCH = 'anfo:search?q='
export const isWeb = (u) => /^https?:/i.test(u || '')
export const queryOf = (u) => (u && u.startsWith(SEARCH) ? decodeURIComponent(u.slice(SEARCH.length)) : null)
export const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}
const titleFor = (url) => queryOf(url) ?? hostOf(url)
export const labelOf = (t) => queryOf(t.url) ?? (t.title || hostOf(t.url) || 'Yeni sekme')

const DEFAULT_PINS = [
  { url: 'https://tr.wikipedia.org', title: 'Vikipedi' },
  { url: 'https://www.openstreetmap.org', title: 'Harita' },
  { url: 'https://archive.org', title: 'Arşiv' },
  ...(isNative ? [{ url: 'https://www.youtube.com', title: 'YouTube' }, { url: 'https://github.com', title: 'GitHub' }] : [{ url: 'https://www.gutenberg.org', title: 'Kitaplık' }]),
]

const uid = () => Math.random().toString(36).slice(2, 10)
const blankTab = () => ({ id: uid(), url: '', title: '', stack: [], idx: -1, zoom: 1 })

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x)
// Kayıtlı sekmeyi güvenli hale getirir (bozuk alanlar varsayılanla değişir).
const normTab = (t) => {
  const stack = Array.isArray(t.stack) ? t.stack.filter((u) => typeof u === 'string') : []
  return {
    id: t.id ? String(t.id) : uid(),
    url: typeof t.url === 'string' ? t.url : '',
    title: typeof t.title === 'string' ? t.title : '',
    stack,
    idx: Number.isInteger(t.idx) ? Math.min(t.idx, stack.length - 1) : stack.length - 1,
  }
}
// url alanı olmayan (bozuk) pins/history/closedTabs öğeleri atılır.
const withUrl = (list) => (Array.isArray(list) ? list.filter((x) => isObj(x) && typeof x.url === 'string') : null)

function load() {
  let saved = {}
  try {
    saved = JSON.parse(localStorage.getItem(KEY)) || {}
  } catch {}
  if (!isObj(saved)) saved = {}
  const savedSettings = isObj(saved.settings) ? saved.settings : null
  const settings = { ...DEFAULT_SETTINGS, ...savedSettings }
  // Yerel AI öncesi kayıtlar: API anahtarı girilmişse bulut AI ile devam et.
  if (savedSettings && !savedSettings.aiEngine && savedSettings.aiKey) settings.aiEngine = 'cloud'
  // Tek Anthropic anahtarı → sağlayıcı başına anahtarlar.
  if (savedSettings?.aiKey) {
    settings.aiKeys = { anthropic: savedSettings.aiKey, ...(isObj(settings.aiKeys) ? settings.aiKeys : {}) }
  }
  delete settings.aiKey
  // Tek 'aiBase' (özel sağlayıcı) → sağlayıcı başına adresler.
  if (savedSettings?.aiBase) settings.aiBases = { custom: savedSettings.aiBase, ...(isObj(settings.aiBases) ? settings.aiBases : {}) }
  delete settings.aiBase
  // Sürüm 4 öncesi kayıtlar için tek seferlik göç.
  // Sürüm 5: gizlilik öncelikli varsayılanlar mevcut kullanıcılara da bir kez uygulanır.
  if ((saved.v || 0) < 5 && savedSettings) Object.assign(settings, { prewarm: false })
  // Sürüm 6: simgeler artık üçüncü taraf hizmet kullanmadan geliyor; sürüm 5'te kapatılan simgeler geri açılır.
  if ((saved.v || 0) < 6 && savedSettings) settings.favicons = true
  if ((saved.v || 0) < 4 && savedSettings) {
    // Eski kayıtlar: tek renkli küçük ışığa geç.
    if (!savedSettings.glow) settings.widgets = [] // eski sürüm widget'ları kendiliğinden eklemişti
    // Kar temasına geçiş: eski kiraz kayıtları yeni soğuk paletle açılır.
    if (!savedSettings.theme) Object.assign(settings, { accent: DEFAULT_SETTINGS.accent, glow: DEFAULT_SETTINGS.glow, aura: 'mist', shift: 10, theme: 'snow' })
  }
  const tabsIn = Array.isArray(saved.tabs) ? saved.tabs.filter(isObj).map(normTab) : []
  let tabs = tabsIn.length ? tabsIn : [blankTab()]
  if (settings.startPage === 'home') tabs = [blankTab()]
  return {
    settings,
    notifs: Array.isArray(saved.notifs) ? saved.notifs : [],
    readLater: Array.isArray(saved.readLater) ? saved.readLater : [],
    closedTabs: (withUrl(saved.closedTabs) || []).slice(0, 10),
    tabs,
    activeId: tabs.some((t) => t.id === saved.activeId) ? saved.activeId : tabs[0].id,
    pins: withUrl(saved.pins) || DEFAULT_PINS,
    history: withUrl(saved.history) || [],
    blockedTotal: saved.blockedTotal || 0,
    sleepTick: 0, // uyutma zamanlayıcısının nabzı (kaydedilmez)
    ui: null, // 'alan' | 'arc' | 'settings' | null
    full: false, // tam ekran
    pop: 0, // açık açılır menü sayısı (araç çubuğu ⋮, yer imi listesi…); yerel WebView'ı gizler
  }
}

let state = load()
const subs = new Set()
let timer
let quotaWarned = false

function persist() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    const { settings, tabs, activeId, pins, history, blockedTotal, notifs, readLater, closedTabs } = state
    // Gizli sekmeler diske yazılmaz.
    const slim = tabs.filter((t) => !t.incognito).map(({ id, url, title, stack, idx }) => ({ id, url, title, stack, idx }))
    try {
      localStorage.setItem(KEY, JSON.stringify({ v: 6, settings, tabs: slim, activeId, pins, history, blockedTotal, notifs, readLater, closedTabs }))
      quotaWarned = false
    } catch {
      // Bayrak: notify → set → persist döngüsüne girmemek ve uyarıyı bir kez göstermek için.
      if (quotaWarned) return
      quotaWarned = true
      notify({ kind: 'system', title: 'Depolama dolu', body: 'Ayarlar kaydedilemedi. Duvar kâğıdını kaldırmayı ya da geçmişi temizlemeyi dene.', key: 'quota' })
    }
  }, 250)
}
persist() // göçü ve normalleştirilmiş durumu kaydet

export const get = () => state
export function set(patch) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }
  subs.forEach((f) => f())
  persist()
}
const subscribe = (f) => (subs.add(f), () => subs.delete(f))
export const useStore = (sel) => useSyncExternalStore(subscribe, () => sel(state))

// Görünür durum değişiklikleri View Transitions ile yumuşakça geçer (destek yoksa anında).
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
function soft(fn) {
  if (!document.startViewTransition || !state.settings.motion || state.settings.perf === 'saver' || reduce.matches) return fn()
  document.startViewTransition(() => flushSync(fn))
}

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/.*)?$/
// Alan adının uzantısı harf içermeli: "3.14", "v1.10" URL sayılmaz.
const DOMAIN = /^[^\s/]+\.(?=[a-z0-9-]*[a-z])[a-z0-9-]{2,}(:\d+)?(\/.*)?$/i
const LOCAL_HOST = /^localhost(:\d+)?(\/|$)|^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/|$)/i
export const looksLikeUrl = (q) =>
  /^https?:\/\//i.test(q) || (!/\s/.test(q) && (/^localhost(:\d+)?(\/|$)/i.test(q) || IPV4.test(q) || DOMAIN.test(q)))

// "yt kedi" ya da "!yt kedi" → { ...kısayol, rest: 'kedi' }. Tek kelime ("yt") rest: '' ile döner.
export function bangOf(q, s = state) {
  const m = q.trim().match(/^!?(\S+)(?:\s+(.+))?$/)
  if (!m) return null
  const b = s.settings.bangs.find((x) => x.k.toLowerCase() === m[1].toLowerCase())
  return b ? { ...b, rest: m[2] || '' } : null
}

const originOf = (u) => {
  try {
    return new URL(u).origin
  } catch {
    return u
  }
}

export function resolveInput(raw) {
  const q = raw.trim()
  if (!q) return ''
  if (/^https?:\/\//i.test(q)) return q
  if (looksLikeUrl(q)) return (LOCAL_HOST.test(q) ? 'http://' : 'https://') + q
  const bang = bangOf(q)
  // Tek kelimelik kısayol ("yt") arama yerine kısayolun alan adını açar.
  if (bang) return bang.rest ? bang.url.replace('%s', encodeURIComponent(bang.rest)) : originOf(bang.url.replace('%s', ''))
  const engine = ENGINES[state.settings.engine]
  return (engine?.url || SEARCH) + encodeURIComponent(q)
}
export const engineUrl = (key, q) => ENGINES[key].url + encodeURIComponent(q)

const tabOf = (id) => state.tabs.find((t) => t.id === id)
const patchTab = (id, patch) =>
  set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...(typeof patch === 'function' ? patch(t) : patch) } : t)) }))

export const activeTab = (s = state) => s.tabs.find((t) => t.id === s.activeId) || s.tabs[0]

function addHistory(url, title) {
  if (!url) return
  set((s) => ({ history: [{ url, title: title || titleFor(url), t: Date.now() }, ...s.history.filter((h) => h.url !== url)].slice(0, 200) }))
}

// ---------- yerel WebView yaşam döngüsü ----------
// WebView'lar tembel oluşturulur. `live` en son kullanılandan eskiye doğru sıralıdır;
// sınır aşılınca en eski sekme uyutulur (belleği bırakır, seçilince yeniden yüklenir).
let live = []
const isLive = (id) => live.includes(id)
const seen = new Map() // sekme kimliği → en son görüldüğü an (uyutma zamanlayıcısı için)
function sleepTab(x) {
  live = live.filter((y) => y !== x)
  WebTabs.close({ id: x })
  patchTab(x, { nativeIdx: undefined, asleep: true, loading: false })
}
function touch(id) {
  seen.set(id, Date.now())
  live = [id, ...live.filter((x) => x !== id)]
  const extra = live.slice(Math.max(1, state.settings.liveTabs)).filter((x) => x !== state.activeId)
  extra.forEach(sleepTab)
}
// Bellek baskısında ya da elle: görünen dışındaki tüm sekmeleri uyut.
export function sleepBackground() {
  if (!isNative) return 0
  const bg = live.filter((x) => x !== state.activeId)
  bg.forEach(sleepTab)
  return bg.length
}
// Web sürümü: yalnızca son kullanılan birkaç sekmenin iframe'i bellekte tutulur, gerisi boşaltılır.
let recentWeb = []
export function webLive() {
  const now = Date.now()
  const a = state.activeId
  seen.set(a, now)
  recentWeb = [a, ...recentWeb.filter((x) => x !== a)]
  const idle = state.settings.sleepAfter * 60000
  return recentWeb
    .filter((id) => {
      const t = tabOf(id)
      return t && isWeb(t.url) && (id === a || !idle || now - (seen.get(id) || now) < idle)
    })
    .slice(0, Math.max(1, state.settings.liveTabs))
}
// Arka planda uzun süre bakılmayan sekmeler uyur (Android'de WebView kapanır, web'de iframe boşaltılır).
setInterval(() => {
  const idle = state.settings.sleepAfter * 60000
  if (!idle) return
  const now = Date.now()
  if (isNative) live.filter((x) => x !== state.activeId && now - (seen.get(x) || now) > idle).forEach(sleepTab)
  else set({ sleepTick: now }) // web: iframe'ler yeniden hesaplansın (useSleepTick ile dinlenir)
}, 60000)
export const useSleepTick = () => useStore((s) => s.sleepTick)
export const liveCount = () => (isNative ? live.length : webLive().length)
function openNative(id, url) {
  // Gizli sekme yerel tarafta ayrı bir profilde (çerez, depolama, önbellek) açılır.
  WebTabs.open({ id, url, incognito: !!tabOf(id)?.incognito })
  touch(id)
}
function ensureNative(tab) {
  if (!isNative || !tab || !isWeb(tab.url)) return
  if (isLive(tab.id)) return touch(tab.id)
  openNative(tab.id, tab.url)
  patchTab(tab.id, { nativeIdx: tab.idx, loading: true, asleep: false })
}
function syncNative(reload = false) {
  if (!isNative) return
  const s = state.settings
  WebTabs.configure({ shield: s.shield, lite: s.lite, blockImages: s.noImages, dark: s.darkPages, desktop: s.desktop, safeNet: s.safeNet !== false, thirdPartyCookies: !!s.thirdPartyCookies, allow: s.shieldOff, scripts: activeScripts(s), cacheMode: s.cacheMode, reload })
}

// Sekmenin geçmiş yığınındaki i. girdiyi gösterir (arama sayfası ya da site).
function enter(id, i) {
  const t = tabOf(id)
  const url = t.stack[i]
  if (isNative && isWeb(url)) {
    if (t.nativeIdx === i && isLive(id)) return patchTab(id, { idx: i, url: t.lastUrl || url, title: t.lastTitle || hostOf(url), reader: null })
    openNative(id, url)
    return patchTab(id, { idx: i, url, lastUrl: url, lastTitle: '', title: hostOf(url), loading: true, nativeIdx: i, asleep: false, reader: null, blocked: 0 })
  }
  patchTab(id, { idx: i, url, title: titleFor(url), loading: isWeb(url), reader: null })
}

// ---------- eylemler ----------
export function setSetting(k, v) {
  set((s) => ({ settings: { ...s.settings, [k]: v } }))
  if (NATIVE_KEYS.includes(k)) syncNative(true)
}

let seed = ''
export const takeSeed = () => {
  const s = seed
  seed = ''
  return s
}
export function setUi(ui, withSeed = '') {
  if (ui === state.ui) return
  seed = withSeed
  play(ui ? 'sheet' : 'tap')
  soft(() => set({ ui }))
}

// AI özeti kullanılabilir mi: yerel modda indirilmiş bir model, bulut modda API anahtarı gerekir.
export const aiReady = (st) => !!st.ai && (st.aiEngine === 'local' ? !!st.localModel : cloudReady(st))

// Açılır menüler yerel WebView'ın altında kalmasın diye açıkken sayılır (bkz. WebPane NativeSlot).
export const popOpen = () => set((s) => ({ pop: s.pop + 1 }))
export const popClose = () => set((s) => ({ pop: Math.max(0, s.pop - 1) }))

// Çift dokunma koruması: aynı çağrı 300 ms içinde tekrarlanırsa yok sayılır.
const recentCalls = new Map()
function isDuplicate(key, ms = 300) {
  const now = Date.now()
  if (now - (recentCalls.get(key) || 0) < ms) return true
  if (recentCalls.size > 50) recentCalls.clear()
  recentCalls.set(key, now)
  return false
}

// opts.keepUi: açık arayüz paneli (ör. GitHub cihaz girişi) kapanmaz.
export function newTab(url, opts) {
  if (isDuplicate(['newTab', url || '', !!opts?.keepUi, !!opts?.incognito].join('|'))) return
  const t = { ...blankTab(), incognito: !!opts?.incognito }
  play('open')
  soft(() => {
    set((s) => ({ tabs: [...s.tabs, t], activeId: t.id, ui: opts?.keepUi ? s.ui : (url ? null : 'alan') }))
    if (url) push(t.id, url)
  })
}

export function closeTab(id) {
  play('close')
  if (isNative && isLive(id)) {
    live = live.filter((x) => x !== id)
    WebTabs.close({ id })
  }
  seen.delete(id)
  recentWeb = recentWeb.filter((x) => x !== id)
  soft(() => {
    set((s) => {
      const i = s.tabs.findIndex((t) => t.id === id)
      const gone = s.tabs[i]
      const closedTabs = gone?.url && !gone.incognito ? [{ url: gone.url, title: gone.title || '', t: Date.now() }, ...s.closedTabs].slice(0, 10) : s.closedTabs
      let tabs = s.tabs.filter((t) => t.id !== id)
      if (!tabs.length) tabs = [blankTab()]
      const activeId = s.activeId === id ? tabs[Math.min(i, tabs.length - 1)].id : s.activeId
      return { tabs, activeId, closedTabs }
    })
    ensureNative(activeTab())
  })
}

// Son kapatılan sekmeyi yeni bir sekmede yeniden açar.
export function reopenClosed() {
  const c = state.closedTabs[0]
  if (!c) return
  set((s) => ({ closedTabs: s.closedTabs.slice(1) }))
  newTab(c.url)
}

export function selectTab(id) {
  play('tap')
  soft(() => {
    set({ activeId: id, ui: null })
    ensureNative(tabOf(id))
  })
}

// Sekmeler arasında döngü (dir: 1 sonraki, -1 önceki).
export function cycleTab(dir) {
  const { tabs, activeId } = state
  if (tabs.length < 2) return
  const i = tabs.findIndex((t) => t.id === activeId)
  selectTab(tabs[(i + dir + tabs.length) % tabs.length].id)
}
// n. sekmeye geçer (1–8); 9 her zaman son sekmedir.
export function selectTabIndex(n) {
  const { tabs } = state
  if (!tabs.length) return
  const t = n >= 9 ? tabs[tabs.length - 1] : tabs[n - 1]
  if (t) selectTab(t.id)
}

function push(id, url) {
  patchTab(id, (t) => ({ stack: [...t.stack.slice(0, t.idx + 1), url].slice(-50) }))
  enter(id, tabOf(id).stack.length - 1)
  if ((!isNative || !isWeb(url)) && !tabOf(id)?.incognito) addHistory(url)
}

export function navigate(input, id = state.activeId) {
  const url = resolveInput(input)
  if (!url) return
  if (isDuplicate(['nav', id, input].join('|'))) return
  // GitHub bağlıysa github.com'un kendisi yerine Anfo'nun GitHub arayüzü açılır.
  const s = state.settings
  if (s.ghToken && s.ghTakeover && /^https?:\/\/(www\.)?github\.com\/?$/i.test(url)) return setUi('github')
  // Adres zaten görünen sayfaysa yeni giriş eklenmez; yalnızca arayüz kapanır.
  const t = tabOf(id)
  if (t && t.stack[t.idx] === url) return soft(() => set({ ui: null }))
  play('nav')
  soft(() => {
    push(id, url)
    set({ ui: null })
  })
}

export function goHome(id = state.activeId) {
  soft(() => patchTab(id, { idx: -1, url: '', title: '', loading: false, reader: null }))
}

export const canBack = (t) => t.idx >= 0
export const canFwd = (t) => (isNative && isWeb(t.url) && !!t.canFwd) || t.idx < t.stack.length - 1

export function back() {
  const t = activeTab()
  if (t.reader) return closeReader()
  if (!canBack(t)) return
  play('tap')
  if (isNative && isWeb(t.url) && t.canBack) return WebTabs.back({ id: t.id })
  if (t.idx > 0) soft(() => enter(t.id, t.idx - 1))
  else goHome(t.id)
}

export function forward() {
  const t = activeTab()
  if (!canFwd(t)) return
  play('tap')
  if (isNative && isWeb(t.url) && t.canFwd) return WebTabs.forward({ id: t.id })
  soft(() => enter(t.id, t.idx + 1))
}

export function reload() {
  const t = activeTab()
  if (!t.url) return
  play('tap')
  if (isNative && isWeb(t.url)) WebTabs.reload({ id: t.id })
  else patchTab(t.id, { loading: isWeb(t.url), rev: (t.rev || 0) + 1 })
}

// Sekme yakınlaştırması (0.5–2). d: eklenecek fark (ör. 0.1 / -0.1) ya da 'reset'.
// Yerel tarafta WebTabs.zoom çağrılır (yoksa sessizce geçilir); web'de yalnızca durum tutulur.
export function setZoom(d) {
  const t = activeTab()
  if (!t) return
  const cur = t.zoom ?? 1
  const z = d === 'reset' ? 1 : Math.round(Math.min(2, Math.max(0.5, cur + d)) * 100) / 100
  if (z === cur) return
  patchTab(t.id, { zoom: z })
  if (isNative && isWeb(t.url)) {
    try {
      WebTabs.zoom?.({ id: t.id, factor: z })?.catch?.(() => {})
    } catch {}
  }
}

export const loaded = (id) => patchTab(id, { loading: false })

// ---------- kısayollar (sabitler) ----------
// Yalnızca adres benzeri girdi sabitlenir (arama sorguları ve anfo:search sabitlenmez). Başarıda true.
export function addPin(input, title) {
  const raw = String(input || '').trim()
  if (!looksLikeUrl(raw) && !/^https?:\/\//i.test(raw)) return false
  const url = resolveInput(raw)
  if (!url || isPinned(url)) return false
  play('toggle')
  soft(() => set((s) => ({ pins: [...s.pins, { url, title: title?.trim() || hostOf(url) }] })))
  return true
}
export const updatePin = (url, patch) => set((s) => ({ pins: s.pins.map((p) => (p.url === url ? { ...p, ...patch } : p)) }))
export const movePin = (url, dir) =>
  set((s) => {
    const pins = [...s.pins]
    const i = pins.findIndex((p) => p.url === url)
    const j = i + dir
    if (i < 0 || j < 0 || j >= pins.length) return {}
    ;[pins[i], pins[j]] = [pins[j], pins[i]]
    return { pins }
  })

// ---------- okuma listesi (sonra oku) ----------
export const inReadLater = (url, s = state) => !!url && s.readLater.some((r) => r.url === url)
export function toggleReadLater(url, title) {
  if (!isWeb(url)) return
  play('toggle')
  set((s) => ({
    readLater: inReadLater(url, s) ? s.readLater.filter((r) => r.url !== url) : [{ url, title: title || hostOf(url), t: Date.now() }, ...s.readLater].slice(0, 200),
  }))
}
export const removeReadLater = (url) => set((s) => ({ readLater: s.readLater.filter((r) => r.url !== url) }))

// ---------- bildirimler ----------
// notify({ kind: 'github'|'shield'|'system'|'focus', title, body?, url?, key? }) — key aynıysa tekrar eklenmez
export function notify(n) {
  if (n.key && state.notifs.some((x) => x.key === n.key)) return
  set((s) => ({ notifs: [{ id: uid(), t: Date.now(), read: false, ...n }, ...s.notifs].slice(0, 100) }))
  play('toggle')
}
export const markAllRead = () => set((s) => ({ notifs: s.notifs.map((n) => ({ ...n, read: true })) }))
export const dismissNotif = (id) => set((s) => ({ notifs: s.notifs.filter((n) => n.id !== id) }))
export const clearNotifs = () => set({ notifs: [] })
export const unreadCount = (s = state) => s.notifs.filter((n) => !n.read).length

export const isPinned = (url, s = state) => !!url && s.pins.some((p) => p.url === url)
export function togglePin(url, title) {
  if (!url) return
  play('toggle')
  soft(() => set((s) => ({ pins: isPinned(url, s) ? s.pins.filter((p) => p.url !== url) : [...s.pins, { url, title: title || hostOf(url) }] })))
}
// Chrome "Yer imlerini dışa aktar" dosyası (Netscape HTML) → sabitler. Yalnızca http(s), tekrarlar atlanır. Eklenen sayı döner.
export function importBookmarksHtml(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html')
  const have = new Set(state.pins.map((p) => p.url))
  const add = []
  doc.querySelectorAll('a[href]').forEach((a) => {
    const url = a.getAttribute('href') || ''
    if (!/^https?:\/\//i.test(url) || have.has(url)) return
    have.add(url)
    add.push({ url, title: a.textContent.trim().slice(0, 80) || hostOf(url) })
  })
  if (add.length) set((s) => ({ pins: [...s.pins, ...add] }))
  return add.length
}

// ---------- sayfa araçları ----------
export const shieldOn = (t, s = state) => s.settings.shield && !s.settings.shieldOff.includes(hostOf(t.url))
export function toggleShieldHere() {
  const host = hostOf(activeTab().url)
  if (!host) return
  play('toggle')
  const off = state.settings.shieldOff
  setSetting('shieldOff', off.includes(host) ? off.filter((h) => h !== host) : [...off, host])
}

// Okuma modu: sayfanın metni yerel taraftan alınır ve kendi tipografimizle gösterilir.
export async function openReader(summarize = false) {
  const t = activeTab()
  if (!isNative || !isWeb(t.url)) return
  play('sheet')
  try {
    const { data } = await WebTabs.reader({ id: t.id })
    const doc = JSON.parse(JSON.parse(data))
    // Bekleme sırasında sekme başka bir adrese geçtiyse eski sayfanın metni yazılmaz.
    if (tabOf(t.id)?.url !== t.url) return
    soft(() => {
      patchTab(t.id, { reader: { ...doc, summarize } })
      if (state.ui === 'arc') set({ ui: null })
    })
  } catch {
    notify({ kind: 'system', title: 'Okuma modu açılamadı', body: hostOf(t.url) })
  }
}
export const closeReader = () => {
  play('tap')
  soft(() => patchTab(state.activeId, { reader: null }))
}

export async function share() {
  const t = activeTab()
  if (!isWeb(t.url)) return
  play('tap')
  if (isNative) return WebTabs.share({ url: t.url, title: t.title })
  try {
    if (navigator.share) await navigator.share({ url: t.url, title: t.title })
    else await navigator.clipboard.writeText(t.url)
  } catch {}
}

export function setFull(on) {
  if (on === state.full) return
  play(on ? 'sheet' : 'tap')
  soft(() => set({ full: on, ui: null }))
  if (isNative) WebTabs.immersive({ on })
  else if (on) document.documentElement.requestFullscreen?.().catch(() => {})
  else if (document.fullscreenElement) document.exitFullscreen?.()
}
document.addEventListener('fullscreenchange', () => !document.fullscreenElement && state.full && setFull(false))

export const clearHistory = () => set({ history: [] })

// Tüm tarama verileri: geçmiş, kapatılan sekmeler ve (Android'de) çerezler, önbellek ve site depolaması.
// Uygulamanın kendi ayarları, sabitleri ve okuma listesi korunur.
export async function clearBrowsingData() {
  set({ history: [], closedTabs: [] })
  clearFavs()
  if (isNative) await WebTabs.clearData().catch(() => {})
}
if (state.settings.clearOnStart) clearBrowsingData()

// Bağlantı ısıtma: bir bağlantının üzerine gelinince/dokunulunca sunucuya önceden bağlanılır (DNS + TLS).
const warmed = new Set()
export function warm(url) {
  if (!state.settings.prewarm || !isWeb(url)) return
  let origin
  try {
    origin = new URL(url).origin
  } catch {
    return
  }
  if (warmed.has(origin) || warmed.size > 40) return
  warmed.add(origin)
  const l = document.createElement('link')
  l.rel = 'preconnect'
  l.href = origin
  document.head.appendChild(l)
}

// Önbellek ve bellek araçları (Android'de yerel, web'de tarayıcı önbellekleri).
export async function clearCaches() {
  if (isNative) return (await WebTabs.clearCache()).freedMB || 0
  if (!('caches' in window)) return 0
  const keys = await caches.keys()
  // Uygulama kabuğu ve indirilen AI modelleri ('transformers-cache') silinmez.
  await Promise.all(keys.filter((k) => !k.startsWith('anfo-shell') && k !== 'transformers-cache').map((k) => caches.delete(k)))
  return 0
}
export async function memoryInfo() {
  if (isNative) return WebTabs.memory()
  const m = performance.memory
  return m ? { usedMB: Math.round(m.usedJSHeapSize / 1048576), maxMB: Math.round(m.jsHeapSizeLimit / 1048576) } : null
}
// Kullanıcı içeriği korunur; yalnızca görünüm ve davranış ayarları sıfırlanır.
const USER_KEYS = ['aiKeys', 'aiModels', 'aiBases', 'ghToken', 'ghClientId', 'notes', 'extensions', 'builtinExt', 'bangs', 'widgets', 'wallpaper', 'city', 'name']
export const resetSettings = () => {
  set((s) => {
    const keep = {}
    for (const k of USER_KEYS) if (k in s.settings) keep[k] = s.settings[k]
    return { settings: { ...DEFAULT_SETTINGS, ...keep } }
  })
  syncNative(true)
}

// ---------- yedekleme ----------
const SECRET_KEYS = ['aiKeys', 'ghToken']
// Ayarlar (anahtarlar hariç), sabitler ve okuma listesi → JSON metni.
export function exportData() {
  const s = state
  const settings = Object.fromEntries(Object.entries(s.settings).filter(([k]) => !SECRET_KEYS.includes(k)))
  return JSON.stringify({ app: 'anfo', v: 4, at: Date.now(), settings, pins: s.pins, readLater: s.readLater }, null, 2)
}
// Tip uyumu, değer doğrulanır; mevcut veriler silinmez, birleştirilir. Başarıda true.
const fits = (v, def) =>
  Array.isArray(def) ? Array.isArray(v) : def && typeof def === 'object' ? isObj(v) : typeof v === typeof def
export function importData(json) {
  try {
    const d = typeof json === 'string' ? JSON.parse(json) : json
    if (!isObj(d) || d.app !== 'anfo') return false
    const incoming = isObj(d.settings) ? d.settings : {}
    const clean = {}
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      if (SECRET_KEYS.includes(k) || !(k in incoming)) continue
      if (fits(incoming[k], DEFAULT_SETTINGS[k])) clean[k] = incoming[k]
    }
    if (clean.bangs) clean.bangs = clean.bangs.filter((b) => isObj(b) && typeof b.k === 'string' && typeof b.url === 'string')
    const pinsIn = withUrl(d.pins) || []
    const rlIn = withUrl(d.readLater) || []
    set((s) => {
      const pins = [...s.pins]
      for (const p of pinsIn) if (!pins.some((q) => q.url === p.url)) pins.push({ url: p.url, title: typeof p.title === 'string' ? p.title : hostOf(p.url) })
      const readLater = [...s.readLater]
      for (const r of rlIn) if (!readLater.some((q) => q.url === r.url)) readLater.push({ url: r.url, title: r.title || hostOf(r.url), t: r.t || Date.now() })
      return { settings: { ...s.settings, ...clean }, pins, readLater: readLater.slice(0, 200) }
    })
    syncNative(true)
    return true
  } catch {
    return false
  }
}

// ---------- yerel köprü ----------
if (isNative) {
  syncNative()
  WebTabs.addListener('favicon', (e) => putFav(e.host, e.data))
  WebTabs.addListener('tabUpdate', (e) => {
    const prev = tabOf(e.id)
    if (!prev) return
    const showing = isWeb(prev.url)
    const moved = showing && e.url && e.url !== prev.url
    const gained = Math.max(0, (e.blocked || 0) - (prev.blocked || 0))
    patchTab(e.id, {
      ...(showing ? { url: e.url || prev.url, title: e.title || hostOf(e.url) || prev.title } : {}),
      ...(moved ? { reader: null } : {}),
      lastUrl: e.url || prev.lastUrl,
      lastTitle: e.title || '',
      loading: e.loading,
      canBack: e.canGoBack,
      canFwd: e.canGoForward,
      blocked: e.blocked || 0,
    })
    if (gained) set((s) => ({ blockedTotal: s.blockedTotal + gained }))
    if (!e.loading && e.url && !prev.incognito) addHistory(e.url, e.title)
  })
  // Sistem belleği daraldığında arka plan sekmeleri hemen uyutulur.
  WebTabs.addListener('memoryPressure', () => {
    const n = sleepBackground()
    if (n) notify({ kind: 'system', title: 'Bellek boşaltıldı', body: `${n} arka plan sekmesi uyutuldu`, key: 'mem:' + Math.floor(Date.now() / 600000) })
  })
  WebTabs.addListener('backButton', () => {
    if (state.ui) return setUi(null)
    const t = activeTab()
    if (t.reader || canBack(t)) return back()
    if (state.full) return setFull(false)
    WebTabs.minimize()
  })
  ensureNative(activeTab())
}
