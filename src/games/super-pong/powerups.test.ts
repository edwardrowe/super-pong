import { describe, expect, it } from 'vitest';
import { POWER, PowerSchedule, grownHeight, spawnPoint, touches } from './powerups';

/** Deterministic random numbers from a list (repeats the last one). */
const seq = (...v: number[]) => {
  let i = 0;
  return () => v[Math.min(i++, v.length - 1)];
};

const hitsUntilSpawn = (s: PowerSchedule, max = 100) => {
  for (let n = 1; n <= max; n++) if (s.onHit()) return n;
  return -1;
};

describe('PowerSchedule', () => {
  it('every rally gets one 2–6 hits in, then every 7–12', () => {
    const seen = new Set<number>();
    for (let trial = 0; trial < 300; trial++) {
      const s = new PowerSchedule();
      s.startRally();
      const first = hitsUntilSpawn(s);
      seen.add(first);
      expect(first).toBeGreaterThanOrEqual(2);
      expect(first).toBeLessThanOrEqual(6);
      for (let k = 0; k < 3; k++) {
        const next = hitsUntilSpawn(s);
        expect(next).toBeGreaterThanOrEqual(7);
        expect(next).toBeLessThanOrEqual(12);
      }
    }
    expect([...seen].sort()).toEqual([2, 3, 4, 5, 6]);
  });

  it('a new rally restarts the count', () => {
    const s = new PowerSchedule(seq(0)); // always the shortest gap
    s.startRally();
    s.onHit();
    s.startRally();
    expect(hitsUntilSpawn(s)).toBe(2);
  });
});

describe('spawnPoint', () => {
  const field = { w: 1800, h: 900, goalL: 105, goalR: 1695 };
  it('stays in the middle of the court and clear of the walls', () => {
    for (let i = 0; i < 500; i++) {
      const p = spawnPoint(field, { x: 900, y: 450, vx: 0, vy: 0, r: 14 });
      expect(p.x).toBeGreaterThanOrEqual(105 + 1590 * 0.2);
      expect(p.x).toBeLessThanOrEqual(105 + 1590 * 0.8);
      expect(p.y).toBeGreaterThanOrEqual(110);
      expect(p.y).toBeLessThanOrEqual(790);
    }
  });

  it('avoids appearing on top of the ball', () => {
    for (let i = 0; i < 500; i++) {
      const ball = { x: 900, y: 450, vx: 0, vy: 0, r: 14 };
      const p = spawnPoint(field, ball);
      expect(Math.hypot(p.x - ball.x, p.y - ball.y)).toBeGreaterThan(POWER.radius + ball.r);
    }
  });
});

describe('pickups', () => {
  it('touch when the ball overlaps', () => {
    const ball = { x: 0, y: 0, vx: 0, vy: 0, r: 14 };
    expect(touches(ball, POWER.radius + 13, 0)).toBe(true);
    expect(touches(ball, POWER.radius + 15, 0)).toBe(false);
  });

  it('paddle growth caps at five pickups', () => {
    expect(grownHeight(170, 0)).toBe(170);
    expect(grownHeight(170, 1)).toBe(170 + POWER.growBy);
    expect(grownHeight(170, 5)).toBe(170 + 5 * POWER.growBy);
    expect(grownHeight(170, 9)).toBe(grownHeight(170, 5));
  });
});
