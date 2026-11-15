/** Power-up rules — pure, no rendering, so they can be unit tested. */

import type { Ball, Field } from './physics';

export const POWER = {
  /** Chance that a rally has power-ups at all. */
  chance: 0.75,
  /** Paddle hits into the rally before the first one appears. */
  firstAfter: [3, 5] as const,
  /** Paddle hits between later ones in the same rally. */
  thenEvery: [7, 15] as const,
  /** Pickup radius (world units). */
  radius: 38,
  /** Paddle growth per pickup, and the most pickups that count. */
  growBy: 18,
  maxGrows: 5,
};

export type Rnd = () => number;

const randInt = (lo: number, hi: number, rnd: Rnd) => lo + Math.floor(rnd() * (hi - lo + 1));

/** Counts paddle hits through a rally and says when to spawn a power-up. */
export class PowerSchedule {
  /** Hits left until the next spawn; -1 = no more power-ups this rally. */
  countdown = -1;

  constructor(private rnd: Rnd = Math.random) {}

  /** A new rally (serve) is starting. */
  startRally(): void {
    this.countdown = this.rnd() < POWER.chance ? randInt(POWER.firstAfter[0], POWER.firstAfter[1], this.rnd) : -1;
  }

  /** Call on every paddle hit. Returns true when a power-up should appear now. */
  onHit(): boolean {
    if (this.countdown < 0) return false;
    if (--this.countdown > 0) return false;
    this.countdown = randInt(POWER.thenEvery[0], POWER.thenEvery[1], this.rnd);
    return true;
  }
}

/**
 * Somewhere in the middle of the court, away from the ball: the middle 60% between the goal
 * lines, clear of the top and bottom walls.
 */
export function spawnPoint(field: Required<Field>, ball: Ball, rnd: Rnd = Math.random): { x: number; y: number } {
  const span = field.goalR - field.goalL;
  let best = { x: 0, y: 0 };
  let bestD = -1;
  for (let i = 0; i < 8; i++) {
    const x = field.goalL + span * (0.2 + rnd() * 0.6);
    const y = 110 + rnd() * (field.h - 220);
    const d = Math.hypot(x - ball.x, y - ball.y);
    if (d > 220) return { x, y };
    if (d > bestD) {
      bestD = d;
      best = { x, y };
    }
  }
  return best;
}

/** Does the ball touch a power-up at (x, y)? */
export const touches = (ball: Ball, x: number, y: number) => Math.hypot(ball.x - x, ball.y - y) < ball.r + POWER.radius;

/** Paddle height after this many pickups (capped). */
export const grownHeight = (base: number, grows: number) => base + Math.min(grows, POWER.maxGrows) * POWER.growBy;
