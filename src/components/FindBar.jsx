import { useEffect, useRef, useState } from 'react'
import { ChevronUp, ChevronDown, X } from 'lucide-react'
import { WebTabs, isNative } from '../native'
import '../features/find.css'

// Yerel sekmede metin arar. Sonuçlar "findResult" olayıyla gelir (WebTabsPlugin.java).
export default function FindBar({ tabId, onClose }) {
  const [query, setQuery] = useState('')
  const [res, setRes] = useState(null) // { active, count }
  const timer = useRef(0)
  const lastRun = useRef('')
  const tabRef = useRef(tabId)
  tabRef.current = tabId

  // Sonuç olayını dinle; abonelik Promise döndürebilir, ikisi de desteklenir.
  useEffect(() => {
    if (!isNative || !WebTabs) return
    const handle = WebTabs.addListener('findResult', e => {
      if (e.id !== tabId) return
      setRes({ active: e.count > 0 ? e.active + 1 : 0, count: e.count })
    })
    return () => {
      Promise.resolve(handle).then(h => h && h.remove && h.remove())
    }
  }, [tabId])

  // Bileşen kapanınca ya da sekme değişince eşleşme vurguları temizlenir.
  useEffect(() => {
    return () => {
      clearTimeout(timer.current)
      if (isNative && WebTabs) WebTabs.findClear({ id: tabRef.current })
    }
  }, [])

  if (!isNative || !WebTabs) return null

  const runSearch = q => {
    lastRun.current = q
    WebTabs.find({ id: tabId, query: q })
  }

  const onChange = e => {
    const q = e.target.value
    setQuery(q)
    if (!q) {
      clearTimeout(timer.current)
      setRes(null)
      lastRun.current = ''
      WebTabs.findClear({ id: tabId })
      return
    }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => runSearch(q), 150)
  }

  // Bekleyen arama varsa hemen çalıştırılır; sonra eşleşmeler arasında gezilir.
  const step = forward => {
    if (!query) return
    if (lastRun.current !== query) {
      clearTimeout(timer.current)
      runSearch(query)
    }
    WebTabs.findNext({ id: tabId, forward })
  }

  const close = () => {
    clearTimeout(timer.current)
    WebTabs.findClear({ id: tabId })
    if (onClose) onClose()
  }

  const onKeyDown = e => {
    if (e.key === 'Enter') {
      e.preventDefault()
      step(!e.shiftKey)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  // Ok düğmelerine basınca klavye kapanmasın diye odak kaymaz.
  const keepFocus = e => e.preventDefault()

  const miss = !!query && res !== null && res.count === 0
  const label = query && res ? (res.count > 0 ? `${res.active}/${res.count}` : '0') : ''

  return (
    <div className="find-bar" role="search">
      <div className="find-pill" data-miss={miss || undefined}>
        <input
          className="find-input"
          type="text"
          placeholder="Sayfada bul"
          aria-label="Sayfada bul"
          value={query}
          onChange={onChange}
          onKeyDown={onKeyDown}
          autoFocus
          enterKeyHint="search"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
        />
        <span className="find-count" aria-live="polite">{label}</span>
        <button
          type="button"
          className="find-btn"
          aria-label="Önceki eşleşme"
          onMouseDown={keepFocus}
          onClick={() => step(false)}
        >
          <ChevronUp size={20} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="find-btn"
          aria-label="Sonraki eşleşme"
          onMouseDown={keepFocus}
          onClick={() => step(true)}
        >
          <ChevronDown size={20} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="find-btn"
          aria-label="Kapat"
          onMouseDown={keepFocus}
          onClick={close}
        >
          <X size={20} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}
