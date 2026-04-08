/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Go",
        short_name: "Go",
        start_url: "/",
        display: "standalone",
        theme_color: "#0ea5e9",
        background_color: "#1a1d23",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        navigateFallbackDenylist: [/^\/api\//, /^\/.auth\//],
        runtimeCaching: [
          {
            urlPattern: /\.(?:js|css|html|svg|png|ico|woff2?)$/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "static-assets",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
            },
          },
          {
            urlPattern: /^.*\/api\/(?!redirect\/).*/,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 24 * 60 * 60,
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:7071",
        changeOrigin: true,
      },
      "/go-redirect": {
        target: "http://localhost:7071",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/go-redirect/, ""),
      },
    },
  },
  test: {
    environment: "happy-dom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
