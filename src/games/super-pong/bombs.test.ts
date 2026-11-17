import { describe, expect, it } from 'vitest';
import { BOMB, addHole, blastPaddle, launchVelocity, solidPieces } from './bombs';
import { PHYS, stepBall, throughHole, type BallEvent, type Paddle } from './physics';

const paddle = (y = 450, h = 170): Paddle => ({ x: 140, y, w: 22, h, vy: 0 });

describe('launchVelocity', () => {
  it('goes at serve speed toward the other player and inherits the paddle movement', () => {
    expect(launchVelocity(1, 0)).toEqual({ vx: PHYS.serveSpeed, vy: 0 });
    expect(launchVelocity(-1, 300)).toEqual({ vx: -PHYS.serveSpeed, vy: 300 });
  });

  it('never launches steeper than the max travel angle', () => {
    const v = launchVelocity(1, 99999);
    expect(Math.atan2(v.vy, v.vx)).toBeCloseTo(PHYS.maxTravelAngle, 6);
  });
});

describe('blastPaddle', () => {
  it('misses a paddle outside the blast', () => {
    expect(blastPaddle(paddle(), 0, 450, 100)).toEqual({ hole: null, core: false });
    expect(blastPaddle(paddle(100), 0, 800, BOMB.blast)).toEqual({ hole: null, core: false });
  });

  it('blasts a hole where the blast crosses the paddle, sparing the core', () => {
    // Blast at the back edge (x = 0), centred below the paddle's middle.
    const r = blastPaddle(paddle(450, 300), 0, 700, BOMB.blast);
    expect(r.core).toBe(false);
    expect(r.hole).not.toBeNull();
    const half = Math.sqrt(BOMB.blast ** 2 - 140 ** 2);
    expect(r.hole!.lo).toBeCloseTo(250 - half, 6);
    expect(r.hole!.hi).toBe(150); // clipped at the paddle's end
  });

  it('destroys the paddle when the blast reaches its core', () => {
    expect(blastPaddle(paddle(), 0, 450, BOMB.blast).core).toBe(true);
    // Just reaching the core's edge counts.
    const half = Math.sqrt(BOMB.blast ** 2 - 140 ** 2);
    expect(blastPaddle(paddle(), 0, 450 + BOMB.core / 2 + half - 1, BOMB.blast).core).toBe(true);
    expect(blastPaddle(paddle(), 0, 450 + BOMB.core / 2 + half + 1, BOMB.blast).core).toBe(false);
  });
});

describe('holes', () => {
  it('merge when they overlap', () => {
    const holes = [{ lo: -80, hi: -50 }];
    addHole(holes, { lo: 40, hi: 60 });
    addHole(holes, { lo: -60, hi: -30 });
    expect(holes).toEqual([
      { lo: -80, hi: -30 },
      { lo: 40, hi: 60 },
    ]);
  });

  it('cut the paddle into solid pieces', () => {
    expect(solidPieces(-85, 85, [{ lo: -40, hi: -20 }, { lo: 60, hi: 100 }])).toEqual([
      [-85, -40],
      [-20, 60],
    ]);
  });

  it('let the ball through, but not a ball wider than the gap', () => {
    const p = { ...paddle(), holes: [{ lo: 20, hi: 60 }] };
    expect(throughHole(p, 40, 14)).toBe(true);
    expect(throughHole(p, 0, 14)).toBe(false);
    expect(throughHole(p, 22, 14)).toBe(false); // clipping the edge still hits
    // A hole at the paddle's end is open beyond it.
    const end = { ...paddle(), holes: [{ lo: 50, hi: 85 }] };
    expect(throughHole(end, 95, 14)).toBe(true);
  });

  it('a ball aimed at a hole flies through the paddle; a gone paddle stops nothing', () => {
    const field = { w: 1600, h: 900, goalL: 105, goalR: 1495 };
    const run = (p: Paddle, y: number) => {
      const ball = { x: 400, y, vx: -900, vy: 0, r: 14 };
      const out: BallEvent[] = [];
      for (let i = 0; i < 2000 && !out.length; i++) stepBall(ball, [p, { ...paddle(), x: 1460 }], field, 1 / 240, out);
      return out[0]?.type;
    };
    expect(run(paddle(), 490)).toBe('paddle');
    expect(run({ ...paddle(), holes: [{ lo: 20, hi: 60 }] }, 490)).toBe('goal');
    expect(run({ ...paddle(), gone: true }, 450)).toBe('goal');
  });
});
