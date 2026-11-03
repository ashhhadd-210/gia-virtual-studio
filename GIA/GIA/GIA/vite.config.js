import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    exclude: ["@babylonjs/core"],
  },
  server: {
    host: "0.0.0.0",
    port: 8081,
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 8081,
    strictPort: true,
  },
  build: {
    target: "esnext",
    sourcemap: false,
    cssMinify: true,
    chunkSizeWarningLimit: 2200,
    // Inline tiny assets (fonts, small icons) to cut HTTP request count on cold load.
    assetsInlineLimit: 8192,
    rollupOptions: {
      output: {
        assetFileNames: "assets/[name]-[hash][extname]",
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        // Vite 8 (Rolldown) can split @babylonjs/core across chunks; ThinEngine then extends
        // Engine before it is initialized → "Class extends value undefined" and a black canvas.
        manualChunks(id) {
          if (id.includes("node_modules/@babylonjs")) {
            return "babylon";
          }
          if (id.includes("node_modules/howler")) {
            return "audio";
          }
          if (id.includes("node_modules/earcut")) {
            return "vendor";
          }
        },
      },
    },
  },
});
