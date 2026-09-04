# syntax=docker/dockerfile:1
# Astro (adapter: @astrojs/node, output: server) requires Node >=22.12.0,
# so this image uses node:22-alpine rather than node:20-alpine.

ARG NODE_IMAGE=node:22-alpine

# ---- Base ----
FROM ${NODE_IMAGE} AS base
WORKDIR /app

# ---- Dependencies (full, needed to run the build) ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---- Build ----
# Las variables PUBLIC_* de Astro/Vite se incrustan en el bundle del
# navegador en tiempo de build, no de arranque -a diferencia de los
# secretos del servidor (FIREBASE_PROJECT_ID, etc.), que se leen en
# runtime vía astro:env-. Por eso .dockerignore excluye .env (para no
# filtrar los secretos en las capas de la imagen) pero estas SÍ deben
# pasarse explícitamente como --build-arg al construir la imagen; no
# son sensibles, están pensadas para exponerse al cliente.
FROM base AS build
ARG PUBLIC_FIREBASE_API_KEY
ARG PUBLIC_FIREBASE_AUTH_DOMAIN
ARG PUBLIC_FIREBASE_PROJECT_ID
ARG PUBLIC_FIREBASE_STORAGE_BUCKET
ARG PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG PUBLIC_FIREBASE_APP_ID
ENV PUBLIC_FIREBASE_API_KEY=$PUBLIC_FIREBASE_API_KEY \
    PUBLIC_FIREBASE_AUTH_DOMAIN=$PUBLIC_FIREBASE_AUTH_DOMAIN \
    PUBLIC_FIREBASE_PROJECT_ID=$PUBLIC_FIREBASE_PROJECT_ID \
    PUBLIC_FIREBASE_STORAGE_BUCKET=$PUBLIC_FIREBASE_STORAGE_BUCKET \
    PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$PUBLIC_FIREBASE_MESSAGING_SENDER_ID \
    PUBLIC_FIREBASE_APP_ID=$PUBLIC_FIREBASE_APP_ID
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- Production-only dependencies ----
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- Runtime ----
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

EXPOSE 4321
USER node

CMD ["node", "./dist/server/entry.mjs"]
