import path from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Unit tests for the app's pure decisions (`src/lib`): which column is the price, which
 * partida is the same partida, which market band applies, how the money adds up.
 *
 * No DOM, no session, no database, no network. The React surfaces and the
 * `'use server'` modules under `src/app` are deliberately out of scope — they need a
 * browser and real data (see SPEC.md §5).
 *
 * `@/…` is aliased by hand so the suite needs exactly one dependency (vitest).
 *
 * `.mts`, not `.ts`: the repo has no `"type": "module"`, so a `.ts` config would be
 * loaded as CommonJS and Vite warns about ESM syntax in every run.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', '.next']
  },
  resolve: {
    // vitest resolves relative to the repo root, which is where this file lives.
    alias: { '@': path.resolve(process.cwd(), 'src') }
  }
})
