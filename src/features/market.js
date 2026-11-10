// Piyasa verisi, anahtarsız iki kaynak:
//  - CNBC (ana): anlık fiyat (toplu tek istek), grafik ve sembol arama. GitHub sunucularından bile erişilebilir.
//  - Yahoo Finance (yedek): CNBC'nin bulamadığı semboller, ör. BIST hisseleri (THYAO.IS). Yahoo veri merkezi
//    IP'lerini sık engeller (429); telefonda genelde çalışır.
// Yalnızca sembol gönderilir; Android'de yerel HTTP (çerez yok).
import { getJson } from './net'

export const RANGES = {
  '1d': { label: '1G', cnbc: '1D', range: '1d', interval: '5m' },
  '5d': { label: '1H', cnbc: '5D', range: '5d', interval: '30m' },
  '1mo': { label: '1A', cnbc: '1M', range: '1mo', interval: '1d' },
  '1y': { label: '1Y', cnbc: '1Y', range: '1y', interval: '1d' },
  max: { label: 'TÜMÜ', cnbc: 'ALL', range: 'max', interval: '1mo' },
}

// Hiçbir şey seçilmediyse: başlıca endeksler + rastgele iki büyük hisse (oturum boyunca aynı).
const BIG = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AVGO', 'JPM', 'TSM', 'NFLX', 'AMD']
const pick = [...BIG].sort(() => Math.random() - 0.5).slice(0, 2)
export const DEFAULT_ITEMS = [
  { s: '.SPX', big: true },
  { s: '.IXIC', big: false },
  { s: '.XU100', big: false },
  ...pick.map((s) => ({ s, big: false })),
]

const NAMES = { '.SPX': 'S&P 500', '.IXIC': 'Nasdaq', '.NDX': 'Nasdaq 100', '.DJI': 'Dow Jones', '.XU100': 'BIST 100', '.XU030': 'BIST 30' }
const num = (v) => {
  if (v == null || v === '') return null
  const n = parseFloat(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}
const isYahoo = (s) => /\.IS$|^\^|=/.test(s) // Yahoo biçimi: THYAO.IS, ^GSPC, EURTRY=X

const TTL = 60000
const qCache = new Map() // sembol → { t, v } anlık
const cCache = new Map() // `${sembol}|${aralık}` → { t, v } grafik
const fresh = (m, k) => {
  const h = m.get(k)
  return h && Date.now() - h.t < TTL ? h.v : undefined
}

// ---- CNBC ----
async function cnbcQuotes(syms, signal) {
  const need = syms.filter((s) => fresh(qCache, s) === undefined)
  if (need.length) {
    const j = await getJson(
      'https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol',
      { symbols: need.join('|'), requestMethod: 'itv', noform: '1', partnerId: '2', fund: '1', exthrs: '1', output: 'json' },
      signal,
    )
    let list = j?.FormattedQuoteResult?.FormattedQuote || []
    if (!Array.isArray(list)) list = [list]
    for (const q of list) {
      if (!q?.symbol || q.code === 1 || num(q.last) == null) continue
      qCache.set(q.symbol, {
        t: Date.now(),
        v: {
          name: NAMES[q.symbol] || q.name || q.symbol,
          exch: q.exchange || '',
          currency: q.currencyCode || '',
          price: num(q.last),
          prev: num(q.previous_day_closing),
          change: num(String(q.change_pct || '').replace('%', '')),
        },
      })
    }
  }
  return Object.fromEntries(syms.map((s) => [s, fresh(qCache, s)]).filter(([, v]) => v))
}

async function cnbcChart(sym, rangeKey, signal) {
  const k = sym + '|' + rangeKey
  const hit = fresh(cCache, k)
  if (hit) return hit
  const j = await getJson(`https://ts-api.cnbc.com/harmony/app/charts/${RANGES[rangeKey].cnbc}.json`, { symbol: sym }, signal)
  const v = (j?.barData?.priceBars || []).map((b) => num(b.close)).filter((x) => x != null)
  cCache.set(k, { t: Date.now(), v })
  return v
}

// ---- Yahoo (yedek) ----
async function yahoo(sym, rangeKey, signal) {
  const k = 'Y' + sym + '|' + rangeKey
  const hit = fresh(cCache, k)
  if (hit) return hit
  const r = RANGES[rangeKey]
  const j = await getJson('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym), { range: r.range, interval: r.interval }, signal)
  const res = j?.chart?.result?.[0]
  if (!res) throw new Error('Veri yok')
  const m = res.meta || {}
  const points = (res.indicators?.quote?.[0]?.close || []).filter((x) => x != null)
  const price = m.regularMarketPrice ?? points.at(-1)
  const prev = m.chartPreviousClose ?? m.previousClose
  const v = { name: m.shortName || m.longName || sym, exch: m.fullExchangeName || m.exchangeName || '', currency: m.currency || '', price, prev, points, change: prev ? ((price - prev) / prev) * 100 : null }
  cCache.set(k, { t: Date.now(), v })
  return v
}

/**
 * Seçili öğelerin verisi: { [sembol]: { sym, name, exch, currency, price, ref, change, points } }.
 * Gün içi (1G) değişim önceki kapanışa göre; diğer aralıklarda aralığın başına göre hesaplanır.
 */
export async function loadQuotes(syms, rangeKey = '1d', signal) {
  const cn = syms.filter((s) => !isYahoo(s))
  const out = {}
  const quotes = cn.length ? await cnbcQuotes(cn, signal).catch(() => ({})) : {}
  await Promise.all(
    syms.map(async (s) => {
      try {
        let q
        if (!isYahoo(s) && quotes[s]) {
          const points = await cnbcChart(s, rangeKey, signal).catch(() => [])
          q = { ...quotes[s], points }
        } else {
          q = await yahoo(s, rangeKey, signal)
        }
        const ref = rangeKey === '1d' ? q.prev ?? q.points[0] : q.points[0]
        const change = rangeKey === '1d' && q.change != null ? q.change : ref ? ((q.price - ref) / ref) * 100 : null
        out[s] = { sym: s, ...q, ref, change }
      } catch {
        /* bu sembol alınamadı; diğerleri gösterilir */
      }
    }),
  )
  return out
}

const TYPES_CNBC = { STOCK: 'Hisse', ETF: 'Fon (ETF)', FUND: 'Yatırım fonu', INDEX: 'Endeks' }
const TYPES_YAHOO = { EQUITY: 'Hisse', ETF: 'Fon (ETF)', MUTUALFUND: 'Yatırım fonu', INDEX: 'Endeks', CRYPTOCURRENCY: 'Kripto', CURRENCY: 'Döviz' }

// Arama: CNBC ve Yahoo birlikte; CNBC önce, aynı sembol tekrar edilmez. Biri başarısız olsa da diğeri döner.
export async function searchSymbols(q, signal) {
  const [c, y] = await Promise.allSettled([
    getJson('https://symlookup.cnbc.com/symservice/symlookup.do', { prefix: q, partnerid: '20064', pgok: '1', pgsize: '8' }, signal),
    getJson('https://query1.finance.yahoo.com/v1/finance/search', { q, quotesCount: '6', newsCount: '0', lang: 'tr-TR', region: 'TR' }, signal),
  ])
  const out = []
  const seen = new Set()
  const add = (x) => !seen.has(x.s) && (seen.add(x.s), out.push(x))
  if (c.status === 'fulfilled' && Array.isArray(c.value))
    c.value.filter((x) => x.symbolName && TYPES_CNBC[x.issueType]).forEach((x) => add({ s: x.symbolName, name: x.companyName || x.symbolName, type: TYPES_CNBC[x.issueType], exch: x.exchangeName || '' }))
  if (y.status === 'fulfilled')
    (y.value?.quotes || []).filter((x) => x.symbol && TYPES_YAHOO[x.quoteType]).forEach((x) => add({ s: x.symbol, name: x.shortname || x.longname || x.symbol, type: TYPES_YAHOO[x.quoteType], exch: x.exchDisp || '' }))
  if (!out.length && c.status === 'rejected' && y.status === 'rejected') throw c.reason
  return out.slice(0, 10)
}

const CUR = { USD: '$', EUR: '€', TRY: '₺', GBP: '£', JPY: '¥' }
export function money(v, currency) {
  if (v == null) return '–'
  const n = v >= 1000 ? v.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) : v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const c = CUR[currency]
  return c ? (currency === 'TRY' ? n + ' ' + c : c + n) : n
}
export const pct = (v) => (v == null ? '' : (v >= 0 ? '+' : '') + v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%')
