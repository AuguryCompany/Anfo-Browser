import { Sparkles } from 'lucide-react'
import { logoFor } from './providers'

// Sağlayıcı / model logoları (lobehub/icons, MIT) uygulamaya gömülür; ağdan yüklenmez. Logolar ilgili
// şirketlerin ticari markalarıdır ve yalnızca modelin hangi sağlayıcıdan geldiğini göstermek için kullanılır.
// Tek renkli (currentColor) olduklarından tema rengini alırlar.
const icons = import.meta.glob('./logos/*.svg', { query: '?raw', import: 'default', eager: true })
const svg = (k) => icons[`./logos/${k}.svg`]

export default function ModelLogo({ provider, model, size = 14, live }) {
  const key = logoFor(provider, model)
  const raw = key && svg(key)
  if (!raw) return <Sparkles size={size} />
  return <span className="ai-logo" data-live={live ? '' : undefined} style={{ fontSize: size }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: raw }} />
}
