import { useMemo } from 'react'
import { useStore, hostOf } from '../store'
import { pagePrompt } from '../ai'
import Aura from './Aura'
import AiCard from './AiCard'

// Okuma modu: sayfanın yalnızca metni, kendi tipografimizle. İstenirse başında AI özeti.
export default function Reader({ doc }) {
  const aiOn = useStore((s) => s.settings.ai)
  const keyed = useStore((s) => !!s.settings.aiKey)
  const prompt = useMemo(() => pagePrompt(doc), [doc])
  const words = useMemo(() => doc.blocks.reduce((n, b) => n + (b.t === 'img' ? 0 : b.v.split(/\s+/).length), 0), [doc])
  const empty = words < 40

  return (
    <div className="page reader tex">
      <Aura kind="aurora" still />
      <div className="results-inner">
        <header className="q-head">
          <h1>{doc.title || hostOf(doc.url)}</h1>
          <p>
            {hostOf(doc.url)} · {Math.max(1, Math.round(words / 200))} dk okuma
          </p>
        </header>

        {doc.summarize &&
          (!aiOn ? (
            <p className="foot left">AI modu kapalı — Ayarlar’dan aç</p>
          ) : keyed ? (
            <AiCard prompt={prompt} label="Sayfa özeti" />
          ) : (
            <p className="foot left">AI özeti için Ayarlar › AI bölümüne bir API anahtarı ekle.</p>
          ))}

        {empty ? (
          <p className="foot left">Bu sayfada okunacak düz metin bulunamadı. Geri dönmek için adayı sağa kaydır.</p>
        ) : (
          <article className="prose">
            {doc.blocks.map((b, i) =>
              b.t === 'img' ? (
                <img key={i} src={b.v} alt="" loading="lazy" />
              ) : b.t === 'h' ? (
                <h2 key={i}>{b.v}</h2>
              ) : b.t === 'q' ? (
                <blockquote key={i}>{b.v}</blockquote>
              ) : b.t === 'pre' ? (
                <pre key={i}>{b.v}</pre>
              ) : (
                <p key={i} className={b.t === 'li' ? 'li' : undefined}>
                  {b.v}
                </p>
              ),
            )}
          </article>
        )}
      </div>
    </div>
  )
}
