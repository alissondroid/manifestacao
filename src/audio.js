import { fireworkAudio } from './fireworks-math.js';

// Som ambiente sintetizado (sem arquivos): murmúrio da multidão, buzinas distantes
// e um "pop" para mensagens de chat. Só inicia após um gesto do usuário.

const STORAGE_KEY = 'avenida-online:som';

export class Ambience {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.hornTimer = null;
    this.enabled = true;
    try { this.enabled = localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { /* sem storage */ }
  }

  start() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 1 : 0;
    this.master.connect(ctx.destination);

    // murmúrio: ruído filtrado com volume oscilando devagar
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 480;
    band.Q.value = 0.5;
    const gain = ctx.createGain();
    gain.gain.value = 0.16;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.12;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.05;
    lfo.connect(lfoGain).connect(gain.gain);
    noise.connect(band).connect(gain).connect(this.master);
    noise.start();
    lfo.start();

    const scheduleHorn = () => {
      this.hornTimer = setTimeout(() => { this.horn(); scheduleHorn(); }, 9000 + Math.random() * 20000);
    };
    scheduleHorn();
  }

  tone(freq, start, dur, type, vol) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(vol, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(this.master);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  horn() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    this.tone(392, t, 0.45, 'sawtooth', 0.03);
    this.tone(494, t, 0.45, 'sawtooth', 0.03);
  }

  pop() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    this.tone(660, t, 0.12, 'sine', 0.08);
  }

  /** Pancada: grave e seca no soco, estalo no cassetete, baque pesado no carro, "splat" no tomate. */
  hit(kind = 'punch') {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    if (kind === 'baton') {
      this.tone(520, t, 0.05, 'square', 0.1);
      this.tone(140, t + 0.02, 0.18, 'sawtooth', 0.09);
    } else if (kind === 'kick') {
      this.tone(120, t, 0.2, 'sawtooth', 0.12);
      this.tone(70, t + 0.04, 0.22, 'sine', 0.14);
    } else if (kind === 'car') {
      this.tone(60, t, 0.45, 'sawtooth', 0.16);
      this.tone(45, t + 0.05, 0.5, 'sine', 0.2);
      this.tone(300, t, 0.08, 'square', 0.08);
    } else if (kind === 'tomato') {
      this.tone(220, t, 0.1, 'triangle', 0.1);
      this.tone(110, t + 0.03, 0.16, 'sine', 0.1);
    } else {
      this.tone(160, t, 0.14, 'square', 0.1);
      this.tone(90, t + 0.03, 0.18, 'sawtooth', 0.09);
    }
  }

  /** Golpe que você acertou: tique curto de confirmação. */
  land() {
    if (!this.ctx || !this.enabled) return;
    this.tone(880, this.ctx.currentTime, 0.06, 'triangle', 0.05);
  }

  ko() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    this.tone(300, t, 0.2, 'sawtooth', 0.09);
    this.tone(200, t + 0.18, 0.2, 'sawtooth', 0.09);
    this.tone(110, t + 0.36, 0.5, 'sawtooth', 0.09);
  }

  noise() {
    if (!this.noiseBuf) {
      const ctx = this.ctx;
      const len = ctx.sampleRate * 2;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i += 1) d[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuf;
  }

  /** Saída com pan estéreo (quando o navegador tem StereoPanner) e volume. */
  out(vol, pan = 0) {
    const g = this.ctx.createGain();
    g.gain.value = vol;
    let last = g;
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      last = p;
    }
    last.connect(this.master);
    return g;
  }

  /** Rajada de ruído filtrada com envelope (a base do assobio, do estalo e do corpo do estouro). */
  burstNoise(t, dur, { type = 'lowpass', from, to = from, vol, attack = 0.004, pan = 0, dest }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise();
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(from, t);
    if (to !== from) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest ?? this.out(1, pan));
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  /** Foguete subindo: assobio de ruído que sobe de tom e some. `distance` em metros, `pan` -1..1. */
  launch(distance = 0, pan = 0) {
    if (!this.ctx || !this.enabled) return;
    const { gain, cutoff } = fireworkAudio(distance);
    const t = this.ctx.currentTime;
    const dest = this.out(0.5 * gain, pan);
    this.burstNoise(t, 1.1, { type: 'bandpass', from: 450, to: Math.min(2800, cutoff), vol: 0.22, attack: 0.25, dest });
    this.tone(220, t, 0.9, 'sawtooth', 0.012 * gain); // zumbido do motor
  }

  /**
   * Estouro: estalo seco, corpo de ruído que abafa, trovão grave com eco e, nos tipos que cintilam, crepitar.
   * Chega atrasado e mais baixo/abafado quanto mais longe.
   */
  explode(distance = 0, pan = 0, type = 'peony') {
    if (!this.ctx || !this.enabled) return;
    const { gain, delay, cutoff } = fireworkAudio(distance);
    const t = this.ctx.currentTime + delay;
    const ctx = this.ctx;
    const dest = this.out(1, pan);
    const level = (v) => v * gain;
    // estalo agudo (some com a distância)
    this.burstNoise(t, 0.07, { type: 'highpass', from: 2200, vol: level(0.55) * Math.min(1, cutoff / 6000), attack: 0.002, dest });
    // corpo: ruído que escurece
    this.burstNoise(t, 0.95, { type: 'lowpass', from: Math.min(2600, cutoff), to: 160, vol: level(0.5), attack: 0.006, dest });
    // trovão: seno que cai de tom
    const osc = ctx.createOscillator();
    const og = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(34, t + 0.55);
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(level(0.75), t + 0.01);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    osc.connect(og).connect(dest);
    osc.start(t);
    osc.stop(t + 0.8);
    // eco dos prédios da avenida
    this.burstNoise(t + 0.22, 0.8, { type: 'lowpass', from: 700, to: 120, vol: level(0.2), attack: 0.03, dest });
    // crepitar: estalinhos soltos (salgueiro e palmeira cintilam mais)
    const crackles = type === 'willow' ? 34 : type === 'palm' ? 22 : 12;
    for (let i = 0; i < crackles; i += 1) {
      const at = t + 0.3 + Math.random() * (type === 'willow' ? 2.2 : 1.3);
      this.burstNoise(at, 0.018 + Math.random() * 0.02, {
        type: 'highpass', from: 2500 + Math.random() * 3000, vol: level(0.05 + Math.random() * 0.12) * Math.min(1, cutoff / 5000), attack: 0.001, pan: Math.max(-1, Math.min(1, pan + (Math.random() - 0.5) * 0.6)),
      });
    }
  }

  capture() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    [523, 659, 784].forEach((f, i) => this.tone(f, t + i * 0.1, 0.3, 'triangle', 0.08));
  }

  setEnabled(on) {
    this.enabled = on;
    try { localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
    if (this.master) this.master.gain.value = on ? 1 : 0;
  }
}
