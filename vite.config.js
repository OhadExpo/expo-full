import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // prompt: don't auto-activate a new SW; let SwUpdateBanner show a
      // refresh toast first so users on the installed PWA know to refresh
      // (autoUpdate would silently swap on next load — fine for browsers,
      // bad for the Add-to-Home Screen experience that rarely closes).
      registerType: 'prompt',
      // Registration is handled by useRegisterSW inside SwUpdateBanner — no
      // auto-injected script tag, no double registration.
      injectRegister: false,
      includeAssets: ['favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png', 'favicon-48x48.png', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'nord-fonts.css'],
      manifest: {
        name: 'EXPO',
        short_name: 'EXPO',
        description: 'EXPO fitness coaching portal',
        theme_color: '#0a0a0b',
        background_color: '#0a0a0b',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/portal',
        scope: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,ttf}'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api/, /supabase/]
      }
    })
  ]
})
