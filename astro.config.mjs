// @ts-check
import { defineConfig, envField } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  site: 'https://nodo-eventos.duckdns.org',

  vite: {
    plugins: [tailwindcss()]
  },

  adapter: node({
    mode: 'standalone'
  }),

  env: {
    schema: {
      FIREBASE_PROJECT_ID: envField.string({ context: 'server', access: 'secret', optional: true }),
      FIREBASE_CLIENT_EMAIL: envField.string({ context: 'server', access: 'secret', optional: true }),
      FIREBASE_PRIVATE_KEY: envField.string({ context: 'server', access: 'secret', optional: true })
    }
  }
});