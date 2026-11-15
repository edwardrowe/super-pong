/**
 * Original 16-bit-style dance tracks synthesised live with Web Audio — no audio files, nothing
 * to license. Each track is data: tempo, an 8-bar chord loop, 16-step drum and bass patterns,
 * and melodies.
 *
 * The arrangement builds in levels that the game sets (Super Pong: one level per point the
 * leading player has). Each layer joins at a level; a change lands on the next bar line, and a
 * rise is marked with a cymbal crash. The tempo never changes.
 *
 * Pad, bass, leads, arp and stabs are "sidechained" to the kick (they duck on every beat).
 */

export type Layer =
  | 'pad'
  | 'arp'
  | 'kick'
  | 'hat'
  | 'bass'
  | 'snare'
  | 'lead'
  | 'stab'
  | 'hat16'
  | 'counter'
  | 'perc'
  | 'orch'
  | 'double';

/**
 * The level each layer joins at, unless a track overrides it.
 * 0 = menu, 1 = kick-off, 2–6 = each point the leader gains, 7 = match point, 8 = win screen.
 */
export const DEFAULT_ENTER: Record<Layer, number> = {
  pad: 0, //     strings / supersaw chords
  arp: 0, //     arpeggio, filter opens as the level rises
  kick: 1,
  hat: 1, //     offbeat open hats
  bass: 1,
  snare: 2, //   backbeat, plus a roll into every 8-bar phrase
  lead: 3, //    the melody
  stab: 4, //    chord stabs (brass or piano)
  hat16: 4, //   16th-note closed hats
  counter: 5, // second melody under the lead
  perc: 6, //    claps on the backbeat, tambourine, tom fills; orchestra hits (tracks that have them)
  orch: 6,
  double: 7, //  lead and arp doubled an octave up, crash every 4 bars, brighter bass
};
export const MAX_LEVEL = 8;

/** Melodic voices. pulse/thin/square are the chip-style waves; brass and strings are "samples". */
export type Voice = 'pulse' | 'thin' | 'square' | 'brass' | 'strings';

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
  snare: string;
  hat: string;
  /** 'x' = root, 'o' = root an octave up. */
  bassline: string;
  /** Chord stab rhythm. */
  stab: string;
  stabVoice: 'brass' | 'piano';
  /** Index into [chord, chord + octave] for each 16th. */
  arp: number[];
  /** Melodies, one bar per entry, built with melody(). Loop independently of the chords. */
  lead: number[][];
  leadVoice: Voice;
  counter: number[][];
  counterVoice: Voice;
  /** Orchestra hits every 4 bars once 'orch' is in. */
  orch?: boolean;
  /** Pad volume multiplier (default 1). */
  pad?: number;
  enter?: Partial<Record<Layer, number>>;
}

/** A melody step: a MIDI note to start, HOLD to keep the previous note going, or REST. */
const HOLD = 0;
const REST = -1;
const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function parseNote(tok: string): number {
  if (tok === '-') return HOLD;
  if (tok === '.') return REST;
  const m = /^([A-G])([#b]?)(\d)$/.exec(tok);
  if (!m) throw new Error(`Bad note ${tok}`);
  return 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

/**
 * Parse bars like 'E5 - - B4 . F#5 …'. A bar has 16, 8, 4, 2 or 1 tokens (16ths, 8ths, quarters,
 * halves, whole notes). '-' holds the previous note, '.' is a rest.
 */
export function melody(bars: string[]): number[][] {
  return bars.map((bar) => {
    const toks = bar.trim().split(/\s+/);
    if (16 % toks.length !== 0) throw new Error(`Melody bar needs 1/2/4/8/16 tokens, got ${toks.length}: ${bar}`);
    const span = 16 / toks.length;
    const steps: number[] = [];
    for (const tok of toks) {
      const v = parseNote(tok);
      steps.push(v);
      for (let i = 1; i < span; i++) steps.push(v === REST ? REST : HOLD);
    }
    return steps;
  });
}

export const TRACKS: Track[] = [
  {
    // Racing anthem: driving octave bass, brass lead, a pulse counter-line.
    id: 'overdrive',
    name: 'Overdrive',
    bpm: 150,
    chords: [
      [57, 60, 64], // Am
      [57, 60, 65], // F
      [55, 59, 62], // G
      [55, 59, 64], // Em
      [57, 60, 64], // Am
      [57, 60, 65], // F
      [55, 59, 62], // G
      [56, 59, 64], // E
    ],
    bass: [33, 29, 31, 28, 33, 29, 31, 28],
    kick: 'x...x...x...x.x.',
    snare: '....x.......x...',
    hat: '..x...x...x...x.',
    bassline: 'x.o.x.o.x.o.x.oo',
    stab: 'x..x..x...x.x...',
    stabVoice: 'brass',
    arp: [0, 1, 2, 3, 4, 5, 4, 3, 0, 1, 2, 3, 4, 5, 4, 3],
    lead: melody([
      'A4 - C5 - E5 - A5 - - - G5 - E5 - D5 -',
      'C5 - - - A4 - C5 - F5 - - - E5 - C5 -',
      'D5 - - B4 - - D5 - G5 - - F5 - E5 - D5',
      'E5 - - - - - - - B4 - D5 - E5 - G5 -',
      'A5 - - G5 - - E5 - A5 - - G5 - E5 - C5',
      'F5 - - E5 - - C5 - F5 - - A5 - C6 - -',
      'B5 - - A5 - - G5 - D5 - - G5 - B5 - D6',
      'E6 - - - D6 - - - B5 - G#5 - E5 - - -',
    ]),
    leadVoice: 'brass',
    counter: melody(['C5 B4', 'A4 C5', 'B4 D5', 'G4 B4', 'E5 C5', 'C5 A4', 'D5 B4', 'G#4 B4']),
    counterVoice: 'thin',
    pad: 0.7,
  },
  {
    // Eurodance: offbeat bass, house-piano stabs, orchestra hits, a pulse hook.
    id: 'crystal-rave',
    name: 'Crystal Rave',
    bpm: 140,
    chords: [
      [53, 56, 60], // Fm
      [53, 56, 61], // Db
      [51, 56, 60], // Ab
      [51, 55, 58], // Eb
      [53, 56, 60], // Fm
      [53, 56, 61], // Db
      [51, 55, 58], // Eb
      [52, 55, 60], // C
    ],
    bass: [41, 37, 32, 39, 41, 37, 39, 36],
    kick: 'x...x...x...x...',
    snare: '....x.......x...',
    hat: '..x...x...x...x.',
    bassline: '..x...o...x...o.',
    stab: 'x..x..x...x..x..',
    stabVoice: 'piano',
    arp: [0, 2, 1, 3, 2, 4, 3, 5, 0, 2, 1, 3, 2, 4, 3, 5],
    lead: melody([
      'F5 - - F5 - - Eb5 - F5 - - Ab5 - - G5 -',
      'F5 - - - Eb5 - Db5 - Db5 - - - C5 - Ab4 -',
      'C5 - - C5 - - Bb4 - C5 - - Eb5 - - Db5 -',
      'Bb4 - - - - - G4 - Bb4 - Eb5 - G5 - - -',
      'F5 - - F5 - - Eb5 - F5 - - Ab5 - - C6 -',
      'Bb5 - - - Ab5 - F5 - Ab5 - - - F5 - Db5 -',
      'G5 - - G5 - - F5 - Eb5 - - G5 - - Bb5 -',
      'C6 - - - - - - - G5 - E5 - C5 - E5 -',
    ]),
    leadVoice: 'pulse',
    counter: melody(['Ab4 C5', 'Ab4 F4', 'Eb4 Ab4', 'G4 Bb4', 'C5 Ab4', 'Db5 Ab4', 'Bb4 G4', 'G4 E4']),
    counterVoice: 'strings',
    orch: true,
  },
  {
    // Bright, major-key and fast: a square-wave lead over piano stabs and strings.
    id: 'sunset-circuit',
    name: 'Sunset Circuit',
    bpm: 160,
    chords: [
      [62, 66, 69], // D
      [61, 64, 69], // A
      [62, 66, 71], // Bm
      [62, 67, 71], // G
      [62, 66, 69], // D
      [61, 64, 69], // A
      [62, 67, 71], // G
      [61, 64, 69], // A
    ],
    bass: [38, 33, 35, 31, 38, 33, 31, 33],
    kick: 'x...x...x...x...',
    snare: '....x.......x..x',
    hat: '..x...x...x...x.',
    bassline: 'x.ox.ox.x.ox.ox.',
    stab: '..x..x....x..x..',
    stabVoice: 'piano',
    arp: [0, 1, 2, 1, 3, 2, 4, 3, 5, 4, 3, 2, 4, 3, 2, 1],
    lead: melody([
      'F#5 - A5 - D6 - - - C#6 - B5 - A5 - F#5 -',
      'E5 - - - - - C#5 - E5 - A5 - - - G5 -',
      'F#5 - - D5 - - F#5 - B5 - - A5 - F#5 - D5',
      'G5 - - - - - - - A5 - B5 - A5 - G5 -',
      'F#5 - A5 - D6 - - - E6 - D6 - C#6 - A5 -',
      'C#6 - - - - - A5 - E6 - - - C#6 - A5 -',
      'B5 - - - A5 - - - G5 - - - F#5 - G5 -',
      'A5 - - - - - - - . . A4 B4 C#5 - E5 -',
    ]),
    leadVoice: 'square',
    counter: melody(['A4 D5', 'C#5 A4', 'D5 B4', 'B4 D5', 'A4 F#4', 'E4 A4', 'D5 B4', 'C#5 E5']),
    counterVoice: 'strings',
    pad: 0.8,
  },
  {
    // Darker and slower: arpeggio-led night drive, pulse lead with long notes.
    id: 'midnight-grid',
    name: 'Midnight Grid',
    bpm: 132,
    chords: [
      [55, 60, 63], // Cm
      [56, 60, 63], // Ab
      [55, 58, 63], // Eb
      [53, 58, 62], // Bb
      [55, 60, 63], // Cm
      [56, 60, 63], // Ab
      [53, 58, 62], // Bb
      [55, 59, 62], // G
    ],
    bass: [36, 32, 39, 34, 36, 32, 34, 31],
    kick: 'x...x...x...x...',
    snare: '....x.......x...',
    hat: '..x...x...x...x.',
    bassline: 'x..xo..xx..xo.xo',
    stab: 'x.....x.....x...',
    stabVoice: 'brass',
    arp: [0, 1, 2, 4, 3, 2, 1, 2, 0, 1, 2, 4, 5, 4, 3, 2],
    lead: melody([
      'G5 - - - Eb5 - - - C5 - D5 - Eb5 - - -',
      'C5 - - - - - - - Ab4 - - - C5 - Eb5 -',
      'Bb5 - - - G5 - - - Eb5 - F5 - G5 - - -',
      'F5 - - - - - - - D5 - - - F5 - Bb4 -',
      'G5 - - - Eb5 - - - C6 - Bb5 - G5 - - -',
      'Ab5 - - - - - Eb5 - C5 - Eb5 - Ab5 - - -',
      'F5 - - - D5 - - - Bb4 - D5 - F5 - Ab5 -',
      'G5 - - - - - - - B4 - D5 - F5 - - -',
    ]),
    leadVoice: 'pulse',
    counter: melody(['Eb4 G4', 'Eb4 C4', 'G4 Bb4', 'F4 D4', 'C5 G4', 'C5 Ab4', 'D5 Bb4', 'B4 D5']),
    counterVoice: 'strings',
    // Let the arp carry the intro on its own a little longer.
    enter: { kick: 1, bass: 2, snare: 2 },
  },
];

const LOOKAHEAD = 0.15;
/** Output gain at full volume. The default slider position (0.75) gives about 0.42. */
const FULL_GAIN = 0.75;
const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);
const stepOf = (t: Track) => 60 / t.bpm / 4; // a 16th note

export function readVolume(key: string, fallback: number): number {
  const n = Number(localStorage.getItem(key) ?? NaN);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

export class Music {
  private ctx: AudioContext | null = null;
  private out!: GainNode;
  private filter!: BiquadFilterNode;
  private bus!: GainNode;
  private duck!: GainNode;
  private echoIn!: GainNode;
  private echoL!: DelayNode;
  private echoR!: DelayNode;
  private verbIn!: GainNode;
  private noise!: AudioBuffer;
  private waves!: Record<'pulse' | 'thin' | 'square' | 'piano', PeriodicWave>;
  private step = 0;
  private nextTime = 0;
  private level = 0;
  private levelTarget = 0;
  private crashNext = false;
  private track: Track;
  private pending: Track | null = null;
  /** 0..1 (slider position). 0 stops the music altogether. */
  volume: number;

  /** Pick a random track at the start of every match (the default). */
  shuffle: boolean;

  constructor() {
    const old = localStorage.getItem('track');
    const saved = localStorage.getItem('musicTrack') ?? 'shuffle';
    const picked = TRACKS.find((t) => t.id === saved);
    this.shuffle = !picked;
    this.track = picked ?? TRACKS[Math.floor(Math.random() * TRACKS.length)];
    // Older versions had a music on/off switch instead of a volume.
    const wasOff = old === 'off' || localStorage.getItem('music') === '0';
    this.volume = readVolume('musicVol', wasOff ? 0 : 0.75);
  }

  get trackId(): string {
    return (this.pending ?? this.track).id;
  }

  /** 'shuffle' or the chosen track's id. */
  get choice(): string {
    return this.shuffle ? 'shuffle' : this.trackId;
  }

  /** Choose a track by id, or 'shuffle'. */
  select(id: string): void {
    if (id === 'shuffle') {
      this.shuffle = true;
      localStorage.setItem('musicTrack', id);
      return;
    }
    const t = TRACKS.find((x) => x.id === id);
    if (!t) return;
    this.shuffle = false;
    localStorage.setItem('musicTrack', id);
    this.switchTo(t);
  }

  /** A match is starting: on shuffle, change to a different random track. */
  newMatch(): void {
    if (!this.shuffle || TRACKS.length < 2) return;
    const others = TRACKS.filter((t) => t.id !== this.trackId);
    this.switchTo(others[Math.floor(Math.random() * others.length)]);
  }

  private switchTo(t: Track): void {
    if (this.ctx && this.volume > 0) this.pending = t; // switch on the next bar line
    else {
      this.track = t;
      this.pending = null;
      this.applyTrack();
    }
  }

  setVolume(v: number): void {
    const wasOn = this.volume > 0;
    this.volume = Math.max(0, Math.min(1, v));
    localStorage.setItem('musicVol', String(this.volume));
    if (!this.ctx) return;
    if (this.volume > 0 && !wasOn) {
      if (this.pending) this.applyTrack();
      this.step = 0;
      this.nextTime = this.ctx.currentTime + 0.05;
      this.level = this.levelTarget;
    }
    this.fadeTo(FULL_GAIN * this.volume * this.volume, 0.08);
  }

  /** How built-up the arrangement is: 0 (menu) .. MAX_LEVEL (win screen). */
  setLevel(n: number): void {
    this.levelTarget = Math.max(0, Math.min(MAX_LEVEL, Math.round(n)));
  }

  private applyTrack(): void {
    if (this.pending) {
      this.track = this.pending;
      this.pending = null;
      this.step = 0;
    }
    if (!this.ctx) return;
    const d = stepOf(this.track) * 3; // dotted eighth
    this.echoL.delayTime.value = d;
    this.echoR.delayTime.value = d;
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
    // Softened highs, like the SNES's sample interpolation.
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 10000;
    this.bus = ctx.createGain();
    this.duck = ctx.createGain();
    this.bus.connect(tone).connect(this.filter).connect(this.out).connect(dest);
    this.duck.connect(this.bus);

    // Ping-pong echo: left and right taps a dotted eighth apart.
    this.echoIn = ctx.createGain();
    this.echoIn.gain.value = 0.32;
    this.echoL = ctx.createDelay(1);
    this.echoR = ctx.createDelay(1);
    const fbL = ctx.createGain();
    const fbR = ctx.createGain();
    fbL.gain.value = fbR.gain.value = 0.42;
    const panL = this.panner(-0.7);
    const panR = this.panner(0.7);
    const echoTone = ctx.createBiquadFilter();
    echoTone.type = 'lowpass';
    echoTone.frequency.value = 4500;
    this.echoIn.connect(echoTone).connect(this.echoL);
    this.echoL.connect(fbL).connect(this.echoR);
    this.echoR.connect(fbR).connect(this.echoL);
    this.echoL.connect(panL).connect(this.duck);
    this.echoR.connect(panR).connect(this.duck);

    // Dark hall reverb from a generated impulse response.
    this.verbIn = ctx.createGain();
    this.verbIn.gain.value = 0.28;
    const verb = ctx.createConvolver();
    verb.buffer = impulse(ctx, 2.2);
    this.verbIn.connect(verb).connect(this.bus);

    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.waves = {
      pulse: pulseWave(ctx, 0.25),
      thin: pulseWave(ctx, 0.125),
      square: pulseWave(ctx, 0.5),
      piano: ctx.createPeriodicWave(
        new Float32Array(9),
        new Float32Array([0, 1, 0.55, 0.32, 0.24, 0.12, 0.09, 0.05, 0.03]),
      ),
    };

    this.nextTime = ctx.currentTime + 0.1;
    this.level = this.levelTarget;
    this.applyTrack();
    this.fadeTo(FULL_GAIN * this.volume * this.volume, 1.5);
    setInterval(() => this.schedule(), 25);
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
    if (!ctx || this.volume <= 0 || ctx.state !== 'running') return;
    // If we fell behind (tab was suspended), skip ahead instead of firing a burst of notes.
    if (this.nextTime < ctx.currentTime - 0.05) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      if (this.step % 16 === 0) {
        if (this.pending) this.applyTrack();
        if (this.levelTarget !== this.level) {
          this.crashNext = this.levelTarget > this.level;
          this.level = this.levelTarget;
        }
      }
      this.playStep(this.step, this.nextTime);
      this.step++;
      this.nextTime += stepOf(this.track);
    }
  }

  private has(layer: Layer): boolean {
    return this.level >= (this.track.enter?.[layer] ?? DEFAULT_ENTER[layer]);
  }

  private playStep(step: number, t: number): void {
    const T = this.track;
    const STEP = stepOf(T);
    const I = this.level / MAX_LEVEL;
    const s = step % 16;
    const barN = Math.floor(step / 16);
    const bar = barN % T.chords.length;
    const phraseBar = barN % 8;
    const chord = T.chords[bar];
    const peak = this.has('double');

    if (s === 0) {
      if (this.has('pad')) this.pad(chord, t, STEP * 16, I, T.pad ?? 1);
      if (T.orch && this.has('orch') && phraseBar % 4 === 0) this.orch(chord, t);
      if (this.crashNext || (peak && phraseBar % 4 === 0)) this.crash(t);
      this.crashNext = false;
    }
    if (this.has('kick') && T.kick[s] === 'x') this.kick(t, STEP);
    if (this.has('hat') && T.hat[s] === 'x') this.hat(t, true, 0);
    else if (this.has('hat16')) this.hat(t, false, s % 2 ? 0.25 : -0.25);

    const b = T.bassline[s];
    if (this.has('bass') && (b === 'x' || b === 'o')) this.bass(T.bass[bar] + (b === 'o' ? 12 : 0), t, STEP, peak);

    if (this.has('snare')) {
      if (T.snare[s] === 'x') {
        this.snare(t, 0.32);
        if (this.has('perc')) this.clap(t, 0.22);
      } else if (phraseBar === 7 && s >= 8) this.snare(t, 0.08 + (s - 8) * 0.025); // roll into the phrase
    }
    if (this.has('perc')) {
      if (phraseBar === 3 && s >= 12) this.tom(t, [196, 165, 139, 110][s - 12]);
      else if (s % 2) this.noiseHit(t, 'bandpass', 6500, 1.2, s % 4 === 3 ? 0.09 : 0.05, 0.06, 0.45); // tambourine
    }

    if (this.has('lead')) {
      this.melodyStep(T.lead, T.leadVoice, step, t, STEP, 0.09, 0);
      if (peak) this.melodyStep(T.lead, T.leadVoice, step, t, STEP, 0.06, 0.25, 12);
    }
    if (this.has('counter')) this.melodyStep(T.counter, T.counterVoice, step, t, STEP, 0.08, -0.3);
    if (this.has('arp')) {
      const tones = [...chord, ...chord.map((n) => n + 12)];
      this.arp(tones[T.arp[s]] + 12, t, I, s % 2 ? 0.35 : -0.35);
      // Match point: a sparkle an octave up, mirrored in the stereo field.
      if (peak) this.arp(tones[T.arp[(s + 2) % 16]] + 24, t, I, s % 2 ? -0.5 : 0.5, 0.035);
    }
    if (this.has('stab') && T.stab[s] === 'x') {
      if (T.stabVoice === 'piano') this.piano(chord, t);
      else this.brassStab(chord, t, I);
    }
  }

  // ---- routing ---------------------------------------------------------------

  private panner(pan: number): AudioNode {
    const ctx = this.ctx!;
    if (!ctx.createStereoPanner) return ctx.createGain();
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    return p;
  }

  /** Send a voice to the ducked mix, and optionally the echo and the reverb. */
  private route(node: AudioNode, echo: boolean, verb: boolean, ducked = true): void {
    node.connect(ducked ? this.duck : this.bus);
    if (echo) node.connect(this.echoIn);
    if (verb) node.connect(this.verbIn);
  }

  private env(g: AudioParam, t: number, peak: number, attack: number, dur: number): void {
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(peak, t + attack);
    g.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  // ---- drums -------------------------------------------------------------------

  private kick(t: number, STEP: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.09);
    this.env(g.gain, t, 0.95, 0.002, 0.34);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.36);
    this.noiseHit(t, 'highpass', 2500, 0.7, 0.12, 0.012); // beater click
    // Sidechain pump.
    this.duck.gain.setValueAtTime(0.25, t);
    this.duck.gain.linearRampToValueAtTime(1, t + STEP * 2.6);
  }

  private noiseHit(
    t: number,
    type: BiquadFilterType,
    freq: number,
    q: number,
    gain: number,
    dur: number,
    pan = 0,
    verb = false,
  ): GainNode {
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
    src.connect(f).connect(g);
    const out: AudioNode = pan ? g.connect(this.panner(pan)) : g;
    out.connect(this.bus);
    if (verb) out.connect(this.verbIn);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
    return g;
  }

  private hat(t: number, open: boolean, pan: number): void {
    this.noiseHit(t, 'highpass', 7500, 0.7, open ? 0.15 : 0.055, open ? 0.13 : 0.035, pan);
  }

  /** Punchy 16-bit snare: a noise crack over a dropping body tone. */
  private snare(t: number, gain: number): void {
    this.noiseHit(t, 'bandpass', 2300, 0.6, gain * 1.1, 0.15, 0, true);
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(210, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.08);
    const g = ctx.createGain();
    this.env(g.gain, t, gain * 1.2, 0.002, 0.1);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.12);
  }

  private clap(t: number, gain: number): void {
    const g = this.noiseHit(t, 'bandpass', 1300, 0.9, gain, 0.2, 0, true).gain;
    // Replace the envelope: three quick re-triggers sound like several hands.
    g.cancelScheduledValues(t);
    for (const dt of [0, 0.011, 0.022]) {
      g.setValueAtTime(gain, t + dt);
      g.exponentialRampToValueAtTime(gain * 0.25, t + dt + 0.009);
    }
    g.exponentialRampToValueAtTime(0.0001, t + 0.2);
  }

  private crash(t: number): void {
    this.noiseHit(t, 'highpass', 5000, 0.5, 0.14, 1.6, 0, true);
    this.noiseHit(t, 'bandpass', 9000, 1.5, 0.06, 0.9, 0.3);
  }

  private tom(t: number, f0: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.6, t + 0.2);
    const g = ctx.createGain();
    this.env(g.gain, t, 0.4, 0.002, 0.24);
    const p = this.panner((f0 - 150) / 150);
    o.connect(g).connect(p);
    this.route(p, false, true, false);
    o.start(t);
    o.stop(t + 0.26);
  }

  // ---- pitched -------------------------------------------------------------

  private bass(m: number, t: number, STEP: number, bright: boolean): void {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 7;
    // "Slap": a fast, bright filter snap.
    f.frequency.setValueAtTime(bright ? 4500 : 3000, t);
    f.frequency.exponentialRampToValueAtTime(380, t + 0.07);
    const g = ctx.createGain();
    this.env(g.gain, t, 0.3, 0.004, STEP * 1.7);
    f.connect(g).connect(this.duck);
    for (const [type, det] of [['sawtooth', -8], ['square', 8]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
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

  /** Supersaw chord held for the bar, voices spread across the stereo field. */
  private pad(chord: number[], t: number, dur: number, I: number, level: number): void {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 700 + I * 2600;
    f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05 * level, t + 0.06);
    g.gain.setValueAtTime(0.05 * level, t + dur - 0.08);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    f.connect(g);
    this.route(g, false, true);
    for (const [det, pan] of [[-14, -0.6], [0, 0], [14, 0.6]]) {
      const p = this.panner(pan);
      p.connect(f);
      for (const n of chord) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(n);
        o.detune.value = det;
        o.connect(p);
        o.start(t);
        o.stop(t + dur + 0.02);
      }
    }
  }

  /** Play the melody note (if any) that starts on this step, held until the next note or rest. */
  private melodyStep(
    line: number[][],
    voice: Voice,
    step: number,
    t: number,
    STEP: number,
    gain: number,
    pan: number,
    transpose = 0,
  ): void {
    const bar = line[Math.floor(step / 16) % line.length];
    const s = step % 16;
    const note = bar[s];
    if (note <= 0) return;
    let len = 1;
    while (s + len < 16 && bar[s + len] === HOLD) len++;
    this.note(voice, note + transpose, t, len * STEP, gain, pan);
  }

  /** One melodic note in the given voice, with delayed vibrato, into the echo and reverb. */
  private note(voice: Voice, m: number, t: number, dur: number, gain: number, pan: number): void {
    const ctx = this.ctx!;
    const strings = voice === 'strings';
    const brass = voice === 'brass';
    const atk = strings ? 0.09 : brass ? 0.025 : 0.006;
    const rel = strings ? 0.3 : 0.08;
    const end = Math.max(t + atk + 0.02, t + dur - 0.02);

    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = brass ? 1.5 : 0.7;
    if (brass) {
      // Brass "blat": the filter opens fast, then settles.
      f.frequency.setValueAtTime(500, t);
      f.frequency.exponentialRampToValueAtTime(3400, t + 0.05);
      f.frequency.setTargetAtTime(1900, t + 0.05, 0.12);
    } else {
      f.frequency.value = strings ? 2600 : 4800;
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + atk);
    g.gain.linearRampToValueAtTime(gain * 0.8, Math.min(end, t + atk + 0.1));
    g.gain.setValueAtTime(gain * 0.8, end);
    g.gain.exponentialRampToValueAtTime(0.0001, end + rel);
    const p = this.panner(pan);
    f.connect(g).connect(p);
    this.route(p, !strings, true);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = strings ? 5 : 5.8;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.setValueAtTime(0, t + 0.15);
    depth.gain.linearRampToValueAtTime(strings ? 10 : 20, t + 0.35);
    lfo.connect(depth);

    const oscs: OscillatorNode[] = [lfo];
    const add = (wave: OscillatorType | PeriodicWave, det: number, scoop = 0) => {
      const o = ctx.createOscillator();
      if (typeof wave === 'string') o.type = wave as OscillatorType;
      else o.setPeriodicWave(wave);
      o.frequency.value = mtof(m);
      if (scoop) {
        o.detune.setValueAtTime(det - scoop, t);
        o.detune.linearRampToValueAtTime(det, t + 0.06);
      } else o.detune.value = det;
      depth.connect(o.detune);
      o.connect(f);
      oscs.push(o);
    };
    switch (voice) {
      case 'pulse':
        add(this.waves.pulse, 0);
        add(this.waves.pulse, 9);
        break;
      case 'thin':
        add(this.waves.thin, 0);
        break;
      case 'square':
        add(this.waves.square, -5);
        add(this.waves.pulse, 5);
        break;
      case 'brass':
        for (const det of [-10, 0, 10]) add('sawtooth', det, 45);
        break;
      case 'strings':
        add('sawtooth', -12);
        add('sawtooth', 12);
        add('triangle', 0);
        break;
    }
    for (const o of oscs) {
      o.start(t);
      o.stop(end + rel + 0.02);
    }
  }

  /** House piano chord: bright attack, quick decay. */
  private piano(chord: number[], t: number): void {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(5000, t);
    f.frequency.exponentialRampToValueAtTime(1100, t + 0.35);
    const g = ctx.createGain();
    this.env(g.gain, t, 0.06, 0.003, 0.45);
    f.connect(g);
    this.route(g, true, true);
    chord.forEach((n, i) => {
      const p = this.panner((i - 1) * 0.35);
      p.connect(f);
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.setPeriodicWave(this.waves.piano);
        o.frequency.value = mtof(n + 12);
        o.detune.value = det;
        o.connect(p);
        o.start(t);
        o.stop(t + 0.48);
      }
    });
  }

  /** Short, bright brass/supersaw chord hit. */
  private brassStab(chord: number[], t: number, I: number): void {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(2500 + I * 3500, t);
    f.frequency.exponentialRampToValueAtTime(700, t + 0.16);
    const g = ctx.createGain();
    this.env(g.gain, t, 0.065, 0.004, 0.2);
    f.connect(g);
    this.route(g, true, true);
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

  /** Brassy orchestra hit across three octaves — pure early-90s. */
  private orch(chord: number[], t: number): void {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(5000, t);
    f.frequency.exponentialRampToValueAtTime(700, t + 0.3);
    const g = ctx.createGain();
    this.env(g.gain, t, 0.12, 0.004, 0.5);
    f.connect(g);
    this.route(g, false, true, false);
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
    this.noiseHit(t, 'lowpass', 3000, 0.7, 0.22, 0.25, 0, true);
  }

  private arp(m: number, t: number, I: number, pan: number, gain = 0.06): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.setPeriodicWave(this.waves.pulse);
    o.frequency.value = mtof(m);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 3;
    const top = 900 + I * 5500;
    f.frequency.setValueAtTime(top, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(300, top * 0.25), t + 0.11);
    const g = ctx.createGain();
    this.env(g.gain, t, gain, 0.003, 0.14);
    const p = this.panner(pan);
    o.connect(f).connect(g).connect(p);
    this.route(p, true, false);
    o.start(t);
    o.stop(t + 0.16);
  }
}

/** Band-limited pulse wave with the given duty cycle (0.5 = square). */
function pulseWave(ctx: BaseAudioContext, duty: number): PeriodicWave {
  const n = 40;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
  return ctx.createPeriodicWave(real, imag);
}

/** Stereo reverb tail: decaying noise, darkened a little more each sample as it decays. */
function impulse(ctx: BaseAudioContext, secs: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * secs);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const x = i / len;
      const k = 0.5 - 0.45 * x; // one-pole lowpass that closes over the tail
      lp += k * (Math.random() * 2 - 1 - lp);
      d[i] = lp * (1 - x) ** 3;
    }
  }
  return buf;
}
