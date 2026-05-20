import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/*
  Vite is the bundler/dev server for this React app. Unlike Webpack's
  configuration-heavy setup, Vite uses native ES modules in development
  and a faster build pipeline based on Rollup for production.

  This file also configures Vitest for browser-like testing with JSDOM,
  similar to how Angular projects configure TestBed and the browser test
  environment.
*/
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom"
  }
})
