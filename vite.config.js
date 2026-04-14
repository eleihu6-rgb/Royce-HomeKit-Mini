import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

/**
 * Plugin: serve pages/*.html as raw HTML fragments without Vite HMR injection.
 * These are legacy page partials fetched at runtime by LegacyPage.tsx.
 */
function rawPageFragments() {
  return {
    name: 'raw-page-fragments',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/pages/') || !req.url.endsWith('.html')) {
          return next()
        }
        const filePath = path.join(process.cwd(), req.url)
        if (!fs.existsSync(filePath)) return next()
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(fs.readFileSync(filePath, 'utf-8'))
      })
    },
  }
}

export default defineConfig({
  root: '.',
  plugins: [rawPageFragments(), react()],
  server: {
    port: 5173,
    open: false,
    proxy: {
      '/api': {
        target: 'http://localhost:8088',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'index.html',
    },
  },
})
