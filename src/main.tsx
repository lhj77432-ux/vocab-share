import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { neuterPuterSignIn } from './lib/puterAuth'

/**
 * Puter.js auto-opens a login popup when cloud AI is used while signed out.
 * Keep signIn neutered site-wide (AI-only). Product login is email+password via accountAuth, not Puter.
 */
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
