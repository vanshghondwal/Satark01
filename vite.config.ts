import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'SATARK: See the sky. Verify the signal.',
        short_name: 'SATARK',
        description: 'Simulated drone monitoring and evidence-review platform. Synthetic data only.',
        theme_color: '#090B10',
        background_color: '#090B10',
        display: 'standalone',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      // Every built asset is precached (JS, CSS, HTML, SVG, JSON, manifest),
      // so after the first online load the production build reloads offline.
      // The ML model JSON is imported by ml.ts and bundled into the JS asset,
      // so it is precached with it. No remote fonts, images, CDNs or APIs.
      workbox: { globPatterns: ['**/*.{js,css,html,svg,json,webmanifest}'] },
    }),
  ],
  server: { port: 5173 },
})
