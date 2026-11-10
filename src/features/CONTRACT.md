# Anfo özellik sözleşmesi (ajanlar için)

Proje: React 19 + Vite, Capacitor Android. Dil: arayüz metinleri **Türkçe**. İkon: `lucide-react`.
Tasarım dili: OLED siyah, kiraz vurgu (`var(--accent)`), **kenar çizgisi YOK**, gölge/parlama YOK,
"buğulu" kartlar (`background: var(--frost)`, hover `var(--frost-2)`), yumuşak köşe (`var(--radius)`,
iç köşe `var(--r-in)`, küçük `var(--r-sm)`), metin `var(--text)`, ikincil metin `var(--muted)`.
Animasyon: `animation: settle 0.7s var(--spring) both; animation-delay: calc(var(--i) * 42ms)` (keyframes hazır).
Hazır sınıflar (styles.css): `.page` (tam sahne katmanı), `.tex` (gürültü dokusu), `.card`, `.stack`
(sıkı aralıklı kart yığını), `.link`, `.text` (metin kutusu), `.seg` (segment seçici, role=radio + aria-checked),
`.switch` (role=switch aria-checked, içinde `<i/>`), `.field`, `.field.line`, `.settings-inner` (ortalanmış kaydırılabilir sütun).
Sayfa iskeleti örneği (Settings.jsx gibi):
```jsx
<div className="page settings tex"><Aura kind="aurora" still /><div className="settings-inner"><h1>Başlık</h1>...</div></div>
```
`import Aura from '../components/Aura'` — `kind`: horizon | aurora | orb, `still` hareketsiz.
`import Favicon from '../components/Favicon'` — `<Favicon url={url} size={16} />`.
`import { play } from '../sound'` — `play('tap'|'toggle'|'open'|'close'|'nav'|'sheet'|'tick')`.

## store.js (`import { ... } from '../store'`)
- `useStore(sel)` — örn. `useStore(s => s.settings.ghToken)`; `get()` anlık durum.
- `setSetting(key, value)`; `setUi(ui)` (`'github' | 'notifs' | 'ext' | 'settings' | 'alan' | null`).
- `navigate(urlOrQuery)`, `newTab(url)`.
- Ayarlar (s.settings): `ghToken, ghTakeover, city, widgets (dizi), notes, builtinExt ({id:true}),
  extensions ([{id,name,match,css,js,on}]), bangs ([{k,label,url}] url'de %s), pinShape, pinCount, homeAlign,
  clockStyle, blur, auraSpeed, islandWidth, wallpaper, wallDim, startPage, accent, shift, aura, auraStrength,
  grain, radius, font, scale` ve diğerleri.
- Bildirim: `notify({ kind: 'github'|'shield'|'system'|'focus', title, body, url, key })` (aynı key tekrar eklenmez),
  `s.notifs` = `[{id,t,read,kind,title,body,url}]`, `markAllRead()`, `dismissNotif(id)`, `clearNotifs()`, `unreadCount(s)`.
- Sabitler: `s.pins`, `addPin(url, title)`, `updatePin(url, patch)`, `movePin(url, ±1)`, `togglePin(url)`.
- `registerBuiltins(list)` — yerleşik eklenti listesini yerel tarafa bildirir.
- `isNative` → `import { isNative } from '../native'`.

Her özellik kendi CSS dosyasını kendi bileşeninde import eder (örn. `import './github.css'`).
styles.css, store.js, App.jsx, Island.jsx, Home.jsx dosyalarına DOKUNMA (entegrasyonu ana oturum yapar).
