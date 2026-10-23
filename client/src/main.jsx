import { createControllerReloadGuard, warmInitialPublicAssets } from './app/serviceWorkerLifecycle';
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
    const shouldReload = createControllerReloadGuard(Boolean(navigator.serviceWorker.controller))
    let warmedFirstPage = false
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
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      const controller = navigator.serviceWorker.controller
      if (!controller) return
      if (!shouldReload(true)) {
        // These initial resources loaded before the first worker could observe
        // fetches. Warm only public assets without restarting a live form.
        if (!warmedFirstPage) {
          warmedFirstPage = true
          warmInitialPublicAssets(controller, location.origin)
        }
        return
      }
      window.location.reload()
    })
  })
}
