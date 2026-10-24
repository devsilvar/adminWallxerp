import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { visualizer } from 'rollup-plugin-visualizer';

/**
 * Custom plugin to eliminate render-blocking CSS on production builds.
 */
function nonBlockingCssPlugin() {
  return {
    name: 'vite-plugin-non-blocking-css',
    enforce: 'post' as const,
    transformIndexHtml(html: string) {
      return html.replace(
        /<link\s+([^>]*?)\bhref="([^"]+?\.css)"([^>]*?)>/gi,
        (match, before, href, after) => {
          const fullAttrs = `${before} ${after}`;
          if (!/\brel=["']stylesheet["']/i.test(fullAttrs)) {
            return match;
          }
          const hasCrossorigin = /\bcrossorigin\b/i.test(fullAttrs);
          const crossOriginAttr = hasCrossorigin ? ' crossorigin' : '';
          return `<link rel="preload" as="style" href="${href}"${crossOriginAttr}>\n    <link rel="stylesheet" href="${href}" media="print" onload="this.media='all'"${crossOriginAttr}>\n    <noscript><link rel="stylesheet" href="${href}"${crossOriginAttr}></noscript>`;
        }
      );
    },
  };
}

export default defineConfig({
  envPrefix: ['VITE_'],
  plugins: [
    react(),
    tailwindcss(),
    nonBlockingCssPlugin(),
    visualizer({
      filename: './dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    assetsInlineLimit: 2048,
    cssCodeSplit: true,
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router-dom/')
          ) {
            return 'vendor-react';
          }

          if (id.includes('node_modules/lucide-react/')) {
            return 'vendor-icons';
          }

          if (id.includes('node_modules/zustand')) {
            return 'vendor-state';
          }
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    chunkSizeWarningLimit: 600,
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
});
