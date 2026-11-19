import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      exclude: [...configDefaults.exclude, 'e2e/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
      // Recent Node.js versions ship their own `localStorage` global, which is `undefined` unless
      // Node is started with `--localstorage-file`, and which hides jsdom's working implementation.
      // Turning Node's version off lets the tests use jsdom's, like a browser would.
      execArgv: ['--no-experimental-webstorage'],
    },
  }),
)
