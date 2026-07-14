import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Service worker: en prod, registrar y forzar update para no quedarse con UI vieja
// (header logo, etc.). Al activar un SW nuevo, recarga la página una vez.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // Buscar versión nueva al abrir la app
        reg.update().catch(() => {})

        // Si hay un worker esperando, activarlo ya
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' })
        }

        reg.addEventListener('updatefound', () => {
          const neu = reg.installing
          if (!neu) return
          neu.addEventListener('statechange', () => {
            if (neu.state === 'installed' && navigator.serviceWorker.controller) {
              neu.postMessage({ type: 'SKIP_WAITING' })
            }
          })
        })
      })
      .catch(() => {})

    // Un solo reload cuando el SW nuevo toma el control
    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    })
  })
}
