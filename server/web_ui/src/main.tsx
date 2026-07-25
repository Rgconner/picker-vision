import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { MobilePickerView } from './MobilePickerView'
import './index.css'

// Render the standalone mobile view when the path starts with /mobile.
// All other paths render the full desktop App.
const isMobileRoute = window.location.pathname.startsWith('/mobile')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isMobileRoute ? <MobilePickerView /> : <App />}
  </React.StrictMode>,
)
