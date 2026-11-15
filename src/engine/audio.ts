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
  muted = localStorage.getItem('muted') === '1';

  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
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

  setMuted(m: boolean): void {
    this.muted = m;
    localStorage.setItem('muted', m ? '1' : '0');
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
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

  serve(): void {
    this.tone(180, 760, 0.22, 'triangle', 0.16, 0);
  }

  win(): void {
    [523, 659, 784, 1047, 1319].forEach((f, i) => {
      this.tone(f, f, 0.22, 'square', 0.07, 0, i * 0.09);
      this.tone(f, f * 0.99, 0.3, 'triangle', 0.18, 0, i * 0.09);
    });
  }

  firework(pan: number): void {
    this.noise(0.4, 0.28, 3500, 250, pan);
    this.tone(1100, 280, 0.16, 'triangle', 0.08, pan);
  }

  click(): void {
    this.tone(660, 990, 0.06, 'square', 0.08, 0);
  }

  // ---- primitives --------------------------------------------------------

  private out(pan: number): AudioNode | null {
    if (!this.ctx || !this.master || this.muted) return null;
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

/** Short vibration. Works on Android; iPhones ignore it. */
export function buzz(ms: number | number[]): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
}
