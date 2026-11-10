import { createRoot } from 'react-dom/client'
import './fonts.css'
import './styles.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'

// Yeni sürüm yayınlandıktan sonra açık kalan eski sayfa, adı değişmiş parçaları bulamazsa
// (Vite "vite:preloadError" olayı) bir kez kendini yeniler. Başarılı açılıştan 10 sn sonra bayrak silinir.
window.addEventListener('vite:preloadError', (e) => {
  if (sessionStorage.getItem('anfo:reloaded')) return
  e.preventDefault()
  sessionStorage.setItem('anfo:reloaded', '1')
  location.reload()
})
setTimeout(() => sessionStorage.removeItem('anfo:reloaded'), 10000)

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
