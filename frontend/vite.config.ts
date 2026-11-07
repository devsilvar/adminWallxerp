import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { visualizer } from 'rollup-plugin-visualizer'

/**
 * Custom plugin to eliminate render-blocking CSS on production builds.
 * Resolves Google PageSpeed Insights "Requests are blocking the page's initial render"
 * by converting critical-path stylesheets into non-blocking async links with preload and noscript fallback.
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
    // Bundle analyzer - run `npm run build` to see bundle visualization
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
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    assetsInlineLimit: 2048, // Reduce inline limit to 2kB (keep more assets external)
    cssCodeSplit: true, // Split CSS per route
    sourcemap: false, // Disable sourcemaps in production for faster builds
    minify: 'terser', // Use terser for better minification
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Critical: Separate marketing pages & components from application routes
          if (
            id.includes('/pages/marketing/') ||
            id.includes('/components/marketing/')
          ) {
            return 'marketing-site';
          }
          
          // Recharts and charting internals are deliberately NOT forced into a
          // named chunk. Every consumer (SalesExpenseChart, TaxAnalytics,
          // admin TreasuryCharts) sits behind a React.lazy boundary, but a
          // manualChunks rule for shared node_modules gets hoisted into the
          // entry graph — which modulepreloads ~72kB gzip of Recharts on the
          // login page. Falling through to Rollup's own placement keeps it
          // on-demand.

          // Core React runtime (shared across all pages)
          if (id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/react-router-dom/')) {
            return 'vendor-react';
          }

          // UI icons (lucide-react used throughout the app)
          if (id.includes('node_modules/lucide-react/')) {
            return 'vendor-icons';
          }

          // Zustand state management
          if (id.includes('node_modules/zustand')) {
            return 'vendor-state';
          }

          // Form libraries
          if (id.includes('node_modules/react-hook-form') ||
              id.includes('node_modules/zod')) {
            return 'vendor-forms';
          }

          // Date/time libraries
          if (id.includes('node_modules/date-fns')) {
            return 'vendor-dates';
          }

          // No catch-all for the remaining node_modules. A blanket
          // `id.includes('node_modules/')` bucket swallows route-only
          // libraries (Recharts, Redux, PDF tooling) into the entry chunk
          // and defeats lazy loading entirely. Anything not named above is
          // left to Rollup, which places it with the routes that use it.
        },
        // Optimize chunk naming for better caching
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    chunkSizeWarningLimit: 600, // Suppress warnings for vendor chunks
  },
  // Performance optimizations
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'], // Pre-bundle critical deps
    exclude: ['@tanstack/react-query-devtools'], // Exclude dev tools
  },
})
