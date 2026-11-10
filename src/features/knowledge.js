// Arama zenginleştirme veri katmanı: Vikipedi, Vikiveri ve Commons verisini tarayıcıdan
// fetch ile okur (origin=* ile CORS). Tüm fonksiyonlar hata durumunda null/[] döndürür;
// yalnızca AbortError fırlatılır.

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

// Vikiveri özellikleri, gösterim sırasıyla. type: quantity | time | entity | string
const FACT_PROPS = [
  ['P1082', 'Nüfus', 'quantity'],
  ['P2046', 'Yüzölçümü (km²)', 'quantity'],
  ['P571', 'Kuruluş', 'time'],
  ['P569', 'Doğum', 'time'],
  ['P570', 'Ölüm', 'time'],
  ['P17', 'Ülke', 'entity'],
  ['P36', 'Başkent', 'entity'],
  ['P6', 'Yönetici', 'entity'],
  ['P35', 'Devlet başkanı', 'entity'],
  ['P106', 'Meslek', 'entity'],
  ['P27', 'Vatandaşlık', 'entity'],
  ['P112', 'Kurucu', 'entity'],
  ['P159', 'Merkez', 'entity'],
  ['P1128', 'Çalışan sayısı', 'quantity'],
  ['P2044', 'Rakım (m)', 'quantity'],
  ['P38', 'Para birimi', 'entity'],
  ['P37', 'Resmî dil', 'entity'],
  ['P50', 'Yazar', 'entity'],
  ['P577', 'Yayın tarihi', 'time'],
  ['P136', 'Tür', 'entity'],
]

// ---- Önbellek (modül düzeyi, 30 kayıt, en eski silinir) ----
const CACHE_MAX = 30
const cache = new Map()

const key = (s) => String(s ?? '').trim().toLocaleLowerCase('tr')

function cacheGet(k) {
  if (!cache.has(k)) return undefined
  const v = cache.get(k)
  cache.delete(k)
  cache.set(k, v)
  return v
}

function cacheSet(k, v) {
  cache.delete(k)
  cache.set(k, v)
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value)
}

// Önbellek + hata yutma. Hatalı sonuç önbelleğe yazılmaz, sonraki çağrı yeniden dener.
async function guard(k, signal, run, fallback) {
  const hit = cacheGet(k)
  if (hit !== undefined) return hit
  try {
    const v = await run()
    cacheSet(k, v)
    return v
  } catch (e) {
    if (e?.name === 'AbortError' || signal?.aborted) throw new DOMException('aborted', 'AbortError')
    return fallback
  }
}

async function getJson(url, signal) {
  const r = await fetch(url, { signal })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

// ---- Vikiveri yardımcıları ----

// Bir özelliğin geçerli ifadelerini (en fazla 3) döndürür; kesinleşmişler önce, deprecated atlanır.
function claimVals(claims, pid) {
  return (claims[pid] || [])
    .filter((c) => c.mainsnak?.snaktype === 'value' && c.rank !== 'deprecated')
    .sort((a, b) => (b.rank === 'preferred') - (a.rank === 'preferred'))
    .slice(0, 3)
    .map((c) => c.mainsnak.datavalue)
    .filter(Boolean)
}

// Niteleyicideki zaman değerini (P585/P580) sayısal anahtara çevirir: YYYYMMDD (negatif yıllar için işaretli).
function qualTime(c, prop) {
  const time = c.qualifiers?.[prop]?.[0]?.datavalue?.value?.time
  const m = /^([+-])(\d+)-(\d{2})-(\d{2})/.exec(time || '')
  if (!m) return null
  const n = Number(m[2]) * 10000 + Number(m[3]) * 100 + Number(m[4])
  return m[1] === '-' ? -n : n
}

// Tek ifade seçer: P582 (bitiş) niteleyicisi olanlar atılır; preferred varsa onlar;
// hâlâ birden fazlaysa P585 (yoksa P580) en yenisi; yoksa ilki.
function pickClaim(claims, pid) {
  const list = (claims[pid] || []).filter(
    (c) => c.mainsnak?.snaktype === 'value' && c.rank !== 'deprecated' && !(c.qualifiers?.P582?.length),
  )
  if (!list.length) return null
  let pool = list.some((c) => c.rank === 'preferred') ? list.filter((c) => c.rank === 'preferred') : list
  if (pool.length > 1) {
    const when = (c) => qualTime(c, 'P585') ?? qualTime(c, 'P580')
    const dated = pool.filter((c) => when(c) !== null)
    if (dated.length) pool = [dated.sort((a, b) => when(b) - when(a))[0]]
  }
  return pool[0]
}

// Seçilen ifadenin yılı (P585, yoksa P580).
function claimYear(c) {
  const k = qualTime(c, 'P585') ?? qualTime(c, 'P580')
  if (k === null) return null
  const y = Math.trunc(Math.abs(k) / 10000) * Math.sign(k)
  return y < 0 ? `${-y} M.Ö.` : String(y)
}

// '+1923-10-29T00:00:00Z' + precision → '29 Ekim 1923' | 'Ekim 1923' | '1923' | 'M.Ö. 500'
function fmtTime(time, precision) {
  const m = /^([+-])(\d+)-(\d{2})-(\d{2})/.exec(time || '')
  if (!m) return null
  const y = Number(m[2]) * (m[1] === '-' ? -1 : 1)
  const ys = y < 0 ? `${-y} M.Ö.` : String(y)
  const mo = Number(m[3])
  const d = Number(m[4])
  if (precision >= 11 && mo >= 1 && mo <= 12 && d >= 1) return `${d} ${MONTHS[mo - 1]} ${ys}`
  if (precision === 10 && mo >= 1 && mo <= 12) return `${MONTHS[mo - 1]} ${ys}`
  return ys
}

function fieldText(d, type, names) {
  const v = d.value
  if (type === 'quantity') {
    const n = Number(v?.amount)
    return Number.isFinite(n) ? n.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) : null
  }
  if (type === 'time') return fmtTime(v?.time, v?.precision)
  if (type === 'entity') return names[v?.id] ?? null
  return typeof v === 'string' ? v : null
}

// Varlık kimliklerinin Türkçe (yoksa İngilizce) etiketlerini tek istekte çözer.
async function entityLabels(ids, signal) {
  const map = {}
  if (!ids.length) return map
  const j = await getJson(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join('|')}&props=labels&languages=tr|en&format=json&origin=*`,
    signal,
  )
  for (const id of ids) {
    const e = j.entities?.[id]
    map[id] = e?.labels?.tr?.value ?? e?.labels?.en?.value ?? id
  }
  return map
}

// ---- Dışa aktarılan API ----

// Vikipedi sayfasının özet verisi: Vikiveri özellikleri, görsel, site, koordinat.
export async function facts(title, lang = 'tr', signal) {
  const L = String(lang).replace(/[^a-z-]/gi, '') || 'tr'
  const t = String(title ?? '').trim()
  if (!t) return null
  return guard(
    `facts:${L}:${key(t)}`,
    signal,
    async () => {
      const w = await getJson(
        `https://${L}.wikipedia.org/w/api.php?action=query&prop=pageprops|pageimages&ppprop=wikibase_item&piprop=original&titles=${encodeURIComponent(t)}&redirects=1&format=json&origin=*`,
        signal,
      )
      const page = Object.values(w.query?.pages || {})[0]
      const qid = page && !('missing' in page) ? page.pageprops?.wikibase_item : null
      if (!qid) return null

      const wd = await getJson(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=labels|descriptions|claims&languages=tr|en&format=json&origin=*`,
        signal,
      )
      const ent = wd.entities?.[qid]
      if (!ent || 'missing' in ent) return null
      const claims = ent.claims || {}

      // En fazla 8 bilgi
      const picked = []
      for (const [pid, label, type] of FACT_PROPS) {
        const c = pickClaim(claims, pid)
        if (c) picked.push({ label, type, pid, dvs: [c.mainsnak.datavalue], year: claimYear(c) })
        if (picked.length >= 8) break
      }
      const ids = [
        ...new Set(
          picked
            .filter((p) => p.type === 'entity')
            .flatMap((p) => p.dvs.map((d) => d.value?.id))
            .filter(Boolean),
        ),
      ]
      const names = await entityLabels(ids, signal)

      const list = []
      for (const { label, type, pid, dvs, year } of picked) {
        let text = fieldText(dvs[0], type, names)
        if (!text) continue
        // Nüfus: sayının yanında ölçüm yılı, örn. "5.803.482 (2023)"
        if (pid === 'P1082' && year) text = `${text} (${year})`
        const f = { label, value: text }
        if (type === 'entity' && dvs[0].value?.id) f.url = `https://www.wikidata.org/wiki/${dvs[0].value.id}`
        list.push(f)
      }

      const val = (pid) => claimVals(claims, pid)[0]?.value
      const p18 = val('P18')
      const site = val('P856')
      const coord = val('P625')
      return {
        label: ent.labels?.tr?.value ?? ent.labels?.en?.value ?? t,
        description: ent.descriptions?.tr?.value ?? ent.descriptions?.en?.value ?? null,
        image:
          page.original?.source ??
          (typeof p18 === 'string' ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(p18)}?width=480` : null),
        facts: list,
        website: typeof site === 'string' ? site : null,
        coords: coord && Number.isFinite(coord.latitude) ? { lat: coord.latitude, lon: coord.longitude } : null,
        wikidata: qid,
      }
    },
    null,
  )
}

// Wikimedia Commons'tan bitmap görseller (en fazla 24).
export async function images(q, signal) {
  const s = String(q ?? '').trim()
  if (!s) return []
  return guard(
    `img:${key(s)}`,
    signal,
    async () => {
      const j = await getJson(
        `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(s + ' filetype:bitmap')}&gsrnamespace=6&gsrlimit=24&prop=imageinfo&iiprop=url|size&iiurlwidth=360&format=json&origin=*`,
        signal,
      )
      return Object.values(j.query?.pages || {})
        .sort((a, b) => a.index - b.index)
        .map((p) => {
          const ii = p.imageinfo?.[0]
          if (!ii?.url) return null
          return {
            thumb: ii.thumburl || ii.url,
            full: ii.url,
            title: (p.title || '').replace(/^File:/i, '').replace(/\.[^.]+$/, '').replace(/_/g, ' '),
            page: ii.descriptionurl,
          }
        })
        .filter(Boolean)
        .slice(0, 24)
    },
    [],
  )
}

// Türkçe Vikipedi önerileri; sorgunun kendisi hariç en fazla 8.
export async function related(q, signal) {
  const s = String(q ?? '').trim()
  if (!s) return []
  return guard(
    `rel:${key(s)}`,
    signal,
    async () => {
      const j = await getJson(
        `https://tr.wikipedia.org/w/api.php?action=opensearch&limit=9&search=${encodeURIComponent(s)}&format=json&origin=*`,
        signal,
      )
      const self = key(s)
      return (j[1] || []).filter((t) => key(t) !== self).slice(0, 8)
    },
    [],
  )
}

// ---- Gruplama ----

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}
const isWiki = (h) => /(^|\.)wikipedia\.org$/.test(h)
const titleKey = (t) => String(t ?? '').toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]/gu, '')

// Aynı alan adındaki sonuçları (ve neredeyse aynı başlıklı sonuçları) tek grupta toplar.
// Vikipedi dil sürümleri (tr/en) başlık aynı olsa bile ayrı kalır.
export function groupResults(results = []) {
  const groups = []
  for (const r of results) {
    if (!r) continue
    const host = hostOf(r.url)
    const tk = titleKey(r.title)
    const g = groups.find(
      (g) =>
        (host && g.host === host) ||
        (tk && g.key === tk && !(isWiki(g.host) && isWiki(host))),
    )
    if (g) g.more.push(r)
    else groups.push({ host, main: r, more: [], key: tk })
  }
  return groups.map(({ host, main, more }) => ({ host, main, more }))
}

// ---- Yapay zekâsız hızlı yanıt ----

// Kaynak snippet'lerinden sorguyla eşleşen en iyi 2-3 cümleyi seçer (en fazla 320 karakter).
export function quickAnswer(q, sources = []) {
  const words = [
    ...new Set(
      String(q ?? '')
        .toLocaleLowerCase('tr')
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length > 2),
    ),
  ]
  if (!words.length) return null

  const cands = []
  sources.forEach((src, si) => {
    String(src?.snippet ?? '')
      .split(/(?<=[.!?])\s+/)
      .forEach((sent, ci) => {
        const t = sent.trim()
        if (!t) return
        const low = t.toLocaleLowerCase('tr')
        const hits = words.filter((w) => low.includes(w)).length
        if (!hits) return
        cands.push({ t, si, ci, score: hits + Math.max(0, 0.3 - si * 0.1) })
      })
  })
  cands.sort((a, b) => b.score - a.score || a.si - b.si || a.ci - b.ci)

  const pick = []
  const seen = new Set()
  let len = 0
  // Her cümle kaynağının [n] (1 tabanlı) işaretiyle biter; Results bunları atıf düğmesine çevirir.
  const marked = (c) => `${c.t} [${c.si + 1}]`
  for (const c of cands) {
    if (pick.length >= 3) break
    const k = c.t.toLocaleLowerCase('tr')
    if (seen.has(k)) continue
    const piece = marked(c)
    const next = len ? len + 1 + piece.length : piece.length
    if (next > 320) continue
    seen.add(k)
    len = next
    pick.push(c)
  }
  if (!pick.length) return null

  // Okunabilirlik için kaynak sırasında birleştir
  pick.sort((a, b) => a.si - b.si || a.ci - b.ci)
  return {
    text: pick.map(marked).join(' '),
    cites: [...new Set(pick.map((c) => c.si))].sort((a, b) => a - b),
  }
}
