/**
 * Cheap neon. Real blur is slow on phones, so glow is faked with:
 *  - pre-rendered radial-gradient sprites for points (ball, embers, flashes)
 *  - several stacked strokes of decreasing width for lines
 * Everything is meant to be drawn with globalCompositeOperation = 'lighter'.
 */

const rgbCache = new Map<string, [number, number, number]>();

export function hexToRgb(hex: string): [number, number, number] {
  let c = rgbCache.get(hex);
  if (!c) {
    const n = parseInt(hex.slice(1), 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, c);
  }
  return c;
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a < 0 ? 0 : a > 1 ? 1 : a.toFixed(3)})`;
}

/** Mix a colour toward white. t = 0 → colour, 1 → white. */
export function whiten(hex: string, t: number): string {
  const [r, g, b] = hexToRgb(hex);
  const m = (v: number) => Math.round(v + (255 - v) * t);
  return '#' + ((1 << 24) | (m(r) << 16) | (m(g) << 8) | m(b)).toString(16).slice(1);
}

const spriteCache = new Map<string, HTMLCanvasElement>();

/** A soft glowing dot with a white-hot centre. Draw it at the size you want. */
export function glowSprite(color: string): HTMLCanvasElement {
  let c = spriteCache.get(color);
  if (c) return c;
  const s = 128;
  c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.08, rgba(whiten(color, 0.5), 1));
  grad.addColorStop(0.2, rgba(color, 0.75));
  grad.addColorStop(0.45, rgba(color, 0.22));
  grad.addColorStop(1, rgba(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  spriteCache.set(color, c);
  return c;
}

export function drawGlow(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, size: number, alpha = 1): void {
  if (alpha <= 0.003) return;
  ctx.globalAlpha = alpha > 1 ? 1 : alpha;
  ctx.drawImage(glowSprite(color), x - size / 2, y - size / 2, size, size);
  ctx.globalAlpha = 1;
}

const PASSES: [widthMul: number, alpha: number, white: number][] = [
  [7, 0.05, 0],
  [3.6, 0.12, 0],
  [1.8, 0.35, 0.1],
  [1, 0.9, 0.35],
  [0.4, 0.9, 1],
];

/** Stroke the current path as a neon tube. Call after building a path with beginPath/moveTo/lineTo. */
export function glowStroke(ctx: CanvasRenderingContext2D, color: string, width: number, intensity = 1): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [wm, a, white] of PASSES) {
    ctx.strokeStyle = rgba(white ? whiten(color, white) : color, a * intensity);
    ctx.lineWidth = width * wm;
    ctx.stroke();
  }
}

export function glowLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width: number, intensity = 1): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  glowStroke(ctx, color, width, intensity);
}

/** A glowing rounded rectangle centred on (cx, cy): stacked fills that grow and fade outward. */
export function glowRect(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, color: string, intensity = 1): void {
  const passes: [pad: number, alpha: number, white: number][] = [
    [w * 1.5, 0.05, 0],
    [w * 0.75, 0.1, 0],
    [w * 0.3, 0.28, 0.1],
    [0, 0.9, 0.3],
    [-w * 0.28, 0.85, 0.85],
  ];
  for (const [pad, a, white] of passes) {
    ctx.fillStyle = rgba(white ? whiten(color, white) : color, a * intensity);
    ctx.beginPath();
    ctx.roundRect(cx - w / 2 - pad, cy - h / 2 - pad, w + pad * 2, h + pad * 2, Math.max(1.5, 3 + pad));
    ctx.fill();
  }
}

export function glowRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, width: number, intensity = 1): void {
  if (r <= 0) return;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  glowStroke(ctx, color, width, intensity);
}
