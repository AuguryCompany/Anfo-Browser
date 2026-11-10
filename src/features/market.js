// Piyasa verisi: Yahoo Finance'in anahtarsız uç noktaları (grafik ve sembol arama). Yalnızca sembol gönderilir.
import { getJson } from './net'

export const RANGES = {
  '1d': { label: '1G', range: '1d', interval: '5m' },
  '5d': { label: '1H', range: '5d', interval: '30m' },
  '1mo': { label: '1A', range: '1mo', interval: '1d' },
  '1y': { label: '1Y', range: '1y', interval: '1d' },
  max: { label: 'TÜMÜ', range: 'max', interval: '1mo' },
}

// Hiçbir şey seçilmediyse: başlıca endeksler + rastgele iki büyük hisse (oturum boyunca aynı).
const INDICES = ['^GSPC', '^IXIC', 'XU100.IS']
const BIG = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AVGO', 'BRK-B', 'JPM', 'TSM', 'ASML']
const pick = [...BIG].sort(() => Math.random() - 0.5).slice(0, 2)
export const DEFAULT_ITEMS = [...INDICES.map((s) => ({ s, big: s === '^GSPC' })), ...pick.map((s) => ({ s, big: false }))]

// Endekslerin Yahoo adları uzun/İngilizce; kısa Türkçe adlar.
const NAMES = { '^GSPC': 'S&P 500', '^IXIC': 'Nasdaq', '^NDX': 'Nasdaq 100', '^DJI': 'Dow Jones', 'XU100.IS': 'BIST 100', 'XU030.IS': 'BIST 30' }

const cache = new Map() // `${sym}|${range}` → { t, v }
const TTL = 60000

export async function quote(sym, rangeKey = '1d', signal) {
  const k = sym + '|' + rangeKey
  const hit = cache.get(k)
  if (hit && Date.now() - hit.t < TTL) return hit.v
  const r = RANGES[rangeKey] || RANGES['1d']
  const j = await getJson('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym), { range: r.range, interval: r.interval, includePrePost: 'false' }, signal)
  const res = j?.chart?.result?.[0]
  if (!res) throw new Error(j?.chart?.error?.description || 'Veri yok')
  const m = res.meta || {}
  const closes = (res.indicators?.quote?.[0]?.close || []).filter((x) => x != null)
  const price = m.regularMarketPrice ?? closes.at(-1)
  // Gün içi değişim: önceki kapanışa göre. Diğer aralıklarda aralığın başına göre.
  const ref = rangeKey === '1d' ? (m.chartPreviousClose ?? m.previousClose ?? closes[0]) : closes[0]
  const v = {
    sym,
    name: NAMES[sym] || m.shortName || m.longName || sym,
    exch: m.fullExchangeName || m.exchangeName || '',
    currency: m.currency || '',
    price,
    ref,
    change: price != null && ref ? ((price - ref) / ref) * 100 : null,
    points: closes,
  }
  cache.set(k, { t: Date.now(), v })
  return v
}

export async function searchSymbols(q, signal) {
  const j = await getJson('https://query1.finance.yahoo.com/v1/finance/search', { q, quotesCount: '8', newsCount: '0', lang: 'tr-TR', region: 'TR' }, signal)
  const TYPES = { EQUITY: 'Hisse', ETF: 'Fon (ETF)', MUTUALFUND: 'Yatırım fonu', INDEX: 'Endeks', CRYPTOCURRENCY: 'Kripto', CURRENCY: 'Döviz', FUTURE: 'Vadeli' }
  return (j?.quotes || [])
    .filter((x) => x.symbol && TYPES[x.quoteType])
    .map((x) => ({ s: x.symbol, name: x.shortname || x.longname || x.symbol, type: TYPES[x.quoteType], exch: x.exchDisp || '' }))
}

const CUR = { USD: '$', EUR: '€', TRY: '₺', GBP: '£', JPY: '¥' }
export function money(v, currency) {
  if (v == null) return '–'
  const n = v >= 1000 ? v.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) : v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const c = CUR[currency]
  return c ? (currency === 'TRY' ? n + ' ' + c : c + n) : n
}
export const pct = (v) => (v == null ? '' : (v >= 0 ? '+' : '') + v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%')
