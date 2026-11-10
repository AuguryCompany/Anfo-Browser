// CNBC yanıt biçimini yazdırır (alan adları için).
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
const g = async (u) => (await fetch(u, { headers: { 'User-Agent': UA } })).json()
;(async () => {
  const q = await g('https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=NVDA%7C.XU100&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json')
  console.log('QUOTE', JSON.stringify(q.FormattedQuoteResult.FormattedQuote[0]).slice(0, 1500))
  console.log('QUOTE2', JSON.stringify(q.FormattedQuoteResult.FormattedQuote[1]).slice(0, 600))
  const c = await g('https://ts-api.cnbc.com/harmony/app/charts/1D.json?symbol=NVDA')
  console.log('CHART keys', Object.keys(c), Object.keys(c.barData || {}), JSON.stringify((c.barData?.priceBars || [])[0]))
  for (const r of ['5D', '1M', '1Y', 'ALL']) { try { const x = await g(`https://ts-api.cnbc.com/harmony/app/charts/${r}.json?symbol=.SPX`); console.log('RANGE', r, (x.barData?.priceBars || []).length) } catch (e) { console.log('RANGE', r, 'HATA', e.message) } }
  const s = await g('https://symlookup.cnbc.com/symservice/symlookup.do?prefix=turk%20hava&partnerid=20064&pgok=1&pgsize=6')
  console.log('SEARCH', JSON.stringify(s).slice(0, 900))
  const s2 = await g('https://symlookup.cnbc.com/symservice/symlookup.do?prefix=s%26p&partnerid=20064&pgok=1&pgsize=6')
  console.log('SEARCH2', JSON.stringify(s2).slice(0, 700))
})()
