/// <reference types="vitest/config" />

import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/ld-elements/',
  test: {
    environment: 'jsdom'
  }
})