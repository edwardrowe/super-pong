import { buzz } from '../../engine/audio';
import { drawGlow, glowLine, glowRect, glowRing, glowStroke, rgba, whiten } from '../../engine/glow';
import { SpringGrid } from '../../engine/grid';
import { MAX_LEVEL } from '../../engine/music';
import { Kind, Particles } from '../../engine/particles';
import { Shake } from '../../engine/shake';
import { WORLD_H, type Game, type GameContext, type Side, type View } from '../../engine/types';
import { serve, speedFrac, speedOf, stepBall, type Ball, type BallEvent, type Field, type Paddle } from './physics';
import { POWER, PowerSchedule, grownHeight, spawnPoint, touches } from './powerups';

// ---- look & tuning ---------------------------------------------------------

const COLOR = {
  player: ['#18f0ff', '#ff2bd6'] as const,
  playerName: ['CYAN', 'MAGENTA'] as const,
  white: '#ffffff',
  gold: '#ffd447',
  wall: '#4d5bff',
  bg: '#05050c',
};
// Particle palette indices.
const PAL = [COLOR.white, COLOR.player[0], COLOR.player[1], COLOR.gold, COLOR.wall];
const WHITE = 0;
const GOLD = 3;
const WALL = 4;
const pc = (s: Side) => (s === 0 ? 1 : 2);

const FONT = 'Futura, "Avenir Next", "Century Gothic", "Trebuchet MS", system-ui, sans-serif';
const WIN_SCORE = 7;
const STEP = 1 / 240;
const PADDLE = { w: 22.5, h: 170, fromEdge: 140, keySpeed: 1400 };
/** Goal lines sit just behind the paddles; the gutter outside them is room for fingers. */
const GOAL_FROM_EDGE = 105;
const BALL_R = 14;
const TRAIL_LEN = 40;
const SERVE_WINDUP = 0.85;

type Phase = 'intro' | 'serve' | 'play' | 'scored' | 'won';

interface PaddleState extends Paddle {
  squash: number;
  squashV: number;
  flash: number;
}

interface Popup {
  x: number;
  y: number;
  t: number;
  text: string;
  color: string;
}

/** A power-up waiting on the court. t = seconds since it appeared. */
interface PowerUp {
  x: number;
  y: number;
  t: number;
}

interface Ring {
  x: number;
  y: number;
  t: number;
  dur: number;
  maxR: number;
  color: string;
  width: number;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeOutBack = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;

export class SuperPong implements Game {
  private view: View;
  private field: Field & { goalL: number; goalR: number } = { w: 0, h: WORLD_H, goalL: 0, goalR: 0 };
  private paddles: [PaddleState, PaddleState];
  private ball: Ball = { x: 0, y: 0, vx: 0, vy: 0, r: BALL_R };
  private ballColor = COLOR.white;
  private ballCi = WHITE;
  private ballVisible = false;
  private ballScale = 0;
  private trail: { x: number; y: number }[] = [];

  private score: [number, number] = [0, 0];
  private scoreT: [number, number] = [99, 99];
  private phase: Phase = 'intro';
  private phaseT = 0;
  private firstIntro = true;
  private serveDir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
  private winner: Side = 0;

  private acc = 0;
  private hitstop = 0;
  private timeScale = 1;
  private time = 0;
  private flash = 0;
  private flashColor = COLOR.white;
  private fireworkT = 0;

  private schedule = new PowerSchedule();
  private power: PowerUp | null = null;
  /** Paddle growers each player has collected this match. */
  private grows: [number, number] = [0, 0];
  private growT: [number, number] = [99, 99];
  /** Who touched the ball last (they get any power-up it hits). */
  private lastHit: Side | -1 = -1;
  private popups: Popup[] = [];

  private events: BallEvent[] = [];
  private rings: Ring[] = [];
  private wallHits: { x: number; y: number; t: number }[] = [];
  private particles = new Particles(PAL, 4000);
  private grid = new SpringGrid(60, COLOR.wall);
  private shake = new Shake();
  private vignette: HTMLCanvasElement | null = null;

  constructor(private g: GameContext) {
    this.view = g.view;
    const mk = (): PaddleState => ({ x: 0, y: WORLD_H / 2, w: PADDLE.w, h: PADDLE.h, vy: 0, squash: 0, squashV: 0, flash: 0 });
    this.paddles = [mk(), mk()];
    this.resize(g.view);
    g.music.newMatch();
    this.enter('intro');
  }

  // ---- lifecycle -----------------------------------------------------------

  resize(view: View): void {
    const oldW = this.field.w;
    this.view = view;
    // Use the larger safe-area inset (camera cutout) on both sides so the gutters match and
    // the play area stays centred under the screen's halfway split.
    const inset = Math.max(view.inset.l, view.inset.r);
    this.field = { w: view.w, h: view.h, goalL: inset + GOAL_FROM_EDGE, goalR: view.w - inset - GOAL_FROM_EDGE };
    this.paddles[0].x = inset + PADDLE.fromEdge;
    this.paddles[1].x = view.w - inset - PADDLE.fromEdge;
    for (const p of this.paddles) p.y = clamp(p.y, p.h / 2, view.h - p.h / 2);
    if (oldW > 0 && this.phase === 'play') this.ball.x *= view.w / oldW;
    else this.ball.x = this.mid;
    this.trail.length = 0;
    this.grid.resize(this.field.goalR - this.field.goalL, view.h, this.field.goalL);
    this.vignette = makeVignette(view.w, view.h);
  }

  /** Centre of the play area (between the goal lines). */
  private get mid(): number {
    return (this.field.goalL + this.field.goalR) / 2;
  }

  onPress(_side: Side | -1): void {
    if (this.phase === 'won' && this.phaseT > 1.0) {
      this.score = [0, 0];
      this.scoreT = [99, 99];
      this.grows = [0, 0];
      this.growT = [99, 99];
      this.g.music.newMatch();
      this.serveDir = this.winner === 0 ? 1 : -1;
      this.enter('intro');
    } else if (this.phase === 'intro' && this.phaseT > 0.3) {
      this.enter('serve');
    }
  }

  private enter(phase: Phase): void {
    this.phase = phase;
    this.phaseT = 0;
    const { h } = this.field;
    const w2 = this.mid;
    switch (phase) {
      case 'intro':
        this.ballVisible = false;
        break;
      case 'serve':
        this.firstIntro = false;
        this.ballVisible = true;
        this.ballScale = 0;
        this.ballColor = COLOR.white;
        this.ballCi = WHITE;
        Object.assign(this.ball, { x: w2, y: h / 2, vx: 0, vy: 0 });
        this.trail.length = 0;
        this.lastHit = -1;
        this.schedule.startRally();
        this.g.sfx.charge(SERVE_WINDUP);
        break;
      case 'play':
        serve(this.ball, this.field, this.serveDir);
        this.acc = 0;
        this.g.sfx.serve();
        this.g.sfx.warp(0.3, 0);
        this.rings.push({ x: w2, y: h / 2, t: 0, dur: 0.4, maxR: 140, color: COLOR.white, width: 4 });
        this.particles.burst(w2, h / 2, { count: 30, color: [WHITE, GOLD], speed: [200, 600], life: [0.2, 0.5], drag: 3 });
        this.grid.impulse(w2, h / 2, 500, 260);
        break;
      case 'scored':
        this.ballVisible = false;
        this.fizzlePower();
        break;
      case 'won':
        this.fireworkT = 0.15;
        this.g.sfx.win();
        this.g.music.sweep(2.5);
        break;
    }
  }

  // ---- update --------------------------------------------------------------

  update(dt: number): void {
    this.time += dt;
    this.shake.update(dt);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    if (this.hitstop > 0) {
      // Freeze-frame: everything stops for a few frames to sell the impact.
      this.hitstop -= dt;
      return;
    }
    this.timeScale += (1 - this.timeScale) * (1 - Math.exp(-dt * 2.2));
    const sdt = dt * this.timeScale;

    this.updatePaddles(dt);
    this.phaseT += sdt;

    switch (this.phase) {
      case 'intro':
        if (this.phaseT > (this.firstIntro ? 2.0 : 0.9)) this.enter('serve');
        break;
      case 'serve': {
        this.ballScale = easeOutBack(Math.min(1, this.phaseT / 0.7));
        if (this.phaseT < 0.55) this.implode(this.mid, this.field.h / 2, dt);
        if (this.phaseT >= SERVE_WINDUP) this.enter('play');
        break;
      }
      case 'play':
        this.simulate(sdt);
        this.embers(dt);
        break;
      case 'scored':
        if (this.phaseT > 1.35) this.enter(this.score[0] >= WIN_SCORE || this.score[1] >= WIN_SCORE ? 'won' : 'serve');
        break;
      case 'won':
        this.fireworks(dt);
        break;
    }

    // The arrangement gains an instrument for every point the leader scores, peaking on the win screen.
    const top = Math.max(this.score[0], this.score[1]);
    this.g.music.setLevel(this.phase === 'won' ? MAX_LEVEL : Math.min(MAX_LEVEL - 1, 1 + top));
    this.particles.update(sdt);
    this.grid.update(sdt);
    for (const r of this.rings) r.t += sdt;
    this.rings = this.rings.filter((r) => r.t < r.dur);
    if (this.power) this.power.t += sdt;
    for (const p of this.popups) p.t += sdt;
    this.popups = this.popups.filter((p) => p.t < 1.1);
    this.growT[0] += dt;
    this.growT[1] += dt;
    for (const w of this.wallHits) w.t += sdt;
    this.wallHits = this.wallHits.filter((w) => w.t < 0.35);
    this.scoreT[0] += dt;
    this.scoreT[1] += dt;
  }

  private updatePaddles(dt: number): void {
    const { input } = this.g;
    for (const side of [0, 1] as const) {
      const p = this.paddles[side];
      // Grow (or shrink back, after a new match) smoothly toward the collected size.
      p.h += (grownHeight(PADDLE.h, this.grows[side]) - p.h) * (1 - Math.exp(-dt * 7));
      const prevY = p.y;
      const move = input.consumeDrag(side) / this.view.scale + input.keyAxis(side) * PADDLE.keySpeed * dt;
      p.y = clamp(p.y + move, p.h / 2, this.field.h - p.h / 2);
      const inst = (p.y - prevY) / Math.max(dt, 1e-3);
      p.vy += (inst - p.vy) * Math.min(1, dt * 20);
      // Squash-and-stretch spring.
      p.squashV += (-260 * p.squash - 13 * p.squashV) * dt;
      p.squash += p.squashV * dt;
      p.flash = Math.max(0, p.flash - dt * 4);
    }
  }

  private simulate(dt: number): void {
    this.acc += dt;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.events.length = 0;
      const goal = stepBall(this.ball, this.paddles, this.field, STEP, this.events);
      this.trail.push({ x: this.ball.x, y: this.ball.y });
      if (this.trail.length > TRAIL_LEN) this.trail.shift();
      for (const e of this.events) this.handle(e);
      const pw = this.power;
      if (!goal && pw && pw.t > 0.15 && this.lastHit !== -1 && touches(this.ball, pw.x, pw.y)) this.collect(this.lastHit, pw);
      if (goal) {
        this.acc = 0;
        break;
      }
      if (this.hitstop > 0) break;
    }
  }

  private handle(e: BallEvent): void {
    const { sfx } = this.g;
    const pan = (e.x / this.field.w) * 2 - 1;
    switch (e.type) {
      case 'paddle': {
        const p = this.paddles[e.side];
        const col = COLOR.player[e.side];
        const sf = speedFrac(e.speed);
        this.lastHit = e.side;
        if (this.schedule.onHit()) this.spawnPower();
        this.ballColor = col;
        this.ballCi = pc(e.side);
        p.squashV = 10 + sf * 8;
        p.flash = 1;
        const out = e.side === 0 ? 0 : Math.PI;
        this.particles.burst(e.x, e.y, { count: (16 + sf * 30) | 0, color: [pc(e.side), pc(e.side), WHITE], speed: [250, 750 + sf * 800], angle: out, spread: 2.3, life: [0.15, 0.45], drag: 4 });
        this.particles.burst(e.x, e.y, { count: 5, color: pc(e.side), kind: Kind.Dot, speed: [30, 160], angle: out, spread: 2, life: [0.25, 0.55], size: [24, 50], drag: 3 });
        this.rings.push({ x: e.x, y: e.y, t: 0, dur: 0.28, maxR: 70 + sf * 80, color: col, width: 3 });
        this.grid.impulse(e.x, e.y, 300 + sf * 450, 240);
        this.shake.add(0.2 + sf * 0.3);
        this.hitstop = 0.012 + sf * 0.05;
        sfx.paddle(sf, pan);
        sfx.warp(0.12 + sf * 0.35, pan);
        buzz((12 + sf * 25) | 0);
        break;
      }
      case 'wall': {
        this.particles.burst(e.x, e.y, { count: 10, color: [WALL, this.ballCi], speed: [150, 500], angle: e.top ? Math.PI / 2 : -Math.PI / 2, spread: 2.6, life: [0.1, 0.3], drag: 5 });
        this.wallHits.push({ x: e.x, y: e.y, t: 0 });
        this.grid.impulse(e.x, e.y, 180, 170);
        this.shake.add(0.08);
        sfx.wall(pan);
        sfx.warp(0.03, pan);
        break;
      }
      case 'goal': {
        const s = e.scorer;
        const ci = pc(s);
        const col = COLOR.player[s];
        this.score[s]++;
        this.scoreT[s] = 0;
        // Serve toward whoever conceded.
        this.serveDir = s === 0 ? 1 : -1;
        if (this.score[s] >= WIN_SCORE) this.winner = s;
        const gx = clamp(e.x, 0, this.field.w);
        const gy = clamp(e.y, 0, this.field.h);
        const into = e.x < this.mid ? 0 : Math.PI;
        this.particles.burst(gx, gy, { count: 280, color: [ci, ci, WHITE, GOLD], speed: [200, 1800], angle: into, spread: Math.PI * 1.3, life: [0.5, 1.4], drag: 1.6 });
        this.particles.burst(gx, gy, { count: 70, color: [ci, WHITE], kind: Kind.Dot, speed: [80, 900], angle: into, spread: Math.PI, life: [0.6, 1.6], size: [20, 60], drag: 2.2 });
        this.rings.push(
          { x: gx, y: gy, t: 0, dur: 0.55, maxR: 420, color: COLOR.white, width: 9 },
          { x: gx, y: gy, t: -0.08, dur: 0.9, maxR: 900, color: col, width: 5 },
          { x: gx, y: gy, t: -0.2, dur: 1.2, maxR: 1400, color: col, width: 3 },
        );
        this.grid.impulse(gx, gy, 2600, 650);
        this.shake.add(0.9);
        this.flash = 0.5;
        this.flashColor = col;
        this.hitstop = 0.11;
        this.timeScale = 0.2;
        this.trail.length = 0;
        sfx.goal(pan);
        sfx.warp(1, pan);
        this.g.music.sweep();
        buzz([45, 30, 80]);
        this.enter('scored');
        break;
      }
    }
  }

  // ---- power-ups -------------------------------------------------------------

  private spawnPower(): void {
    // One at a time, and none once both paddles are full size.
    if (this.power || Math.min(...this.grows) >= POWER.maxGrows) return;
    const { x, y } = spawnPoint(this.field, this.ball);
    this.power = { x, y, t: 0 };
    const pan = (x / this.field.w) * 2 - 1;
    this.rings.push({ x, y, t: 0, dur: 0.45, maxR: 120, color: COLOR.gold, width: 3 });
    this.particles.burst(x, y, { count: 24, color: [GOLD, WHITE], speed: [120, 420], life: [0.2, 0.5], drag: 4 });
    this.grid.impulse(x, y, 260, 200);
    this.g.sfx.powerSpawn(pan);
    this.g.sfx.warp(0.08, pan);
  }

  private collect(side: Side, pw: PowerUp): void {
    this.power = null;
    const maxed = this.grows[side] >= POWER.maxGrows;
    if (!maxed) {
      this.grows[side]++;
      this.growT[side] = 0;
    }
    const col = COLOR.player[side];
    const ci = pc(side);
    const p = this.paddles[side];
    const pan = (pw.x / this.field.w) * 2 - 1;
    this.particles.burst(pw.x, pw.y, { count: 90, color: [GOLD, GOLD, ci, WHITE], speed: [150, 900], life: [0.3, 0.8], drag: 2.5 });
    // A stream of sparks flies from the pickup to the paddle that earned it.
    for (let i = 0; i < 28; i++) {
      const life = 0.3 + Math.random() * 0.25;
      const tx = p.x + (Math.random() - 0.5) * 20;
      const ty = p.y + (Math.random() - 0.5) * p.h;
      const sx = pw.x + (Math.random() - 0.5) * 40;
      const sy = pw.y + (Math.random() - 0.5) * 40;
      this.particles.spawn(sx, sy, (tx - sx) / life, (ty - sy) / life, life, 3, Math.random() < 0.5 ? ci : GOLD, Kind.Streak, 0);
    }
    this.rings.push(
      { x: pw.x, y: pw.y, t: 0, dur: 0.4, maxR: 220, color: COLOR.gold, width: 5 },
      { x: p.x, y: p.y, t: -0.3, dur: 0.4, maxR: p.h * 0.9, color: col, width: 4 },
    );
    this.popups.push({ x: pw.x, y: pw.y - 60, t: 0, text: maxed ? 'MAX SIZE' : 'PADDLE UP', color: col });
    p.flash = 1;
    p.squashV = 14;
    this.grid.impulse(pw.x, pw.y, 700, 300);
    this.shake.add(0.3);
    this.g.sfx.powerUp(pan, maxed);
    this.g.sfx.warp(0.25, pan);
    buzz(30);
  }

  /** The point ended with a power-up still on court: it pops quietly. */
  private fizzlePower(): void {
    const pw = this.power;
    if (!pw) return;
    this.power = null;
    this.particles.burst(pw.x, pw.y, { count: 18, color: [GOLD, WHITE], speed: [60, 260], life: [0.2, 0.45], drag: 4 });
  }

  /** Particles rushing into the centre as the ball materialises. */
  private implode(x: number, y: number, dt: number): void {
    const n = Math.ceil(dt * 260);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 180 + Math.random() * 160;
      const life = 0.3 + Math.random() * 0.15;
      this.particles.spawn(x + Math.cos(a) * d, y + Math.sin(a) * d, (-Math.cos(a) * d) / life, (-Math.sin(a) * d) / life, life, 3, Math.random() < 0.5 ? WHITE : GOLD, Kind.Streak, 0);
    }
  }

  /** The ball sheds glowing embers, more as it speeds up. */
  private embers(dt: number): void {
    const sf = speedFrac(speedOf(this.ball));
    const n = Math.floor((10 + sf * 90) * dt + Math.random());
    for (let i = 0; i < n; i++) {
      this.particles.spawn(this.ball.x, this.ball.y, (Math.random() - 0.5) * 90, (Math.random() - 0.5) * 90, 0.25 + Math.random() * 0.3, 14 + Math.random() * 16, this.ballCi, Kind.Dot, 2);
    }
  }

  private fireworks(dt: number): void {
    this.fireworkT -= dt;
    if (this.fireworkT > 0 || this.phaseT > 6) return;
    this.fireworkT = 0.22 + Math.random() * 0.2;
    const { w, h, goalL, goalR } = this.field;
    const halfW = (goalR - goalL) / 2;
    const x = (this.winner === 0 ? goalL : this.mid) + halfW * (0.15 + Math.random() * 0.7);
    const y = h * (0.15 + Math.random() * 0.55);
    const ci = pc(this.winner);
    this.particles.burst(x, y, { count: 110, color: [ci, ci, WHITE, GOLD], speed: [80, 620], life: [0.7, 1.5], drag: 1.3, gravity: 380 });
    this.rings.push({ x, y, t: 0, dur: 0.45, maxR: 200, color: COLOR.player[this.winner], width: 4 });
    this.grid.impulse(x, y, 900, 320);
    this.shake.add(0.22);
    this.g.sfx.firework((x / w) * 2 - 1);
    this.g.sfx.warp(0.4, (x / w) * 2 - 1);
  }

  // ---- render --------------------------------------------------------------

  render(ctx: CanvasRenderingContext2D): void {
    const { w, h } = this.field;
    ctx.save();
    this.shake.apply(ctx, w / 2, h / 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = COLOR.bg;
    ctx.fillRect(-200, -200, w + 400, h + 400);
    ctx.globalCompositeOperation = 'lighter';

    this.grid.draw(ctx);
    this.drawArena(ctx);
    this.drawScores(ctx);
    this.drawTrail(ctx);
    this.particles.draw(ctx);
    for (const r of this.rings) {
      if (r.t < 0) continue;
      const f = r.t / r.dur;
      glowRing(ctx, r.x, r.y, r.maxR * easeOutCubic(f), r.color, r.width * (1 - f * 0.7), 1 - f);
    }
    this.drawPower(ctx);
    this.drawPaddles(ctx);
    if (this.ballVisible) this.drawBall(ctx);
    this.drawPopups(ctx);
    this.drawText(ctx);
    ctx.restore();

    ctx.globalCompositeOperation = 'source-over';
    if (this.vignette) ctx.drawImage(this.vignette, 0, 0, w, h);
    if (this.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(this.flashColor, this.flash * 0.45);
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  private drawArena(ctx: CanvasRenderingContext2D): void {
    const { w, h, goalL, goalR } = this.field;
    const m = this.mid;
    ctx.beginPath();
    for (let y = 18; y < h; y += 46) {
      ctx.moveTo(m, y);
      ctx.lineTo(m, Math.min(h - 18, y + 20));
    }
    glowStroke(ctx, '#7b86ff', 2.2, 0.35);
    // Gutters: a faint tint in each player's colour (brighter while their finger is down) and the goal line.
    for (const side of [0, 1] as const) {
      const col = COLOR.player[side];
      const touch = this.g.input.isTouching(side) ? 1 : 0;
      const x = side === 0 ? goalL : goalR;
      ctx.fillStyle = rgba(col, 0.022 + touch * 0.035);
      if (side === 0) ctx.fillRect(0, 0, goalL, h);
      else ctx.fillRect(goalR, 0, w - goalR, h);
      glowLine(ctx, x, 0, x, h, col, 1.4, 0.22 + touch * 0.15);
    }
    glowLine(ctx, 0, 3, w, 3, COLOR.wall, 3, 0.55);
    glowLine(ctx, 0, h - 3, w, h - 3, COLOR.wall, 3, 0.55);
    for (const hit of this.wallHits) {
      const f = 1 - hit.t / 0.35;
      drawGlow(ctx, whiten(COLOR.wall, 0.3), hit.x, hit.y, 260 * f, f);
    }
  }

  private drawScores(ctx: CanvasRenderingContext2D): void {
    const { h } = this.field;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const s of [0, 1] as const) {
      const t = this.scoreT[s];
      const pop = 1 + 0.9 * Math.exp(-5 * t) * Math.cos(15 * t);
      const bright = Math.exp(-3 * t);
      ctx.save();
      const q = (this.field.goalR - this.field.goalL) / 4;
      ctx.translate(this.mid + (s === 0 ? -q : q), h / 2);
      ctx.scale(pop, pop);
      ctx.font = `700 280px ${FONT}`;
      ctx.fillStyle = rgba(COLOR.player[s], 0.09 + 0.55 * bright);
      ctx.fillText(String(this.score[s]), 0, 12);
      ctx.restore();
      this.drawGrowPips(ctx, this.mid + (s === 0 ? -q : q), h / 2 + 180, s);
    }
  }

  /** Five diamonds under each score: one lights up per paddle grower collected. */
  private drawGrowPips(ctx: CanvasRenderingContext2D, cx: number, y: number, s: Side): void {
    const col = COLOR.player[s];
    const n = this.grows[s];
    const gap = 54;
    for (let i = 0; i < POWER.maxGrows; i++) {
      const x = cx + (i - (POWER.maxGrows - 1) / 2) * gap;
      const on = i < n;
      const newest = on && i === n - 1;
      const t = this.growT[s];
      const pop = newest ? 1 + 1.2 * Math.exp(-5 * t) * Math.abs(Math.cos(9 * t)) : 1;
      const r = 13 * pop;
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      if (on) {
        drawGlow(ctx, col, x, y, r * 6, newest ? 0.3 + 0.6 * Math.exp(-3 * t) : 0.3);
        ctx.fillStyle = whiten(col, 0.35);
        ctx.fill();
      } else {
        ctx.strokeStyle = rgba(col, 0.28);
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  private drawPower(ctx: CanvasRenderingContext2D): void {
    const pw = this.power;
    if (!pw) return;
    const s = easeOutBack(Math.min(1, pw.t / 0.35));
    const r = POWER.radius * s;
    if (r <= 0.5) return;
    const x = pw.x;
    const y = pw.y + Math.sin(this.time * 3) * 6;
    const pulse = 1 + 0.12 * Math.sin(this.time * 7);
    drawGlow(ctx, COLOR.gold, x, y, r * 6 * pulse, 0.32);
    drawGlow(ctx, COLOR.gold, x, y, r * 2.4, 0.5);
    // Two counter-rotating diamonds.
    for (const [spin, k, a] of [[1.3, 1, 0.95], [-0.8, 1.3, 0.35]]) {
      const rr = r * k;
      const ang = this.time * spin;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const t = ang + (i * Math.PI) / 2;
        const px = x + Math.cos(t) * rr;
        const py = y + Math.sin(t) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      glowStroke(ctx, COLOR.gold, 3.2, a);
    }
    // Icon: a vertical double arrow — "taller paddle".
    const a = r * 0.55;
    const head = a * 0.42;
    ctx.beginPath();
    ctx.moveTo(x, y - a);
    ctx.lineTo(x, y + a);
    ctx.moveTo(x - head, y - a + head);
    ctx.lineTo(x, y - a);
    ctx.lineTo(x + head, y - a + head);
    ctx.moveTo(x - head, y + a - head);
    ctx.lineTo(x, y + a);
    ctx.lineTo(x + head, y + a - head);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    glowStroke(ctx, '#ffffff', 3, 0.9);
  }

  private drawPopups(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 44px ${FONT}`;
    for (const p of this.popups) {
      const a = Math.min(1, p.t / 0.08) * clamp((1.1 - p.t) / 0.35, 0, 1);
      const s = 1 + 0.4 * Math.exp(-8 * p.t);
      ctx.save();
      ctx.translate(p.x, p.y - easeOutCubic(Math.min(1, p.t / 1.1)) * 70);
      ctx.scale(s, s);
      neonText(ctx, p.text, 0, 0, whiten(p.color, 0.4), p.color, a);
      ctx.restore();
    }
  }

  private drawTrail(ctx: CanvasRenderingContext2D): void {
    const t = this.trail;
    if (t.length < 2 || !this.ballVisible) return;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(t[0].x, t[0].y);
    for (let i = 1; i < t.length; i++) ctx.lineTo(t[i].x, t[i].y);
    ctx.strokeStyle = rgba(this.ballColor, 0.08);
    ctx.lineWidth = BALL_R * 5;
    ctx.stroke();
    for (let i = 1; i < t.length; i++) {
      const f = i / (t.length - 1);
      ctx.beginPath();
      ctx.moveTo(t[i - 1].x, t[i - 1].y);
      ctx.lineTo(t[i].x, t[i].y);
      ctx.strokeStyle = rgba(whiten(this.ballColor, f * 0.5), f * f * 0.85);
      ctx.lineWidth = BALL_R * 1.9 * f;
      ctx.stroke();
    }
  }

  private drawPaddles(ctx: CanvasRenderingContext2D): void {
    for (const side of [0, 1] as const) {
      const p = this.paddles[side];
      const col = COLOR.player[side];
      const sx = Math.max(0.5, 1 + 0.9 * p.squash);
      const sy = Math.max(0.6, 1 - 0.14 * p.squash);
      const touch = this.g.input.isTouching(side) ? 0.15 : 0;
      drawGlow(ctx, col, p.x, p.y, p.h * 1.5, 0.1 + p.flash * 0.35 + touch * 0.3);
      glowRect(ctx, p.x, p.y, p.w * 0.72 * sx, p.h * sy, p.flash > 0 ? whiten(col, p.flash * 0.7) : col, 0.85 + p.flash * 0.5 + touch);
    }
  }

  private drawBall(ctx: CanvasRenderingContext2D): void {
    const { x, y } = this.ball;
    const r = BALL_R * this.ballScale;
    if (r <= 0.1) return;
    const pulse = 1 + 0.1 * Math.sin(this.time * 22);
    drawGlow(ctx, this.ballColor, x, y, r * 16 * pulse, 0.5);
    drawGlow(ctx, this.ballColor, x, y, r * 5.5, 0.95);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawText(ctx: CanvasRenderingContext2D): void {
    const { h } = this.field;
    const w = this.mid * 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this.phase === 'intro') {
      const dur = this.firstIntro ? 2.0 : 0.9;
      const a = Math.min(1, this.phaseT / 0.25) * clamp((dur - this.phaseT) / 0.3, 0, 1);
      if (this.firstIntro) {
        const s = 1 + 0.25 * (1 - easeOutCubic(Math.min(1, this.phaseT / 0.5)));
        ctx.save();
        ctx.translate(w / 2, h / 2 - 40);
        ctx.scale(s, s);
        ctx.font = `700 150px ${FONT}`;
        const grad = ctx.createLinearGradient(-420, 0, 420, 0);
        grad.addColorStop(0, COLOR.player[0]);
        grad.addColorStop(1, COLOR.player[1]);
        neonText(ctx, 'SUPER PONG', 0, 0, grad, '#8f6bff', a);
        ctx.restore();
      }
      ctx.font = `600 48px ${FONT}`;
      neonText(ctx, `FIRST TO ${WIN_SCORE}`, w / 2, this.firstIntro ? h / 2 + 80 : h / 2, COLOR.gold, COLOR.gold, a);
    } else if (this.phase === 'won') {
      const col = COLOR.player[this.winner];
      const a = Math.min(1, this.phaseT / 0.3);
      const s = 1 + 0.06 * Math.sin(this.time * 5);
      ctx.save();
      ctx.translate(w / 2, h / 2 - 30);
      ctx.scale(s, s);
      ctx.font = `700 130px ${FONT}`;
      neonText(ctx, `${COLOR.playerName[this.winner]} WINS`, 0, 0, whiten(col, 0.3), col, a);
      ctx.restore();
      if (this.phaseT > 1.0) {
        ctx.font = `600 40px ${FONT}`;
        neonText(ctx, 'TAP TO PLAY AGAIN', w / 2, h / 2 + 90, '#ffffff', '#9aa4ff', 0.55 + 0.45 * Math.sin(this.time * 4));
      }
    }
  }
}

function neonText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string | CanvasGradient, glow: string, alpha: number): void {
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  ctx.shadowColor = glow;
  ctx.shadowBlur = 40;
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillText(text, x, y);
  ctx.globalAlpha = 1;
}

function makeVignette(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = Math.max(1, Math.round((256 * h) / w));
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, c.height / 2, 60, 128, c.height / 2, 190);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.6)');
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}
