import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub project pages: https://lhj77432-ux.github.io/vocab-share/
export default defineConfig({
  plugins: [react()],
  base: '/vocab-share/',
})
