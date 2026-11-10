import { useState } from 'react'
import { useStore, setSetting, registerBuiltins } from '../store'
import { play } from '../sound'
import { isNative } from '../native'
import Aura from '../components/Aura'
import { BUILTINS } from './builtins'
import './panels.css'

registerBuiltins(BUILTINS)

const uid = () => Math.random().toString(36).slice(2, 9)
const EMPTY = { name: '', match: '', css: '', js: '' }

export default function Extensions() {
  const builtin = useStore((s) => s.settings.builtinExt) || {}
  const extensions = useStore((s) => s.settings.extensions) || []
  // null: form kapalı; {id?, name, match, css, js}: yeni ya da düzenlenen eklenti
  const [form, setForm] = useState(null)
  let i = 0

  const toggleBuiltin = (id) => {
    setSetting('builtinExt', { ...builtin, [id]: !builtin[id] })
    play('toggle')
  }
  const toggleOwn = (id) => {
    setSetting('extensions', extensions.map((e) => (e.id === id ? { ...e, on: !e.on } : e)))
    play('toggle')
  }
  const remove = (id) => {
    setSetting('extensions', extensions.filter((e) => e.id !== id))
    play('close')
  }
  const save = () => {
    const prev = form.id ? extensions.find((e) => e.id === form.id) : null
    const item = {
      id: prev ? prev.id : uid(),
      name: form.name.trim() || 'Adsız eklenti',
      match: form.match.trim(),
      css: form.css,
      js: form.js,
      on: prev ? prev.on : true,
    }
    setSetting('extensions', prev ? extensions.map((e) => (e.id === item.id ? item : e)) : [...extensions, item])
    setForm(null)
    play('tick')
  }
  const edit = (e) => setForm({ id: e.id, name: e.name || '', match: e.match || '', css: e.css || '', js: e.js || '' })
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  return (
    <div className="page ext tex">
      <Aura kind="aurora" still />
      <div className="settings-inner">
        <h1>Eklentiler</h1>

        {!isNative && (
          <section className="card" style={{ '--i': i++ }}>
            <p>
              Eklentiler Android uygulamasında sayfalara uygulanır; web sürümü sayfaları çerçevede gösterdiği için müdahale edemez.
            </p>
          </section>
        )}

        <h2 className="ext-sec" style={{ '--i': i++ }}>Yerleşik</h2>
        {BUILTINS.map((b) => {
          const on = !!builtin[b.id]
          return (
            <section key={b.id} className="card" style={{ '--i': i++ }}>
              <div className="ext-row">
                <div className="ext-info">
                  <span className="ext-name">{b.name}</span>
                  <span className="ext-site">{b.match || 'tüm siteler'}</span>
                  <p>{b.desc}</p>
                </div>
                <button className="switch" role="switch" aria-checked={on} aria-label={b.name} onClick={() => toggleBuiltin(b.id)}>
                  <i />
                </button>
              </div>
            </section>
          )
        })}

        <h2 className="ext-sec" style={{ '--i': i++ }}>Senin eklentilerin</h2>
        {extensions.length === 0 && !form && (
          <section className="card" style={{ '--i': i++ }}>
            <p>Henüz eklenti yok. Aşağıdan CSS ya da JS ekleyebilirsin.</p>
          </section>
        )}
        {extensions.map((e) => (
          <section key={e.id} className="card" style={{ '--i': i++ }}>
            <div className="ext-row">
              <div className="ext-info">
                <span className="ext-name">{e.name}</span>
                <span className="ext-site">{e.match || 'tüm siteler'}</span>
              </div>
              <button className="switch" role="switch" aria-checked={!!e.on} aria-label={e.name} onClick={() => toggleOwn(e.id)}>
                <i />
              </button>
            </div>
            <div className="ext-acts">
              <button className="link" onClick={() => edit(e)}>Düzenle</button>
              <button className="link" onClick={() => remove(e.id)}>Sil</button>
            </div>
          </section>
        ))}

        {form ? (
          <section className="card ext-form" style={{ '--i': i++ }}>
            <label className="field">
              <span>Ad</span>
              <input className="text" value={form.name} maxLength={40} placeholder="örn. Sayfa sadeleştirici" onChange={set('name')} />
            </label>
            <label className="field">
              <span>Siteler</span>
              <input className="text" value={form.match} placeholder="youtube.com, x.com (boş = tümü)" spellCheck={false} onChange={set('match')} />
            </label>
            <label className="field">
              <span>CSS</span>
              <textarea className="ext-code" value={form.css} spellCheck={false} onChange={set('css')} />
            </label>
            <label className="field">
              <span>JS</span>
              <textarea className="ext-code" value={form.js} spellCheck={false} onChange={set('js')} />
            </label>
            <div className="ext-form-acts">
              <button className="link" onClick={() => setForm(null)}>Vazgeç</button>
              <button className="link" onClick={save}>Kaydet</button>
            </div>
          </section>
        ) : (
          <section className="card" style={{ '--i': i++ }}>
            <button className="link" onClick={() => (setForm({ ...EMPTY }), play('open'))}>Yeni eklenti</button>
          </section>
        )}

        <section className="card" style={{ '--i': i++ }}>
          <p>Kendi yazdığın betikler yalnızca senin cihazında çalışır; güvenmediğin kodu yapıştırma.</p>
        </section>
      </div>
    </div>
  )
}
