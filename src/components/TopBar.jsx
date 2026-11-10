import { ArrowLeft, House, Bell, Settings2, GitBranch } from 'lucide-react'
import { useStore, setUi, back, goHome, unreadCount, closeReader } from '../store'

const TITLES = { settings: 'Ayarlar', github: 'GitHub', ext: 'Eklentiler', notifs: 'Bildirimler', lib: 'Kitaplık' }

// Sahnenin üst kenarında her zaman görünen küçük çıkış/geri düğmeleri.
// Panel açıksa: geri ok (paneli kapatır). Arama/okuma ekranında: geri + ana sayfa.
// Ana sayfada: sağ üstte bildirim, eklenti, GitHub ve ayarlar kısayolları.
export default function TopBar({ tab, ui }) {
  const unread = useStore(unreadCount)
  const gh = useStore((s) => !!s.settings.ghToken)
  const panel = TITLES[ui]
  const home = !tab.url && !panel && !tab.reader
  const sub = !panel && (tab.reader || tab.url?.startsWith('anfo:'))

  if (panel)
    return (
      <nav className="topbar" aria-label="Panel">
        <button className="tb-btn" onClick={() => setUi(null)} aria-label="Geri">
          <ArrowLeft size={18} />
        </button>
        <span className="tb-title">{panel}</span>
        <span aria-hidden />
      </nav>
    )

  if (sub)
    return (
      <nav className="topbar" aria-label="Gezinme">
        <button className="tb-btn" onClick={() => (tab.reader ? closeReader() : back())} aria-label="Geri">
          <ArrowLeft size={18} />
        </button>
        <span />
        <button className="tb-btn" onClick={() => goHome()} aria-label="Ana sayfa">
          <House size={17} />
        </button>
      </nav>
    )

  // Ana sayfa sade: yalnızca ayarlar. Bildirim düğmesi yalnızca yeni bildirim varken,
  // GitHub düğmesi yalnızca bağlanınca görünür. Eklentiler ayarlardan ve yay menüsünden açılır.
  if (home)
    return (
      <nav className="topbar end" aria-label="Kısayollar">
        {unread > 0 && (
          <button className="tb-btn" onClick={() => setUi('notifs')} aria-label="Bildirimler">
            <Bell size={17} />
            <i className="tb-dot">{unread > 9 ? '9+' : unread}</i>
          </button>
        )}
        {gh && (
          <button className="tb-btn" onClick={() => setUi('github')} aria-label="GitHub">
            <GitBranch size={17} />
          </button>
        )}
        <button className="tb-btn" onClick={() => setUi('settings')} aria-label="Ayarlar">
          <Settings2 size={17} />
        </button>
      </nav>
    )
  return null
}
