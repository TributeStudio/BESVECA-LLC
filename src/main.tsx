import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppProvider } from './context/AppContext'
import App from './App.tsx'
import './index.css'

console.log('App version:', new Date().toISOString());
// @ts-expect-error Injected by the deployment environment when present.
console.log('Build timestamp:', typeof __BUILD_TIMESTAMP__ !== 'undefined' ? __BUILD_TIMESTAMP__ : 'Unknown');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
)
