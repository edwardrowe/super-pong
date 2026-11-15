import { describe, expect, it } from 'vitest';
import { DEFAULT_ENTER, MAX_LEVEL, TRACKS, melody } from './music';

describe('melody()', () => {
  it('expands shorter bars into 16 steps', () => {
    const [bar] = melody(['A4 . C5 -']);
    expect(bar).toHaveLength(16);
    expect(bar[0]).toBe(69);
    expect(bar.slice(1, 4)).toEqual([0, 0, 0]); // held
    expect(bar.slice(4, 8)).toEqual([-1, -1, -1, -1]); // rest
    expect(bar[8]).toBe(72);
  });

  it('rejects bars that do not divide into 16ths', () => {
    expect(() => melody(['A4 B4 C5'])).toThrow();
    expect(() => melody(['H4'])).toThrow();
  });
});

describe('TRACKS', () => {
  it('have unique ids', () => {
    expect(new Set(TRACKS.map((t) => t.id)).size).toBe(TRACKS.length);
  });

  for (const t of TRACKS) {
    it(`${t.name} is well formed`, () => {
      for (const p of [t.kick, t.snare, t.hat, t.bassline, t.stab]) expect(p).toHaveLength(16);
      expect(t.arp).toHaveLength(16);
      expect(t.bass).toHaveLength(t.chords.length);
      for (const i of t.arp) expect(i).toBeLessThan(6);
      for (const line of [t.lead, t.counter]) {
        expect(line.length).toBeGreaterThan(0);
        for (const bar of line) expect(bar).toHaveLength(16);
      }
    });

    it(`${t.name} builds up: every layer is in by match point, and something new arrives at every level`, () => {
      const enter = { ...DEFAULT_ENTER, ...t.enter };
      const levels = Object.values(enter);
      expect(Math.max(...levels)).toBeLessThanOrEqual(MAX_LEVEL - 1);
      const arrivals = new Set(levels);
      for (let lvl = 0; lvl <= MAX_LEVEL - 1; lvl++) expect(arrivals.has(lvl)).toBe(true);
    });
  }
});
