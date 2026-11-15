import type { Side } from './types';

interface Touch {
  side: Side;
  lastY: number;
}

/** An on-screen button a game draws itself. Rect in CSS pixels. */
export interface ScreenButton {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Extra reach around buttons, in CSS pixels, for thumbs. */
const BUTTON_SLOP = 12;

/**
 * Two-player input on one screen. Each touch belongs to the half it started on for its
 * whole life, so players can't steal each other's paddle by drifting across the middle.
 * Movement is relative: games read how far each side's finger(s) moved since last frame.
 */
export class Input {
  private touches = new Map<number, Touch>();
  private drag: [number, number] = [0, 0];
  private keys = new Set<string>();
  private pressListeners: ((side: Side) => void)[] = [];
  private buttons: ScreenButton[] = [];
  private buttonListeners: ((id: string) => void)[] = [];
  /** pointerId → id of the button it is holding down. */
  private held = new Map<number, string>();
  /** Keys pressed (not auto-repeat) since they were last consumed. */
  private tapped = new Set<string>();

  constructor(private el: HTMLElement) {
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('lostpointercapture', this.onUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** CSS pixels the given side's finger(s) moved vertically since the last call. */
  consumeDrag(side: Side): number {
    const d = this.drag[side];
    this.drag[side] = 0;
    return d;
  }

  /** Keyboard axis for a side: -1 up, +1 down. Left = W/S, right = arrows. */
  keyAxis(side: Side): number {
    const up = side === 0 ? 'KeyW' : 'ArrowUp';
    const down = side === 0 ? 'KeyS' : 'ArrowDown';
    return (this.keys.has(down) ? 1 : 0) - (this.keys.has(up) ? 1 : 0);
  }

  isTouching(side: Side): boolean {
    for (const t of this.touches.values()) if (t.side === side) return true;
    return false;
  }

  onPress(fn: (side: Side) => void): void {
    this.pressListeners.push(fn);
  }

  /**
   * Replace the on-screen buttons. A touch that starts on one fires onButton and does not
   * move a paddle.
   */
  setButtons(buttons: ScreenButton[]): void {
    this.buttons = buttons;
  }

  onButton(fn: (id: string) => void): () => void {
    this.buttonListeners.push(fn);
    return () => (this.buttonListeners = this.buttonListeners.filter((f) => f !== fn));
  }

  isButtonDown(id: string): boolean {
    for (const b of this.held.values()) if (b === id) return true;
    return false;
  }

  /** True once per press of the key (by KeyboardEvent.code). */
  consumeKey(code: string): boolean {
    return this.tapped.delete(code);
  }

  reset(): void {
    this.touches.clear();
    this.held.clear();
    this.tapped.clear();
    this.drag = [0, 0];
  }

  private onDown = (e: PointerEvent) => {
    e.preventDefault();
    const btn = this.buttons.find(
      (b) =>
        e.clientX >= b.x - BUTTON_SLOP &&
        e.clientX <= b.x + b.w + BUTTON_SLOP &&
        e.clientY >= b.y - BUTTON_SLOP &&
        e.clientY <= b.y + b.h + BUTTON_SLOP,
    );
    if (btn) {
      this.held.set(e.pointerId, btn.id);
      for (const fn of this.buttonListeners) fn(btn.id);
      return;
    }
    const side: Side = e.clientX < window.innerWidth / 2 ? 0 : 1;
    this.touches.set(e.pointerId, { side, lastY: e.clientY });
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* not all browsers allow capture for every pointer type */
    }
    for (const fn of this.pressListeners) fn(side);
  };

  private onMove = (e: PointerEvent) => {
    const t = this.touches.get(e.pointerId);
    if (!t) return;
    e.preventDefault();
    this.drag[t.side] += e.clientY - t.lastY;
    t.lastY = e.clientY;
  };

  private onUp = (e: PointerEvent) => {
    this.touches.delete(e.pointerId);
    this.held.delete(e.pointerId);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    this.keys.add(e.code);
    if (!e.repeat) this.tapped.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
}
