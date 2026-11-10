import { useState } from 'react'
import { useStore, setSetting } from '../store'
import { LANGS, COUNTRIES } from '../features/region'
import { play } from '../sound'
import Aura from './Aura'

// İlk açılış: dil ve ülke (ikisi de isteğe bağlı). Haberler, piyasa, arama bölgesi ve Vikipedi dili buna göre
// şekillenir. Yalnızca cihazda saklanır; Ayarlar › Bölge'den değiştirilebilir.
export default function Welcome() {
  const s = useStore((st) => st.settings)
  const [lang, setLang] = useState(s.lang || '')
  const [country, setCountry] = useState(s.country || '')
  const finish = (save) => {
    if (save) {
      setSetting('lang', lang)
      setSetting('country', country)
    }
    setSetting('onboarded', true)
    play('open')
  }
  return (
    <div className="welcome tex" role="dialog" aria-modal="true" aria-labelledby="welcome-h">
      <Aura kind="aurora" still />
      <div className="welcome-in">
        <img className="welcome-logo" src="./icon-192.png" alt="" width="72" height="72" />
        <h1 id="welcome-h">Anfo’ya hoş geldin</h1>
        <p className="welcome-sub">
          Haberleri, piyasaları ve aramayı sana göre ayarlayalım. İkisi de isteğe bağlı; seçmezsen cihazının dili kullanılır.
          Bu bilgiler yalnızca bu cihazda kalır, Ayarlar › Bölge’den değiştirebilirsin.
        </p>

        <section>
          <h2>Dil</h2>
          <div className="welcome-chips" role="radiogroup" aria-label="Dil">
            {Object.entries(LANGS).map(([k, label]) => (
              <button key={k} role="radio" aria-checked={lang === k} className="welcome-chip" onClick={() => setLang(lang === k ? '' : k)}>
                {label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2>Ülke</h2>
          <div className="welcome-chips" role="radiogroup" aria-label="Ülke">
            {Object.entries(COUNTRIES).map(([k, c]) => (
              <button key={k} role="radio" aria-checked={country === k} className="welcome-chip" onClick={() => setCountry(country === k ? '' : k)}>
                <span aria-hidden>{c.flag}</span> {c.name}
              </button>
            ))}
          </div>
        </section>

        <p className="welcome-note">Arayüz şimdilik Türkçe; seçtiğin dil haberlerde, aramada ve Vikipedi’de kullanılır.</p>
        <div className="welcome-acts">
          <button className="welcome-skip" onClick={() => finish(false)}>
            Atla
          </button>
          <button className="welcome-go" onClick={() => finish(true)}>
            Başla
          </button>
        </div>
      </div>
    </div>
  )
}
