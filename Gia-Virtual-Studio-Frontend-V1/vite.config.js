import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/auth': 'http://127.0.0.1:8000',
      '/api': 'http://127.0.0.1:8000',
    },
  },
  assetsInclude: ['**/*.glb', '**/*.gltf'],
  publicDir: 'public',
  optimizeDeps: {
    exclude: ['@babylonjs/core'],
  },
  build: {
    target: 'esnext',
    sourcemap: false,
    cssMinify: true,
    chunkSizeWarningLimit: 2200,
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        // Keep @babylonjs/core in a single chunk to avoid
        // "Class extends value undefined" errors at runtime.
        manualChunks(id) {
          if (id.includes('node_modules/@babylonjs')) {
            return 'babylon';
          }
        },
      },
    },
  },
})
