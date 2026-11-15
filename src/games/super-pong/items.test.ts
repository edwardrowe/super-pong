import { describe, expect, it } from 'vitest';
import { ITEM_SLOTS, Inventory, SLOW } from './items';
import { PHYS, brake, speedOf } from './physics';

describe('Inventory', () => {
  it('fills free slots, then refuses', () => {
    const inv = new Inventory();
    for (let i = 0; i < ITEM_SLOTS; i++) expect(inv.give(0, 'slow')).toBe(true);
    expect(inv.give(0, 'slow')).toBe(false);
    expect(inv.has(0, 'slow')).toBe(true);
    expect(inv.has(1, 'slow')).toBe(false);
  });

  it('take empties the slot', () => {
    const inv = new Inventory();
    inv.give(1, 'slow');
    expect(inv.take(1)).toBe('slow');
    expect(inv.take(1)).toBe(null);
    expect(inv.has(1, 'slow')).toBe(false);
  });

  it('clear empties everyone', () => {
    const inv = new Inventory();
    inv.give(0, 'slow');
    inv.give(1, 'slow');
    inv.clear();
    expect(inv.has(0, 'slow') || inv.has(1, 'slow')).toBe(false);
  });
});

describe('brake (slowdown)', () => {
  it('brings a fast ball back to serve speed within the slowdown, keeping its direction', () => {
    const ball = { x: 0, y: 0, vx: 1800, vy: -900, r: 14 };
    const dir = Math.atan2(ball.vy, ball.vx);
    const dt = 1 / 240;
    for (let t = 0; t < SLOW.duration; t += dt) brake(ball, SLOW.toSpeed, SLOW.rate, dt);
    expect(speedOf(ball)).toBeLessThan(PHYS.serveSpeed * 1.05);
    expect(speedOf(ball)).toBeGreaterThanOrEqual(PHYS.serveSpeed);
    expect(Math.atan2(ball.vy, ball.vx)).toBeCloseTo(dir, 9);
  });

  it('never speeds up a slow ball', () => {
    const ball = { x: 0, y: 0, vx: -300, vy: 0, r: 14 };
    brake(ball, SLOW.toSpeed, SLOW.rate, 1 / 60);
    expect(ball.vx).toBe(-300);
  });
});
