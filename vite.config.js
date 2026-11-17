import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  publicDir: "public",
  build: {
    modulePreload: { polyfill: false },
    rollupOptions: { output: { format: "iife" } }
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  }
});
