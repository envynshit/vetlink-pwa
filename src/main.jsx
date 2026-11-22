import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initDatabase } from './db/database'
import { registerSW } from 'virtual:pwa-register'

// Automatic Cache & Service Worker Reset:
// Purges stale Service Workers and outdated CacheStorage buckets on mobile updates
// while keeping local IndexedDB clinical records completely safe.
const APP_CACHE_VERSION = 'vetlink-onnx-v2.2'

async function enforceFreshOfflineCache() {
  try {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return
    if (!navigator.onLine) return

    const savedVersion = localStorage.getItem('vetlink_cache_version')
    if (savedVersion === APP_CACHE_VERSION) return

    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      for (const reg of registrations) {
        await reg.unregister()
      }
    }

    if ('caches' in window) {
      const cacheNames = await caches.keys()
      for (const name of cacheNames) {
        await caches.delete(name)
      }
    }

    localStorage.setItem('vetlink_cache_version', APP_CACHE_VERSION)
    window.location.reload()
  } catch (err) {
    console.warn('[VetLink PWA] Cache cleanup skipped:', err)
  }
}

enforceFreshOfflineCache()

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
