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
  `TRACKS` — tempo, chords, 16-step patterns; layers follow a 0–1 intensity the game sets; filter
  sweep on big moments, muffled while paused; the player picks a track or Off), `particles` (typed-array pool), `glow` (neon
  sprites and stacked strokes), `grid` (spring-mesh background), `shake`, `types` (Game interface).
- `src/shell/` — canvas setup, frame loop, menus, pause, rotate-your-phone screen.
- `src/games/` — one folder per game; register new games in `src/games/index.ts`.
- `src/games/super-pong/physics.ts` — pure, tested ball physics. Keep game rules here, not in rendering.

## Conventions
- Games draw in world units: the field is always 900 tall; width varies with aspect ratio.
- Draw glowing things with `globalCompositeOperation = 'lighter'`; use `glow.ts` helpers, not
  `shadowBlur` (too slow on phones).
- Touches belong to the half of the screen they started on.
- Super Pong leaves a gutter behind each paddle for fingers; the ball scores at the goal line
  (`goalL`/`goalR` on the field), not the screen edge. The grid only covers the play area.
- Every grid warp has a matching `sfx.warp(amount)` bass dive; the serve wind-up plays `sfx.wobble`.
- Must stay smooth on phones: avoid per-frame allocations in hot loops, keep DPR capped at 2.
- In dev builds `window.__shell` exposes the shell for debugging (`__shell.frame(1/60)` steps a frame).
