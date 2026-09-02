import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Relative base so the build works both at the root of a domain and under
  // a GitHub Pages project path like /seadocs/.
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    // The dev server only listens on loopback; the orb portal proxies to it
    // under these public hostnames.
    allowedHosts: ['.orb.swa.sh', '.onamp.dev'],
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
