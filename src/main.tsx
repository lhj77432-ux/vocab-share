import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

/**
 * Puter.js auto-opens a login popup when cloud AI is used while signed out.
 * We never want that on this site (esp. mobile). Neuter signIn as soon as
 * Puter appears; AI path in api.ts also skips Puter unless already signed in.
 */
function neuterPuterSignIn() {
  const p = typeof window !== 'undefined' ? window.puter : undefined
  if (!p?.auth) return false
  try {
    p.auth.signIn = () => Promise.reject(new Error('PUTER_AUTH_DISABLED'))
  } catch {
    /* ignore */
  }
  return true
}

neuterPuterSignIn()
if (!neuterPuterSignIn()) {
  const started = Date.now()
  const timer = window.setInterval(() => {
    if (neuterPuterSignIn() || Date.now() - started > 15000) {
      window.clearInterval(timer)
    }
  }, 50)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
