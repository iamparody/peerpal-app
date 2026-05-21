import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Tooltip from '@radix-ui/react-tooltip';
import './styles/globals.css';
import './index.css';
import App from './App.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { initSentry } from './services/sentry';

initSentry();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,   // 5 min before refetch
      gcTime:    30 * 60 * 1000,  // 30 min in-memory cache
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Register FCM on first authenticated load
if ('Notification' in window && 'serviceWorker' in navigator) {
  window.addEventListener('mb:register-fcm', async (e) => {
    const token = e.detail?.fcmToken;
    if (!token) return;
    try {
      const { default: client } = await import('./api/client.js');
      await client.patch('/api/profile', { fcm_token: token }).catch(() => {});
    } catch {}
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Tooltip.Provider delayDuration={400}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </Tooltip.Provider>
    </QueryClientProvider>
  </StrictMode>
);
