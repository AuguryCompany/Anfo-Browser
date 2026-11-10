// Piyasa ve haber widget'larının kullandığı dış uç noktaların gerçekten (anahtarsız, çerezsiz) yanıt verdiğini
// denetler. Android'deki yerel HTTP isteğine benzer şekilde düz fetch kullanır (CORS yok).
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
const get = async (url) => {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'tr,en;q=0.8' } })
  return { status: r.status, text: await r.text() }
}
;(async () => {
  let bad = 0
  for (const [name, url, check] of [
    ['Yahoo grafik NVDA 1G', 'https://query1.finance.yahoo.com/v8/finance/chart/NVDA?range=1d&interval=5m&includePrePost=false', (t) => { const m = JSON.parse(t).chart.result[0].meta; return `${m.shortName} ${m.regularMarketPrice} ${m.currency} önceki ${m.chartPreviousClose}` }],
    ['Yahoo grafik ^GSPC 1Y', 'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=1y&interval=1d', (t) => { const r = JSON.parse(t).chart.result[0]; return `${r.meta.regularMarketPrice} · ${r.indicators.quote[0].close.length} nokta` }],
    ['Yahoo grafik XU100.IS', 'https://query1.finance.yahoo.com/v8/finance/chart/XU100.IS?range=1d&interval=5m', (t) => { const m = JSON.parse(t).chart.result[0].meta; return `${m.regularMarketPrice} ${m.currency}` }],
    ['Yahoo arama "thyao"', 'https://query1.finance.yahoo.com/v1/finance/search?q=thyao&quotesCount=8&newsCount=0&lang=tr-TR&region=TR', (t) => JSON.parse(t).quotes.map((q) => q.symbol + '/' + q.quoteType).join(', ')],
    ['Yahoo query2 grafik NVDA', 'https://query2.finance.yahoo.com/v8/finance/chart/NVDA?range=1d&interval=5m', (t) => { const m = JSON.parse(t).chart.result[0].meta; return `${m.regularMarketPrice} ${m.currency}` }],
    ['Stooq anlık NVDA', 'https://stooq.com/q/l/?s=nvda.us&f=sd2t2ohlcvn&h&e=csv', (t) => t.trim().split('\n').slice(0, 2).join(' | ')],
    ['Stooq anlık ^SPX', 'https://stooq.com/q/l/?s=%5Espx&f=sd2t2ohlcvn&h&e=csv', (t) => t.trim().split('\n').slice(0, 2).join(' | ')],
    ['Stooq anlık XU100', 'https://stooq.com/q/l/?s=%5Exu100&f=sd2t2ohlcvn&h&e=csv', (t) => t.trim().split('\n').slice(0, 2).join(' | ')],
    ['Stooq geçmiş NVDA', 'https://stooq.com/q/d/l/?s=nvda.us&i=d', (t) => t.trim().split('\n').length + ' satır · ' + t.slice(0, 60).replace(/\n/g, ' | ')],
    ['CNBC anlık NVDA,.SPX,.IXIC,.XU100', 'https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=NVDA%7C.SPX%7C.IXIC%7C.XU100&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json', (t) => JSON.parse(t).FormattedQuoteResult.FormattedQuote.map((q) => `${q.symbol}=${q.last} ${q.change_pct} ${q.name}`).join(' ; ')],
    ['CNBC grafik NVDA 1D', 'https://ts-api.cnbc.com/harmony/app/charts/1D.json?symbol=NVDA', (t) => { const j = JSON.parse(t); const b = j.barData?.priceBars || []; return b.length + ' çubuk · önceki ' + j.barData?.previousClose + ' · son ' + b.at(-1)?.close }],
    ['CNBC grafik .SPX 1Y', 'https://ts-api.cnbc.com/harmony/app/charts/1Y.json?symbol=.SPX', (t) => { const j = JSON.parse(t); return (j.barData?.priceBars || []).length + ' çubuk' }],
    ['CNBC arama "nvidia"', 'https://symlookup.cnbc.com/symservice/symlookup.do?prefix=nvidia&partnerid=20064&pgok=1&pgsize=6', (t) => JSON.parse(t).map((x) => x.symbolName + '/' + x.issueType + '/' + x.exchangeName).join(', ')],
    ['CNBC arama "thy"', 'https://symlookup.cnbc.com/symservice/symlookup.do?prefix=thy&partnerid=20064&pgok=1&pgsize=6', (t) => JSON.parse(t).map((x) => x.symbolName + '/' + x.issueType).join(', ')],
    ['Google Haberler gündem', 'https://news.google.com/rss?hl=tr&gl=TR&ceid=TR:tr', (t) => (t.match(/<item>/g) || []).length + ' haber · ' + (t.match(/<item><title>([^<]{0,80})/) || [])[1]],
    ['Google Haberler "Teknoloji"', 'https://news.google.com/rss/search?q=Teknoloji%20when%3A2d&hl=tr&gl=TR&ceid=TR:tr', (t) => (t.match(/<item>/g) || []).length + ' haber'],
  ]) {
    try {
      const r = await get(url)
      console.log(`${r.status === 200 ? 'TAMAM' : 'HATA '} ${name}: ${r.status} · ${r.status === 200 ? check(r.text) : r.text.slice(0, 120)}`)
      if (r.status !== 200) bad++
    } catch (e) {
      bad++
      console.log(`HATA  ${name}: ${e.message}`)
    }
  }
  process.exit(bad ? 1 : 0)
})()
