/** Pure ball physics — no rendering, no DOM — so it can be unit tested. */

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export interface Paddle {
  /** Centre. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Vertical velocity, world units / s (adds a little spin to the bounce). */
  vy: number;
}

export interface Field {
  w: number;
  h: number;
}

export const PHYS = {
  serveSpeed: 760,
  speedUp: 1.055,
  maxSpeed: 2300,
  maxBounceAngle: (55 * Math.PI) / 180,
  serveAngle: (25 * Math.PI) / 180,
  /** How much paddle movement bends the bounce. */
  english: 0.15,
  /** Never let the ball travel steeper than this from horizontal. */
  maxTravelAngle: (62 * Math.PI) / 180,
};

export type BallEvent =
  | { type: 'paddle'; side: 0 | 1; x: number; y: number; speed: number; offset: number }
  | { type: 'wall'; x: number; y: number; top: boolean }
  | { type: 'goal'; scorer: 0 | 1; x: number; y: number };

export const speedOf = (b: Ball) => Math.hypot(b.vx, b.vy);

/** 0 at serve speed, 1 at max speed. */
export const speedFrac = (speed: number) => Math.max(0, Math.min(1, (speed - PHYS.serveSpeed) / (PHYS.maxSpeed - PHYS.serveSpeed)));

export function serve(ball: Ball, field: Field, dir: 1 | -1, rnd: () => number = Math.random): void {
  ball.x = field.w / 2;
  ball.y = field.h / 2;
  const a = (rnd() * 2 - 1) * PHYS.serveAngle;
  ball.vx = Math.cos(a) * PHYS.serveSpeed * dir;
  ball.vy = Math.sin(a) * PHYS.serveSpeed;
}

/**
 * Advance the ball by dt. Paddle collision is swept (checks where the ball crossed the
 * paddle face during the step), so a fast ball can't tunnel through. Events are pushed
 * to `out`. Returns true if a goal was scored.
 */
export function stepBall(ball: Ball, paddles: readonly [Paddle, Paddle], field: Field, dt: number, out: BallEvent[]): boolean {
  const px = ball.x;
  const py = ball.y;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  if (ball.vx < 0) hitPaddle(ball, paddles[0], 0, px, py, out);
  else if (ball.vx > 0) hitPaddle(ball, paddles[1], 1, px, py, out);

  if (ball.y - ball.r < 0) {
    ball.y = 2 * ball.r - ball.y;
    ball.vy = Math.abs(ball.vy);
    out.push({ type: 'wall', x: ball.x, y: 0, top: true });
  } else if (ball.y + ball.r > field.h) {
    ball.y = 2 * (field.h - ball.r) - ball.y;
    ball.vy = -Math.abs(ball.vy);
    out.push({ type: 'wall', x: ball.x, y: field.h, top: false });
  }

  if (ball.x + ball.r < 0) {
    out.push({ type: 'goal', scorer: 1, x: 0, y: ball.y });
    return true;
  }
  if (ball.x - ball.r > field.w) {
    out.push({ type: 'goal', scorer: 0, x: field.w, y: ball.y });
    return true;
  }
  return false;
}

function hitPaddle(ball: Ball, p: Paddle, side: 0 | 1, px: number, py: number, out: BallEvent[]): boolean {
  // dir: which way the ball travels after bouncing off this paddle.
  const dir = side === 0 ? 1 : -1;
  const face = p.x + (dir * p.w) / 2;
  const prevLead = px - dir * ball.r;
  const lead = ball.x - dir * ball.r;
  // Must have been in front of the face at the start of the step and past it at the end.
  if ((prevLead - face) * dir < 0 || (lead - face) * dir >= 0) return false;

  const t = (prevLead - face) / (prevLead - lead);
  const yAt = py + (ball.y - py) * t;
  const reach = p.h / 2 + ball.r;
  if (Math.abs(yAt - p.y) > reach) return false;

  const offset = Math.max(-1, Math.min(1, (yAt - p.y) / reach));
  const speed = Math.min(speedOf(ball) * PHYS.speedUp, PHYS.maxSpeed);
  const angle = offset * PHYS.maxBounceAngle;
  let nx = Math.cos(angle);
  let ny = Math.sin(angle) + (p.vy / speed) * PHYS.english;
  const len = Math.hypot(nx, ny);
  nx /= len;
  ny /= len;
  const minX = Math.cos(PHYS.maxTravelAngle);
  if (nx < minX) {
    nx = minX;
    ny = Math.sign(ny) * Math.sqrt(1 - minX * minX);
  }
  ball.vx = nx * dir * speed;
  ball.vy = ny * speed;
  ball.x = face + dir * ball.r;
  ball.y = yAt;
  out.push({ type: 'paddle', side, x: face, y: yAt, speed, offset });
  return true;
}
