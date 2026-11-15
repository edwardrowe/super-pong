import { drawGlow } from './glow';

export const Kind = {
  /** A motion-stretched line — sparks. */
  Streak: 0,
  /** A soft glowing dot — embers, smoke. */
  Dot: 1,
} as const;
export type Kind = (typeof Kind)[keyof typeof Kind];

export interface BurstOpts {
  count: number;
  /** Palette index, or several to pick from at random. */
  color: number | number[];
  speed: [number, number];
  /** Centre direction in radians. Omit for all directions. */
  angle?: number;
  /** Total spread in radians around angle. */
  spread?: number;
  life: [number, number];
  size?: [number, number];
  kind?: Kind;
  /** Velocity damping per second (exponential). */
  drag?: number;
  gravity?: number;
  /** Spawn jitter radius. */
  jitter?: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const BUCKETS = 4;

/** Fixed-capacity particle pool stored in typed arrays (no garbage per frame). */
export class Particles {
  n = 0;
  private x: Float32Array;
  private y: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private life: Float32Array;
  private max: Float32Array;
  private size: Float32Array;
  private drag: Float32Array;
  private grav: Float32Array;
  private col: Uint8Array;
  private kind: Uint8Array;

  constructor(
    private palette: string[],
    readonly cap = 4000,
  ) {
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap);
    this.size = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.col = new Uint8Array(cap);
    this.kind = new Uint8Array(cap);
  }

  spawn(x: number, y: number, vx: number, vy: number, life: number, size: number, color: number, kind: Kind, drag = 2, grav = 0): void {
    // When full, overwrite a random particle rather than dropping the new one.
    const i = this.n < this.cap ? this.n++ : (Math.random() * this.cap) | 0;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = this.max[i] = life;
    this.size[i] = size;
    this.col[i] = color;
    this.kind[i] = kind;
    this.drag[i] = drag;
    this.grav[i] = grav;
  }

  burst(x: number, y: number, o: BurstOpts): void {
    const spread = o.spread ?? Math.PI * 2;
    const base = o.angle ?? 0;
    for (let k = 0; k < o.count; k++) {
      const a = base + (Math.random() - 0.5) * spread;
      const s = rand(o.speed[0], o.speed[1]);
      const c = Array.isArray(o.color) ? o.color[(Math.random() * o.color.length) | 0] : o.color;
      const j = o.jitter ?? 0;
      this.spawn(
        x + (Math.random() - 0.5) * j,
        y + (Math.random() - 0.5) * j,
        Math.cos(a) * s,
        Math.sin(a) * s,
        rand(o.life[0], o.life[1]),
        o.size ? rand(o.size[0], o.size[1]) : 3,
        c,
        o.kind ?? Kind.Streak,
        o.drag ?? 2,
        o.gravity ?? 0,
      );
    }
  }

  clear(): void {
    this.n = 0;
  }

  update(dt: number): void {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.n--;
        this.copy(this.n, i);
        continue;
      }
      const d = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= d;
      this.vy[i] = this.vy[i] * d + this.grav[i] * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      i++;
    }
  }

  /** Draw with 'lighter' compositing already set. */
  draw(ctx: CanvasRenderingContext2D): void {
    const P = this.palette.length;
    // Streaks are batched into one path per (colour, fade bucket) to keep draw calls low.
    const paths: (Path2D | null)[] = new Array(P * BUCKETS).fill(null);
    for (let i = 0; i < this.n; i++) {
      const f = this.life[i] / this.max[i];
      if (this.kind[i] === Kind.Dot) {
        drawGlow(ctx, this.palette[this.col[i]], this.x[i], this.y[i], this.size[i] * (0.4 + 0.6 * f), f);
        continue;
      }
      const b = Math.min(BUCKETS - 1, (f * BUCKETS) | 0);
      const key = this.col[i] * BUCKETS + b;
      const p = (paths[key] ??= new Path2D());
      const k = 0.028;
      p.moveTo(this.x[i], this.y[i]);
      p.lineTo(this.x[i] - this.vx[i] * k - 0.01, this.y[i] - this.vy[i] * k);
    }
    ctx.lineCap = 'round';
    for (let key = 0; key < paths.length; key++) {
      const p = paths[key];
      if (!p) continue;
      const b = key % BUCKETS;
      const t = (b + 1) / BUCKETS;
      ctx.strokeStyle = this.palette[(key / BUCKETS) | 0];
      ctx.globalAlpha = 0.25 * t;
      ctx.lineWidth = 9 * t;
      ctx.stroke(p);
      ctx.globalAlpha = t;
      ctx.lineWidth = 3.2 * t;
      ctx.stroke(p);
    }
    ctx.globalAlpha = 1;
  }

  private copy(from: number, to: number): void {
    this.x[to] = this.x[from];
    this.y[to] = this.y[from];
    this.vx[to] = this.vx[from];
    this.vy[to] = this.vy[from];
    this.life[to] = this.life[from];
    this.max[to] = this.max[from];
    this.size[to] = this.size[from];
    this.drag[to] = this.drag[from];
    this.grav[to] = this.grav[from];
    this.col[to] = this.col[from];
    this.kind[to] = this.kind[from];
  }
}
