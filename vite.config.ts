import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Project site: https://dieuwedeboer.github.io/nz-demographic-map/
// Local/dev and custom domains use `/`.
const base = process.env.GITHUB_PAGES === 'true' ? '/nz-demographic-map/' : '/'

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ['maplibre-gl', 'pmtiles'],
          react: ['react', 'react-dom'],
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
})
