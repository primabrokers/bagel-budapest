import { defineConfig } from 'vitest/config';

/*
  Test harness, ported from the CRM root (see CRM_NEW/vitest.config.ts). Deliberately no
  `jsdom` and no `@testing-library/react` — component tests that need to assert what a handler
  actually renders should go through `react-dom/server`'s `renderToStaticMarkup` instead, which
  needs neither. Add the DOM environment only at the point a test genuinely needs events or
  effects, rather than carrying unused weight from Stage 1.

  `include` is scoped to this project's own `src/`.
*/
export default defineConfig({
  // Match the app's `react-jsx` transform. Vitest loads this config instead of vite.config.ts,
  // so rendered component tests use automatic JSX without manual React imports.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    reporters: 'verbose',
  },
});
