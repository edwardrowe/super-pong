/**
 * Usable items: power-ups a player holds in a slot and fires when they choose (tap the slot in
 * their gutter, or press their key). Pure — no rendering — so it can be unit tested.
 */

import type { Side } from '../../engine/types';
import { PHYS } from './physics';

export type ItemId = 'slow' | 'bomb';

export const ITEMS: Record<ItemId, { name: string; color: string }> = {
  slow: { name: 'Slowdown', color: '#8fdcff' },
  bomb: { name: 'Bomb ball', color: '#ff3b3b' },
};

/** Slots per player. */
export const ITEM_SLOTS = 2;

/** Slowdown: brake the ball back to serve speed over a moment. */
export const SLOW = {
  toSpeed: PHYS.serveSpeed,
  /** Seconds of braking; the speed closes in on the target exponentially. */
  duration: 0.3,
  rate: 14,
};

export class Inventory {
  readonly slots: [(ItemId | null)[], (ItemId | null)[]] = [
    new Array<ItemId | null>(ITEM_SLOTS).fill(null),
    new Array<ItemId | null>(ITEM_SLOTS).fill(null),
  ];

  /** Put an item in the first free slot. False if the player's slots are full. */
  give(side: Side, item: ItemId): boolean {
    const i = this.slots[side].indexOf(null);
    if (i < 0) return false;
    this.slots[side][i] = item;
    return true;
  }

  has(side: Side, item: ItemId): boolean {
    return this.slots[side].includes(item);
  }

  /** Take the item out of a slot to use it (null if the slot is empty). */
  take(side: Side, slot = 0): ItemId | null {
    const item = this.slots[side][slot] ?? null;
    this.slots[side][slot] = null;
    return item;
  }

  clear(): void {
    for (const s of this.slots) s.fill(null);
  }
}
