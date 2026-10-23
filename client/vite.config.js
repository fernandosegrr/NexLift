import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Vite only transpiles. Explicit emit settings let a standalone client copy
  // compile real TSX without the monorepo's parent typecheck configuration.
  // The strict tsc project remains unchanged; phase44 tests compare these flags.
  esbuild: {
    // A string is intentional: Vite merges object-form options with the parent
    // tsconfig before transforming TSX; the string form is self-contained.
    tsconfigRaw: JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        jsx: 'react-jsx',
        useDefineForClassFields: true,
        verbatimModuleSyntax: true,
      },
    }),
  },
  build: {
    // Chunks estables: al actualizar una página no se invalida todo el vendor
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory')) {
            return 'recharts'
          }
          if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('canvg') || id.includes('fflate')) {
            return 'pdf'
          }
          if (id.includes('react-dom') || id.includes('react-router') || id.includes('/react/') || id.includes('\\react\\')) {
            return 'react-vendor'
          }
          if (id.includes('lucide-react')) {
            return 'icons'
          }
        }
      }
    },
    chunkSizeWarningLimit: 600
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  }
})
