import { Sfx } from '../engine/audio';
import { Input } from '../engine/input';
import { WORLD_H, type Game, type GameEntry, type View } from '../engine/types';
import { GAMES } from '../games';
import { Backdrop } from './backdrop';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/**
 * Owns the canvas, the frame loop, input, audio and the HTML menus. Games plug in via
 * the Game interface and only ever see world coordinates.
 */
export class Shell {
  private ctx: CanvasRenderingContext2D;
  private view!: View;
  private input: Input;
  private sfx = new Sfx();
  private game: Game | null = null;
  private entry: GameEntry | null = null;
  private paused = false;
  private backdrop = new Backdrop();
  private portrait = matchMedia('(orientation: portrait) and (pointer: coarse)');
  private probe: HTMLElement;
  private ui = {
    menu: $('menu'),
    list: $('game-list'),
    pause: $('pause'),
    pauseBtn: $('pause-btn'),
    resume: $('resume'),
    restart: $('restart'),
    sound: $('sound'),
    quit: $('quit'),
  };

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.input = new Input(canvas);
    this.probe = document.createElement('div');
    this.probe.className = 'safe-probe';
    document.body.appendChild(this.probe);

    this.input.onPress((side) => {
      if (this.game && !this.paused && !this.portrait.matches) this.game.onPress?.(side);
    });

    const unlock = () => this.sfx.unlock();
    document.addEventListener('pointerdown', unlock, { capture: true });
    document.addEventListener('keydown', unlock, { capture: true });

    window.addEventListener('keydown', (e) => {
      if (!this.game) return;
      if (e.code === 'Escape' || e.code === 'KeyP') this.paused ? this.resume() : this.pause();
      else if ((e.code === 'Enter' || e.code === 'Space') && !this.paused) this.game.onPress?.(-1);
    });

    const onResize = () => this.resize();
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(onResize, 250));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
    });

    for (const g of GAMES) {
      const b = document.createElement('button');
      b.className = 'card';
      b.style.setProperty('--accent', g.accent);
      b.innerHTML = `<span class="card-name"></span><span class="card-tag"></span>`;
      b.querySelector('.card-name')!.textContent = g.name;
      b.querySelector('.card-tag')!.textContent = g.tagline;
      b.addEventListener('click', () => this.start(g));
      this.ui.list.appendChild(b);
    }
    this.ui.pauseBtn.addEventListener('click', () => this.pause());
    this.ui.resume.addEventListener('click', () => this.resume());
    this.ui.restart.addEventListener('click', () => this.entry && this.start(this.entry));
    this.ui.quit.addEventListener('click', () => this.quit());
    this.ui.sound.addEventListener('click', () => {
      this.sfx.setMuted(!this.sfx.muted);
      this.syncSoundLabel();
      this.sfx.click();
    });
    this.syncSoundLabel();

    this.resize();
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 20);
      last = now;
      this.frame(dt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private frame(dt: number): void {
    const { ctx, view } = this;
    ctx.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale, 0, 0);
    if (this.game) {
      if (this.paused || this.portrait.matches) {
        this.input.consumeDrag(0);
        this.input.consumeDrag(1);
      } else {
        this.game.update(dt);
      }
      this.game.render(ctx);
    } else {
      this.backdrop.update(dt);
      this.backdrop.render(ctx);
    }
  }

  private resize(): void {
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    const scale = cssH / WORLD_H;
    const cs = getComputedStyle(this.probe);
    const px = (v: string) => (parseFloat(v) || 0) / scale;
    this.view = {
      cssW,
      cssH,
      dpr,
      scale,
      w: cssW / scale,
      h: WORLD_H,
      inset: { l: px(cs.paddingLeft), r: px(cs.paddingRight), t: px(cs.paddingTop), b: px(cs.paddingBottom) },
    };
    this.backdrop.resize(this.view);
    this.game?.resize(this.view);
  }

  private start(entry: GameEntry): void {
    this.sfx.click();
    this.game?.dispose?.();
    this.entry = entry;
    this.input.reset();
    this.game = entry.create({ input: this.input, sfx: this.sfx, view: this.view });
    this.paused = false;
    this.ui.menu.classList.add('hidden');
    this.ui.pause.classList.add('hidden');
    this.ui.pauseBtn.classList.remove('hidden');
    tryFullscreen();
  }

  private pause(): void {
    if (!this.game || this.paused) return;
    this.paused = true;
    this.ui.pause.classList.remove('hidden');
    this.ui.pauseBtn.classList.add('hidden');
  }

  private resume(): void {
    this.sfx.click();
    this.paused = false;
    this.input.reset();
    this.ui.pause.classList.add('hidden');
    this.ui.pauseBtn.classList.remove('hidden');
  }

  private quit(): void {
    this.sfx.click();
    this.game?.dispose?.();
    this.game = null;
    this.entry = null;
    this.paused = false;
    this.ui.pause.classList.add('hidden');
    this.ui.pauseBtn.classList.add('hidden');
    this.ui.menu.classList.remove('hidden');
  }

  private syncSoundLabel(): void {
    this.ui.sound.textContent = this.sfx.muted ? 'Sound: Off' : 'Sound: On';
  }
}

/** Android Chrome: go fullscreen and lock landscape. iPhone Safari can't; use Add to Home Screen. */
function tryFullscreen(): void {
  const standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
  if (standalone || !matchMedia('(pointer: coarse)').matches) return;
  const el = document.documentElement;
  if (!el.requestFullscreen || document.fullscreenElement) return;
  el.requestFullscreen({ navigationUI: 'hide' })
    .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
    .catch(() => {});
}
