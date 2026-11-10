import { useEffect, useState } from 'react'
import { Download, Trash2, Check } from 'lucide-react'
import { useStore, get, setSetting } from '../store'
import { LOCAL_MODELS, useLocalModels, refreshLocal, measureLocal, downloadLocal, deleteLocal, localDevice, fmtMB } from './local-ai'

// Ayarlar › AI modu: cihazda çalışan modellerin listesi. Kullanıcı istediğini indirir, seçer ya da siler.
export default function LocalModels() {
  const st = useLocalModels()
  const chosen = useStore((s) => s.settings.localModel)
  const [err, setErr] = useState('')

  useEffect(() => {
    // Önbellekteki modelleri bul; seçili model silinmişse seçimi düzelt.
    refreshLocal()
      .then((have) => {
        const cur = get().settings.localModel
        if (cur && !have.includes(cur)) setSetting('localModel', have[0] || '')
        if (!cur && have.length) setSetting('localModel', have[0])
      })
      .catch(() => {})
    // İndirme boyutlarını ağdan öğren (bir kez; sonuç saklanır).
    LOCAL_MODELS.forEach((m) => measureLocal(m.id).catch(() => {}))
  }, [])

  const download = async (id) => {
    setErr('')
    try {
      await downloadLocal(id)
      if (!get().settings.localModel) setSetting('localModel', id)
    } catch (e) {
      void e // hata satırın altında gösterilir
    }
  }
  const remove = async (id) => {
    setErr('')
    try {
      await deleteLocal(id)
      if (get().settings.localModel === id) {
        const other = LOCAL_MODELS.find((m) => m.id !== id && st[m.id]?.status === 'ready')
        setSetting('localModel', other?.id || '')
      }
      refreshLocal()
        .then((have) => {
          if (!get().settings.localModel && have.length) setSetting('localModel', have[0])
        })
        .catch(() => {})
    } catch (e) {
      setErr('Silinemedi: ' + e.message)
    }
  }

  const dev = localDevice()
  return (
    <div className="lm-list">
      {LOCAL_MODELS.map((m) => {
        const s = st[m.id] || {}
        const ready = s.status === 'ready'
        const busy = s.status === 'downloading'
        const size = s.size || s.total
        const on = ready && chosen === m.id
        return (
          <div key={m.id} className="lm-row" data-on={on ? '' : undefined}>
            <button
              className="lm-main"
              disabled={!ready}
              aria-pressed={on}
              title={ready ? 'Bu modeli kullan' : 'Önce indir'}
              onClick={() => setSetting('localModel', m.id)}
            >
              <span className="lm-dot">{on && <Check size={12} />}</span>
              <span className="lm-txt">
                <b>
                  {m.name} <small>{m.params} · nicemlenmiş{size ? ' · ' + fmtMB(size) : ''}</small>
                </b>
                <small>{m.note}</small>
                {busy && (
                  <span className="lm-bar" role="progressbar" aria-valuenow={Math.round(s.progress || 0)} aria-valuemin={0} aria-valuemax={100}>
                    <i style={{ width: (s.progress || 0) + '%' }} />
                  </span>
                )}
                {busy && (
                  <small>
                    İndiriliyor… %{Math.floor(s.progress || 0)}
                    {s.total ? ` · ${fmtMB(s.loaded || 0)} / ${fmtMB(s.total)}` : ''}
                  </small>
                )}
                {s.status === 'error' && <small className="sx-err">{s.error}</small>}
              </span>
            </button>
            {ready ? (
              <button className="sx-icon" aria-label={m.name + ' modelini sil'} title="Sil" onClick={() => remove(m.id)}>
                <Trash2 size={15} />
              </button>
            ) : (
              <button className="sx-icon" aria-label={m.name + ' modelini indir'} title="İndir" disabled={busy} onClick={() => download(m.id)}>
                <Download size={15} />
              </button>
            )}
          </div>
        )
      })}
      {err && <p className="sx-err">{err}</p>}
      <p>
        Modeller yalnızca sen indirirsen, bir kez Hugging Face’ten indirilir ve cihazda saklanır. Özet tamamen bu cihazda üretilir; sorgun bir
        AI sunucusuna gönderilmez, anahtar gerekmez. Wi-Fi önerilir; model ilk kullanımda belleğe yüklenirken birkaç saniye sürebilir.
        {dev ? ` Çalışma biçimi: ${dev === 'webgpu' ? 'GPU (WebGPU)' : 'işlemci (WASM)'}.` : ''}
      </p>
    </div>
  )
}
