/**
 * Toggles shown on the Debug screen. To add one, append it to SETTINGS and read it in the game
 * with `settings.get('id')` — the panel builds itself from this list and saves every change.
 */

export interface SettingDef {
  id: string;
  label: string;
  /** One line shown under the label. */
  hint: string;
  default: boolean;
}

export const SETTINGS: SettingDef[] = [
  { id: 'spin', label: 'Spin', hint: 'Moving your paddle as you hit puts spin on the ball, so it curves.', default: false },
];

const KEY = 'settings';

export class Settings {
  private values: Record<string, boolean> = {};

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
      if (saved && typeof saved === 'object') this.values = saved;
    } catch {
      /* corrupt or missing: use defaults */
    }
  }

  get(id: string): boolean {
    const v = this.values[id];
    return typeof v === 'boolean' ? v : (SETTINGS.find((s) => s.id === id)?.default ?? false);
  }

  set(id: string, v: boolean): void {
    this.values[id] = v;
    localStorage.setItem(KEY, JSON.stringify(this.values));
  }
}
