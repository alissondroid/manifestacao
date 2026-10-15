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

  boom() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    this.tone(70, t + 0.9, 0.5, 'sine', 0.2);
    this.tone(55, t + 1.35, 0.5, 'sine', 0.2);
    this.tone(80, t + 1.8, 0.4, 'sine', 0.15);
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
