// Piyasa ve Haberler widget'larını derlenmiş uygulamada CANLI veriyle dener. Android'deki yerel HTTP'yi taklit
// etmek için dış isteklere CORS başlığı eklenir (tarayıcı kısıtı yalnızca web sürümünde vardır).
const { chromium } = require('playwright')
const base = process.argv[2] || 'http://localhost:4173'
;(async () => {
  const b = await chromium.launch()
  const p = await b.newPage({ viewport: { width: 1200, height: 1400 } })
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  await p.route(/cnbc\.com|finance\.yahoo\.com|news\.google\.com/, async (route) => {
    try {
      const r = await route.fetch()
      await route.fulfill({ response: r, headers: { ...r.headers(), 'access-control-allow-origin': '*' } })
    } catch (e) {
      await route.abort()
    }
  })
  await p.goto(base + '/')
  await p.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('anfo:v3') || '{}')
    d.v = 6
    d.settings = { ...(d.settings || {}), widgets: ['market', 'news'] }
    localStorage.setItem('anfo:v3', JSON.stringify(d))
  })
  await p.reload()
  await p.waitForTimeout(8000)
  const txt = (sel) => p.$$eval(sel, (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()))
  console.log('PİYASA (varsayılan):')
  for (const t of await txt('.mk-row, .mk-big')) console.log('  ' + t.slice(0, 160))
  // Arama: hisse ekle
  await p.click('.mk-gear')
  for (const q of ['nvidia', 'thyao', 's&p']) {
    await p.fill('.mk-search input', q)
    await p.waitForTimeout(2500)
    console.log(`ARAMA "${q}": ` + (await txt('.mk-opt')).slice(0, 5).join(' | '))
  }
  await p.fill('.mk-search input', 'nvidia')
  await p.waitForTimeout(2500)
  await p.locator('.mk-opt').first().click()
  await p.locator('.mk-foot button', { hasText: 'Bitti' }).click()
  await p.waitForTimeout(4000)
  console.log('PİYASA (NVDA eklendi): ' + (await txt('.mk-row, .mk-big')).join(' | ').slice(0, 300))
  console.log('HABERLER:')
  for (const t of (await txt('.nw-item')).slice(0, 5)) console.log('  ' + t.slice(0, 140))
  await p.click('.nw-chip:has-text("Ekonomi")')
  await p.waitForTimeout(4000)
  console.log('HABERLER (Ekonomi): ' + (await txt('.nw-item')).slice(0, 2).join(' | ').slice(0, 300))
  console.log('sayfa hataları: ' + (errs.join(' | ') || 'yok'))
  await b.close()
})()
