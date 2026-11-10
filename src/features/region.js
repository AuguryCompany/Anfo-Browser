// Dil ve ülke tercihi: ilk açılışta (isteğe bağlı) sorulur, Ayarlar › Bölge'den değiştirilir.
// Haber dili/ülkesi, piyasa varsayılan endeksleri, arama bölgesi ve Vikipedi dili buna göre şekillenir.
// Seçilmezse cihazın dili kullanılır. Bilgi yalnızca cihazda saklanır.
import { get } from '../store'

export const LANGS = {
  tr: 'Türkçe',
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  pt: 'Português',
  nl: 'Nederlands',
  az: 'Azərbaycanca',
  ar: 'العربية',
  ru: 'Русский',
  ja: '日本語',
}

// Ülke: ad, bayrak, varsayılan dil, DuckDuckGo bölge kodu, yerel borsa endeksi (CNBC sembolü).
export const COUNTRIES = {
  TR: { name: 'Türkiye', flag: '🇹🇷', lang: 'tr', ddg: 'tr-tr', index: '.XU100' },
  US: { name: 'ABD', flag: '🇺🇸', lang: 'en', ddg: 'us-en', index: '.DJI' },
  GB: { name: 'Birleşik Krallık', flag: '🇬🇧', lang: 'en', ddg: 'uk-en', index: '.FTSE' },
  DE: { name: 'Almanya', flag: '🇩🇪', lang: 'de', ddg: 'de-de', index: '.GDAXI' },
  FR: { name: 'Fransa', flag: '🇫🇷', lang: 'fr', ddg: 'fr-fr', index: '.FCHI' },
  NL: { name: 'Hollanda', flag: '🇳🇱', lang: 'nl', ddg: 'nl-nl', index: '.AEX' },
  ES: { name: 'İspanya', flag: '🇪🇸', lang: 'es', ddg: 'es-es', index: '.IBEX' },
  IT: { name: 'İtalya', flag: '🇮🇹', lang: 'it', ddg: 'it-it', index: '.FTMIB' },
  AZ: { name: 'Azerbaycan', flag: '🇦🇿', lang: 'az', ddg: 'wt-wt', index: null },
  AE: { name: 'BAE', flag: '🇦🇪', lang: 'ar', ddg: 'xa-ar', index: '.DFMGI' },
  JP: { name: 'Japonya', flag: '🇯🇵', lang: 'ja', ddg: 'jp-jp', index: '.N225' },
  CA: { name: 'Kanada', flag: '🇨🇦', lang: 'en', ddg: 'ca-en', index: '.GSPTSE' },
  AU: { name: 'Avustralya', flag: '🇦🇺', lang: 'en', ddg: 'au-en', index: '.AXJO' },
}

// Dilden tahmini ülke (ülke seçilmediyse).
const LANG_COUNTRY = { tr: 'TR', en: 'US', de: 'DE', fr: 'FR', es: 'ES', it: 'IT', pt: null, nl: 'NL', az: 'AZ', ar: 'AE', ru: null, ja: 'JP' }

const device = () => {
  const l = (navigator.language || 'tr').toLowerCase().split('-')
  return { lang: LANGS[l[0]] ? l[0] : 'tr', country: COUNTRIES[(l[1] || '').toUpperCase()] ? l[1].toUpperCase() : null }
}

/** Etkin bölge: { lang, country } — kullanıcı seçimi, yoksa cihaz dili, yoksa Türkçe/Türkiye. */
export function region(s = get().settings) {
  const d = device()
  const lang = LANGS[s.lang] ? s.lang : d.lang
  const country = COUNTRIES[s.country] ? s.country : d.country || LANG_COUNTRY[lang] || null
  return { lang, country }
}

export const ddgRegion = () => {
  const { lang, country } = region()
  return country ? COUNTRIES[country].ddg : { en: 'us-en', pt: 'br-pt', ru: 'ru-ru' }[lang] || 'wt-wt'
}

// Vikipedi dili (Azerice ve Arapça dahil hepsinin Vikipedisi var).
export const wikiLang = () => region().lang

// Google Haberler: hl / gl / ceid. Ülke yoksa dilin ülkesi, o da yoksa ABD.
export function newsParams() {
  const { lang, country } = region()
  const gl = country || LANG_COUNTRY[lang] || 'US'
  return { hl: lang, gl, ceid: `${gl}:${lang}` }
}

// Arama aracılığıyla gelen konular için yerel kelimeler (Google Haberler bölümü olmayanlar).
export const AI_WORD = {
  tr: 'yapay zeka',
  en: 'artificial intelligence',
  de: 'künstliche Intelligenz',
  fr: 'intelligence artificielle',
  es: 'inteligencia artificial',
  it: 'intelligenza artificiale',
  pt: 'inteligência artificial',
  nl: 'kunstmatige intelligentie',
  az: 'süni intellekt',
  ar: 'الذكاء الاصطناعي',
  ru: 'искусственный интеллект',
  ja: '人工知能',
}

// Piyasa varsayılanı: ülkenin endeksi + S&P 500 + Nasdaq (+ rastgele iki büyük hisse; market.js ekler).
export function defaultIndices() {
  const { country } = region()
  const local = country && COUNTRIES[country].index
  const list = ['.SPX', '.IXIC']
  if (local && !list.includes(local)) list.push(local)
  else if (!local) list.push('.NDX')
  return list
}
