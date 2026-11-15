import type { Input } from './input';
import type { Sfx } from './audio';
import type { Music } from './music';
import type { Settings } from './settings';

/** Screen geometry. Games draw in world units: the play field is always WORLD_H tall. */
export interface View {
  cssW: number;
  cssH: number;
  dpr: number;
  /** CSS pixels per world unit. */
  scale: number;
  /** World width (varies with aspect ratio). */
  w: number;
  /** World height (always WORLD_H). */
  h: number;
  /** Safe-area insets (notch, home bar) in world units. */
  inset: { l: number; r: number; t: number; b: number };
}

export const WORLD_H = 900;

export type Side = 0 | 1;

export interface GameContext {
  input: Input;
  sfx: Sfx;
  music: Music;
  settings: Settings;
  view: View;
}

/** Every game in the suite implements this. The shell owns the loop, canvas and menus. */
export interface Game {
  resize(view: View): void;
  /** Real seconds since last frame (clamped). */
  update(dt: number): void;
  /** The canvas transform is already set to world units. */
  render(ctx: CanvasRenderingContext2D): void;
  /** A finger went down on one half of the screen, or a confirm key was pressed (side = -1). */
  onPress?(side: Side | -1): void;
  dispose?(): void;
  /** Power-up kinds the Debug screen can award, if the game has any. */
  readonly powerUps?: { id: string; name: string }[];
  /** Debug: give `side` this many of a power-up. */
  award?(side: Side, id: string, count: number): void;
}

export interface GameEntry {
  id: string;
  name: string;
  tagline: string;
  /** CSS colour used for the menu card. */
  accent: string;
  create(ctx: GameContext): Game;
}
