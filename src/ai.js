// AI modu: Claude ile kaynaklı özet. SDK yalnızca ilk kullanımda yüklenir (ana paketi şişirmez).
// Anahtar kullanıcıya aittir, yalnızca bu cihazda saklanır ve doğrudan api.anthropic.com'a gider.
let sdk

const MODEL = 'claude-opus-5-5'
const MAX_TOKENS = 1500 // varsayılan; arama özeti 1200, sayfa özeti 1600 gibi çağıran kendi değerini verir
const PAGE_MAX_CHARS = 60000

const SYSTEM = `Bir tarayıcının içindeki özet katmanısın. Kullanıcının dilinde (varsayılan Türkçe), kısa ve doğrudan yaz.
Yalnızca sana verilen kaynaklara dayan; kaynaklarda olmayan bir şeyi biliyormuş gibi sunma, emin olmadığında bunu söyle.
Düz metin yaz: başlık, madde imi ya da Markdown kullanma. En fazla üç kısa paragraf.`

export async function ask({ key, prompt, onText, signal, maxTokens = MAX_TOKENS, model = MODEL }) {
  sdk ||= (await import('@anthropic-ai/sdk')).default
  const Anthropic = sdk
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true })
  try {
    const stream = client.beta.messages.stream(
      {
        model,
        max_tokens: maxTokens,
        output_config: { effort: 'low' }, // kısa özet: hız öncelikli
        // Model bir isteği güvenlik nedeniyle geri çevirirse sunucu aynı isteği yedek modelde yeniden dener.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: SYSTEM,
        messages: [{ role: 'user', content: prompt }],
      },
      { signal },
    )
    let text = ''
    stream.on('text', (delta) => onText((text += delta)))
    const message = await stream.finalMessage()
    if (message.stop_reason === 'refusal') throw new Error('Bu istek için özet üretilemedi.')
    return text
  } catch (e) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
    if (e instanceof Anthropic.AuthenticationError) throw new Error('API anahtarı geçersiz. Ayarlar › AI bölümünden kontrol et.')
    if (e instanceof Anthropic.RateLimitError) throw new Error('Hız sınırına takıldı; biraz sonra yeniden dene.')
    if (e instanceof Anthropic.APIConnectionError) throw new Error('Bağlantı kurulamadı.')
    if (e instanceof Anthropic.APIError) throw new Error(`AI hatası (${e.status}).`)
    throw e
  }
}

// Arama için: sonuç başlıkları ve özetlerinden kaynak numaralı kısa yanıt.
export const overviewPrompt = (q, results) =>
  `Soru: ${q}\n\nKaynaklar:\n${results
    .slice(0, 8)
    .map((r, i) => `[${i + 1}] ${r.title} — ${r.url}\n${r.snippet || ''}`)
    .join('\n\n')}\n\nBu kaynaklara dayanarak soruyu yanıtla. Dayandığın kaynağı cümlenin sonunda [1], [2] biçiminde belirt.`

// Sayfa özeti: metin en fazla 60.000 karaktere kırpılır (çok uzun sayfalarda istek boyutu ve süre için).
export const pagePrompt = (doc) => {
  const body = doc.blocks
    .filter((b) => b.t !== 'img')
    .map((b) => b.v)
    .join('\n\n')
  const text = body.length > PAGE_MAX_CHARS ? body.slice(0, PAGE_MAX_CHARS) + '\n\n[Metnin devamı kırpıldı.]' : body
  return `Aşağıdaki sayfayı özetle: önce tek cümleyle ne olduğu, sonra en önemli noktalar.\n\nBaşlık: ${doc.title}\nAdres: ${doc.url}\n\n${text}`
}

// ---- cihazda çalışan küçük modeller için (bkz. features/local-ai.js) ----
// Küçük modellerin bağlamı ve hızı sınırlı: daha az kaynak, kısa metin, kısa yönerge.
// Küçük modeller için: kaynaklar önce, soru ve yönerge en sonda (küçük modeller son satıra en çok uyar).
export const LOCAL_SYSTEM = `Sen yardımsever bir asistansın. Her zaman Türkçe yanıt verirsin.
Yalnızca sana verilen bilgileri kullanırsın; bilgilerde olmayan bir şey uydurmazsın.`

const LOCAL_SNIPPET = 300
const LOCAL_PAGE_CHARS = 4000

export const overviewPromptLocal = (q, results) =>
  `Bilgiler:\n${results
    .slice(0, 5)
    .map((r, i) => `[${i + 1}] ${r.title}: ${(r.snippet || '').slice(0, LOCAL_SNIPPET)}`)
    .join('\n')}\n\nSoru: ${q}\n\nYukarıdaki bilgilere dayanarak soruyu Türkçe olarak 2-3 cümleyle yanıtla. Her cümlenin sonuna dayandığın bilginin numarasını [1] gibi yaz.`

export const pagePromptLocal = (doc) => {
  const body = doc.blocks
    .filter((b) => b.t !== 'img')
    .map((b) => b.v)
    .join('\n')
    .slice(0, LOCAL_PAGE_CHARS)
  return `Aşağıdaki sayfayı Türkçe olarak birkaç cümleyle özetle.\n\nBaşlık: ${doc.title}\n\n${body}`
}
