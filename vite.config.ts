/// <reference types="vitest/config" />

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

// https://vitejs.dev/config/
export default defineConfig({
  base: '/ld-elements/',
  build: {
    cssCodeSplit: true,
    lib: {
      entry: resolve(__dirname, 'src/bundle/index.js'),
      formats: ['es'],
      name: 'LD-Elements',
      // the proper extensions will be added
      fileName: 'ld-elements'
    },
    rollupOptions: {
      external: [/heximal/],
      input: {
        // do not include index.html here as it collides with name of ld-elements library above
        // index: resolve(__dirname, 'index.html'),
        wikidata: resolve(__dirname, 'demo/wikidata.html'),
      },
      output: {
        inlineDynamicImports: false
      }
    }
  },
  test: {
    environment: 'jsdom'
  }
})