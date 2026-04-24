import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' }, // repCounterWorker dynamically imports @mediapipe/tasks-vision — needs ES module format for code splitting
})
