import { SpringGrid } from '../engine/grid';
import { Kind, Particles } from '../engine/particles';
import type { View } from '../engine/types';

/** Animated neon background behind the home menu. */
export class Backdrop {
  private grid = new SpringGrid(60, '#4d5bff');
  private particles = new Particles(['#18f0ff', '#ff2bd6', '#ffd447', '#ffffff'], 800);
  private w = 0;
  private h = 0;
  private next = 0.3;

  resize(view: View): void {
    this.w = view.w;
    this.h = view.h;
    this.grid.resize(view.w, view.h);
  }

  update(dt: number): void {
    this.next -= dt;
    if (this.next <= 0) {
      this.next = 0.7 + Math.random() * 0.9;
      const x = Math.random() * this.w;
      const y = Math.random() * this.h;
      const c = (Math.random() * 3) | 0;
      this.grid.impulse(x, y, 700, 300);
      this.particles.burst(x, y, { count: 40, color: [c, 3], speed: [60, 420], life: [0.5, 1.2], drag: 1.5 });
      this.particles.burst(x, y, { count: 8, color: c, kind: Kind.Dot, speed: [20, 120], life: [0.6, 1.2], size: [20, 50], drag: 1.5 });
    }
    this.grid.update(dt);
    this.particles.update(dt);
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#05050c';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.globalCompositeOperation = 'lighter';
    this.grid.draw(ctx, 1.2);
    this.particles.draw(ctx);
    ctx.globalCompositeOperation = 'source-over';
  }
}
