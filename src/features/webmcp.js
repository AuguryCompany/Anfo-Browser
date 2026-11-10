// WebMCP (Web Machine Learning CG taslağı): sayfa, tarayıcıdaki yapay zekâ ajanlarına araç sunar.
// Güncel API: document.modelContext.registerTool(tool, { signal }). Eski taslak: navigator.modelContext.
// Destek yoksa hiçbir şey yapmaz (özellik algılama). Anfo, kendi gezinme araçlarını bu yolla ajana açar.
import { get, navigate, newTab, closeTab, selectTab, setUi, activeTab, labelOf, isWeb } from '../store'
import { search } from '../search'

const text = (t) => ({ content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t) }] })

const TOOLS = [
  {
    name: 'anfo_search',
    title: 'Anfo araması',
    description: 'Web ve Vikipedi üzerinde arar, en iyi sonuçların başlık, adres ve özetini döndürür.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Aranacak metin' } }, required: ['query'] },
    annotations: { readOnlyHint: true },
    async execute({ query }) {
      const r = await search(String(query || ''), new AbortController().signal)
      const list = [...(r.answer ? [r.answer] : []), ...r.results].slice(0, 8).map(({ title, url, snippet }) => ({ title, url, snippet }))
      return text(list)
    },
  },
  {
    name: 'anfo_open',
    title: 'Adres ya da arama aç',
    description: 'Verilen adresi ya da arama metnini Anfo içinde açar. newTab true ise yeni sekmede.',
    inputSchema: { type: 'object', properties: { target: { type: 'string' }, newTab: { type: 'boolean' } }, required: ['target'] },
    async execute({ target, newTab: inNew }) {
      inNew ? newTab(String(target)) : navigate(String(target))
      return text('Açıldı: ' + target)
    },
  },
  {
    name: 'anfo_tabs',
    title: 'Sekmeleri listele',
    description: 'Açık sekmeleri (kimlik, başlık, adres, etkin mi) döndürür.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    async execute() {
      const s = get()
      return text(s.tabs.map((t) => ({ id: t.id, title: labelOf(t), url: t.url, active: t.id === s.activeId })))
    },
  },
  {
    name: 'anfo_tab',
    title: 'Sekmeye geç ya da kapat',
    description: 'Kimliği verilen sekmeye geçer (action: "select") ya da kapatır (action: "close").',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, action: { type: 'string', enum: ['select', 'close'] } }, required: ['id', 'action'] },
    async execute({ id, action }) {
      if (!get().tabs.some((t) => t.id === id)) return text('Böyle bir sekme yok')
      action === 'close' ? closeTab(id) : selectTab(id)
      return text('Tamam')
    },
  },
  {
    name: 'anfo_current',
    title: 'Etkin sekme',
    description: 'Etkin sekmenin başlığını ve adresini döndürür.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    async execute() {
      const t = activeTab()
      return text({ title: labelOf(t), url: t.url, isWebPage: isWeb(t.url) })
    },
  },
  {
    name: 'anfo_panel',
    title: 'Panel aç',
    description: 'Anfo panellerinden birini açar: settings, lib (geçmiş/yer imleri), notifs, ext, github; ya da kapatır (none).',
    inputSchema: { type: 'object', properties: { panel: { type: 'string', enum: ['settings', 'lib', 'notifs', 'ext', 'github', 'none'] } }, required: ['panel'] },
    async execute({ panel }) {
      setUi(panel === 'none' ? null : panel)
      return text('Tamam')
    },
  },
]

let ctrl = null
export function startWebMcp() {
  const mc = document.modelContext || navigator.modelContext
  if (!mc || ctrl) return false
  ctrl = new AbortController()
  try {
    if (typeof mc.registerTool === 'function') {
      for (const tool of TOOLS) {
        try {
          // güncel taslak: (tool, { signal }); eski taslak: (tool)
          mc.registerTool(tool, { signal: ctrl.signal })
        } catch {}
      }
    } else if (typeof mc.provideContext === 'function') {
      mc.provideContext({ tools: TOOLS })
    }
    return true
  } catch {
    return false
  }
}
export function stopWebMcp() {
  ctrl?.abort()
  ctrl = null
}
export const webMcpAvailable = () => !!(document.modelContext || navigator.modelContext)
export const WEBMCP_TOOLS = TOOLS.map((t) => t.name)
