import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      // Disable SW in dev / Lovable preview iframes
      devOptions: {
        enabled: false,
      },
      includeAssets: [
        "nonfiction-apple-touch-icon-v20261109.png",
        "nonfiction-pwa-icon-192-v20261109.png",
        "nonfiction-pwa-icon-512-v20261109.png",
        "nonfiction-pwa-maskable-512-v20261109.png",
      ],
      // Keep install metadata and icon paths on the app's own origin.
      // public/manifest.webmanifest is the single source of truth.
      manifest: false,
      workbox: {
        // Cache app shell; deny OAuth + auth callbacks + supabase API
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [
          /^\/~oauth/,
          /^\/auth\/callback/,
          /^\/api\//,
          /\/functions\/v1\//,
        ],
        // Avoid runtime caching for Supabase API (always go network)
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: { cacheName: "html", networkTimeoutSeconds: 3 },
          },
          {
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "google-fonts", expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            urlPattern: ({ request, url }) =>
              request.destination === "image" &&
              !/\/(?:apple-touch-icon|icon-|nonfiction-(?:apple-touch-icon|pwa-icon|pwa-maskable))/.test(url.pathname),
            handler: "StaleWhileRevalidate",
            options: { cacheName: "images", expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
        ],
        // Don't precache huge files
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    // Generate sourcemaps so production stack traces show real function names
    // and file locations (e.g. in operational error alerts).
    sourcemap: true,
    // Split heavy vendor libraries into their own chunks so the initial bundle stays small.
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-query": ["@tanstack/react-query"],
          "vendor-charts": ["recharts"],
          "vendor-i18n": ["i18next", "react-i18next", "i18next-browser-languagedetector"],
          "vendor-icons": ["lucide-react"],
          "vendor-forms": ["react-hook-form", "@hookform/resolvers", "zod"],
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
}));
