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
FROM base AS build
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
