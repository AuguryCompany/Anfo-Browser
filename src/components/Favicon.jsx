import { useState } from 'react'
import { hostOf, useStore } from '../store'
import { useFav } from '../features/favicons'

// Site simgeleri, gizlilik öncelikli:
//  1. Cihazdaki önbellek (Android'de ziyaret edilen sitenin kendi simgesi; ağ isteği yok).
//  2. Yoksa doğrudan sitenin kendisinden /favicon.ico (aradaki hiçbir hizmete site adı gitmez).
//     cachedOnly: arama sonuçlarında sonuçtaki her siteye istek atılmasın diye bu adım atlanır.
//  3. O da yoksa / kapalıysa alan adının baş harfi.
export default function Favicon({ url, size = 16, cachedOnly = false }) {
  const host = hostOf(url)
  const cached = useFav(host)
  const [bad, setBad] = useState(null)
  const on = useStore((s) => s.settings.favicons !== false)
  if (on && cached) return <img className="fav" src={cached} width={size} height={size} alt="" />
  if (!on || cachedOnly || !host || bad === host) return <Letter host={host} size={size} />
  return (
    <img
      className="fav"
      src={`https://${host}/favicon.ico`}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBad(host)}
    />
  )
}

function Letter({ host, size }) {
  return (
    <span
      className="fav-letter"
      aria-hidden
      style={{
        display: 'grid',
        placeItems: 'center',
        flex: 'none',
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--frost-2)',
        color: 'var(--text)',
        fontSize: Math.round(size * 0.55),
        fontWeight: 600,
        lineHeight: 1,
      }}
    >
      {(host || '?').charAt(0).toUpperCase()}
    </span>
  )
}
