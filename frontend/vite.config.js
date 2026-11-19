import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Yeh Docker container ko bahar se expose karega
    port: 5173,
    strictPort: true,
  }
})