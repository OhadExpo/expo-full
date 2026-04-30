import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // No source maps in prod (see security rationale in coach-app vite.config.js).
  build: { sourcemap: false },
  plugins: [react()],
  server: { port: 5174 }, // 5173 is occupied by the main expo-full dev server
})
