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
