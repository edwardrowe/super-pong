/**
 * Original electronic dance loops synthesised live with Web Audio — no audio files, nothing
 * to license. Each track is just data (tempo, chords, 16-step patterns). Layers come in as
 * the game raises the intensity:
 *
 *   0.00  supersaw pad
 *   0.20  kick + offbeat hats
 *   0.40  bassline
 *   0.45  claps/snare, a build-up roll at the end of every 8 bars, and the lead melody
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
  /** 'x' = root, 'o' = root an octave up. */
  bassline: string;
  stab?: string;
  /** Index into [chord, chord + octave] for each 16th. */
  arp: number[];
  /** Melody, one bar per entry, built with melody(). Loops independently of the chords. */
  lead?: LeadStep[][];
  /**
   * 16-bit console flavour: pulse-wave lead with delayed vibrato, slap bass, snare instead of
   * clap, heavier echo and softened highs (like the SNES's sample interpolation).
   */
  retro?: boolean;
  /** Orchestra hit at the start of every 8-bar phrase. */
  orch?: boolean;
  /** Pad volume multiplier (default 1). */
  pad?: number;
}

/** A MIDI note to start, HOLD to keep the previous note going, or REST for silence. */
type LeadStep = number;
const HOLD = 0;
const REST = -1;
const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Parse bars written like 'E5 - - B4 . F#5 ...': 16 tokens each; '-' holds, '.' rests. */
function melody(bars: string[]): LeadStep[][] {
  return bars.map((bar) => {
    const steps = bar.trim().split(/\s+/).map((tok): LeadStep => {
      if (tok === '-') return HOLD;
      if (tok === '.') return REST;
      const m = /^([A-G])([#b]?)(\d)$/.exec(tok);
      if (!m) throw new Error(`Bad note ${tok}`);
      return 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    });
    if (steps.length !== 16) throw new Error(`Melody bar needs 16 steps, got ${steps.length}: ${bar}`);
    return steps;
  });
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
  {
    // 16-bit racing-game drive: octave-jumping bass, fast arps, a pulse lead out front.
    id: 'turbo-lane',
    name: 'Turbo Lane',
    bpm: 156,
    retro: true,
    pad: 0.6,
    chords: [
      [64, 67, 71], // Em
      [64, 67, 72], // C
      [62, 66, 69], // D
      [63, 66, 71], // B
    ],
    bass: [40, 36, 38, 35],
    kick: 'x...x...x...x.x.',
    clap: '....x.......x...',
    ohat: '..x...x...x...x.',
    bassline: 'x.o.x.o.x.o.xxo.',
    arp: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 4, 3, 2, 1],
    lead: melody([
      'E5 - - B4 - - E5 - G5 - - F#5 - E5 - D5',
      'E5 - - - - - . . C5 D5 E5 - G5 - E5 -',
      'F#5 - - D5 - - F#5 - A5 - - G5 - F#5 - D5',
      'D#5 - - - B4 - - - F#5 - - - D#5 - B4 -',
      'E5 - - B4 - - E5 - G5 - - A5 - B5 - -',
      'C6 - - B5 - - G5 - E5 - - G5 - C6 - -',
      'D6 - - C6 - - A5 - F#5 - - A5 - D6 - C6',
      'B5 - - - - - - - F#5 - D#5 - B4 - F#5 -',
    ]),
  },
  {
    // 16-bit eurodance: bouncing octave bass, piano-style stabs, orchestra hits.
    id: 'pixel-rave',
    name: 'Pixel Rave',
    bpm: 140,
    retro: true,
    orch: true,
    pad: 0.7,
    chords: [
      [53, 56, 60], // Fm
      [53, 56, 61], // Db
      [51, 55, 58], // Eb
      [52, 55, 60], // C
    ],
    bass: [41, 37, 39, 36],
    kick: 'x...x...x...x...',
    clap: '....x.......x...',
    ohat: '..x...x...x...x.',
    bassline: '..x.o.x...x.o.x.',
    stab: 'x..x..x...x..x..',
    arp: [0, 2, 1, 3, 2, 4, 3, 5, 0, 2, 1, 3, 2, 4, 3, 5],
    lead: melody([
      'C5 - Ab4 - C5 - F5 - - - Eb5 - C5 - Ab4 -',
      'Db5 - - - F5 - - - Ab5 - - G5 - F5 - -',
      'Eb5 - G4 - Bb4 - Eb5 - - - G5 - F5 - Eb5 -',
      'E5 - - - G5 - - - C6 - - - Bb5 - G5 -',
      'F5 - - Eb5 - - C5 - Ab5 - - G5 - F5 - Eb5',
      'F5 - - - - - Db5 - Ab5 - - - F5 - Db5 -',
      'G5 - - F5 - - Eb5 - Bb5 - - Ab5 - G5 - Eb5',
      'G5 - - - - - - - E5 - G5 - C6 - - -',
    ]),
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
  private feedback!: GainNode;
  private tone!: BiquadFilterNode;
  private tempo = 1;
  private tempoTarget = 1;
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
    if (!this.ctx) return;
    this.delay.delayTime.value = this.stepLen() * 3;
    this.feedback.gain.value = this.track.retro ? 0.46 : 0.38;
    this.tone.frequency.value = this.track.retro ? 9000 : 20000;
  }

  /** Length of a 16th note right now, including any tempo push. */
  private stepLen(): number {
    return stepOf(this.track) / this.tempo;
  }

  /** Speed the music up (1 = normal). Eases in over a couple of seconds. */
  setTempo(mult: number): void {
    this.tempoTarget = mult;
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
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 20000;
    this.bus.connect(this.tone).connect(this.filter).connect(this.out).connect(dest);
    this.duck.connect(this.bus);

    // Dotted-eighth echo for the arp.
    this.delayIn = ctx.createGain();
    const delay = (this.delay = ctx.createDelay(1));
    delay.delayTime.value = stepOf(this.track) * 3;
    const fb = (this.feedback = ctx.createGain());
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
    this.applyTrack();
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
      if (Math.abs(this.tempoTarget - this.tempo) > 0.0005) {
        this.tempo += (this.tempoTarget - this.tempo) * 0.04;
        this.delay.delayTime.setTargetAtTime(this.stepLen() * 3, this.nextTime, 0.05);
      }
      this.playStep(this.step, this.nextTime);
      this.step++;
      this.nextTime += this.stepLen();
    }
  }

  private playStep(step: number, t: number): void {
    const I = this.intensity;
    const T = this.track;
    const STEP = this.stepLen();
    const s = step % 16;
    const bar = Math.floor(step / 16) % T.chords.length;
    const phraseBar = Math.floor(step / 16) % 8;
    const chord = T.chords[bar];

    if (s === 0) this.pad(chord, t, STEP * 16, I, T.pad ?? 1);
    if (T.orch && I >= 0.45 && s === 0 && phraseBar === 0) this.orch(chord, t);
    if (I >= 0.2) {
      if (T.kick[s] === 'x') this.kick(t, STEP);
      if (T.ohat[s] === 'x') this.hat(t, true);
      if (I >= 0.8 && T.ohat[s] !== 'x') this.hat(t, false);
    }
    const b = T.bassline[s];
    if (I >= 0.4 && (b === 'x' || b === 'o')) this.bass(T.bass[bar] + (b === 'o' ? 12 : 0), t, I, STEP, !!T.retro);
    if (I >= 0.45) {
      const hit = T.retro ? (g: number) => this.snare(t, g) : (g: number) => this.clap(t, g);
      if (T.clap[s] === 'x') hit(0.32);
      else if (phraseBar === 7 && s >= 8) hit(0.08 + (s - 8) * 0.025); // build-up roll
      if (T.lead) this.leadStep(T.lead, step, t, STEP);
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

  private bass(m: number, t: number, I: number, STEP: number, retro: boolean): void {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = retro ? 7 : 5;
    // Retro "slap": a much faster, brighter filter snap.
    f.frequency.setValueAtTime(retro ? 3200 : 900 + I * 1400, t);
    f.frequency.exponentialRampToValueAtTime(retro ? 380 : 220, t + (retro ? 0.07 : 0.12));
    const g = ctx.createGain();
    this.env(g.gain, t, 0.3, 0.004, STEP * 1.7);
    f.connect(g).connect(this.duck);
    for (const det of [-8, 8]) {
      const o = ctx.createOscillator();
      o.type = retro && det > 0 ? 'square' : 'sawtooth';
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

  private pad(chord: number[], t: number, dur: number, I: number, level = 1): void {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 700 + I * 2600;
    f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.055 * level, t + 0.06);
    g.gain.setValueAtTime(0.055 * level, t + dur - 0.08);
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

  /** Punchy 16-bit snare: a noise crack over a dropping body tone. */
  private snare(t: number, gain: number): void {
    this.noiseHit(t, 'bandpass', 2300, 0.6, gain * 1.1, 0.15);
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.08);
    const g = ctx.createGain();
    this.env(g.gain, t, gain * 1.2, 0.002, 0.1);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.12);
  }

  /** Play the melody note (if any) that starts on this step, held until the next note or rest. */
  private leadStep(lead: LeadStep[][], step: number, t: number, STEP: number): void {
    const bar = lead[Math.floor(step / 16) % lead.length];
    const s = step % 16;
    const note = bar[s];
    if (note <= 0) return;
    let len = 1;
    while (s + len < 16 && bar[s + len] === HOLD) len++;
    this.lead(note, t, len * STEP);
  }

  /** Pulse-wave lead with delayed vibrato, into the echo — the 16-bit melody voice. */
  private lead(m: number, t: number, dur: number): void {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 3800;
    f.Q.value = 0.7;
    const g = ctx.createGain();
    const end = t + Math.max(0.06, dur - 0.02);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.085, t + 0.008);
    g.gain.setValueAtTime(0.07, Math.max(t + 0.01, end - 0.04));
    g.gain.exponentialRampToValueAtTime(0.0001, end + 0.06);
    f.connect(g);
    g.connect(this.duck);
    g.connect(this.delayIn);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.8;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.setValueAtTime(0, t + 0.12);
    depth.gain.linearRampToValueAtTime(22, t + 0.3);
    lfo.connect(depth);
    const oscs = [lfo];
    for (const [type, det] of [['square', 0], ['sawtooth', 7]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = mtof(m);
      o.detune.value = det;
      depth.connect(o.detune);
      o.connect(f);
      oscs.push(o);
    }
    for (const o of oscs) {
      o.start(t);
      o.stop(end + 0.08);
    }
  }

  /** Brassy orchestra hit across three octaves — pure early-90s. */
  private orch(chord: number[], t: number): void {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(5000, t);
    f.frequency.exponentialRampToValueAtTime(700, t + 0.3);
    const g = ctx.createGain();
    this.env(g.gain, t, 0.13, 0.004, 0.5);
    f.connect(g).connect(this.bus);
    for (const oct of [-12, 0, 12]) {
      for (const n of chord) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(n + oct);
        o.detune.value = (Math.random() - 0.5) * 20;
        o.connect(f);
        o.start(t);
        o.stop(t + 0.55);
      }
    }
    this.noiseHit(t, 'lowpass', 3000, 0.7, 0.25, 0.25);
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
