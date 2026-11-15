import type { GameEntry } from '../engine/types';
import { SuperPong } from './super-pong/game';

/** The suite. Add new games here and they appear on the home menu. */
export const GAMES: GameEntry[] = [
  {
    id: 'super-pong',
    name: 'Super Pong',
    tagline: 'Neon paddles · first to 7',
    accent: '#18f0ff',
    create: (ctx) => new SuperPong(ctx),
  },
];
