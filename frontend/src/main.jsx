import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import './index.css'
import './org-explorer.css'
import './product-redesign.css'
import './product-workspace.css'
import './figma-skin.css'
import App from './App.jsx'
// Wireframe alignment layer: must come after App so its shell rules win.
import './wireframe.css'

document.documentElement.dataset.theme = 'light'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster position="top-right" />
    </QueryClientProvider>
  </StrictMode>,
)
