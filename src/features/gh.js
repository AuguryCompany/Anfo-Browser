import { useSyncExternalStore } from 'react'
import { CapacitorHttp } from '@capacitor/core'
import { get, notify } from '../store'

// GitHub REST istemcisi. Her fonksiyon ham JSON (ya da text: true ise metin) döner; hata durumunda status'lu Error fırlatır.
const API = 'https://api.github.com'
const POLL_MS = 5 * 60 * 1000
const HTML = 'application/vnd.github.html+json'
const RAW = 'application/vnd.github.raw'

const headers = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
})

// Geçersiz anahtar durumu: GitHub sayfası, GitHub kartı ve Ayarlar bunu okur.
let bad = false
const badSubs = new Set()
const setBad = (v) => {
  if (v === bad) return
  bad = v
  badSubs.forEach((f) => f())
}
const subBad = (f) => (badSubs.add(f), () => badSubs.delete(f))
export const ghInvalid = () => bad
export const useGhInvalid = () => useSyncExternalStore(subBad, ghInvalid)

async function call(token, path, { accept, method, body, signal, text } = {}) {
  const h = headers(token)
  if (accept) h.Accept = accept
  if (body !== undefined) h['Content-Type'] = 'application/json'
  let res
  try {
    res = await fetch(API + path, {
      method,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (e) {
    if (e?.name === 'AbortError') throw e
    throw new Error('Bağlantı kurulamadı')
  }
  // Yalnızca kayıtlı anahtar için durum değişir; formdaki denenen anahtar bunu etkilemez.
  const current = token === get().settings.ghToken
  if (!res.ok) {
    if (current && (res.status === 401 || res.status === 403)) {
      setBad(true)
      notify({ kind: 'github', title: 'GitHub bağlantısı geçersiz', body: 'Anahtar iptal edilmiş ya da süresi dolmuş. Yeniden bağlan.', key: 'gh-401' })
    }
    const msg =
      res.status === 401
        ? 'Anahtar geçersiz'
        : res.status === 403
          ? 'Erişim reddedildi ya da istek sınırı doldu'
          : res.status === 404
            ? 'Bulunamadı'
            : `GitHub yanıt vermedi (${res.status})`
    throw Object.assign(new Error(msg), { status: res.status })
  }
  if (current) setBad(false)
  return text ? res.text() : res.json()
}

// Yol segmentlerini kodlar: "owner/repo" ve "klasör/dosya.md" bölü işaretini korur.
const enc = (p) => p.split('/').map(encodeURIComponent).join('/')

export const me = (token) => call(token, '/user')
export const repos = (token) => call(token, '/user/repos?sort=pushed&per_page=30')
export const notifications = (token) => call(token, '/notifications?per_page=30')
export const assigned = (token) => call(token, '/search/issues?q=is:open+involves:@me+archived:false&sort=updated&per_page=20')
export const events = (token, login) => call(token, `/users/${encodeURIComponent(login)}/events?per_page=30`)

// Depo görünümü
export const repo = (token, full, signal) => call(token, `/repos/${enc(full)}`, { signal })

// README: HTML olarak istenir. Depo README'siz ise null döner.
export async function readme(token, full, signal) {
  try {
    const t = await call(token, `/repos/${enc(full)}/readme`, { accept: HTML, signal, text: true })
    try {
      const j = JSON.parse(t)
      return typeof j === 'string' ? j : j.content ?? j.body_html ?? ''
    } catch {
      return t
    }
  } catch (e) {
    if (e.status === 404) return null
    throw e
  }
}

// Klasör listesi (path '' ise kök) ya da tek dosya meta verisi.
export const contents = (token, full, path, signal) =>
  call(token, `/repos/${enc(full)}/contents${path ? '/' + enc(path) : ''}`, { signal })

// Dosyanın ham metni (en fazla birkaç yüz KB için; boyut kontrolü çağıranın işi).
export const rawFile = (token, full, path, signal) =>
  call(token, `/repos/${enc(full)}/contents/${enc(path)}`, { accept: RAW, signal, text: true })

export const commits = (token, full, signal) => call(token, `/repos/${enc(full)}/commits?per_page=30`, { signal })
export const commit = (token, full, sha, signal) => call(token, `/repos/${enc(full)}/commits/${encodeURIComponent(sha)}`, { signal })

export const issues = (token, full, signal) => call(token, `/repos/${enc(full)}/issues?state=open&per_page=30`, { signal })
export const pulls = (token, full, signal) => call(token, `/repos/${enc(full)}/pulls?state=open&per_page=30`, { signal })
// Issue ve PR gövdesi ile yorumları HTML (body_html) olarak alınır.
export const issueDetail = (token, full, n, signal) => call(token, `/repos/${enc(full)}/issues/${n}`, { accept: HTML, signal })
export const issueComments = (token, full, n, signal) =>
  call(token, `/repos/${enc(full)}/issues/${n}/comments?per_page=50`, { accept: HTML, signal })

// Markdown metnini GitHub'ın GFM işleyicisiyle HTML'e çevirir.
export const renderMarkdown = (token, text, context, signal) =>
  call(token, '/markdown', { method: 'POST', body: { text, mode: 'gfm', context }, accept: 'text/html', signal, text: true })

// GitHub'dan gelen HTML'i gösterilebilir hale getirir: betik/stil/çerçeve ve olay öznitelikleri kaldırılır,
// göreli bağlantı ve görseller depo tabanına çevrilir. Çıktı yalnızca bu uygulamanın DOM'una gömülür.
export function cleanHtml(html, full) {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const root = doc.body
  root.querySelectorAll('script,style,iframe,object,embed,link,meta,base,form,input,button,textarea,select').forEach((n) => n.remove())
  const linkBase = `https://github.com/${full}/blob/HEAD/`
  const imgBase = `https://github.com/${full}/raw/HEAD/`
  const unsafe = /^\s*(javascript|vbscript|data:(?!image\/(png|gif|jpe?g|webp);))/i
  root.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase()
      const v = a.value.trim()
      if (n.startsWith('on') || n === 'style' || n === 'srcset' || n === 'formaction') el.removeAttribute(a.name)
      else if ((n === 'href' || n === 'src' || n === 'xlink:href') && unsafe.test(v)) el.removeAttribute(a.name)
    }
    if (el.tagName === 'A') {
      const h = el.getAttribute('href')
      if (h && h.startsWith('#')) el.removeAttribute('href')
      else if (h && !/^https?:|^mailto:/i.test(h)) el.setAttribute('href', new URL(h, linkBase).href)
      if (el.hasAttribute('href')) el.setAttribute('rel', 'noopener noreferrer')
    }
    if (el.tagName === 'IMG') {
      const s = el.getAttribute('src')
      if (s && !/^https?:/i.test(s)) el.setAttribute('src', new URL(s, imgBase).href)
      el.setAttribute('loading', 'lazy')
    }
  })
  return root.innerHTML
}

const KIND ={ PullRequest: 'PR', Issue: 'issue', Commit: 'commit', Release: 'sürüm', Discussion: 'tartışma' }

// Cihaz akışı (OAuth Device Flow). github.com/login/* CORS başlığı göndermez; bu yüzden
// yalnızca Android'de CapacitorHttp (yerel HTTP) ile çağrılır. Gizli anahtar gerekmez.
export const GH_CLIENT_ID = ''
export const clientId = () => get().settings.ghClientId || GH_CLIENT_ID

const FORM_HEADERS = { Accept: 'application/json', 'Content-Type': 'application/json' }
const parseData = (r) => {
  try {
    return typeof r.data === 'string' ? JSON.parse(r.data) : r.data
  } catch {
    throw new Error('GitHub yanıtı okunamadı')
  }
}

export async function startDeviceLogin() {
  const r = await CapacitorHttp.post({
    url: 'https://github.com/login/device/code',
    headers: FORM_HEADERS,
    data: { client_id: clientId(), scope: 'repo notifications read:user' },
  })
  const j = parseData(r)
  if (!j.device_code) throw new Error(j.error_description || 'GitHub giriş kodu alınamadı')
  return {
    device_code: j.device_code,
    user_code: j.user_code,
    verification_uri: j.verification_uri,
    expires_in: j.expires_in,
    interval: j.interval || 5,
  }
}

const wait = (ms, signal) =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true })
  })

// Kullanıcı onaylayana kadar yoklar; erişim anahtarını döndürür. İptalde AbortError fırlatır.
export async function pollDeviceLogin(device_code, interval, signal) {
  let every = Math.max(interval || 5, 1)
  for (;;) {
    await wait(every * 1000, signal)
    if (signal?.aborted) throw new DOMException('İptal edildi', 'AbortError')
    const r = await CapacitorHttp.post({
      url: 'https://github.com/login/oauth/access_token',
      headers: FORM_HEADERS,
      data: { client_id: clientId(), device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' },
    })
    const j = parseData(r)
    if (j.access_token) return j.access_token
    if (j.error === 'authorization_pending') continue
    if (j.error === 'slow_down') {
      every += 5
      continue
    }
    if (j.error === 'expired_token') throw new Error('Kodun süresi doldu. Tekrar dene.')
    if (j.error === 'access_denied') throw new Error('Giriş isteği reddedildi.')
    throw new Error(j.error_description || 'GitHub girişi tamamlanamadı')
  }
}

// Bildirim öğesinin API adresini tarayıcıdaki adrese çevirir (pulls → pull, commits → commit).
export function webUrl(n) {
  const repo = n.repository?.html_url || ''
  const m = (n.subject?.url || '').match(/^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)\/(.*)$/)
  if (!m) return repo
  const [, full, rest] = m
  if (rest.startsWith('pulls/')) return `https://github.com/${full}/pull/${rest.slice(6)}`
  if (rest.startsWith('issues/')) return `https://github.com/${full}/issues/${rest.slice(7)}`
  if (rest.startsWith('commits/')) return `https://github.com/${full}/commit/${rest.slice(8)}`
  if (rest.startsWith('releases')) return `https://github.com/${full}/releases`
  return repo
}

export const kindLabel = (t) => KIND[t] || t || ''

// Göreli zaman: "az önce", "12 dk önce", "2 sa önce", "3 g önce", sonra tarih.
export function timeAgo(iso) {
  if (!iso) return ''
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'az önce'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} dk önce`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} sa önce`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} g önce`
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
}

// Dil noktası renkleri (GitHub'ın linguist renkleri, bilinmeyenler için muted).
export const LANG_COLOR = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Python: '#3572A5',
  Java: '#b07219',
  Kotlin: '#A97BFF',
  Go: '#00ADD8',
  Rust: '#dea584',
  C: '#555555',
  'C++': '#f34b7d',
  'C#': '#178600',
  Swift: '#F05138',
  Ruby: '#701516',
  PHP: '#4F5D95',
  Dart: '#00B4AB',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Shell: '#89e051',
  Vue: '#41b883',
  Jupyter: '#DA5B0B',
}

// Bildirimleri periyodik çeker; yalnızca yeni öğeleri notify eder (key ile tekrar eklenmez).
let timer = 0
let lastToken = ''

async function poll() {
  const token = get().settings.ghToken
  lastToken = token || ''
  if (!token) return
  let list
  try {
    list = await notifications(token)
  } catch {
    return
  }
  for (const n of list) {
    notify({
      kind: 'github',
      title: n.subject.title,
      body: `${n.repository.full_name} · ${kindLabel(n.subject.type)}`,
      url: webUrl(n),
      key: `gh:${n.id}:${n.updated_at}`,
    })
  }
}

// Güvenle çağrılabilir: yalnızca bir kez zamanlayıcı kurar. Token değiştiyse hemen dener.
// Token yoksa hiçbir şey yapmaz; zamanlayıcı her turda token'ı yeniden okur.
export function startGitHubPoll() {
  if (!timer) timer = setInterval(poll, POLL_MS)
  const token = get().settings.ghToken
  if (token && token !== lastToken) poll()
}
