import { Capacitor, registerPlugin } from '@capacitor/core'

// APK içinde sayfalar gerçek, yerel bir Android WebView'da açılır (WebTabs eklentisi).
// Web sürümünde aynı arayüz sayfaları iframe ile gösterir.
export const isNative = Capacitor.isNativePlatform()
export const WebTabs = isNative ? registerPlugin('WebTabs') : null
