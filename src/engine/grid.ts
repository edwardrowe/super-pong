import { rgba } from './glow';

/**
 * A background grid of springy points. Impacts push the points outward and the
 * disturbance ripples across the grid and settles — a cheap "space warp" effect.
 */
export class SpringGrid {
  private cols = 0;
  private rows = 0;
  private sx = 0;
  private sy = 0;
  private dx = new Float32Array(0);
  private dy = new Float32Array(0);
  private vx = new Float32Array(0);
  private vy = new Float32Array(0);

  constructor(
    private spacing = 60,
    private color = '#3b4cff',
  ) {}

  resize(w: number, h: number): void {
    this.cols = Math.max(2, Math.round(w / this.spacing) + 1);
    this.rows = Math.max(2, Math.round(h / this.spacing) + 1);
    this.sx = w / (this.cols - 1);
    this.sy = h / (this.rows - 1);
    const n = this.cols * this.rows;
    this.dx = new Float32Array(n);
    this.dy = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
  }

  /** Push points away from (x, y). Negative strength pulls inward. */
  impulse(x: number, y: number, strength: number, radius: number): void {
    const r2 = radius * radius;
    for (let j = 1; j < this.rows - 1; j++) {
      for (let i = 1; i < this.cols - 1; i++) {
        const k = j * this.cols + i;
        const px = i * this.sx + this.dx[k] - x;
        const py = j * this.sy + this.dy[k] - y;
        const d2 = px * px + py * py;
        if (d2 > r2 || d2 < 1) continue;
        const d = Math.sqrt(d2);
        const f = strength * (1 - d / radius) ** 2;
        this.vx[k] += (px / d) * f;
        this.vy[k] += (py / d) * f;
      }
    }
  }

  update(dt: number): void {
    const steps = Math.ceil(dt / (1 / 120));
    const h = dt / steps;
    const K = 45; // pull back to rest
    const C = 140; // pull toward neighbours (makes waves travel)
    const D = 4.5; // damping
    const { cols, rows, dx, dy, vx, vy } = this;
    for (let s = 0; s < steps; s++) {
      for (let j = 1; j < rows - 1; j++) {
        for (let i = 1; i < cols - 1; i++) {
          const k = j * cols + i;
          const lx = dx[k - 1] + dx[k + 1] + dx[k - cols] + dx[k + cols] - 4 * dx[k];
          const ly = dy[k - 1] + dy[k + 1] + dy[k - cols] + dy[k + cols] - 4 * dy[k];
          vx[k] += (-K * dx[k] + C * lx - D * vx[k]) * h;
          vy[k] += (-K * dy[k] + C * ly - D * vy[k]) * h;
        }
      }
      for (let k = 0; k < dx.length; k++) {
        dx[k] += vx[k] * h;
        dy[k] += vy[k] * h;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, intensity = 1): void {
    const { cols, rows, sx, sy, dx, dy } = this;
    // Segments are bucketed by how disturbed they are, so energy fades out smoothly.
    const LEVELS = [1.5, 4, 9, 18, 36];
    const paths = LEVELS.map(() => new Path2D());
    const base = new Path2D();
    const seg = (a: number, b: number, ax: number, ay: number, bx: number, by: number) => {
      const e = Math.abs(dx[a]) + Math.abs(dy[a]) + Math.abs(dx[b]) + Math.abs(dy[b]);
      let lv = -1;
      while (lv + 1 < LEVELS.length && e > LEVELS[lv + 1]) lv++;
      const p = lv < 0 ? base : paths[lv];
      p.moveTo(ax + dx[a], ay + dy[a]);
      p.lineTo(bx + dx[b], by + dy[b]);
    };
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i;
        const x = i * sx;
        const y = j * sy;
        if (i < cols - 1) seg(k, k + 1, x, y, x + sx, y);
        if (j < rows - 1) seg(k, k + cols, x, y, x, y + sy);
      }
    }
    ctx.lineCap = 'butt';
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = rgba(this.color, 0.13 * intensity);
    ctx.stroke(base);
    paths.forEach((p, i) => {
      const t = (i + 1) / LEVELS.length;
      ctx.lineWidth = 2 + 6 * t;
      ctx.strokeStyle = rgba(this.color, 0.1 * t * intensity);
      ctx.stroke(p);
      ctx.lineWidth = 1.5 + 0.8 * t;
      ctx.strokeStyle = rgba(this.color, (0.13 + 0.5 * t) * intensity);
      ctx.stroke(p);
    });
  }
}
