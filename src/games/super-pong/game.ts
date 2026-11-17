import { buzz } from '../../engine/audio';
import { drawGlow, glowLine, glowRect, glowRing, glowStroke, rgba, whiten } from '../../engine/glow';
import { SpringGrid } from '../../engine/grid';
import { MAX_LEVEL } from '../../engine/music';
import { Kind, Particles } from '../../engine/particles';
import { Shake } from '../../engine/shake';
import { WORLD_H, type Game, type GameContext, type Side, type View } from '../../engine/types';
import { PHYS, brake, serve, speedFrac, speedOf, stepBall, type Ball, type BallEvent, type Field, type Paddle, type PhysOptions } from './physics';
import { POWER, PowerSchedule, grownHeight, spawnPoint, touches } from './powerups';
import { ITEMS, ITEM_SLOTS, Inventory, SLOW, type ItemId } from './items';
import { BOMB, addHole, blastPaddle, launchVelocity, solidPieces } from './bombs';

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
const PAL = [COLOR.white, COLOR.player[0], COLOR.player[1], COLOR.gold, COLOR.wall, ITEMS.slow.color, BOMB.color, '#ff9a3b'];
const WHITE = 0;
const GOLD = 3;
const WALL = 4;
const ICE = 5;
const RED = 6;
const FIRE = 7;
const FIRE_COLOR = '#ff9a3b';
/** Item slot size (world units); the slots stack up from the bottom of each finger gutter. */
const SLOT = 84;
const SLOT_GAP = 14;
/** Keyboard: use the item in each slot (bottom slot first). */
const ITEM_KEY = [
  ['KeyD', 'KeyA'],
  ['ArrowLeft', 'ArrowRight'],
] as const;
const ITEM_KEY_LABEL = [
  ['D', 'A'],
  ['←', '→'],
] as const;
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
  kind: 'grow' | 'bomb';
  x: number;
  y: number;
  t: number;
}

/** A bomb ball: winding up on its owner's paddle, then flying at the other player. */
interface Bomb {
  owner: Side;
  ball: Ball;
  charging: boolean;
  /** Seconds since it started charging, or since launch. */
  t: number;
  /** Beep timer (beeps speed up as it closes in). */
  beep: number;
  trail: { x: number; y: number }[];
  dead: boolean;
}

/** A chunk of an exploded paddle. */
interface Debris {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  va: number;
  w: number;
  h: number;
  t: number;
  life: number;
  color: string;
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
  /** Visual rotation of the spin marks around the ball. */
  private ballAngle = 0;
  private phys: PhysOptions = { spin: false };
  private items = new Inventory();
  /** Centre of each player's item slots (world units), bottom slot first. */
  private slots: { x: number; y: number }[][] = [[], []];
  private slotFlash: number[][] = [new Array(ITEM_SLOTS).fill(0), new Array(ITEM_SLOTS).fill(0)];
  private bombs: Bomb[] = [];
  private bombEvents: BallEvent[] = [];
  /** Bombs explode at the screen edges (inside the camera cutout). */
  private bombField = { w: 0, h: WORLD_H, goalL: 0, goalR: 0 };
  /** Seconds of slowdown braking left. */
  private braking = 0;
  private offButton: () => void;
  private coarse = matchMedia('(pointer: coarse)').matches;

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
  /** Paddles blown apart (by a bomb until the next point, by the winning goal until the rematch). */
  private broken: [boolean, boolean] = [false, false];
  private debris: Debris[] = [];

  private events: BallEvent[] = [];
  private rings: Ring[] = [];
  private wallHits: { x: number; y: number; t: number }[] = [];
  private particles = new Particles(PAL, 4000);
  private grid = new SpringGrid(60, COLOR.wall);
  private shake = new Shake();
  private vignette: HTMLCanvasElement | null = null;

  constructor(private g: GameContext) {
    this.view = g.view;
    const mk = (): PaddleState => ({ x: 0, y: WORLD_H / 2, w: PADDLE.w, h: PADDLE.h, vy: 0, squash: 0, squashV: 0, flash: 0, holes: [], gone: false });
    this.paddles = [mk(), mk()];
    this.offButton = g.input.onButton((id) => {
      const m = /^item(\d)-(\d)$/.exec(id);
      if (m) this.useItem(Number(m[1]) as Side, Number(m[2]));
    });
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
    this.bombField = { w: view.w, h: view.h, goalL: inset, goalR: view.w - inset };
    // Item slots: stacked at the bottom of each gutter, clear of the camera cutout and home bar.
    const sy = view.h - Math.max(view.inset.b, 0) - SLOT / 2 - 22;
    const xs = [(inset + this.field.goalL) / 2, (this.field.goalR + view.w - inset) / 2];
    for (const side of [0, 1] as const) {
      this.slots[side] = Array.from({ length: ITEM_SLOTS }, (_, i) => ({ x: xs[side], y: sy - i * (SLOT + SLOT_GAP) }));
    }
    this.g.input.setButtons(
      ([0, 1] as const).flatMap((side) =>
        this.slots[side].map((sl, i) => ({
          id: `item${side}-${i}`,
          x: (sl.x - SLOT / 2) * view.scale,
          y: (sl.y - SLOT / 2) * view.scale,
          w: SLOT * view.scale,
          h: SLOT * view.scale,
        })),
      ),
    );
  }

  dispose(): void {
    this.offButton();
    this.g.input.setButtons([]);
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
      this.items.clear();
      this.fizzlePower();
      this.g.music.newMatch();
      this.serveDir = this.winner === 0 ? 1 : -1;
      this.clearBombs();
      this.repairPaddles();
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
        this.braking = 0;
        this.clearBombs();
        this.repairPaddles();
        this.schedule.startRally();
        // Everyone gets a slowdown each point (it doesn't stack).
        for (const side of [0, 1] as const) {
          if (!this.items.has(side, 'slow') && this.items.give(side, 'slow')) this.flashSlotOf(side, 'slow', 0.6);
        }
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

    this.phys.spin = this.g.settings.get('spin');
    for (const side of [0, 1] as const) {
      for (let i = 0; i < ITEM_SLOTS; i++) {
        if (this.g.input.consumeKey(ITEM_KEY[side][i])) this.useItem(side, i);
        this.slotFlash[side][i] = Math.max(0, this.slotFlash[side][i] - dt * 2.5);
      }
    }
    this.updatePaddles(dt);
    this.phaseT += sdt;
    this.ballAngle += (this.ball.spin ?? 0) * 7 * sdt;

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
        this.chargeBombs(sdt);
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
    if (this.debris.length) this.updateDebris(sdt);
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
      if (this.braking > 0) {
        brake(this.ball, SLOW.toSpeed, SLOW.rate, STEP);
        this.braking -= STEP;
      }
      const goal = stepBall(this.ball, this.paddles, this.field, STEP, this.events, this.phys);
      this.trail.push({ x: this.ball.x, y: this.ball.y });
      if (this.trail.length > TRAIL_LEN) this.trail.shift();
      for (const e of this.events) this.handle(e);
      if (!goal && this.bombs.length) this.stepBombs();
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
        const spin = Math.abs(e.spin) / PHYS.maxSpin;
        if (spin > 0.2) {
          // A curling spray of sparks that shows which way it will bend.
          const bend = Math.sign(e.spin) * (e.side === 0 ? 1 : -1);
          this.particles.burst(e.x, e.y, { count: (10 + spin * 30) | 0, color: [GOLD, WHITE, pc(e.side)], speed: [300, 900], angle: out + bend * 0.7, spread: 0.7, life: [0.2, 0.45], drag: 3 });
          sfx.spin(spin, pan);
        }
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
        this.clearBombs();
        if (this.score[s] >= WIN_SCORE) this.explodePaddle(s === 0 ? 1 : 0, true);
        this.enter('scored');
        break;
      }
    }
  }

  // ---- power-ups -------------------------------------------------------------

  private spawnPower(): void {
    if (this.power) return; // one at a time
    // About a third are bomb balls (if they're switched on); growers stop once both paddles are full.
    const bombsOn = this.g.settings.get('bombPickups');
    const growFull = Math.min(...this.grows) >= POWER.maxGrows;
    if (growFull && !bombsOn) return;
    const kind = bombsOn && (growFull || Math.random() < 0.35) ? 'bomb' : 'grow';
    const { x, y } = spawnPoint(this.field, this.ball);
    this.power = { kind, x, y, t: 0 };
    const pan = (x / this.field.w) * 2 - 1;
    const col = kind === 'bomb' ? BOMB.color : COLOR.gold;
    this.rings.push({ x, y, t: 0, dur: 0.45, maxR: 120, color: col, width: 3 });
    this.particles.burst(x, y, { count: 24, color: [kind === 'bomb' ? RED : GOLD, WHITE], speed: [120, 420], life: [0.2, 0.5], drag: 4 });
    this.grid.impulse(x, y, 260, 200);
    this.g.sfx.powerSpawn(pan);
    this.g.sfx.warp(0.08, pan);
  }

  /** Power-up kinds the Debug screen can set, with the most a player can hold. */
  readonly powerUps = [
    { id: 'grow', name: 'Paddle grower', max: POWER.maxGrows },
    { id: 'slow', name: 'Slowdown', max: ITEM_SLOTS, slot: true },
    { id: 'bomb', name: 'Bomb ball', max: ITEM_SLOTS, slot: true },
  ];
  /** Item slots each player has (slot power-ups share them). */
  readonly itemSlots = ITEM_SLOTS;

  powerUpCount(side: Side, id: string): number {
    if (id === 'grow') return this.grows[side];
    return this.items.slots[side].filter((it) => it === id).length;
  }

  /**
   * Debug: set how many of a power-up a player has. Extra ones arrive with the usual pickup show
   * (sparks come from mid-court); removed ones just go (the paddle shrinks back smoothly).
   */
  setPowerUps(side: Side, id: string, count: number): void {
    const kind = this.powerUps.find((k) => k.id === id);
    if (!kind) return;
    const target = Math.max(0, Math.min(kind.max, Math.round(count)));
    if (id === 'grow') {
      const p = this.paddles[side];
      const x = p.x + (side === 0 ? 1 : -1) * 260;
      while (this.grows[side] < target) this.grow(side, x, p.y, this.grows[side] === target - 1);
      if (this.grows[side] > target) this.grows[side] = target;
      return;
    }
    const item = id as ItemId;
    while (this.powerUpCount(side, id) < target && this.items.give(side, item)) this.flashSlotOf(side, item, 1);
    while (this.powerUpCount(side, id) > target) this.items.take(side, this.items.slots[side].indexOf(item));
  }

  private collect(side: Side, pw: PowerUp): void {
    this.power = null;
    if (pw.kind === 'bomb') {
      this.pickUpItem(side, 'bomb', pw.x, pw.y);
      return;
    }
    if (this.grows[side] < POWER.maxGrows) {
      this.grow(side, pw.x, pw.y, true);
      return;
    }
    // Already full size: the ball still takes it, but nothing happens.
    this.particles.burst(pw.x, pw.y, { count: 30, color: [GOLD, WHITE], speed: [100, 500], life: [0.2, 0.5], drag: 3 });
    this.rings.push({ x: pw.x, y: pw.y, t: 0, dur: 0.3, maxR: 110, color: COLOR.gold, width: 3 });
    this.popups.push({ x: pw.x, y: pw.y - 60, t: 0, text: 'MAX SIZE', color: COLOR.player[side] });
    this.g.sfx.powerUp((pw.x / this.field.w) * 2 - 1, true);
  }

  /** One paddle grower for `side`; sparks fly from (x, y) to the paddle. The fifth fuses it. */
  private grow(side: Side, x: number, y: number, popup: boolean): void {
    this.grows[side]++;
    this.growT[side] = 0;
    const max = this.grows[side] >= POWER.maxGrows;
    const col = COLOR.player[side];
    const ci = pc(side);
    const p = this.paddles[side];
    const pan = (x / this.field.w) * 2 - 1;
    this.particles.burst(x, y, { count: 90, color: [GOLD, GOLD, ci, WHITE], speed: [150, 900], life: [0.3, 0.8], drag: 2.5 });
    // A stream of sparks flies from the pickup to the paddle that earned it.
    for (let i = 0; i < 28; i++) {
      const life = 0.3 + Math.random() * 0.25;
      const tx = p.x + (Math.random() - 0.5) * 20;
      const ty = p.y + (Math.random() - 0.5) * p.h;
      const sx = x + (Math.random() - 0.5) * 40;
      const sy = y + (Math.random() - 0.5) * 40;
      this.particles.spawn(sx, sy, (tx - sx) / life, (ty - sy) / life, life, 3, Math.random() < 0.5 ? ci : GOLD, Kind.Streak, 0);
    }
    this.rings.push(
      { x, y, t: 0, dur: 0.4, maxR: 220, color: COLOR.gold, width: 5 },
      { x: p.x, y: p.y, t: -0.3, dur: 0.4, maxR: p.h * 0.9, color: col, width: 4 },
    );
    if (max) {
      // Fusing into one big paddle: a white-hot flash and a bigger shockwave.
      this.rings.push(
        { x: p.x, y: p.y, t: -0.35, dur: 0.6, maxR: 420, color: COLOR.white, width: 7 },
        { x: p.x, y: p.y, t: -0.45, dur: 0.9, maxR: 700, color: col, width: 4 },
      );
      this.particles.burst(p.x, p.y, { count: 120, color: [ci, ci, WHITE], speed: [200, 1200], life: [0.3, 0.9], drag: 2 });
      this.grid.impulse(p.x, p.y, 1400, 420);
      this.shake.add(0.5);
      this.g.sfx.warp(0.6, (p.x / this.field.w) * 2 - 1);
    }
    if (popup) this.popups.push({ x, y: y - 60, t: 0, text: max ? 'MAX SIZE' : 'PADDLE UP', color: col });
    p.flash = 1;
    p.squashV = max ? 22 : 14;
    this.grid.impulse(x, y, 700, 300);
    this.shake.add(0.3);
    this.g.sfx.powerUp(pan, false);
    this.g.sfx.warp(0.25, pan);
    buzz(max ? [30, 40, 60] : 30);
  }

  // ---- items -----------------------------------------------------------------

  /** Fire the item in a player's slot. Only while the ball is live; otherwise they keep it. */
  private useItem(side: Side, slot: number): void {
    if (this.phase !== 'play') return;
    const item = this.items.slots[side][slot];
    if (!item) return;
    if (item === 'bomb' && this.broken[side]) return; // nothing to launch it from
    this.items.take(side, slot);
    this.slotFlash[side][slot] = 1;
    if (item === 'slow') this.slowdown(side, slot);
    else if (item === 'bomb') this.startBomb(side);
  }

  /** Flash whichever slot holds this item (after it was given). */
  private flashSlotOf(side: Side, item: ItemId, amount: number): void {
    const i = this.items.slots[side].lastIndexOf(item);
    if (i >= 0) this.slotFlash[side][i] = amount;
  }

  /** The ball picked up an item: it goes in the player's first free slot (if they have one). */
  private pickUpItem(side: Side, item: ItemId, x: number, y: number): void {
    const col = ITEMS[item].color;
    const pan = (x / this.field.w) * 2 - 1;
    if (!this.items.give(side, item)) {
      this.particles.burst(x, y, { count: 30, color: [RED, WHITE], speed: [100, 500], life: [0.2, 0.5], drag: 3 });
      this.popups.push({ x, y: y - 60, t: 0, text: 'SLOTS FULL', color: COLOR.player[side] });
      this.g.sfx.powerUp(pan, true);
      return;
    }
    this.flashSlotOf(side, item, 1);
    const sl = this.slots[side][this.items.slots[side].lastIndexOf(item)];
    this.particles.burst(x, y, { count: 80, color: [RED, RED, FIRE, WHITE], speed: [150, 850], life: [0.3, 0.8], drag: 2.5 });
    for (let i = 0; i < 26; i++) {
      const life = 0.3 + Math.random() * 0.25;
      const sx = x + (Math.random() - 0.5) * 40;
      const sy = y + (Math.random() - 0.5) * 40;
      this.particles.spawn(sx, sy, (sl.x - sx) / life, (sl.y - sy) / life, life, 3, Math.random() < 0.5 ? RED : FIRE, Kind.Streak, 0);
    }
    this.rings.push({ x, y, t: 0, dur: 0.4, maxR: 220, color: col, width: 5 });
    this.popups.push({ x, y: y - 60, t: 0, text: ITEMS[item].name.toUpperCase(), color: col });
    this.grid.impulse(x, y, 700, 300);
    this.shake.add(0.3);
    this.g.sfx.powerUp(pan, false);
    this.g.sfx.warp(0.25, pan);
    buzz(30);
  }

  // ---- bomb ball -------------------------------------------------------------

  /** Where a bomb sits while it winds up: just off the front of its owner's paddle. */
  private bombDock(side: Side): { x: number; y: number } {
    const p = this.paddles[side];
    return { x: p.x + (side === 0 ? 1 : -1) * (p.w / 2 + BOMB.r + 8), y: p.y };
  }

  private startBomb(side: Side): void {
    const { x, y } = this.bombDock(side);
    this.bombs.push({ owner: side, ball: { x, y, vx: 0, vy: 0, r: BOMB.r, spin: 0 }, charging: true, t: 0, beep: 0, trail: [], dead: false });
    this.g.sfx.charge(BOMB.charge);
  }

  /** Charging bombs ride on their paddle, sucking in sparks, then launch. */
  private chargeBombs(dt: number): void {
    for (const b of this.bombs) {
      if (!b.charging) continue;
      if (this.broken[b.owner]) {
        b.dead = true;
        continue;
      }
      b.t += dt;
      const { x, y } = this.bombDock(b.owner);
      b.ball.x = x;
      b.ball.y = y;
      const n = Math.ceil(dt * 200);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = 90 + Math.random() * 90;
        const life = 0.2 + Math.random() * 0.12;
        this.particles.spawn(x + Math.cos(a) * d, y + Math.sin(a) * d, (-Math.cos(a) * d) / life, (-Math.sin(a) * d) / life, life, 3, Math.random() < 0.5 ? RED : FIRE, Kind.Streak, 0);
      }
      if (b.t >= BOMB.charge) this.launchBomb(b);
    }
    this.bombs = this.bombs.filter((b) => !b.dead);
  }

  /** Off it goes at serve speed, carrying the paddle's movement (and spin, if that's on). */
  private launchBomb(b: Bomb): void {
    const side = b.owner;
    const p = this.paddles[side];
    const dir = side === 0 ? 1 : -1;
    const v = launchVelocity(dir, p.vy);
    b.charging = false;
    b.t = 0;
    b.ball.vx = v.vx;
    b.ball.vy = v.vy;
    b.ball.spin = this.phys.spin ? clamp(p.vy * PHYS.spinPerPaddleSpeed, -PHYS.maxSpin, PHYS.maxSpin) * dir : 0;
    const { x, y } = b.ball;
    const pan = (x / this.field.w) * 2 - 1;
    this.rings.push({ x, y, t: 0, dur: 0.35, maxR: 130, color: BOMB.color, width: 4 });
    this.particles.burst(x, y, { count: 40, color: [RED, FIRE, WHITE], speed: [200, 700], angle: dir > 0 ? 0 : Math.PI, spread: 1.6, life: [0.2, 0.5], drag: 3 });
    this.grid.impulse(x, y, 500, 240);
    this.shake.add(0.25);
    p.squashV = -12;
    p.flash = 1;
    this.g.sfx.serve();
    this.g.sfx.warp(0.3, pan);
  }

  /** One physics step for flying bombs (runs alongside the ball). */
  private stepBombs(): void {
    for (const b of this.bombs) {
      if (b.charging || b.dead) continue;
      b.t += STEP;
      this.bombEvents.length = 0;
      const landed = stepBall(b.ball, this.paddles, this.bombField, STEP, this.bombEvents, this.phys);
      b.trail.push({ x: b.ball.x, y: b.ball.y });
      if (b.trail.length > 24) b.trail.shift();
      for (const e of this.bombEvents) {
        if (e.type === 'paddle') this.bombBlocked(b, e.side, e.x, e.y);
        else if (e.type === 'wall') {
          this.particles.burst(e.x, e.y, { count: 10, color: [RED, FIRE], speed: [150, 450], angle: e.top ? Math.PI / 2 : -Math.PI / 2, spread: 2.4, life: [0.1, 0.3], drag: 5 });
          this.g.sfx.wall((e.x / this.field.w) * 2 - 1);
        }
      }
      if (!b.dead && (landed || b.t > BOMB.maxLife)) {
        const x = clamp(b.ball.x, this.bombField.goalL, this.bombField.goalR);
        this.bombBlast(b, x, b.ball.y);
      }
      // Beeps speed up as it closes in on the far edge.
      const target = b.owner === 0 ? this.bombField.goalR : this.bombField.goalL;
      const close = 1 - clamp(Math.abs(target - b.ball.x) / (this.bombField.goalR - this.bombField.goalL), 0, 1);
      b.beep += STEP * (2.5 + close * close * 12);
      if (b.beep >= 1 && !b.dead) {
        b.beep -= 1;
        this.g.sfx.bombTick((b.ball.x / this.field.w) * 2 - 1);
      }
    }
    this.bombs = this.bombs.filter((b) => !b.dead);
  }

  /** Blocked it: the bomb goes off on the paddle, and the paddle goes with it. */
  private bombBlocked(b: Bomb, side: Side, x: number, y: number): void {
    b.dead = true;
    this.bombFlash(x, y, 0.7);
    this.explodePaddle(side, false);
  }

  /** Dodged it: it explodes where it hits the back edge, holing (or destroying) paddles in reach. */
  private bombBlast(b: Bomb, x: number, y: number): void {
    b.dead = true;
    this.bombFlash(x, y, 1);
    this.rings.push({ x, y, t: 0, dur: 0.45, maxR: BOMB.blast, color: FIRE_COLOR, width: 10 });
    for (const side of [0, 1] as const) {
      if (this.broken[side]) continue;
      const p = this.paddles[side];
      const hit = blastPaddle(p, x, y, BOMB.blast);
      if (hit.core) this.explodePaddle(side, false);
      else if (hit.hole) this.blastHole(side, hit.hole.lo, hit.hole.hi);
    }
  }

  /** The fireball itself (shared by blocked and dodged bombs). */
  private bombFlash(x: number, y: number, size: number): void {
    const pan = (x / this.field.w) * 2 - 1;
    this.particles.burst(x, y, { count: (260 * size) | 0, color: [RED, FIRE, FIRE, WHITE, GOLD], speed: [150, 1500 * size], life: [0.4, 1.3], drag: 1.8 });
    this.particles.burst(x, y, { count: (60 * size) | 0, color: [FIRE, RED, WHITE], kind: Kind.Dot, speed: [60, 700], life: [0.5, 1.4], size: [24, 70], drag: 2, gravity: -120 });
    this.rings.push(
      { x, y, t: 0, dur: 0.35, maxR: 260 * size, color: COLOR.white, width: 10 },
      { x, y, t: -0.06, dur: 0.8, maxR: 700 * size, color: BOMB.color, width: 5 },
    );
    this.grid.impulse(x, y, 3200 * size, 600);
    this.shake.add(0.8 * size);
    this.flash = Math.max(this.flash, 0.35 * size);
    this.flashColor = BOMB.color;
    this.hitstop = Math.max(this.hitstop, 0.06);
    this.g.sfx.blast(pan);
    this.g.sfx.warp(0.8 * size, pan);
    buzz([50, 30, 70]);
  }

  /** Cut a hole in a paddle (paddle-local lo..hi), with chunks of it flying off. */
  private blastHole(side: Side, lo: number, hi: number): void {
    const p = this.paddles[side];
    addHole(p.holes!, { lo, hi });
    const away = side === 0 ? 1 : -1;
    const chunks = Math.max(1, Math.round((hi - lo) / 22));
    for (let i = 0; i < chunks; i++) {
      const y = p.y + lo + ((hi - lo) * (i + 0.5)) / chunks;
      this.debris.push({
        x: p.x,
        y,
        vx: away * (300 + Math.random() * 700),
        vy: (Math.random() - 0.6) * 900,
        a: 0,
        va: (Math.random() - 0.5) * 20,
        w: p.w * 0.7,
        h: ((hi - lo) / chunks) * 0.8,
        t: 0,
        life: 1.6 + Math.random() * 0.8,
        color: COLOR.player[side],
      });
    }
    for (const edge of [lo, hi]) {
      if (Math.abs(edge) < p.h / 2 - 1) this.particles.burst(p.x, p.y + edge, { count: 16, color: [FIRE, WHITE, pc(side)], speed: [100, 500], life: [0.2, 0.6], drag: 3 });
    }
    p.flash = 1;
    p.squashV = 12;
  }

  /** The point is over: charging bombs are refunded, flying ones fizzle. */
  private clearBombs(): void {
    for (const b of this.bombs) {
      if (b.charging) this.items.give(b.owner, 'bomb');
      else this.particles.burst(b.ball.x, b.ball.y, { count: 20, color: [RED, WHITE], speed: [60, 300], life: [0.2, 0.5], drag: 4 });
    }
    this.bombs.length = 0;
  }

  /** Brake the ball back to serve speed: a time-freeze ripple, ice sparks, a tape-stop dive. */
  private slowdown(side: Side, slot: number): void {
    this.braking = SLOW.duration;
    this.timeScale = 0.35;
    const { x, y } = this.ball;
    const ice = ITEMS.slow.color;
    const pan = (x / this.field.w) * 2 - 1;
    this.rings.push(
      { x, y, t: 0, dur: 0.5, maxR: 260, color: ice, width: 6 },
      { x, y, t: -0.1, dur: 0.7, maxR: 520, color: ice, width: 3 },
      { x, y, t: -0.2, dur: 0.9, maxR: 820, color: COLOR.white, width: 2 },
    );
    this.particles.burst(x, y, { count: 70, color: [ICE, ICE, WHITE], speed: [100, 700], life: [0.4, 1.0], drag: 5 });
    // Frost streams from the slot that fired it to the ball.
    const sl = this.slots[side][slot];
    for (let i = 0; i < 24; i++) {
      const life = 0.25 + Math.random() * 0.2;
      const tx = x + (Math.random() - 0.5) * 30;
      const ty = y + (Math.random() - 0.5) * 30;
      this.particles.spawn(sl.x, sl.y, (tx - sl.x) / life, (ty - sl.y) / life, life, 3, Math.random() < 0.6 ? ICE : WHITE, Kind.Streak, 0);
    }
    this.popups.push({ x, y: y - 70, t: 0, text: 'SLOWDOWN', color: ice });
    this.grid.impulse(x, y, -900, 420);
    this.flash = 0.25;
    this.flashColor = ice;
    this.shake.add(0.25);
    this.g.sfx.slowdown(pan);
    this.g.sfx.warp(0.45, pan);
    buzz(40);
  }

  /** A new match started with a power-up still on court: it pops quietly. */
  private fizzlePower(): void {
    const pw = this.power;
    if (!pw) return;
    this.power = null;
    this.particles.burst(pw.x, pw.y, { count: 18, color: [pw.kind === 'bomb' ? RED : GOLD, WHITE], speed: [60, 260], life: [0.2, 0.45], drag: 4 });
  }

  // ---- match point --------------------------------------------------------------

  /**
   * Blow a paddle apart: chunks, fire, a shockwave. `big` is the winning goal (the whole court
   * shakes and time nearly stops); a bomb kill is a little smaller.
   */
  private explodePaddle(side: Side, big: boolean): void {
    const p = this.paddles[side];
    const col = COLOR.player[side];
    const ci = pc(side);
    const away = side === 0 ? 1 : -1; // toward the middle of the court
    const already = this.broken[side];
    this.broken[side] = true;
    p.gone = true;
    // Chunks: the paddle sliced along its length, flung toward mid-court, tumbling under gravity.
    const n = already ? 0 : 12;
    const ph = p.h / 12;
    for (let i = 0; i < n; i++) {
      const y = p.y - p.h / 2 + ph * (i + 0.5);
      const spread = (y - p.y) / (p.h / 2); // -1 top .. 1 bottom
      const speed = 500 + Math.random() * 1100;
      this.debris.push({
        x: p.x,
        y,
        vx: away * speed * (0.5 + Math.random() * 0.6),
        vy: spread * 500 + (Math.random() - 0.65) * 900,
        a: 0,
        va: (Math.random() - 0.5) * 22,
        w: p.w * (0.55 + Math.random() * 0.3),
        h: ph * (0.6 + Math.random() * 0.5),
        t: 0,
        life: 2.2 + Math.random() * 1.2,
        color: Math.random() < 0.25 ? COLOR.white : col,
      });
    }
    this.particles.burst(p.x, p.y, { count: 420, color: [ci, ci, WHITE, GOLD], speed: [150, 2200], angle: side === 0 ? 0 : Math.PI, spread: Math.PI * 1.6, life: [0.6, 1.8], drag: 1.3 });
    this.particles.burst(p.x, p.y, { count: 120, color: [ci, WHITE, GOLD], kind: Kind.Dot, speed: [60, 1100], life: [0.8, 2.2], size: [24, 80], drag: 1.8, gravity: 200 });
    this.rings.push(
      { x: p.x, y: p.y, t: -0.05, dur: 0.5, maxR: 500, color: COLOR.white, width: 14 },
      { x: p.x, y: p.y, t: -0.12, dur: 1.0, maxR: big ? 1300 : 900, color: col, width: 8 },
    );
    if (big) this.rings.push({ x: p.x, y: p.y, t: -0.25, dur: 1.5, maxR: 2400, color: COLOR.gold, width: 4 });
    this.grid.impulse(p.x, p.y, big ? 5000 : 3500, big ? 1100 : 800);
    this.shake.add(big ? 1.6 : 1.1);
    this.flash = big ? 0.9 : 0.6;
    this.flashColor = COLOR.white;
    this.hitstop = big ? 0.22 : 0.12;
    this.timeScale = big ? 0.12 : 0.3;
    const pan = (p.x / this.field.w) * 2 - 1;
    this.g.sfx.explode(pan);
    this.g.sfx.warp(1, pan);
    buzz([80, 40, 160]);
  }

  /** New point (or rematch): blown-up paddles reform, sparks rushing back together; holes heal. */
  private repairPaddles(): void {
    for (const side of [0, 1] as const) {
      const p = this.paddles[side];
      if (p.holes!.length && !this.broken[side]) {
        for (const h of p.holes!) this.particles.burst(p.x, p.y + (h.lo + h.hi) / 2, { count: 14, color: [pc(side), WHITE], speed: [40, 200], life: [0.2, 0.4], drag: 4 });
        p.flash = 0.6;
      }
      p.holes!.length = 0;
      if (this.broken[side]) this.rebuildPaddle(side);
    }
  }

  private rebuildPaddle(side: Side): void {
    this.broken[side] = false;
    const p = this.paddles[side];
    p.gone = false;
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 120 + Math.random() * 200;
      const life = 0.35 + Math.random() * 0.15;
      const tx = p.x;
      const ty = p.y + (Math.random() - 0.5) * p.h;
      this.particles.spawn(tx + Math.cos(a) * d, ty + Math.sin(a) * d, (-Math.cos(a) * d) / life, (-Math.sin(a) * d) / life, life, 3, Math.random() < 0.6 ? pc(side) : WHITE, Kind.Streak, 0);
    }
    this.rings.push({ x: p.x, y: p.y, t: -0.35, dur: 0.4, maxR: 200, color: COLOR.player[side], width: 4 });
    p.flash = 1;
    p.squashV = 16;
  }

  private updateDebris(dt: number): void {
    const { h } = this.field;
    for (const d of this.debris) {
      d.t += dt;
      d.vy += 1400 * dt;
      d.vx *= Math.exp(-0.6 * dt);
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.a += d.va * dt;
      // Bounce off the floor and ceiling, losing energy.
      if (d.y > h - 8 && d.vy > 0) {
        d.y = h - 8;
        d.vy *= -0.45;
        d.vx *= 0.7;
        d.va *= 0.6;
        if (Math.abs(d.vy) > 120) this.particles.burst(d.x, d.y, { count: 4, color: [WHITE, GOLD], speed: [60, 260], angle: -Math.PI / 2, spread: 2, life: [0.1, 0.3], drag: 5 });
      } else if (d.y < 8 && d.vy < 0) {
        d.y = 8;
        d.vy *= -0.45;
      }
      // Burning: trail embers while fast.
      if (Math.random() < dt * 30 && d.t < d.life * 0.6) {
        this.particles.spawn(d.x, d.y, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, 0.3 + Math.random() * 0.3, 10 + Math.random() * 14, Math.random() < 0.5 ? GOLD : WHITE, Kind.Dot, 2);
      }
    }
    this.debris = this.debris.filter((d) => d.t < d.life);
  }

  private drawDebris(ctx: CanvasRenderingContext2D): void {
    for (const d of this.debris) {
      const fade = 1 - Math.max(0, (d.t - d.life * 0.6) / (d.life * 0.4));
      const hot = Math.exp(-2.5 * d.t);
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.a);
      glowRect(ctx, 0, 0, d.w, d.h, whiten(d.color, hot * 0.7), (0.9 + hot) * fade);
      ctx.restore();
    }
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
    this.drawDebris(ctx);
    this.drawPaddles(ctx);
    this.drawBombs(ctx);
    if (this.ballVisible) this.drawBall(ctx);
    this.drawPopups(ctx);
    this.drawText(ctx);
    ctx.restore();

    ctx.globalCompositeOperation = 'source-over';
    if (this.vignette) ctx.drawImage(this.vignette, 0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    if (this.flash > 0) {
      ctx.fillStyle = rgba(this.flashColor, this.flash * 0.45);
      ctx.fillRect(0, 0, w, h);
    }
    this.drawSlots(ctx);
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Each player's item slots: outlined boxes in their colour, with the item's icon when full. */
  private drawSlots(ctx: CanvasRenderingContext2D): void {
    for (const side of [0, 1] as const) {
      const col = COLOR.player[side];
      for (let i = 0; i < ITEM_SLOTS; i++) {
        const { x, y } = this.slots[side][i];
        const item = this.items.slots[side][i];
        const pressed = this.g.input.isButtonDown(`item${side}-${i}`);
        const f = this.slotFlash[side][i];
        const half = (SLOT / 2) * (pressed ? 0.92 : 1) * (1 + f * 0.12);
        if (f > 0) drawGlow(ctx, item ? ITEMS[item].color : col, x, y, SLOT * 2.2, f * 0.6);
        ctx.beginPath();
        ctx.roundRect(x - half, y - half, half * 2, half * 2, 16);
        if (item) {
          ctx.fillStyle = rgba(ITEMS[item].color, 0.07 + 0.04 * Math.sin(this.time * 4));
          ctx.fill();
        }
        glowStroke(ctx, col, 2.5, item ? 0.7 : 0.22);
        const iy = y - (this.coarse ? 0 : 6);
        if (item === 'slow') this.drawHourglass(ctx, x, iy, half * 0.42, ITEMS.slow.color);
        else if (item === 'bomb') this.drawBombIcon(ctx, x, iy, half * 0.36);
        if (!this.coarse) {
          ctx.font = `600 20px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = rgba(col, item ? 0.75 : 0.3);
          ctx.fillText(ITEM_KEY_LABEL[side][i], x, y + half - 15);
        }
      }
    }
  }

  /** A round bomb with a cap and a fuse curling over the top to a fizzing spark. */
  private drawBombIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 9);
    const cy = y + r * 0.3;
    ctx.beginPath();
    ctx.arc(x, cy, r, 0, Math.PI * 2);
    ctx.rect(x - r * 0.32, cy - r * 1.32, r * 0.64, r * 0.34);
    glowStroke(ctx, BOMB.color, 2.6, 0.95);
    ctx.beginPath();
    ctx.moveTo(x, cy - r * 1.32);
    ctx.bezierCurveTo(x, cy - r * 1.9, x - r * 0.9, cy - r * 1.9, x - r * 0.75, cy - r * 1.45);
    glowStroke(ctx, '#ffffff', 2, 0.8);
    drawGlow(ctx, '#ff9a3b', x - r * 0.75, cy - r * 1.45, r * 1.4, 0.5 + pulse * 0.5);
  }

  private drawHourglass(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, color: string): void {
    const tilt = Math.sin(this.time * 2) * 0.12;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.beginPath();
    ctx.moveTo(-a, -a);
    ctx.lineTo(a, -a);
    ctx.lineTo(-a * 0.15, 0);
    ctx.lineTo(a, a);
    ctx.lineTo(-a, a);
    ctx.lineTo(a * 0.15, 0);
    ctx.closePath();
    glowStroke(ctx, color, 2.6, 0.95);
    ctx.restore();
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
    const col = pw.kind === 'bomb' ? BOMB.color : COLOR.gold;
    drawGlow(ctx, col, x, y, r * 6 * pulse, 0.32);
    drawGlow(ctx, col, x, y, r * 2.4, 0.5);
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
      glowStroke(ctx, col, 3.2, a);
    }
    if (pw.kind === 'bomb') {
      this.drawBombIcon(ctx, x, y - r * 0.05, r * 0.42);
      return;
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

  /**
   * The paddle's own length plus one segment at each end per paddle grower collected, all in the
   * player's colour, so the size shows on the paddle itself; the fifth fuses it into one solid
   * paddle that pulses. Bomb holes are cut out, their edges glowing. The core — a bomb blast there
   * destroys the paddle — is wider and white-hot.
   */
  private drawPaddles(ctx: CanvasRenderingContext2D): void {
    for (const side of [0, 1] as const) {
      if (this.broken[side]) continue;
      const p = this.paddles[side];
      const col = COLOR.player[side];
      const sx = Math.max(0.5, 1 + 0.9 * p.squash);
      const sy = Math.max(0.6, 1 - 0.14 * p.squash);
      const touch = this.g.input.isTouching(side) ? 0.15 : 0;
      const w = p.w * 0.72 * sx;
      const n = this.grows[side];
      const fused = n >= POWER.maxGrows;
      const pulse = fused ? 0.1 + 0.08 * Math.sin(this.time * 5) : 0;
      drawGlow(ctx, col, p.x, p.y, p.h * 1.5, 0.1 + p.flash * 0.35 + touch * 0.3 + pulse);
      const coreCol = p.flash > 0 ? whiten(col, p.flash * 0.7) : col;
      const bright = 0.85 + p.flash * 0.5 + touch + pulse;
      // Pieces in paddle-local y: [lo, hi, newest-segment glow].
      const ext = p.h - PADDLE.h; // grows (and shrinks back) smoothly
      const segs = fused ? 0 : Math.max(n, ext > 1 ? 1 : 0);
      const pieces: [number, number, number][] = [];
      if (segs === 0) pieces.push([-p.h / 2, p.h / 2, 0]);
      else {
        pieces.push([-PADDLE.h / 2, PADDLE.h / 2, 0]);
        const seg = ext / 2 / segs;
        const gap = Math.min(6, seg * 0.35);
        for (let i = 0; i < segs; i++) {
          const newest = i === n - 1 ? Math.exp(-4 * this.growT[side]) : 0;
          const a = PADDLE.h / 2 + seg * i + gap / 2;
          const b = PADDLE.h / 2 + seg * (i + 1) - gap / 2;
          pieces.push([a, b, newest], [-b, -a, newest]);
        }
      }
      for (const [lo, hi, newest] of pieces) {
        for (const [a, b] of solidPieces(lo, hi, p.holes!)) {
          if (b - a < 1) continue;
          glowRect(ctx, p.x, p.y + ((a + b) / 2) * sy, w, (b - a) * sy, whiten(coreCol, newest * 0.6), (newest ? bright * 0.85 : bright) + newest);
        }
      }
      // Holes: glowing, burning edges.
      for (const h of p.holes!) {
        for (const edge of [h.lo, h.hi]) {
          if (Math.abs(edge) < p.h / 2 - 1) drawGlow(ctx, '#ff9a3b', p.x, p.y + edge * sy, 46, 0.55 + 0.15 * Math.sin(this.time * 14 + edge));
        }
      }
      // The core: a wider, white-hot band in the middle.
      glowRect(ctx, p.x, p.y, w * 1.5, BOMB.core * sy, whiten(coreCol, 0.55), bright * 1.05);
    }
  }

  private drawBombs(ctx: CanvasRenderingContext2D): void {
    for (const b of this.bombs) {
      const { x, y } = b.ball;
      const grow = b.charging ? easeOutBack(Math.min(1, b.t / (BOMB.charge * 0.8))) : 1;
      const r = BOMB.r * grow;
      if (r <= 0.3) continue;
      // Faster, harder pulsing the closer it is to going off.
      const rate = b.charging ? 10 : 8 + b.t * 6;
      const pulse = 0.5 + 0.5 * Math.sin(this.time * rate);
      if (b.trail.length > 1) {
        ctx.beginPath();
        ctx.moveTo(b.trail[0].x, b.trail[0].y);
        for (const t of b.trail) ctx.lineTo(t.x, t.y);
        ctx.lineCap = 'round';
        ctx.strokeStyle = rgba(BOMB.color, 0.35);
        ctx.lineWidth = r * 1.6;
        ctx.stroke();
      }
      drawGlow(ctx, BOMB.color, x, y, r * (13 + pulse * 7), 0.7 + pulse * 0.3);
      drawGlow(ctx, BOMB.color, x, y, r * 5, 1);
      drawGlow(ctx, '#ff9a3b', x, y, r * 3, 0.6 + pulse * 0.4);
      ctx.fillStyle = pulse > 0.6 ? '#ffffff' : '#ff6a5a';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawBall(ctx: CanvasRenderingContext2D): void {
    const { x, y } = this.ball;
    const r = BALL_R * this.ballScale;
    if (r <= 0.1) return;
    const pulse = 1 + 0.1 * Math.sin(this.time * 22);
    drawGlow(ctx, this.ballColor, x, y, r * 16 * pulse, 0.5);
    drawGlow(ctx, this.ballColor, x, y, r * 5.5, 0.95);
    if (this.braking > 0) drawGlow(ctx, ITEMS.slow.color, x, y, r * 9, 0.8);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // Spin: two gold arcs whirling around the ball, brighter the harder it curves.
    const spin = Math.min(1, Math.abs(this.ball.spin ?? 0) / PHYS.maxSpin);
    if (spin > 0.03 && this.phase === 'play') {
      ctx.beginPath();
      for (const k of [0, Math.PI]) {
        ctx.moveTo(x + Math.cos(this.ballAngle + k) * r * 1.9, y + Math.sin(this.ballAngle + k) * r * 1.9);
        ctx.arc(x, y, r * 1.9, this.ballAngle + k, this.ballAngle + k + 1.6);
      }
      glowStroke(ctx, COLOR.gold, 2.5, 0.25 + spin * 0.75);
    }
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
