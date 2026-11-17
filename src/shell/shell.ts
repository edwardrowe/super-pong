import { Sfx } from '../engine/audio';
import { Input } from '../engine/input';
import { Music, TRACKS } from '../engine/music';
import { SETTINGS, Settings } from '../engine/settings';
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
  private settings = new Settings();
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
    menuSound: $('menu-sound'),
    quit: $('quit'),
    audio: $('audio'),
    tracks: $('track-list'),
    volMusic: $<HTMLInputElement>('vol-music'),
    volSfx: $<HTMLInputElement>('vol-sfx'),
    audioDone: $('audio-done'),
    debugBtn: $('debug-btn'),
    menuDebug: $('menu-debug'),
    debug: $('debug'),
    debugList: $('debug-list'),
    debugAwards: $('debug-awards'),
    debugSave: $('debug-save'),
    debugCancel: $('debug-cancel'),
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
      if (this.panelOpen) {
        if (e.code === 'Escape') this.closePanel();
        return;
      }
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
    this.ui.sound.addEventListener('click', () => this.openAudio());
    this.ui.menuSound.addEventListener('click', () => this.openAudio());
    this.ui.audioDone.addEventListener('click', () => this.closePanel());
    this.ui.debugBtn.addEventListener('click', () => this.openDebug());
    this.ui.menuDebug.addEventListener('click', () => this.openDebug());
    this.ui.debugSave.addEventListener('click', () => this.saveDebug());
    this.ui.debugCancel.addEventListener('click', () => this.closePanel());
    this.buildDebugPanel();
    this.buildAudioPanel();
    this.music.setLevel(0);

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
    this.game = entry.create({ input: this.input, sfx: this.sfx, music: this.music, settings: this.settings, view: this.view });
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
    this.music.setLevel(0);
    this.ui.pause.classList.add('hidden');
    this.ui.pauseBtn.classList.add('hidden');
    this.ui.menu.classList.remove('hidden');
  }

  // ---- sound panel ---------------------------------------------------------

  /** The Sound or Debug panel is showing. */
  private get panelOpen(): boolean {
    return !this.ui.audio.classList.contains('hidden') || !this.ui.debug.classList.contains('hidden');
  }

  private openPanel(panel: HTMLElement): void {
    this.sfx.click();
    panel.classList.remove('hidden');
    this.ui.pause.classList.add('hidden');
    this.ui.menu.classList.add('hidden');
  }

  /** Back to the pause screen (mid-game) or the main menu. */
  private closePanel(): void {
    this.sfx.click();
    this.ui.audio.classList.add('hidden');
    this.ui.debug.classList.add('hidden');
    if (this.game) {
      this.ui.pause.classList.remove('hidden');
      this.music.muffle(this.paused);
    } else this.ui.menu.classList.remove('hidden');
  }

  /** Debug changes wait here until Save. */
  private pendingSettings = new Map<string, boolean>();
  /** Power-up counts to set on Save, keyed `${powerUpId}:${side}`. Only changed ones are listed. */
  private pendingAwards = new Map<string, number>();

  /** One switch per entry in SETTINGS. Changes are held until Save. */
  private buildDebugPanel(): void {
    for (const def of SETTINGS) {
      const row = document.createElement('label');
      row.className = 'toggle';
      row.innerHTML = '<span class="toggle-text"><b></b><small></small></span><input type="checkbox" role="switch" /><i></i>';
      row.querySelector('b')!.textContent = def.label;
      row.querySelector('small')!.textContent = def.hint;
      const box = row.querySelector('input')!;
      box.dataset.id = def.id;
      box.addEventListener('change', () => {
        this.pendingSettings.set(def.id, box.checked);
        this.sfx.click();
      });
      this.ui.debugList.appendChild(row);
    }
  }

  private openDebug(): void {
    this.pendingSettings.clear();
    this.pendingAwards.clear();
    for (const box of this.ui.debugList.querySelectorAll('input')) box.checked = this.settings.get(box.dataset.id!);
    this.buildAwards();
    this.openPanel(this.ui.debug);
  }

  /**
   * A row per power-up kind with a −/+ counter for each player, starting at what they hold now and
   * limited to what they can hold. Only during a game.
   */
  private buildAwards(): void {
    const box = this.ui.debugAwards;
    box.replaceChildren();
    const game = this.game;
    const kinds = game?.setPowerUps && game.powerUpCount ? (game.powerUps ?? []) : [];
    if (!game || !kinds.length) {
      box.innerHTML = '<p class="hint">Start a game to award power-ups.</p>';
      return;
    }
    const head = document.createElement('div');
    head.className = 'award head';
    head.innerHTML = '<span>Power-ups</span><span class="p0">Cyan</span><span class="p1">Magenta</span>';
    box.appendChild(head);
    // Kinds that use item slots share them: + stops once a player's slots are all spoken for.
    const value = (id: string, side: 0 | 1) => this.pendingAwards.get(`${id}:${side}`) ?? game.powerUpCount!(side, id);
    const slotsUsed = (side: 0 | 1) => kinds.filter((k) => k.slot).reduce((n, k) => n + value(k.id, side), 0);
    const refreshers: (() => void)[] = [];
    for (const kind of kinds) {
      const row = document.createElement('div');
      row.className = 'award';
      const name = document.createElement('span');
      name.textContent = `${kind.name} (max ${kind.max})`;
      row.appendChild(name);
      for (const side of [0, 1] as const) {
        const key = `${kind.id}:${side}`;
        const now = game.powerUpCount!(side, kind.id);
        const step = document.createElement('div');
        step.className = `stepper p${side}`;
        step.innerHTML = '<button aria-label="One fewer">−</button><output></output><button aria-label="One more">+</button>';
        const [minus, plus] = step.querySelectorAll('button');
        const out = step.querySelector('output')!;
        const show = () => {
          const n = value(kind.id, side);
          out.textContent = String(n);
          out.classList.toggle('changed', n !== now);
          minus.disabled = n <= 0;
          plus.disabled = n >= kind.max || (!!kind.slot && slotsUsed(side) >= (game.itemSlots ?? Infinity));
        };
        refreshers.push(show);
        show();
        const change = (d: number) => {
          const n = Math.max(0, Math.min(kind.max, value(kind.id, side) + d));
          if (n === now) this.pendingAwards.delete(key);
          else this.pendingAwards.set(key, n);
          for (const r of refreshers) r();
          this.sfx.click();
        };
        minus.addEventListener('click', () => change(-1));
        plus.addEventListener('click', () => change(1));
        row.appendChild(step);
      }
      box.appendChild(row);
    }
  }

  /** Apply the held settings and queued awards, then close. */
  private saveDebug(): void {
    for (const [id, v] of this.pendingSettings) this.settings.set(id, v);
    // Removals first, so freed item slots are there for additions.
    const changes = [...this.pendingAwards].map(([key, n]) => {
      const [id, side] = key.split(':');
      return { id, side: Number(side) as 0 | 1, n, less: n < (this.game?.powerUpCount?.(Number(side) as 0 | 1, id) ?? 0) };
    });
    changes.sort((a, b) => Number(b.less) - Number(a.less));
    for (const c of changes) this.game?.setPowerUps?.(c.side, c.id, c.n);
    this.pendingSettings.clear();
    this.pendingAwards.clear();
    this.closePanel();
  }


  private buildAudioPanel(): void {
    for (const t of [{ id: 'shuffle', name: 'Shuffle' }, ...TRACKS]) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.setAttribute('role', 'radio');
      b.dataset.id = t.id;
      b.textContent = t.name;
      b.addEventListener('click', () => {
        this.music.select(t.id);
        if (this.music.volume === 0) this.music.setVolume(0.75);
        this.sfx.click();
        this.syncAudioPanel();
      });
      this.ui.tracks.appendChild(b);
    }
    let lastPreview = 0;
    this.ui.volMusic.addEventListener('input', () => {
      this.music.setVolume(Number(this.ui.volMusic.value) / 100);
      this.syncAudioPanel();
    });
    this.ui.volSfx.addEventListener('input', () => {
      this.sfx.setVolume(Number(this.ui.volSfx.value) / 100);
      this.syncAudioPanel();
      // Let the player hear the new level while dragging.
      const now = performance.now();
      if (now - lastPreview > 140) {
        lastPreview = now;
        this.sfx.paddle(0.3, 0);
      }
    });
    this.syncAudioPanel();
  }

  private syncAudioPanel(): void {
    for (const b of this.ui.tracks.children) {
      (b as HTMLElement).setAttribute('aria-checked', String((b as HTMLElement).dataset.id === this.music.choice));
    }
    const set = (input: HTMLInputElement, v: number) => {
      const pct = Math.round(v * 100);
      input.value = String(pct);
      input.style.setProperty('--fill', `${pct}%`);
      (input.nextElementSibling as HTMLOutputElement).textContent = pct ? String(pct) : 'Off';
    };
    set(this.ui.volMusic, this.music.volume);
    set(this.ui.volSfx, this.sfx.volume);
  }

  private openAudio(): void {
    this.syncAudioPanel();
    this.openPanel(this.ui.audio);
    this.music.muffle(false); // hear the track you pick, even from the pause screen
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
