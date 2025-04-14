/// <reference types="vitest/config" />

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

// https://vitejs.dev/config/
export default defineConfig({
  base: '/ld-elements/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        wikidata: resolve(__dirname, 'demo/wikidata.html'),
      },
    },
  },
  test: {
    environment: 'jsdom'
  }
})