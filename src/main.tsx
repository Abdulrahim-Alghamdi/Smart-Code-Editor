import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import SmoothScroll from './components/SmoothScroll.tsx'
import { AuthProvider } from './account/AuthContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <SmoothScroll>
        <App />
      </SmoothScroll>
    </AuthProvider>
  </StrictMode>,
)

// The service worker only runs in the built site: in dev it would cache Vite's modules and hide edits
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(console.error))
}
