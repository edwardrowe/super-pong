/**
 * Bomb ball rules — pure, no rendering, so they can be unit tested.
 *
 * A bomb launches off the front of its owner's paddle toward the other player. Block it and your
 * paddle blows up. Dodge it and it explodes where it hits the back edge: any paddle the blast
 * reaches gets a hole blasted in it, and if the blast reaches the paddle's core, the whole
 * paddle blows up.
 */

import { PHYS, type Hole, type Paddle } from './physics';

export const BOMB = {
  color: '#ff3b3b',
  /** Seconds of wind-up on the paddle before it launches. */
  charge: 0.6,
  r: 17,
  /** Blast radius where a dodged bomb hits the back edge. */
  blast: 210,
  /** Height of each paddle's core: about a quarter of a starting paddle. */
  core: 42,
  /** A bomb that somehow never lands goes off after this long. */
  maxLife: 12,
};

/**
 * Launch velocity: serve speed toward the other player, plus the paddle's own movement — never
 * steeper than the ball may travel.
 */
export function launchVelocity(dir: 1 | -1, paddleVy: number): { vx: number; vy: number } {
  const vx = dir * PHYS.serveSpeed;
  const maxVy = PHYS.serveSpeed * Math.tan(PHYS.maxTravelAngle);
  return { vx, vy: Math.max(-maxVy, Math.min(maxVy, paddleVy)) };
}

/**
 * What a blast of radius R at (cx, cy) does to a paddle (treated as a thin vertical line):
 * the stretch of it inside the blast becomes a hole, and touching the core destroys it.
 */
export function blastPaddle(p: Pick<Paddle, 'x' | 'y' | 'h'>, cx: number, cy: number, R: number): { hole: Hole | null; core: boolean } {
  const dx = Math.abs(p.x - cx);
  if (dx >= R) return { hole: null, core: false };
  const half = Math.sqrt(R * R - dx * dx);
  const lo = Math.max(cy - half - p.y, -p.h / 2);
  const hi = Math.min(cy + half - p.y, p.h / 2);
  if (hi <= lo) return { hole: null, core: false };
  const core = lo < BOMB.core / 2 && hi > -BOMB.core / 2;
  return { hole: { lo, hi }, core };
}

/** Add a hole, merging it with any it overlaps. */
export function addHole(holes: Hole[], hole: Hole): void {
  let { lo, hi } = hole;
  for (let i = holes.length - 1; i >= 0; i--) {
    const h = holes[i];
    if (h.hi >= lo && h.lo <= hi) {
      lo = Math.min(lo, h.lo);
      hi = Math.max(hi, h.hi);
      holes.splice(i, 1);
    }
  }
  holes.push({ lo, hi });
  holes.sort((a, b) => a.lo - b.lo);
}

/** The solid pieces left of [lo, hi] once the holes are cut out. */
export function solidPieces(lo: number, hi: number, holes: readonly Hole[]): [number, number][] {
  let pieces: [number, number][] = [[lo, hi]];
  for (const h of holes) {
    const next: [number, number][] = [];
    for (const [a, b] of pieces) {
      if (h.hi <= a || h.lo >= b) next.push([a, b]);
      else {
        if (h.lo > a) next.push([a, h.lo]);
        if (h.hi < b) next.push([h.hi, b]);
      }
    }
    pieces = next;
  }
  return pieces;
}
