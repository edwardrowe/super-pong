import { describe, expect, it } from 'vitest';
import { PHYS, serve, speedOf, stepBall, type Ball, type BallEvent, type Paddle, type PhysOptions } from './physics';

const field = { w: 1600, h: 900 };
const mkPaddles = (ly = 450, ry = 450): [Paddle, Paddle] => [
  { x: 70, y: ly, w: 18, h: 170, vy: 0 },
  { x: 1530, y: ry, w: 18, h: 170, vy: 0 },
];
const mkBall = (b: Partial<Ball>): Ball => ({ x: 800, y: 450, vx: 0, vy: 0, r: 14, ...b });

/** Run until an event of the given type, or give up. */
function runUntil(ball: Ball, paddles: [Paddle, Paddle], type: BallEvent['type'], dt = 1 / 240, maxSteps = 5000): BallEvent | null {
  const out: BallEvent[] = [];
  for (let i = 0; i < maxSteps; i++) {
    out.length = 0;
    stepBall(ball, paddles, field, dt, out);
    const e = out.find((x) => x.type === type);
    if (e) return e;
  }
  return null;
}

describe('stepBall', () => {
  it('bounces off the top wall', () => {
    const ball = mkBall({ y: 20, vx: 100, vy: -800 });
    const e = runUntil(ball, mkPaddles(), 'wall');
    expect(e).toMatchObject({ type: 'wall', top: true });
    expect(ball.vy).toBeGreaterThan(0);
    expect(ball.y).toBeGreaterThanOrEqual(ball.r);
  });

  it('bounces off the bottom wall', () => {
    const ball = mkBall({ y: 880, vx: 100, vy: 800 });
    const e = runUntil(ball, mkPaddles(), 'wall');
    expect(e).toMatchObject({ type: 'wall', top: false });
    expect(ball.vy).toBeLessThan(0);
    expect(ball.y).toBeLessThanOrEqual(field.h - ball.r);
  });

  it('a centre hit on the left paddle sends the ball straight back, faster', () => {
    const ball = mkBall({ x: 300, y: 450, vx: -800 });
    const e = runUntil(ball, mkPaddles(), 'paddle');
    expect(e).toMatchObject({ type: 'paddle', side: 0 });
    expect(ball.vx).toBeGreaterThan(0);
    expect(Math.abs(ball.vy)).toBeLessThan(1);
    expect(speedOf(ball)).toBeCloseTo(800 * PHYS.speedUp, 3);
  });

  it('the right paddle sends the ball left', () => {
    const ball = mkBall({ x: 1300, y: 450, vx: 800 });
    const e = runUntil(ball, mkPaddles(), 'paddle');
    expect(e).toMatchObject({ type: 'paddle', side: 1 });
    expect(ball.vx).toBeLessThan(0);
  });

  it('hitting near the top of the paddle angles the ball upward', () => {
    const ball = mkBall({ x: 300, y: 450 - 70, vx: -800 });
    runUntil(ball, mkPaddles(), 'paddle');
    expect(ball.vy).toBeLessThan(0);
    expect(ball.vx).toBeGreaterThan(0);
  });

  it('a very fast ball cannot tunnel through the paddle', () => {
    // Moves 2000 units in one step — far more than the paddle is thick.
    const ball = mkBall({ x: 900, y: 450, vx: -240_000 });
    const out: BallEvent[] = [];
    stepBall(ball, mkPaddles(), field, 1 / 120, out);
    expect(out[0]).toMatchObject({ type: 'paddle', side: 0 });
    expect(ball.vx).toBeGreaterThan(0);
    expect(speedOf(ball)).toBeLessThanOrEqual(PHYS.maxSpeed);
  });

  it('misses the paddle and scores for the other player', () => {
    const ball = mkBall({ x: 300, y: 100, vx: -800 });
    const e = runUntil(ball, mkPaddles(800), 'goal');
    expect(e).toMatchObject({ type: 'goal', scorer: 1 });
  });

  it('right-side miss scores for the left player', () => {
    const ball = mkBall({ x: 1300, y: 100, vx: 800 });
    const e = runUntil(ball, mkPaddles(450, 800), 'goal');
    expect(e).toMatchObject({ type: 'goal', scorer: 0 });
  });

  it('scores at the goal lines, not the screen edge, when they are set', () => {
    const f = { ...field, goalL: 105, goalR: 1495 };
    const ball = mkBall({ x: 300, y: 100, vx: -800 });
    const out: BallEvent[] = [];
    let goal: BallEvent | undefined;
    for (let i = 0; i < 2000 && !goal; i++) {
      out.length = 0;
      stepBall(ball, mkPaddles(800), f, 1 / 240, out);
      goal = out.find((e) => e.type === 'goal');
    }
    expect(goal).toMatchObject({ type: 'goal', scorer: 1, x: 105 });
    expect(ball.x + ball.r).toBeLessThan(105);
    expect(ball.x).toBeGreaterThan(80);
  });

  it('ignores a paddle when the ball is moving away from it', () => {
    const ball = mkBall({ x: 100, y: 450, vx: 800 });
    const out: BallEvent[] = [];
    stepBall(ball, mkPaddles(), field, 1 / 240, out);
    expect(out).toHaveLength(0);
  });

  it('never bounces too steeply, even with lots of paddle spin', () => {
    const paddles = mkPaddles();
    paddles[0].vy = -50_000;
    const ball = mkBall({ x: 300, y: 450 - 80, vx: -800 });
    runUntil(ball, paddles, 'paddle');
    const angle = Math.atan2(Math.abs(ball.vy), Math.abs(ball.vx));
    expect(angle).toBeLessThanOrEqual(PHYS.maxTravelAngle + 1e-9);
  });

  it('caps the speed', () => {
    const ball = mkBall({ x: 300, y: 450, vx: -PHYS.maxSpeed });
    runUntil(ball, mkPaddles(), 'paddle');
    expect(speedOf(ball)).toBeCloseTo(PHYS.maxSpeed, 6);
  });
});

describe('serve', () => {
  it('starts from the centre toward the given side at serve speed', () => {
    const ball = mkBall({});
    serve(ball, field, -1, () => 0.5);
    expect(ball.x).toBe(800);
    expect(ball.vx).toBeCloseTo(-PHYS.serveSpeed);
    expect(speedOf(ball)).toBeCloseTo(PHYS.serveSpeed);
  });
});

describe('spin', () => {
  const ON: PhysOptions = { spin: true };
  /** Hit the ball off a paddle moving at paddleVy, then fly for `secs` (no further hits). */
  function hitAndFly(side: 0 | 1, paddleVy: number, opts: PhysOptions = ON, secs = 0.6) {
    const paddles = mkPaddles();
    paddles[side].vy = paddleVy;
    const ball = side === 0 ? mkBall({ x: 200, vx: -900 }) : mkBall({ x: 1400, vx: 900 });
    const out: BallEvent[] = [];
    let hit: BallEvent | undefined;
    for (let i = 0; i < 1000 && !hit; i++) {
      out.length = 0;
      stepBall(ball, paddles, field, 1 / 240, out, opts);
      hit = out.find((e) => e.type === 'paddle');
    }
    const after = { vx: ball.vx, vy: ball.vy, speed: speedOf(ball) };
    // Keep the paddles out of the way while it flies.
    paddles[0].y = paddles[1].y = -1000;
    let maxSteep = 0;
    for (let i = 0; i < secs * 240; i++) {
      out.length = 0;
      stepBall(ball, paddles, { ...field, h: 1e6 }, 1 / 240, out, opts);
      maxSteep = Math.max(maxSteep, Math.atan2(Math.abs(ball.vy), Math.abs(ball.vx)));
    }
    return { hit: hit!, after, ball, maxSteep };
  }

  it('is off by default: paddle movement does not curve the ball', () => {
    const r = hitAndFly(0, 2000, {});
    expect(r.ball.vy).toBeCloseTo(r.after.vy, 6);
    expect(r.ball.spin ?? 0).toBe(0);
  });

  it('curves the ball the way the paddle was moving, keeping its speed', () => {
    for (const side of [0, 1] as const) {
      const down = hitAndFly(side, 1500);
      expect(down.ball.vy).toBeGreaterThan(down.after.vy + 100);
      expect(speedOf(down.ball)).toBeCloseTo(down.after.speed, 3);
      const up = hitAndFly(side, -1500);
      expect(up.ball.vy).toBeLessThan(up.after.vy - 100);
    }
  });

  it('a still paddle puts no spin on', () => {
    expect(hitAndFly(0, 0).hit).toMatchObject({ spin: 0 });
  });

  it('is capped, fades, and never bends the ball steeper than the max travel angle', () => {
    const r = hitAndFly(0, 1e6, ON, 3);
    expect(Math.abs((r.hit as { spin: number }).spin)).toBeLessThanOrEqual(PHYS.maxSpin);
    expect(r.maxSteep).toBeLessThanOrEqual(PHYS.maxTravelAngle + 1e-6);
    const mild = hitAndFly(0, 600, ON, 3);
    expect(Math.abs(mild.ball.spin ?? 0)).toBeLessThan(Math.abs((mild.hit as { spin: number }).spin) * 0.2);
  });

  it('reverses (and weakens) on a wall bounce', () => {
    const b2 = mkBall({ y: 30, vx: 600, vy: -600, spin: 1 });
    const out: BallEvent[] = [];
    for (let i = 0; i < 200 && !out.some((e) => e.type === 'wall'); i++) stepBall(b2, mkPaddles(), field, 1 / 240, out, ON);
    expect(b2.spin).toBeLessThan(0);
    expect(Math.abs(b2.spin!)).toBeLessThan(0.6);
  });
});
