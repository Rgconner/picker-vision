import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { MobilePickerView } from './MobilePickerView'
import { WelcomePage } from './WelcomePage'
import { useAuth } from './useAuth'
import './index.css'

const path = window.location.pathname

// /         → welcome / origin story page
// /app      → full desktop picker-vision app (login → operator/supervisor/etc.)
// /app/*    → same
// /mobile   → standalone mobile picker view
// /mobile/* → same
// anything else → also the full app (preserves existing deep-link behaviour)

const root = document.getElementById('root')!

function WelcomeRoot() {
  const auth = useAuth();
  return <WelcomePage auth={auth} />;
}

if (path === '/' || path === '') {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <WelcomeRoot />
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
