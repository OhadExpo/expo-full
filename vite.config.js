import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // No source maps in prod — keeps the readable JS off the public CDN.
  // Doesn't make the bundle uncopyable (anything served to a browser can be
  // read), but raises the bar from "literal source" to "minified bundle".
  build: { sourcemap: false },
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
      // injectManifest: ship our own src/sw.js (push handlers + precache).
      // Generated default (generateSW) had no push hooks.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,ttf}'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
      },
      includeAssets: ['favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png', 'favicon-48x48.png', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-192.png', 'icon-maskable-512.png', 'nord-fonts.css', 'heebo-fonts.css'],
      manifest: {
        name: 'EXPO',
        short_name: 'EXPO',
        description: 'EXPO fitness coaching portal',
        theme_color: '#0a0a0b',
        background_color: '#0a0a0b',
        display: 'standalone',
        orientation: 'portrait',
        // start_url is the URL the installed PWA opens on launch. The
        // earlier value (/portal) had no router branch — AuthGate fell
        // through to a history.replaceState('/') anyway. Land on / and
        // let AuthGate route to /login or the picked portal.
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      // workbox: {...} removed — irrelevant under injectManifest;
      // navigation-fallback denylist now lives in src/sw.js if/when
      // we re-introduce navigation routing.
    })
  ]
})
