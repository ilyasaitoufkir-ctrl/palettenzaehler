import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

/**
 * Erzeugt beim Build einen Service Worker, der die App Shell
 * (index.html, alle gebauten JS/CSS Dateien, Icons, Manifest) vorab cached.
 */
function serviceWorkerPlugin(): Plugin {
  return {
    name: 'palettenzaehler-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const dateien = Object.keys(bundle)
        .filter((f) => !f.endsWith('.map'))
        .map((f) => '/' + f)
      const statisch = [
        '/',
        '/manifest.webmanifest',
        '/icons/icon-192.png',
        '/icons/icon-512.png',
        '/icons/apple-touch-icon.png',
      ]
      const precache = Array.from(new Set([...statisch, ...dateien]))
      const version = createHash('sha256').update(precache.join('|')).digest('hex').slice(0, 12)
      const vorlage = readFileSync(fileURLToPath(new URL('./sw/sw.template.js', import.meta.url)), 'utf8')
      const quelle = vorlage
        .replace('__PRECACHE__', JSON.stringify(precache))
        .replace('__VERSION__', JSON.stringify(version))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: quelle })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorkerPlugin()],
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
})
