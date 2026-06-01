import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: { open: false, host: true },
  build: { target: 'es2019', outDir: 'dist' },
})
