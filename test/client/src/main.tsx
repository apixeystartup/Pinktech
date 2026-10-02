import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { App } from './App';
import './index.css';

declare const __PINK_ORG_EMBED__: boolean;
if (typeof __PINK_ORG_EMBED__ !== 'undefined' && __PINK_ORG_EMBED__) {
  document.documentElement.classList.add('org-embed-pink');
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          style: { fontSize: '0.85rem' },
          success: { iconTheme: { primary: '#db2777', secondary: 'white' } },
        }}
      />
    </QueryClientProvider>
  </React.StrictMode>,
);
