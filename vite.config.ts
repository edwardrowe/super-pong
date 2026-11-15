import { defineConfig } from 'vite';

// Relative base so the build works at any path (GitHub Pages serves it under /super-pong/).
export default defineConfig({
  base: './',
  server: { port: 5173 },
  build: { target: 'es2022' },
});
