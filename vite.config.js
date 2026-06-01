import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: { open: false, host: '0.0.0.0' },
  build: { target: 'es2019', outDir: 'dist' },
})
