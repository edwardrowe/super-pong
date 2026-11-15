/**
 * Original electronic dance loops synthesised live with Web Audio — no audio files, nothing
 * to license. Each track is just data (tempo, chords, 16-step patterns). Layers come in as
 * the game raises the intensity:
 *
 *   0.00  supersaw pad
 *   0.20  kick + offbeat hats
 *   0.40  bassline
 *   0.45  claps, and a clap build-up at the end of every 8 bars
 *   0.60  arpeggio (its filter opens further as intensity rises)
 *   0.70  chord stabs (tracks that have them)
 *   0.80  16th-note hats
 *
 * Pad, bass, arp and stabs are "sidechained" to the kick (they duck on every beat) for the pump.
 */

export interface Track {
  id: string;
  name: string;
  bpm: number;
  /** One chord (MIDI notes) per bar, looping. */
  chords: number[][];
  /** Bass root (MIDI) per bar. */
  bass: number[];
  /** 16-step patterns: 'x' = hit. */
  kick: string;
  clap: string;
  ohat: string;
  bassline: string;
  stab?: string;
  /** Index into [chord, chord + octave] for each 16th. */
  arp: number[];
}

export const TRACKS: Track[] = [
  {
    id: 'neon-drive',
    name: 'Neon Drive',
    bpm: 128,
    chords: [
      [57, 60, 64], // Am
      [53, 57, 60], // F
      [55, 60, 64], // C
      [55, 59, 62], // G
    ],
    bass: [33, 29, 36, 31],
    kick: 'x...x...x...x...',
    clap: '....x.......x...',
    ohat: '..x...x...x...x.',
    bassline: '..x...x.x.x...xx',
    arp: [0, 2, 4, 1, 3, 5, 2, 4, 0, 2, 4, 1, 3, 5, 4, 2],
  },
  {
    id: 'hyperlight',
    name: 'Hyperlight',
    bpm: 150,
    chords: [
      [61, 64, 68], // C#m
      [61, 64, 69], // A
      [59, 64, 68], // E
      [59, 63, 66], // B
    ],
    bass: [37, 33, 40, 35],
    kick: 'x...x...x...x...',
    clap: '....x.......x...',
    ohat: '..x...x...x...x.',
    bassline: '.xxx.xxx.xxx.xxx',
    stab: 'x..x..x...x.x...',
    arp: [0, 1, 2, 3, 4, 5, 3, 4, 2, 3, 4, 5, 3, 4, 5, 4],
  },
];

const LOOKAHEAD = 0.15;
const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);
const stepOf = (t: Track) => 60 / t.bpm / 4; // a 16th note

export class Music {
  private ctx: AudioContext | null = null;
  private out!: GainNode;
  private filter!: BiquadFilterNode;
  private bus!: GainNode;
  private duck!: GainNode;
  private delayIn!: GainNode;
  private delay!: DelayNode;
  private noise!: AudioBuffer;
  private step = 0;
  private nextTime = 0;
  private intensity = 0.25;
  private target = 0.25;
  private volume = 0.42;
  private track: Track;
  private pending: Track | null = null;
  /** Selected track id, or 'off'. */
  choice: string;

  constructor() {
    const saved = localStorage.getItem('track') ?? (localStorage.getItem('music') === '0' ? 'off' : TRACKS[0].id);
    this.choice = saved === 'off' || TRACKS.some((t) => t.id === saved) ? saved : TRACKS[0].id;
    this.track = TRACKS.find((t) => t.id === this.choice) ?? TRACKS[0];
  }

  get enabled(): boolean {
    return this.choice !== 'off';
  }

  get label(): string {
    return this.enabled ? `Music: ${this.track.name}` : 'Music: Off';
  }

  /** Step through the tracks, then off, then back to the first track. */
  cycle(): void {
    const ids = [...TRACKS.map((t) => t.id), 'off'];
    this.select(ids[(ids.indexOf(this.choice) + 1) % ids.length]);
  }

  select(id: string): void {
    const wasOn = this.enabled;
    this.choice = id;
    localStorage.setItem('track', id);
    const t = TRACKS.find((x) => x.id === id);
    if (t) {
      if (wasOn && this.ctx) this.pending = t; // switch on the next bar line
      else this.track = t;
    }
    if (!this.ctx) return;
    if (this.enabled && !wasOn) {
      this.step = 0;
      this.nextTime = this.ctx.currentTime + 0.05;
      this.applyTrack();
    }
    this.fadeTo(this.enabled ? this.volume : 0, 0.3);
  }

  private applyTrack(): void {
    if (this.pending) {
      this.track = this.pending;
      this.pending = null;
      this.step = 0;
    }
    if (this.delay) this.delay.delayTime.value = stepOf(this.track) * 3;
  }

  /** Connect to an audio graph once audio is unlocked. Safe to call repeatedly. */
  attach(ctx: AudioContext, dest: AudioNode): void {
    if (this.ctx) return;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 20000;
    this.filter.Q.value = 0.9;
    this.bus = ctx.createGain();
    this.duck = ctx.createGain();
    this.bus.connect(this.filter).connect(this.out).connect(dest);
    this.duck.connect(this.bus);

    // Dotted-eighth echo for the arp.
    this.delayIn = ctx.createGain();
    const delay = (this.delay = ctx.createDelay(1));
    delay.delayTime.value = stepOf(this.track) * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.delayIn.connect(delay).connect(fb).connect(delay);
    delay.connect(wet).connect(this.duck);

    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.nextTime = ctx.currentTime + 0.1;
    if (this.enabled) this.fadeTo(this.volume, 1.5);
    setInterval(() => this.schedule(), 25);
  }

  /** 0 = sparse, 1 = everything. */
  setIntensity(v: number): void {
    this.target = Math.max(0, Math.min(1, v));
  }

  /** Muffle the music (as if heard through a wall) — used while paused. */
  muffle(on: boolean): void {
    if (!this.ctx) return;
    const f = this.filter.frequency;
    f.cancelScheduledValues(this.ctx.currentTime);
    f.setTargetAtTime(on ? 450 : 20000, this.ctx.currentTime, on ? 0.08 : 0.2);
  }

  /** Big moment: slam the filter shut and sweep it open again. */
  sweep(seconds = 1.4): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = this.filter.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(300, t);
    f.exponentialRampToValueAtTime(20000, t + seconds);
  }

  private fadeTo(v: number, secs: number): void {
    const g = this.out.gain;
    const t = this.ctx!.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(v, t + secs);
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.enabled || ctx.state !== 'running') return;
    // If we fell behind (tab was suspended), skip ahead instead of firing a burst of notes.
    if (this.nextTime < ctx.currentTime - 0.05) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      if (this.pending && this.step % 16 === 0) this.applyTrack();
      this.intensity += (this.target - this.intensity) * 0.12;
      this.playStep(this.step, this.nextTime);
      this.step++;
      this.nextTime += stepOf(this.track);
    }
  }

  private playStep(step: number, t: number): void {
    const I = this.intensity;
    const T = this.track;
    const STEP = stepOf(T);
    const s = step % 16;
    const bar = Math.floor(step / 16) % T.chords.length;
    const phraseBar = Math.floor(step / 16) % 8;
    const chord = T.chords[bar];

    if (s === 0) this.pad(chord, t, STEP * 16, I);
    if (I >= 0.2) {
      if (T.kick[s] === 'x') this.kick(t, STEP);
      if (T.ohat[s] === 'x') this.hat(t, true);
      if (I >= 0.8 && T.ohat[s] !== 'x') this.hat(t, false);
    }
    if (I >= 0.4 && T.bassline[s] === 'x') this.bass(T.bass[bar], t, I, STEP);
    if (I >= 0.45) {
      if (T.clap[s] === 'x') this.clap(t, 0.32);
      else if (phraseBar === 7 && s >= 8) this.clap(t, 0.08 + (s - 8) * 0.025); // build-up roll
    }
    if (I >= 0.6) {
      const tones = [...chord, ...chord.map((n) => n + 12)];
      this.arp(tones[T.arp[s]] + 12, t, I);
    }
    if (I >= 0.7 && T.stab?.[s] === 'x') this.stab(chord, t, I);
  }

  // ---- instruments ---------------------------------------------------------

  private env(g: AudioParam, t: number, peak: number, attack: number, dur: number): void {
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(peak, t + attack);
    g.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  private kick(t: number, STEP: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(155, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.09);
    this.env(g.gain, t, 0.95, 0.002, 0.34);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.36);
    // Sidechain pump.
    this.duck.gain.setValueAtTime(0.25, t);
    this.duck.gain.linearRampToValueAtTime(1, t + STEP * 2.6);
  }

  private noiseHit(t: number, type: BiquadFilterType, freq: number, q: number, gain: number, dur: number): GainNode {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g.gain, t, gain, 0.001, dur);
    src.connect(f).connect(g).connect(this.bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
    return g;
  }

  private hat(t: number, open: boolean): void {
    this.noiseHit(t, 'highpass', 7500, 0.7, open ? 0.16 : 0.06, open ? 0.13 : 0.035);
  }

  private clap(t: number, gain: number): void {
    const g = this.noiseHit(t, 'bandpass', 1300, 0.9, gain, 0.2).gain;
    // Replace the envelope: three quick re-triggers sound like several hands.
    g.cancelScheduledValues(t);
    for (const dt of [0, 0.011, 0.022]) {
      g.setValueAtTime(gain, t + dt);
      g.exponentialRampToValueAtTime(gain * 0.25, t + dt + 0.009);
    }
    g.exponentialRampToValueAtTime(0.0001, t + 0.2);
  }

  private bass(m: number, t: number, I: number, STEP: number): void {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 5;
    f.frequency.setValueAtTime(900 + I * 1400, t);
    f.frequency.exponentialRampToValueAtTime(220, t + 0.12);
    const g = ctx.createGain();
    this.env(g.gain, t, 0.3, 0.004, STEP * 1.7);
    f.connect(g).connect(this.duck);
    for (const det of [-8, 8]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(m + 12);
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + STEP * 1.8);
    }
    const sub = ctx.createOscillator();
    const sg = ctx.createGain();
    sub.frequency.value = mtof(m);
    this.env(sg.gain, t, 0.32, 0.004, STEP * 1.7);
    sub.connect(sg).connect(this.duck);
    sub.start(t);
    sub.stop(t + STEP * 1.8);
  }

  private pad(chord: number[], t: number, dur: number, I: number): void {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 700 + I * 2600;
    f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.055, t + 0.06);
    g.gain.setValueAtTime(0.055, t + dur - 0.08);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    f.connect(g).connect(this.duck);
    for (const n of chord) {
      for (const det of [-14, 0, 14]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(n);
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 0.02);
      }
    }
  }

  /** Short, bright supersaw chord hit. */
  private stab(chord: number[], t: number, I: number): void {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(2500 + I * 4000, t);
    f.frequency.exponentialRampToValueAtTime(700, t + 0.16);
    const g = ctx.createGain();
    this.env(g.gain, t, 0.07, 0.003, 0.2);
    f.connect(g);
    g.connect(this.duck);
    g.connect(this.delayIn);
    for (const n of chord) {
      for (const det of [-18, 0, 18]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(n + 12);
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + 0.22);
      }
    }
  }

  private arp(m: number, t: number, I: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = mtof(m);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 3;
    const top = 1200 + (I - 0.6) * 12000;
    f.frequency.setValueAtTime(top, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(300, top * 0.25), t + 0.11);
    const g = ctx.createGain();
    this.env(g.gain, t, 0.075, 0.003, 0.14);
    o.connect(f).connect(g);
    g.connect(this.duck);
    g.connect(this.delayIn);
    o.start(t);
    o.stop(t + 0.16);
  }
}
