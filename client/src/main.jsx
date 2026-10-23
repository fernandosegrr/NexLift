import { warmInitialPublicAssets } from './app/serviceWorkerLifecycle';
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Let updates wait until existing documents close naturally. Older documents
// have a controllerchange reload listener, so forced activation is unsafe too.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        // Buscar versión nueva al abrir la app
        reg.update().catch(() => {})

      })
      .catch(() => {})

    // Includes updates: keep this document's immutable assets available.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      const controller = navigator.serviceWorker.controller
      if (!controller) return
      warmInitialPublicAssets(controller, location.origin)
    })
  })
}
