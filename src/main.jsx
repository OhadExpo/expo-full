import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider } from './auth.jsx'

// Client list for auth role resolution — imported from ClientPortal's CLIENTS
// This must match the CLIENTS array in ClientPortal.jsx
// We import it here so AuthProvider can resolve client emails to IDs
import { CLIENTS } from './ClientPortal.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider clientList={CLIENTS}>
      <App />
    </AuthProvider>
  </React.StrictMode>
)
