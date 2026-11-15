import { Sfx } from '../engine/audio';
import { Input } from '../engine/input';
import { Music } from '../engine/music';
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
  private music = new Music();
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
    music: $('music'),
    menuMusic: $('menu-music'),
    quit: $('quit'),
    diag: $('diag'),
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

    // Fullscreen is dropped when the app is backgrounded or the user swipes it away; ask again.
    document.addEventListener('pointerup', () => {
      if (this.game && !this.paused) tryFullscreen();
    });

    const unlock = () => {
      this.sfx.unlock();
      if (this.sfx.context && this.sfx.bus) this.music.attach(this.sfx.context, this.sfx.bus);
    };
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
      if (document.hidden) {
        this.pause();
        this.sfx.suspend();
      }
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
    const toggleMusic = () => {
      this.music.cycle();
      this.syncSoundLabel();
      this.sfx.click();
    };
    this.ui.music.addEventListener('click', toggleMusic);
    this.ui.menuMusic.addEventListener('click', toggleMusic);
    this.music.setIntensity(0.25);
    this.music.setTempo(1);
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
    this.game = entry.create({ input: this.input, sfx: this.sfx, music: this.music, view: this.view });
    this.paused = false;
    this.music.muffle(false);
    this.ui.menu.classList.add('hidden');
    this.ui.pause.classList.add('hidden');
    this.ui.pauseBtn.classList.remove('hidden');
    tryFullscreen();
  }

  private pause(): void {
    if (!this.game || this.paused) return;
    this.paused = true;
    this.music.muffle(true);
    this.ui.diag.textContent = diagnostics();
    this.ui.pause.classList.remove('hidden');
    this.ui.pauseBtn.classList.add('hidden');
  }

  private resume(): void {
    this.sfx.click();
    this.paused = false;
    this.music.muffle(false);
    this.input.reset();
    tryFullscreen();
    this.ui.pause.classList.add('hidden');
    this.ui.pauseBtn.classList.remove('hidden');
  }

  private quit(): void {
    this.sfx.click();
    this.game?.dispose?.();
    this.game = null;
    this.entry = null;
    this.paused = false;
    this.music.muffle(false);
    this.music.setIntensity(0.25);
    this.music.setTempo(1);
    this.ui.pause.classList.add('hidden');
    this.ui.pauseBtn.classList.add('hidden');
    this.ui.menu.classList.remove('hidden');
  }

  private syncSoundLabel(): void {
    this.ui.sound.textContent = this.sfx.muted ? 'Sound: Off' : 'Sound: On';
    const m = this.music.label;
    this.ui.music.textContent = m;
    this.ui.menuMusic.textContent = m;
  }
}

/** Android Chrome: go fullscreen and lock landscape. iPhone Safari can't; use Add to Home Screen. */
/**
 * Hide the phone's status and navigation bars. Requested even inside the installed app:
 * Android sometimes opens an installed web app in "standalone" mode (status bar showing)
 * instead of the manifest's "fullscreen", and the Fullscreen API still hides the bars there.
 * iPhone Safari has no Fullscreen API; Add to Home Screen is the only way there.
 */
function tryFullscreen(): void {
  if (!matchMedia('(pointer: coarse)').matches) return;
  const el = document.documentElement;
  if (!el.requestFullscreen || document.fullscreenElement) return;
  el.requestFullscreen({ navigationUI: 'hide' })
    .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
    .catch(() => {});
}

/** Small print on the pause screen to help debug display problems on a real phone. */
function diagnostics(): string {
  const modes = ['fullscreen', 'standalone', 'minimal-ui', 'browser'];
  const mode = modes.find((m) => matchMedia(`(display-mode: ${m})`).matches) ?? '?';
  const fs = document.fullscreenElement ? 'on' : 'off';
  return `display ${mode} · fullscreen api ${fs} · ${innerWidth}×${innerHeight} @${devicePixelRatio}x`;
}
