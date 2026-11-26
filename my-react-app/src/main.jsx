import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './responsive.css'
import { emailConfirmationPath, readEmailConfirmation } from './lib/emailConfirmation'

const confirmation = readEmailConfirmation(new URL(window.location.href))
if (confirmation) {
  // Strip callback tokens before either route initializes Supabase Auth.
  window.history.replaceState(window.history.state, '', emailConfirmationPath)
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(error => console.warn('Offline support could not start.', error))
  })
}

const root = createRoot(document.getElementById('root'))
if (confirmation) {
  import('./EmailConfirmation.jsx').then(({ default: EmailConfirmation }) => {
    root.render(<StrictMode><EmailConfirmation callback={confirmation} /></StrictMode>)
  })
} else {
  import('./AuthGate.jsx').then(({ default: AuthGate }) => {
    root.render(<StrictMode><AuthGate /></StrictMode>)
  })
}
