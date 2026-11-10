// Arama katmanı: sonuçlar ham veri olarak alınır ve kendi arayüzümüzde çizilir.
//  - APK: web sonuçları DuckDuckGo'nun JS'siz HTML sayfasından (yerel HTTP, CORS yok) okunur.
//  - Web: tarayıcı güvenliği (CORS) genel arama motorlarını engeller; Vikipedi (TR + EN) kullanılır.
import { CapacitorHttp } from '@capacitor/core'
import { isNative } from './native'

const wikiApi = (lang) => `https://${lang}.wikipedia.org/w/api.php?origin=*&format=json&`

async function wiki(q, lang, signal) {
  const url =
    wikiApi(lang) +
    'action=query&generator=search&gsrlimit=8&prop=pageimages|extracts|info&inprop=url&exintro=1&explaintext=1&exsentences=2&exlimit=8&piprop=thumbnail&pithumbsize=320&gsrsearch=' +
    encodeURIComponent(q)
  const j = await (await fetch(url, { signal })).json()
  return Object.values(j.query?.pages || {})
    .sort((a, b) => a.index - b.index)
    .map((p) => ({ title: p.title, url: p.fullurl, snippet: p.extract || '', image: p.thumbnail?.source }))
}

// WebView kimliği ("; wv", "Version/4.0") DuckDuckGo'da bot doğrulamasına (202) düşer; sade Chrome kimliği kullanılır.
const UA = navigator.userAgent.replace('; wv', '').replace(/ Version\/[\d.]+/, '')
const HEAD = { 'User-Agent': UA, 'Accept-Language': 'tr,en;q=0.8' }

const nativeGet = (url, params) => CapacitorHttp.get({ url, params, responseType: 'text', headers: HEAD })
const nativePost = (url, form) =>
  CapacitorHttp.post({
    url,
    responseType: 'text',
    headers: { ...HEAD, 'Content-Type': 'application/x-www-form-urlencoded' },
    data: new URLSearchParams(form).toString(),
  })

const cleanHref = (href) => {
  if (!href) return null
  if (/^(https?:)?\/\/(www\.)?duckduckgo\.com\/y\.js/.test(href)) return null // reklam yönlendirmesi
  const m = href.match(/[?&]uddg=([^&]+)/)
  if (m) {
    try {
      href = decodeURIComponent(m[1])
    } catch {
      href = m[1] // bozuk kodlama: yalnızca bu sonuç elenir, diğerleri etkilenmez
    }
  } else if (href.startsWith('//')) href = 'https:' + href
  return /^https?:/.test(href) ? href : null
}

const parse = (html) => new DOMParser().parseFromString(String(html), 'text/html')

async function ddgHtml(q) {
  const r = await nativePost('https://html.duckduckgo.com/html/', { q, kl: 'tr-tr' })
  if (r.status !== 200) return []
  return [...parse(r.data).querySelectorAll('.result')]
    .map((el) => {
      const a = el.querySelector('.result__a')
      const url = cleanHref(a?.getAttribute('href'))
      return url && { title: a.textContent.trim(), url, snippet: el.querySelector('.result__snippet')?.textContent.trim() || '' }
    })
    .filter(Boolean)
}

async function ddgLite(q) {
  const r = await nativePost('https://lite.duckduckgo.com/lite/', { q, kl: 'tr-tr' })
  if (r.status !== 200) return []
  const doc = parse(r.data)
  const snippets = [...doc.querySelectorAll('td.result-snippet')]
  return [...doc.querySelectorAll('a.result-link')]
    .map((a, i) => {
      const url = cleanHref(a.getAttribute('href'))
      return url && { title: a.textContent.trim(), url, snippet: snippets[i]?.textContent.trim() || '' }
    })
    .filter(Boolean)
}

async function mojeek(q) {
  const r = await nativeGet('https://www.mojeek.com/search', { q })
  if (r.status !== 200) return []
  return [...parse(r.data).querySelectorAll('ul.results-standard > li')]
    .map((el) => {
      const a = el.querySelector('a.title')
      const href = a?.getAttribute('href')
      return /^https?:/.test(href || '') && { title: a.textContent.trim(), url: href, snippet: el.querySelector('p.s')?.textContent.trim() || '' }
    })
    .filter(Boolean)
}

// Önce DuckDuckGo; boş dönerse (bot doğrulaması, engel, ağ hatası) sırayla yedek kaynaklar (DuckDuckGo Lite, Mojeek). Sorgu yedeklere
// yalnızca birincisi sonuç vermediğinde gönderilir.
async function web(q) {
  const a = await ddgHtml(q).catch(() => [])
  if (a.length) return a
  // Gizlilik: yalnızca kullanıcıyı izlemeyen motorlar (Bing yedeği kaldırıldı).
  const rest = [ddgLite, mojeek].map((f) => f(q).catch(() => []))
  for (const p of rest) {
    const r = await p
    if (r.length) return r
  }
  return []
}

// Vikipedi tüm kelimeleri birden arar; uzun ya da "1.yazili" gibi sorgularda hiçbir şey bulamaz.
// Sonuç yoksa sorgu sadeleştirilir: sayılar ve kısa kelimeler atılır, ilk üç anlamlı kelime kalır.
export const relax = (q) =>
  q
    .toLocaleLowerCase('tr')
    .split(/[^\p{L}]+/u)
    .filter((w) => w.length > 2)
    .slice(0, 3)
    .join(' ')

const norm = (s) => s.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

// Bellekte küçük LRU önbellek: geri/ileri ile dönülen aramalar ağa gitmeden anında gelir.
const memo = new Map()
const TTL = 10 * 60000
export async function search(q, signal) {
  const k = q.trim().toLocaleLowerCase('tr')
  const hit = memo.get(k)
  if (hit && Date.now() - hit.t < TTL) {
    memo.delete(k)
    memo.set(k, hit)
    return hit.v
  }
  const v = await searchFresh(q, signal)
  memo.set(k, { t: Date.now(), v })
  if (memo.size > 30) memo.delete(memo.keys().next().value)
  return v
}

async function searchFresh(q, signal) {
  const [tr, webRes] = await Promise.allSettled([wiki(q, 'tr', signal), isNative ? web(q) : []])
  const found = webRes.value || []
  let pedia = tr.value || []
  // Türkçe sonuç azsa (ve web sonucu yoksa) İngilizce Vikipedi ile tamamla.
  if (pedia.length < 4 && !found.length) pedia = [...pedia, ...(await wiki(q, 'en', signal).catch(() => []))]
  if (!pedia.length && !found.length) {
    const r = relax(q)
    if (r && r !== norm(q)) pedia = await wiki(r, 'tr', signal).catch(() => [])
  }
  if (signal.aborted) throw new DOMException('aborted', 'AbortError')
  if (!pedia.length && !found.length && tr.status === 'rejected') throw tr.reason

  // Sorguyla adı örtüşen ilk madde "özet kartı" olur.
  const nq = norm(q)
  const answer = pedia.find((p) => p.snippet && (norm(p.title) === nq || norm(p.title).startsWith(nq + ' ') || nq.startsWith(norm(p.title) + ' '))) || null
  const rest = pedia.filter((p) => p !== answer)
  return found.length ? { answer, results: found, full: true } : { answer, results: rest, full: false }
}

export async function suggest(q, signal) {
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
  if (isNative) {
    const r = await nativeGet('https://duckduckgo.com/ac/', { q, type: 'list', kl: 'tr-tr' })
    // Native istek iptali desteklemez; iptal edildiyse sonucu yok sayıp AbortError fırlat.
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
    const j = typeof r.data === 'string' ? JSON.parse(r.data) : r.data
    return (j[1] || []).slice(0, 5)
  }
  const j = await (await fetch(wikiApi('tr') + 'action=opensearch&limit=5&search=' + encodeURIComponent(q), { signal })).json()
  return j[1] || []
}
