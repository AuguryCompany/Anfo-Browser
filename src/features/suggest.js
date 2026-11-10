// Yazarken öneriler: sabitler, geçmiş, popüler siteler ve (ayar açıksa) arama motoru önerileri.
// Hem telefondaki arama ekranı (Alan) hem tablet/PC araç çubuğu (Toolbar) kullanır.
import { useEffect, useMemo, useState } from 'react'
import { useStore, isWeb, looksLikeUrl, hostOf } from '../store'
import { suggest } from '../search'

// "y" yazınca YouTube gibi: hiç ziyaret edilmemiş olsa da tanınan siteler. Yalnızca yerel eşleştirme; ağ isteği yok.
const POPULAR = [
  ['YouTube', 'https://www.youtube.com'],
  ['Google', 'https://www.google.com'],
  ['Gmail', 'https://mail.google.com'],
  ['Google Haritalar', 'https://maps.google.com'],
  ['Instagram', 'https://www.instagram.com'],
  ['X', 'https://x.com'],
  ['Facebook', 'https://www.facebook.com'],
  ['WhatsApp Web', 'https://web.whatsapp.com'],
  ['Telegram Web', 'https://web.telegram.org'],
  ['Reddit', 'https://www.reddit.com'],
  ['Vikipedi', 'https://tr.wikipedia.org'],
  ['GitHub', 'https://github.com'],
  ['Netflix', 'https://www.netflix.com'],
  ['Spotify', 'https://open.spotify.com'],
  ['Twitch', 'https://www.twitch.tv'],
  ['TikTok', 'https://www.tiktok.com'],
  ['LinkedIn', 'https://www.linkedin.com'],
  ['ChatGPT', 'https://chatgpt.com'],
  ['Claude', 'https://claude.ai'],
  ['Gemini', 'https://gemini.google.com'],
  ['Outlook', 'https://outlook.live.com'],
  ['Amazon', 'https://www.amazon.com.tr'],
  ['Trendyol', 'https://www.trendyol.com'],
  ['Hepsiburada', 'https://www.hepsiburada.com'],
  ['Sahibinden', 'https://www.sahibinden.com'],
  ['Ekşi Sözlük', 'https://eksisozluk.com'],
  ['e-Devlet', 'https://www.turkiye.gov.tr'],
  ['Discord', 'https://discord.com/app'],
  ['Pinterest', 'https://www.pinterest.com'],
  ['Stack Overflow', 'https://stackoverflow.com'],
  ['DuckDuckGo', 'https://duckduckgo.com'],
  ['Twitter', 'https://x.com'],
].map(([title, url]) => ({ title, url }))

const low = (s) => (s || '').toLocaleLowerCase('tr')

// Puan: başlık ya da alan adı terimle başlıyorsa yüksek, içeriyorsa düşük; eşleşmezse -1.
function score(p, t) {
  const title = low(p.title)
  const host = low(hostOf(p.url))
  if (title.startsWith(t) || host.startsWith(t)) return 3
  if (title.split(/\s+/).some((w) => w.startsWith(t)) || host.split('.').some((w) => w.startsWith(t))) return 2
  if ((title + ' ' + low(p.url)).includes(t)) return 1
  return -1
}

/**
 * Öneri listesi. İlk öğe her zaman yazılanın kendisi (ara / git).
 * Öğe: { kind: 'go' | 'query' | 'site', title, url?, lead? }
 */
export function useSuggestions(term, active) {
  const pins = useStore((s) => s.pins)
  const history = useStore((s) => s.history)
  const live = useStore((s) => s.settings.suggest)
  const [remote, setRemote] = useState([])
  const t = low(term.trim())

  // Canlı öneriler (kısa bekleme ile; her tuşta istek atılmaz).
  useEffect(() => {
    if (!active || !live || t.length < 2 || /^https?:|\.\w{2,}/.test(t)) return setRemote([])
    const ac = new AbortController()
    const id = setTimeout(() => suggest(term.trim(), ac.signal).then((v) => !ac.signal.aborted && setRemote(v), () => {}), 170)
    return () => (clearTimeout(id), ac.abort())
  }, [t, active, live]) // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => {
    if (!active || !t) return []
    const seen = new Set()
    const sites = [...pins, ...history.filter((h) => isWeb(h.url)), ...POPULAR]
      .map((p, i) => ({ p, s: score(p, t), i }))
      .filter((x) => x.s >= (t.length < 3 ? 2 : 1)) // kısa terimde yalnızca kelime/alan adı başı eşleşmesi
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .map((x) => x.p)
      .filter((p) => {
        const k = p.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      .slice(0, 4)
      .map((p) => ({ kind: 'site', title: p.title || hostOf(p.url), url: p.url }))
    const queries = history
      .filter((h) => !isWeb(h.url) && low(h.title).startsWith(t) && low(h.title) !== t)
      .slice(0, 2)
      .map((h) => ({ kind: 'query', title: h.title }))
    const ideas = remote
      .filter((r) => low(r) !== t && !queries.some((q) => low(q.title) === low(r)))
      .slice(0, 4)
      .map((r) => ({ kind: 'query', title: r }))
    const lead = { kind: looksLikeUrl(term.trim()) ? 'go' : 'query', title: term.trim(), lead: true }
    // Tek harf yazılıp bir site tam önek eşleşmesiyse (y → YouTube) site en üste çıkar.
    const top = sites[0] && score(sites[0], t) === 3 && lead.kind === 'query' ? [sites[0], lead, ...sites.slice(1)] : [lead, ...sites]
    return [...top, ...queries, ...ideas].slice(0, 9)
  }, [active, t, term, pins, history, remote])
}
