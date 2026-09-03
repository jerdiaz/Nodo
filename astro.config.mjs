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
      FIREBASE_PRIVATE_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),

      // Credenciales solo para Cloud Vision. Si no se definen, la moderacion
      // usa la cuenta de servicio de Firebase de arriba. Existen para poder
      // apuntar a un proyecto distinto que ya tenga la API habilitada, sin
      // mover Firestore ni Storage de sitio.
      VISION_PROJECT_ID: envField.string({ context: 'server', access: 'secret', optional: true }),
      VISION_CLIENT_EMAIL: envField.string({ context: 'server', access: 'secret', optional: true }),
      VISION_PRIVATE_KEY: envField.string({ context: 'server', access: 'secret', optional: true })
    }
  }
});