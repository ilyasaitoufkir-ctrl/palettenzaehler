import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { themaInitialisieren } from './hooks/useTheme'
import './styles/index.css'

themaInitialisieren()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator && import.meta.env.VITE_ROUTER !== 'memory') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* ohne Service Worker läuft die App weiter, nur ohne Offline App Shell */
    })
  })
}
