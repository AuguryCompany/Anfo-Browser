// Dış veri istekleri (piyasa, haberler). Android'de yerel HTTP (CapacitorHttp) kullanılır: tarayıcının CORS
// kısıtına takılmaz ve WebView çerezleri gönderilmez. Web sürümünde normal fetch denenir (CORS izin vermezse hata).
import { CapacitorHttp } from '@capacitor/core'
import { isNative } from '../native'

const UA = navigator.userAgent.replace('; wv', '').replace(/ Version\/[\d.]+/, '')
const abort = () => new DOMException('aborted', 'AbortError')

export async function getText(url, params, signal) {
  if (isNative) {
    const r = await CapacitorHttp.get({ url, params, responseType: 'text', headers: { 'User-Agent': UA, 'Accept-Language': 'tr,en;q=0.8' } })
    if (signal?.aborted) throw abort()
    if (r.status >= 400) throw new Error('HTTP ' + r.status)
    return typeof r.data === 'string' ? r.data : JSON.stringify(r.data)
  }
  const qs = params ? '?' + new URLSearchParams(params) : ''
  const r = await fetch(url + qs, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return r.text()
}

export const getJson = async (url, params, signal) => JSON.parse(await getText(url, params, signal))
