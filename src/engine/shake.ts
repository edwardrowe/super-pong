/**
 * Trauma-based screen shake: add trauma on impacts, it decays over time, and the
 * shake amount is trauma squared so small hits stay subtle and big ones really kick.
 */
export class Shake {
  private trauma = 0;
  private t = 0;

  constructor(
    private maxOffset = 28,
    private maxAngle = 0.03,
    private decay = 1.6,
  ) {}

  add(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number): void {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - this.decay * dt);
  }

  /** Apply the shake around the screen centre. Wrap in save()/restore(). */
  apply(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    const s = this.trauma * this.trauma;
    if (s <= 0) return;
    const t = this.t * 38;
    const n = (seed: number) => Math.sin(t * 1.0 + seed) * 0.6 + Math.sin(t * 2.3 + seed * 1.7) * 0.4;
    ctx.translate(cx, cy);
    ctx.rotate(this.maxAngle * s * n(5.1));
    ctx.translate(-cx + this.maxOffset * s * n(1.3), -cy + this.maxOffset * s * n(9.2));
  }
}
