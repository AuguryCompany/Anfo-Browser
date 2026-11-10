import { useState } from 'react'
import { Globe } from 'lucide-react'
import { hostOf, useStore } from '../store'

// Site simgeleri çalışma anında ağdan çekilir; pakete gömülü görsel yoktur.
// Gizlilik: varsayılan kapalı. Kapalıyken (settings.favicons !== true) hiçbir ağ isteği atılmaz; alan adının
// ilk harfi rozet olarak gösterilir. Açıkken simgeler DuckDuckGo'nun simge hizmetinden gelir (site adı ona gider).
export default function Favicon({ url, size = 16 }) {
  const host = hostOf(url)
  const [bad, setBad] = useState(null)
  const favicons = useStore((s) => s.settings.favicons)
  if (favicons !== true && host)
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
          backdropFilter: 'blur(var(--blur, 18px))',
          WebkitBackdropFilter: 'blur(var(--blur, 18px))',
          color: 'var(--text)',
          fontSize: Math.round(size * 0.55),
          fontWeight: 600,
          lineHeight: 1,
        }}
      >
        {host.charAt(0).toUpperCase()}
      </span>
    )
  if (!host || bad === host) return <Globe size={size} className="fav-fallback" aria-hidden />
  return (
    <img
      className="fav"
      src={`https://icons.duckduckgo.com/ip3/${host}.ico`}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      onError={() => setBad(host)}
    />
  )
}
