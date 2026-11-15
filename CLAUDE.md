# Super Pong — project notes

A suite of two-player games played on **one phone in landscape**, in the browser. Super Pong is
the first game. Neon / vector-arcade look, heavy on "juice" (particles, shake, hit-stop, sound).

## Stack
TypeScript + Vite, Canvas 2D, no game framework and no runtime dependencies. Sound effects and the
music are synthesised with Web Audio (no audio files, nothing to license). Deployed to GitHub Pages by `.github/workflows/deploy.yml` on
every push to `main` (it runs `npm test` and `npm run build` first).

## Commands
- `npm run dev` — dev server on :5173
- `npm test` — Vitest
- `npm run build` — type-check (tsc) + production build into `dist/`

## Layout
- `src/engine/` — shared by every game: `input` (split-screen multi-touch, relative drag,
  keyboard), `audio` (synth SFX + vibration), `music` (original synth dance tracks defined as data in
  `TRACKS` — tempo, chords, 16-step patterns, melodies; instruments join by level, see
  `DEFAULT_ENTER`; filter sweep on big moments, muffled while paused), `particles` (typed-array pool), `glow` (neon
  sprites and stacked strokes), `grid` (spring-mesh background), `shake`, `types` (Game interface).
- `src/shell/` — canvas setup, frame loop, menus, pause, Sound panel (track, music and effects
  volume, saved in localStorage), rotate-your-phone screen.
- `src/games/` — one folder per game; register new games in `src/games/index.ts`.
- `src/games/super-pong/physics.ts` — pure, tested ball physics. Keep game rules here, not in rendering.
- `src/games/super-pong/powerups.ts` — pure, tested power-up rules (when they spawn, where, pickup,
  paddle growth). Every rally gets one 2–6 paddle hits in, then every 7–12. Power-ups go to whoever
  touched the ball last and stay on court between points (cleared on a new match). Growth lasts the
  whole match and shows as extra segments on the paddle ends; the fifth fuses them into one paddle.
- `src/games/super-pong/items.ts` — usable items held in a slot at the bottom of each gutter, fired by
  tapping the slot (an `input.setButtons` button, so it never moves a paddle) or a key (D / ←).
  First item: Slowdown, which brakes the ball back to serve speed. For now everyone gets one each
  point; it isn't spawned on court yet.
- `src/engine/settings.ts` — toggles on the Debug screen (menu and pause). Add an entry to `SETTINGS`
  and read it with `ctx.settings.get(id)`; the panel builds itself. The Debug screen also sets
  power-up counts (starting from what each player holds, capped at each kind's max) for a game that
  lists `powerUps` and implements `powerUpCount()` / `setPowerUps()`; all of it applies on Save. Spin (on by default) lives
  here; its physics is in `physics.ts` (`PhysOptions`).

## Conventions
- Games draw in world units: the field is always 900 tall; width varies with aspect ratio.
- Draw glowing things with `globalCompositeOperation = 'lighter'`; use `glow.ts` helpers, not
  `shadowBlur` (too slow on phones).
- Touches belong to the half of the screen they started on.
- Super Pong leaves a gutter behind each paddle for fingers; the ball scores at the goal line
  (`goalL`/`goalR` on the field), not the screen edge. The grid only covers the play area.
- Every grid warp has a matching `sfx.warp(amount)` bass dive; the serve wind-up plays `sfx.charge`,
  then `sfx.serve` booms on launch. The music never changes tempo: it builds by
  adding instruments — level 0 on the menu, 1 at kick-off, +1 per point the leader has (7 at match
  point), 8 on the win screen. Changes land on the next bar line with a crash. On Shuffle (the default) every match
  starts a different random track (`music.newMatch()`).
- Must stay smooth on phones: avoid per-frame allocations in hot loops, keep DPR capped at 2.
- In dev builds `window.__shell` exposes the shell for debugging (`__shell.frame(1/60)` steps a frame).
