// Sesler Web Audio ile anında sentezlenir: dosya yok, gecikme yok.
// Karakter: koyu ve yumuşak bir gövde (hızla düşen sinüs) + çok kısa, net bir "tık".
import { get } from './store'

let ctx, master, noise

const PACKS = {
  deep: { f: 118, drop: 2.6, type: 'sine', click: 0.42, cut: 2400, gain: 1 },
  velvet: { f: 164, drop: 1.7, type: 'sine', click: 0.1, cut: 1200, gain: 0.85 },
  ice: { f: 392, drop: 1.22, type: 'triangle', click: 0.26, cut: 3400, gain: 0.42 },
}

// Her olay bir ya da iki vuruş: [perde oranı, süre (sn), kazanç, gecikme (sn)]
const EVENTS = {
  tick: [[1.6, 0.03, 0.28]],
  tap: [[1, 0.07, 0.55]],
  toggle: [[1.26, 0.06, 0.5]],
  sheet: [[0.84, 0.12, 0.45]],
  open: [[1, 0.09, 0.55], [1.5, 0.13, 0.42, 0.07]],
  close: [[1.5, 0.08, 0.42], [1, 0.14, 0.55, 0.065]],
  nav: [[0.75, 0.17, 0.62], [1.12, 0.22, 0.3, 0.055]],
}

export const SOUND_PACKS = { deep: 'Derin', velvet: 'Kadife', ice: 'Buz' }

function init() {
  ctx = new (window.AudioContext || window.webkitAudioContext)()
  master = ctx.createGain()
  const soften = ctx.createBiquadFilter()
  soften.type = 'lowpass'
  soften.frequency.value = 4200
  master.connect(soften).connect(ctx.destination)
  noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate)
  const d = noise.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
}

function hit(p, [ratio, dur, g, delay = 0], vol) {
  const t = ctx.currentTime + delay
  const peak = g * p.gain * vol * 0.5
  const f = p.f * ratio

  const o = ctx.createOscillator()
  const og = ctx.createGain()
  o.type = p.type
  o.frequency.setValueAtTime(f * p.drop, t)
  o.frequency.exponentialRampToValueAtTime(f, t + 0.03)
  og.gain.setValueAtTime(0.0001, t)
  og.gain.exponentialRampToValueAtTime(peak, t + 0.005)
  og.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(og).connect(master)
  o.start(t)
  o.stop(t + dur + 0.02)

  if (p.click) {
    const n = ctx.createBufferSource()
    const bp = ctx.createBiquadFilter()
    const ng = ctx.createGain()
    n.buffer = noise
    bp.type = 'bandpass'
    bp.frequency.value = p.cut
    bp.Q.value = 0.9
    ng.gain.setValueAtTime(peak * p.click, t)
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.018)
    n.connect(bp).connect(ng).connect(master)
    n.start(t)
    n.stop(t + 0.03)
  }
}

export function play(name) {
  const s = get().settings
  if (s.haptics && name !== 'sheet') navigator.vibrate?.(name === 'tick' ? 3 : name === 'tap' ? 6 : 11)
  const ev = EVENTS[name]
  if (!s.sound || !s.volume || !ev) return
  try {
    if (!ctx) init()
    if (ctx.state === 'suspended') ctx.resume()
    const pack = PACKS[s.soundPack] || PACKS.deep
    ev.forEach((h) => hit(pack, h, s.volume / 100))
  } catch {}
}
