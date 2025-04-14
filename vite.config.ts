/// <reference types="vitest/config" />

import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(__dirname, 'src');
const libEntryFile = resolve(__dirname, 'src/bundle/ld-elements.ts');
const libEntryFileDir = dirname(libEntryFile);

// https://vitejs.dev/config/
export default defineConfig({
  base: '/ld-elements/',
  build: {
    cssCodeSplit: true,
    rollupOptions: {
      input: [
        libEntryFile,
        resolve(__dirname, 'index.html'),
        resolve(__dirname, 'demo/wikidata.html'),
        resolve(__dirname, 'demo/nfdi4culture.html')
      ],
      output: {
        inlineDynamicImports: false,
        manualChunks(id) {
          if ((id.startsWith(srcDir) || id.includes('node_modules')) && (id.endsWith('.ts') || id.endsWith('.js') || id.endsWith('mjs'))) {
            return 'ld-elements';
          }
        },
        entryFileNames(chunkInfo) {
          return "[name].js";
        }
      }
    }
  },
  test: {
    environment: 'jsdom'
  }
})