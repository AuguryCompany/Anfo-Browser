// AI sağlayıcıları (bulut): Anthropic'in kendi API'si ve OpenAI uyumlu sohbet API'si sunan diğerleri.
// OpenRouter tek anahtarla yüzlerce modele (Claude, GPT, Gemini, Llama, DeepSeek, Qwen…) bağlanır.
// Hiçbir şey sunucumuz üzerinden geçmez: istek doğrudan cihazdan seçilen sağlayıcıya gider.

export const PROVIDERS = {
  anthropic: {
    label: 'Anthropic',
    logo: 'claude',
    hint: 'sk-ant-…',
    models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
  },
  openrouter: {
    label: 'OpenRouter',
    logo: 'openrouter',
    base: 'https://openrouter.ai/api/v1',
    hint: 'sk-or-…',
    models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-haiku', 'google/gemini-2.0-flash-001', 'meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-chat', 'qwen/qwen-2.5-72b-instruct'],
  },
  openai: {
    label: 'OpenAI',
    logo: 'openai',
    base: 'https://api.openai.com/v1',
    hint: 'sk-…',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
  },
  gemini: {
    label: 'Google Gemini',
    logo: 'gemini',
    base: 'https://generativelanguage.googleapis.com/v1beta/openai',
    hint: 'AIza…',
    models: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
  },
  groq: {
    label: 'Groq',
    logo: 'groq',
    base: 'https://api.groq.com/openai/v1',
    hint: 'gsk_…',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
  },
  azure: {
    label: 'Azure OpenAI',
    logo: 'azure',
    hint: 'Azure anahtarı',
    models: [], // Azure'da model yerine, kendi oluşturduğun dağıtımın (deployment) adı yazılır
    editable: true, // adres kullanıcıdan: https://<kaynak>.openai.azure.com
    required: true,
    baseHint: 'https://kaynak-adi.openai.azure.com',
    modelHint: 'dağıtım adı',
    auth: 'api-key',
  },
  alibaba: {
    label: 'Alibaba Cloud',
    logo: 'alibabacloud',
    base: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    editable: true, // anahtar bölgeye bağlıdır: Çin konsolu için https://dashscope.aliyuncs.com/compatible-mode/v1
    baseHint: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    hint: 'sk-…',
    models: ['qwen-plus', 'qwen-turbo', 'qwen-max'],
  },
  custom: {
    label: 'Özel',
    logo: null,
    hint: 'isteğe bağlı',
    models: [],
    custom: true, // adres kullanıcıdan: Ollama, LM Studio, vLLM… (OpenAI uyumlu)
    editable: true,
    required: true,
    baseHint: 'http://192.168.1.5:11434/v1',
  },
}

export const PROVIDER_IDS = Object.keys(PROVIDERS)

export const providerOf = (s) => (PROVIDERS[s.aiProvider] ? s.aiProvider : 'anthropic')
export const keyOf = (s, p = providerOf(s)) => (s.aiKeys?.[p] || '').trim()
export const modelOf = (s, p = providerOf(s)) => (s.aiModels?.[p] || '').trim() || PROVIDERS[p].models[0] || ''
const clean = (u) => (u || '').trim().replace(/\/+$/, '')
// Adres: düzenlenebilir sağlayıcılarda kullanıcının girdiği, yoksa varsayılan. Azure'da kaynak adresine /openai/v1 eklenir.
export const baseOf = (s, p = providerOf(s)) => {
  const def = PROVIDERS[p]
  let u = def.editable ? clean(s.aiBases?.[p]) || clean(def.base) : clean(def.base)
  if (p === 'azure' && u && !/\/openai(\/|$)/.test(u)) u += '/openai/v1'
  return u
}

// Bulut AI kullanıma hazır mı: anahtar (özelde adres) ve model gerekir.
export const cloudReady = (s) => {
  const p = providerOf(s)
  const def = PROVIDERS[p]
  const authed = def.custom ? !!baseOf(s, p) : keyOf(s, p).length >= 10 && (!def.required || !!baseOf(s, p))
  return authed && !!modelOf(s, p)
}

// Model adından üreticiyi çıkarır; OpenRouter'da "anthropic/claude-…" gibi adlarda sağlayıcıdan bağımsız doğru logo çıkar.
const VENDORS = [
  [/claude|anthropic/, 'claude'],
  [/gpt|openai|chatgpt|(^|[/\-:])o[134](-|$)/, 'openai'],
  [/gemini|gemma|google|palm/, 'gemini'],
  [/llama|meta-/, 'meta'],
  [/mistral|mixtral|codestral|ministral|pixtral/, 'mistral'],
  [/deepseek/, 'deepseek'],
  [/qwen|qwq/, 'qwen'],
  [/grok|x-ai/, 'grok'],
  [/command|cohere/, 'cohere'],
  [/phi-|microsoft/, 'microsoft'],
  [/glm|zhipu|z-ai/, 'zhipu'],
  [/kimi|moonshot/, 'kimi'],
  [/nemotron|nvidia/, 'nvidia'],
  [/sonar|perplexity/, 'perplexity'],
  [/minimax/, 'minimax'],
  [/(^|[/\-])yi-/, 'yi'],
]
export function logoFor(provider, model = '') {
  const m = model.toLowerCase()
  for (const [re, key] of VENDORS) if (re.test(m)) return key
  return PROVIDERS[provider]?.logo || null
}

// Kartta gösterilecek kısa model adı: "anthropic/claude-sonnet-5-5" → "claude-sonnet-5-5".
export const shortModel = (m = '') => m.split('/').pop().replace(/:free$/, ' (ücretsiz)')

// ---- model listesi ----
const cache = {}
export const cachedModels = (p) => cache[p] || []

// Sağlayıcının model listesini getirir (OpenRouter anahtarsız da çalışır). Kimlikler sıralı ve tekildir.
export async function fetchModels(s, p = providerOf(s)) {
  const key = keyOf(s, p)
  let url
  const headers = {}
  if (p === 'anthropic') {
    url = 'https://api.anthropic.com/v1/models?limit=100'
    headers['x-api-key'] = key
    headers['anthropic-version'] = '2023-06-01'
    headers['anthropic-dangerous-direct-browser-access'] = 'true'
  } else {
    const base = baseOf(s, p)
    if (!base) throw new Error('Önce adresi gir.')
    url = base + '/models'
    if (key) headers[p === 'azure' ? 'api-key' : 'Authorization'] = p === 'azure' ? key : 'Bearer ' + key
  }
  if (p !== 'openrouter' && !PROVIDERS[p].custom && !key) throw new Error('Önce API anahtarını gir.')
  const r = await fetch(url, { headers })
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'API anahtarı geçersiz.' : `Liste alınamadı (${r.status}).`)
  const j = await r.json()
  const list = (j.data || j.models || []).map((x) => String(x.id || x.name || '').replace(/^models\//, '')).filter(Boolean)
  cache[p] = [...new Set(list)].sort()
  return cache[p]
}
