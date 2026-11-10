// AI modu: seçilen sağlayıcıyla kaynaklı özet. Anthropic SDK'sı yalnızca ilk kullanımda yüklenir (ana paketi şişirmez).
// Anahtar kullanıcıya aittir, yalnızca bu cihazda saklanır ve doğrudan seçilen sağlayıcıya gider.
let sdk

const MODEL = 'claude-opus-5-5'
const MAX_TOKENS = 1500 // varsayılan; arama özeti 1200, sayfa özeti 1600 gibi çağıran kendi değerini verir
const PAGE_MAX_CHARS = 60000

const SYSTEM = `Bir tarayıcının içindeki özet katmanısın. Kullanıcının dilinde (varsayılan Türkçe), kısa ve doğrudan yaz.
Yalnızca sana verilen kaynaklara dayan; kaynaklarda olmayan bir şeyi biliyormuş gibi sunma, emin olmadığında bunu söyle.
Düz metin yaz: başlık, madde imi ya da Markdown kullanma. En fazla üç kısa paragraf.`

// Bulut AI: provider 'anthropic' ise Anthropic SDK'sı, diğerlerinde (OpenRouter, OpenAI, Azure, Gemini, Groq, Alibaba, özel)
// OpenAI uyumlu /chat/completions akışı kullanılır (Azure OpenAI v1 yolu dahil; Azure anahtarı 'api-key' başlığıyla gider). İstek doğrudan cihazdan sağlayıcıya gider.
export async function ask({ provider = 'anthropic', key, base, prompt, onText, signal, maxTokens = MAX_TOKENS, model = MODEL }) {
  if (provider !== 'anthropic') return askCompat({ provider, key, base, model, prompt, onText, signal, maxTokens })
  sdk ||= (await import('@anthropic-ai/sdk')).default
  const Anthropic = sdk
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true })
  try {
    const params = {
      model,
      max_tokens: maxTokens,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    }
    // Varsayılan modelde: hız öncelikli düşük efor + güvenlik reddinde sunucu tarafı yedek model.
    if (model === MODEL) {
      params.output_config = { effort: 'low' }
      params.betas = ['server-side-fallback-2026-07-01']
      params.fallbacks = 'default'
    }
    const stream = client.beta.messages.stream(params, { signal })
    let text = ''
    stream.on('text', (delta) => onText((text += delta)))
    const message = await stream.finalMessage()
    if (message.stop_reason === 'refusal') throw new Error('Bu istek için özet üretilemedi.')
    return text
  } catch (e) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
    if (e instanceof Anthropic.AuthenticationError) throw new Error('API anahtarı geçersiz. Ayarlar › AI bölümünden kontrol et.')
    if (e instanceof Anthropic.NotFoundError) throw new Error(`“${model}” modeli bulunamadı. Ayarlar › AI bölümünden modeli değiştir.`)
    if (e instanceof Anthropic.RateLimitError) throw new Error('Hız sınırına takıldı; biraz sonra yeniden dene.')
    if (e instanceof Anthropic.APIConnectionError) throw new Error('Bağlantı kurulamadı.')
    if (e instanceof Anthropic.APIError) throw new Error(`AI hatası (${e.status}).`)
    throw e
  }
}

// <think>…</think> gibi düşünme bölümleri kartta gösterilmez.
const stripThink = (t) => t.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').replace(/^\s+/, '')

async function askCompat({ provider, key, base, model, prompt, onText, signal, maxTokens }) {
  if (!base) throw new Error('Sağlayıcı adresi eksik. Ayarlar › AI bölümünden gir.')
  const headers = { 'Content-Type': 'application/json' }
  if (key) headers[provider === 'azure' ? 'api-key' : 'Authorization'] = provider === 'azure' ? key : 'Bearer ' + key
  if (provider === 'openrouter') headers['X-Title'] = 'Anfo Browser'
  const body = {
    model,
    stream: true,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: prompt },
    ],
  }
  // OpenAI'nin yeni modelleri max_tokens yerine max_completion_tokens ister; diğerleri max_tokens.
  body[provider === 'openai' || provider === 'azure' ? 'max_completion_tokens' : 'max_tokens'] = maxTokens
  let res
  try {
    res = await fetch(base + '/chat/completions', { method: 'POST', headers, body: JSON.stringify(body), signal })
  } catch (e) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
    throw new Error('Bağlantı kurulamadı.')
  }
  if (!res.ok) {
    let msg = ''
    try {
      const j = await res.json()
      msg = j.error?.message || j[0]?.error?.message || ''
    } catch {
      /* gövde yok */
    }
    if (res.status === 401 || res.status === 403) throw new Error('API anahtarı geçersiz. Ayarlar › AI bölümünden kontrol et.')
    if (res.status === 402) throw new Error('Bakiye yetersiz (' + provider + ').')
    if (res.status === 404) throw new Error(`“${model}” modeli bulunamadı. Ayarlar › AI bölümünden modeli değiştir.`)
    if (res.status === 429) throw new Error('Hız sınırına takıldı; biraz sonra yeniden dene.')
    throw new Error(`AI hatası (${res.status})${msg ? ': ' + msg.slice(0, 140) : '.'}`)
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let raw = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        if (!line.startsWith('data:')) continue // ": OPENROUTER PROCESSING" gibi yorum satırları atlanır
        const data = line.slice(5).trim()
        if (!data || data === '[DONE]') continue
        let j
        try {
          j = JSON.parse(data)
        } catch {
          continue
        }
        if (j.error) throw new Error(j.error.message || 'AI hatası.')
        const d = j.choices?.[0]?.delta?.content
        if (d) onText(stripThink((raw += d)))
      }
    }
  } catch (e) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
    throw e
  }
  return stripThink(raw)
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
