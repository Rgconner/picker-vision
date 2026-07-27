import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { MobilePickerView } from './MobilePickerView'
import { WelcomePage } from './WelcomePage'
import { DemoPage } from './DemoPage'
import './index.css'

const path = window.location.pathname

// /         → welcome / origin story landing page
// /demo     → demo explainer + scannable labels (no login required)
// /app      → full desktop picker-vision app (login → operator/supervisor/etc.)
// /app/*    → same
// /mobile   → standalone mobile picker view
// /mobile/* → same
// anything else → also the full app (preserves existing deep-link behaviour)

const root = document.getElementById('root')!

if (path === '/' || path === '') {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <WelcomePage />
    </React.StrictMode>
  )
} else if (path === '/demo') {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <DemoPage />
    </React.StrictMode>
  )
} else if (path.startsWith('/mobile')) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <MobilePickerView />
    </React.StrictMode>
  )
} else {
  // /app, /app/*, and any legacy paths all render the full App
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}
