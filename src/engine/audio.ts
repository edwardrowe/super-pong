import { readVolume } from './music';

/**
 * Synthesised sound effects — no audio files. Browsers only allow audio after a user
 * gesture, so call unlock() from a pointer/key handler.
 * Note: iPhones in silent mode mute web audio.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Shared output (compressed) that the music also plays into. */
  bus: AudioNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private drive: Float32Array<ArrayBuffer> | null = null;
  /** 0..1 (slider position). Older versions had an on/off switch stored as 'muted'. */
  volume = readVolume('sfxVol', localStorage.getItem('muted') === '1' ? 0 : 0.75);

  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      this.master = this.ctx.createGain();
      this.master.gain.value = sfxGain(this.volume);
      this.master.connect(comp).connect(this.ctx.destination);
      this.bus = comp;
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  /** Stop all audio while the page is hidden. */
  suspend(): void {
    if (this.ctx?.state === 'running') void this.ctx.suspend();
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    localStorage.setItem('sfxVol', String(this.volume));
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(sfxGain(this.volume), this.ctx.currentTime, 0.02);
  }

  // ---- game sounds -------------------------------------------------------

  /** speed: 0 (serve speed) .. 1 (max speed). pan: -1 left .. 1 right. */
  paddle(speed: number, pan: number): void {
    const f = 300 + speed * 520;
    this.tone(f * 2, f, 0.08, 'square', 0.12, pan);
    this.tone(f, f * 0.5, 0.14, 'triangle', 0.3, pan);
  }

  wall(pan: number): void {
    this.tone(1500, 900, 0.05, 'sine', 0.14, pan);
  }

  goal(pan: number): void {
    this.tone(170, 34, 0.7, 'sine', 0.9, pan);
    this.tone(90, 30, 0.6, 'sawtooth', 0.12, pan);
    this.noise(0.6, 0.55, 5000, 120, pan);
  }

  /** The launch: a deep, punchy boom with a little click on top. */
  serve(): void {
    const ctx = this.ctx;
    const dest = this.out(0);
    if (!ctx || !dest) return;
    const t = ctx.currentTime;
    const shaper = ctx.createWaveShaper();
    shaper.curve = this.driveCurve();
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.7, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    shaper.connect(g).connect(dest);
    const boom = ctx.createOscillator();
    boom.frequency.setValueAtTime(150, t);
    boom.frequency.exponentialRampToValueAtTime(36, t + 0.4);
    boom.connect(shaper);
    const body = ctx.createOscillator();
    body.type = 'sawtooth';
    body.frequency.setValueAtTime(82, t);
    body.frequency.exponentialRampToValueAtTime(41, t + 0.3);
    const bf = ctx.createBiquadFilter();
    bf.type = 'lowpass';
    bf.frequency.setValueAtTime(900, t);
    bf.frequency.exponentialRampToValueAtTime(90, t + 0.3);
    const bg = ctx.createGain();
    bg.gain.value = 0.5;
    body.connect(bf).connect(bg).connect(shaper);
    for (const o of [boom, body]) {
      o.start(t);
      o.stop(t + 0.6);
    }
    this.noise(0.05, 0.35, 4000, 600, 0);
  }

  win(): void {
    [523, 659, 784, 1047, 1319].forEach((f, i) => {
      this.tone(f, f, 0.22, 'square', 0.07, 0, i * 0.09);
      this.tone(f, f * 0.99, 0.3, 'triangle', 0.18, 0, i * 0.09);
    });
  }

  /**
   * Deep "space warp": a sub-bass dive with a resonant filter sweep and a wobble that settles.
   * amount 0..1 scales depth, length and loudness. Distorted so the harmonics carry on phone
   * speakers, which can't reproduce true sub-bass.
   */
  warp(amount: number, pan: number): void {
    const ctx = this.ctx;
    const dest = this.out(pan);
    if (!ctx || !dest) return;
    const a = Math.max(0, Math.min(1, amount));
    const t = ctx.currentTime;
    const dur = 0.3 + a * 1.1;
    const f0 = 75 + a * 70;

    const sub = ctx.createOscillator();
    sub.frequency.setValueAtTime(f0, t);
    sub.frequency.exponentialRampToValueAtTime(26, t + dur);
    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.setValueAtTime(f0 * 0.5, t);
    saw.frequency.exponentialRampToValueAtTime(20, t + dur);

    // Wobble on pitch that slows down as it fades — the "warp".
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(11, t);
    lfo.frequency.exponentialRampToValueAtTime(2.5, t + dur);
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(f0 * 0.18, t);
    depth.gain.exponentialRampToValueAtTime(0.5, t + dur);
    lfo.connect(depth);
    depth.connect(sub.frequency);
    depth.connect(saw.frequency);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 9;
    filter.frequency.setValueAtTime(500 + a * 1500, t);
    filter.frequency.exponentialRampToValueAtTime(60, t + dur);

    const shaper = ctx.createWaveShaper();
    shaper.curve = this.driveCurve();
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.08 + a * 0.67, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    sub.connect(shaper);
    saw.connect(filter).connect(shaper);
    shaper.connect(g).connect(dest);
    for (const o of [sub, saw, lfo]) {
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  /**
   * Wind-up while the ball materialises: a deep, wide swell of detuned saws and sub that rises
   * an octave, with a slow wobble that speeds up, ending as the ball launches. Kept low and
   * un-resonant so it sounds big rather than nasal.
   */
  charge(dur: number): void {
    const ctx = this.ctx;
    const dest = this.out(0);
    if (!ctx || !dest || !this.noiseBuf) return;
    const t = ctx.currentTime;
    const f0 = 41.2; // E1

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(110, t);
    filter.frequency.exponentialRampToValueAtTime(950, t + dur);
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(2, t);
    lfo.frequency.exponentialRampToValueAtTime(9, t + dur);
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(20, t);
    depth.gain.linearRampToValueAtTime(260, t + dur);
    lfo.connect(depth).connect(filter.frequency);

    const shaper = ctx.createWaveShaper();
    shaper.curve = this.driveCurve();
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + dur * 0.9);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.04);
    filter.connect(shaper).connect(g).connect(dest);

    const oscs: OscillatorNode[] = [lfo];
    for (const det of [-14, -6, 0, 6, 14]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = det;
      o.frequency.setValueAtTime(f0 * 2, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 4, t + dur);
      o.connect(filter);
      oscs.push(o);
    }
    const sub = ctx.createOscillator();
    sub.frequency.setValueAtTime(f0, t);
    sub.frequency.exponentialRampToValueAtTime(f0 * 2, t + dur);
    const sg = ctx.createGain();
    sg.gain.value = 0.7;
    sub.connect(sg).connect(shaper);
    oscs.push(sub);
    for (const o of oscs) {
      o.start(t);
      o.stop(t + dur + 0.1);
    }

    // A soft rush of air rising underneath.
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    const nf = ctx.createBiquadFilter();
    nf.type = 'lowpass';
    nf.frequency.setValueAtTime(300, t);
    nf.frequency.exponentialRampToValueAtTime(2500, t + dur);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.linearRampToValueAtTime(0.16, t + dur);
    ng.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05);
    n.connect(nf).connect(ng).connect(dest);
    n.start(t);
    n.stop(t + dur + 0.1);
  }

  private driveCurve(): Float32Array<ArrayBuffer> {
    if (!this.drive) {
      const n = 1024;
      this.drive = new Float32Array(n);
      for (let i = 0; i < n; i++) this.drive[i] = Math.tanh(((i / (n - 1)) * 2 - 1) * 2.6);
    }
    return this.drive;
  }

  firework(pan: number): void {
    this.noise(0.4, 0.28, 3500, 250, pan);
    this.tone(1100, 280, 0.16, 'triangle', 0.08, pan);
  }

  /** A power-up appears: a quick shimmering sparkle. */
  powerSpawn(pan: number): void {
    [1320, 1760, 2217, 2637].forEach((f, i) => this.tone(f, f * 1.005, 0.18, 'sine', 0.07, pan, i * 0.045));
  }

  /** A power-up is collected: a bright rising arpeggio (cut short if the paddle is already maxed). */
  powerUp(pan: number, maxed: boolean): void {
    const notes = maxed ? [392, 523] : [392, 523, 659, 784, 1047];
    notes.forEach((f, i) => {
      this.tone(f, f, 0.12, 'square', 0.09, pan, i * 0.055);
      this.tone(f * 2, f * 2, 0.1, 'triangle', 0.08, pan, i * 0.055);
    });
    this.tone(110, 55, 0.35, 'sine', 0.5, pan);
  }

  click(): void {
    this.tone(660, 990, 0.06, 'square', 0.08, 0);
  }

  // ---- primitives --------------------------------------------------------

  private out(pan: number): AudioNode | null {
    if (!this.ctx || !this.master || this.volume <= 0) return null;
    if (pan === 0 || !this.ctx.createStereoPanner) return this.master;
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.master);
    return p;
  }

  private tone(f0: number, f1: number, dur: number, type: OscillatorType, gain: number, pan: number, delay = 0): void {
    const dest = this.out(pan);
    if (!dest || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain: number, fFrom: number, fTo: number, pan: number): void {
    const dest = this.out(pan);
    if (!dest || !this.ctx || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(fFrom, t);
    filter.frequency.exponentialRampToValueAtTime(fTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(dest);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}

/** Squared so the slider feels even; the default position (0.75) gives the original 0.55. */
function sfxGain(v: number): number {
  return 0.98 * v * v;
}

/** Short vibration. Works on Android; iPhones ignore it. */
export function buzz(ms: number | number[]): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
}
