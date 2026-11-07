// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import vercel from '@astrojs/vercel/serverless';
import { loadEnv } from 'vite';

const env = loadEnv(process.env.NODE_ENV || 'production', process.cwd(), '');
const publicAppUrl = process.env.PUBLIC_APP_URL || env.PUBLIC_APP_URL;

if (process.argv.includes('build') && !publicAppUrl) {
  throw new Error('[astro.config.mjs] Build assertion failed: PUBLIC_APP_URL environment variable is required.');
}

// https://astro.build/config
export default defineConfig({
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: false,
    }),
  ],
  adapter: vercel(),
  output: 'hybrid',
  server: {
    port: 5175,
    host: true,
  },
});
