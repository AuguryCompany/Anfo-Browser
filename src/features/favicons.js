// Site simgesi önbelleği (yalnızca bu cihazda). Android'de simge, sayfa açılırken WebView'ın zaten indirdiği
// simgeden gelir (WebTabs 'favicon' olayı); hiçbir üçüncü taraf hizmete site adı gönderilmez.
import { useSyncExternalStore } from 'react'

const KEY = 'anfo:fav'
const MAX = 200
let map = {}
try {
  map = JSON.parse(localStorage.getItem(KEY) || '{}') || {}
} catch {
  map = {}
}
const subs = new Set()
let timer
const save = () => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(map))
    } catch {
      /* dolu: önbellek yalnızca bellekte kalır */
    }
  }, 500)
}
const norm = (h) => (h || '').toLowerCase().replace(/^www\./, '')

export function putFav(host, data) {
  const h = norm(host)
  if (!h || typeof data !== 'string' || !data.startsWith('data:image/') || map[h] === data) return
  delete map[h]
  map[h] = data
  const keys = Object.keys(map)
  for (let i = 0; i < keys.length - MAX; i++) delete map[keys[i]] // en eskiler
  map = { ...map }
  subs.forEach((f) => f())
  save()
}

export function clearFavs() {
  map = {}
  subs.forEach((f) => f())
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* yok say */
  }
}

const subscribe = (f) => (subs.add(f), () => subs.delete(f))
export const useFav = (host) => useSyncExternalStore(subscribe, () => map[norm(host)])
