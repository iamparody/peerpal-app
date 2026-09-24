import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'PeerPal',
        short_name: 'PeerPal',
        description: 'Mental health peer support — always here for you.',
        start_url: '/',
        display: 'standalone',
        background_color: '#1A1410',
        theme_color: '#8FAF9A',
        icons: [
          { src: 'pwa-64x64.png',            sizes: '64x64',   type: 'image/png' },
          { src: 'pwa-192x192.png',          sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png',          sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10 MiB — bundle exceeds 2 MiB default
        navigateFallback: '/index.html',
        // Pull Firebase messaging into the Workbox-generated SW so there is only
        // ONE service worker at scope '/'. Without this, firebase-messaging-sw.js
        // and the Workbox SW fight for the same scope and push never works reliably.
        importScripts: ['firebase-messaging-sw.js'],
        runtimeCaching: [
          {
            urlPattern: /\/breathing/,
            handler: 'CacheFirst',
            options: { cacheName: 'breathing-cache', expiration: { maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/safety-plan'),
            handler: 'NetworkFirst',
            options: { cacheName: 'safety-plan-cache', expiration: { maxAgeSeconds: 60 * 60 * 24 } },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
});
