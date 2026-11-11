import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initDatabase } from './db/database'
import { registerSW } from 'virtual:pwa-register'

// Automated PWA Auto-Update: Ensures mobile phones immediately run the latest build from Vercel
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('[VetLink PWA] New version detected from Vercel. Updating assets immediately...')
    updateSW(true)
  },
  onOfflineReady() {
    console.log('[VetLink PWA] App is ready for 100% offline clinical use.')
  },
})

// Periodically check for new deployments every 30 seconds when device is online
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  setInterval(async () => {
    if (navigator.onLine) {
      try {
        const registration = await navigator.serviceWorker.getRegistration()
        if (registration) {
          await registration.update()
        }
      } catch (e) {
        // ignore background update check errors
      }
    }
  }, 30000)
}

initDatabase().catch((error) => {
  console.error('Failed to initialize local database:', error)
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
