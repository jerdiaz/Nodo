# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev            # Dev server at localhost:4321 (Vite loads .env normally)
npm run check           # astro check + strict TypeScript — run before every commit
npm run build            # Production build to dist/ (client + server)
npm run preview           # Serve the built dist/ standalone; loads .env via --env-file-if-exists
                           # since the standalone Node build does not dotenv-load on its own
npm run db:seed            # Seed 4 sample events into Firestore (scripts/seed.mjs)
```

There is no test suite and no lint script — `astro check` (strict TS across `.astro` and `.ts` files) is the only correctness gate. Always run both `npm run check` and `npm run build` before committing.

## Architecture

Astro, fully SSR (`output: 'server'`, `@astrojs/node` adapter in `standalone` mode) — no prerendered pages, every route hits Firebase per-request. Firestore is the only datastore; there is no database on the VPS.

### Auth: server-verified session cookies, not client ID tokens

Login flow: `firebase/client.ts` (`signInWithPopup`) → gets an ID token → `POST /api/auth/session` → `firebase/server.ts`'s Admin SDK verifies the token and mints an `httpOnly` `__session` cookie (5 days). From then on, `src/lib/auth.ts`'s `getCurrentUser(cookies)` is the single source of truth for "who is logged in" — it takes `AstroCookies` so the exact same function works in both `.astro` frontmatter (`Astro.cookies`) and API routes (`cookies` from `APIContext`). It never throws; a missing/invalid/expired cookie just resolves to `null`, which is what makes the graceful-degradation pattern below work.

`firebase/client.ts` (browser Firebase SDK, public config) must only be imported from inline `<script>` blocks, never from `.astro` frontmatter — frontmatter is server-side and the browser SDK isn't meant to run there.

### Two Firebase server surfaces, and why secrets are read lazily

`firebase/server.ts` exposes `getAdminDb()` / `getAdminAuth()`, both backed by one lazily-created Admin app. Server secrets (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`) are read via `getSecret()` from `astro:env/server` (declared `optional: true` in `astro.config.mjs`) — **not** `process.env` directly, and **not** named imports from `astro:env/server`. Both alternatives are real bugs that shipped and got reverted:

- `process.env.X` works in Docker (real container env vars) but Vite never populates it from a local `.env` file for unprefixed vars, so local dev/preview would silently see `undefined`.
- Named imports (`import { X } from 'astro:env/server'`) validate the *entire* schema eagerly the moment the module is imported — if a required field is missing, that throws during module evaluation, before any `try/catch` around the caller can catch it. `getSecret('X')` only resolves when actually called, inside `getAdminDb()`/`getAdminAuth()`, which is what lets pages/API routes catch "Firebase not configured" and degrade gracefully instead of 500ing.

Every page that reads events wraps `getEvents()` in `try/catch` and falls back to an empty array + `EmptyState` — this is intentional, not defensive boilerplate to trim.

`getAdminDb()` also calls `.settings({ ignoreUndefinedProperties: true })` once, on first app creation. Optional event fields (city, venue, meetingUrl, bannerUrl...) arrive as `undefined` when not applicable to a given modality, and the Admin SDK rejects `undefined` field values by default — without this setting, creating/editing a virtual event with no city would throw.

### Event data layer

`lib/firebase/events.ts`: `getEvents(filters?)` always does **one** Firestore read (`orderBy('startDate')`, no composite index needed) and applies `filterEvents()` in memory — deliberately, to avoid depending on composite indexes that don't exist. Pages that need both an unfiltered list (e.g. to derive available cities or unique organizers) and a filtered view call `getEvents()` once and reuse `filterEvents()` locally, rather than querying twice. `getEventBySlug()` queries the `slug` field directly (Firestore doc ID and `slug` are always kept equal by convention — event creation does `.doc(slug).set(...)`, and editing never changes it).

`lib/eventValidation.ts` (`validateEventPayload`) is shared between `POST /api/events` (create) and `PUT /api/events/[id]` (edit) so the two never drift. Ownership enforcement (`organizer.uid === user.uid`) happens in application code in `[id].ts`, by reading the existing doc before writing — **not** in `firestore.rules`. The Admin SDK bypasses security rules entirely; `firestore.rules` only matters for hypothetical direct client-SDK writes, which nothing in this app does today (all writes go through the API routes).

`components/events/EventForm.astro` is one component used by both `/eventos/nuevo` (create) and `/eventos/[slug]/editar` (edit, pre-filled via an optional `event` prop). Mode-specific behavior (POST vs PUT, submit URL, button label) is read by the form's own inline script from `data-method`/`data-action` attributes on the `<form>` element rather than being duplicated per page.

### Timezone

`NodoEvent.timezone` (IANA string, default `'America/Bogota'`) is stored per event and threaded through every formatter in `lib/format.ts` via a `timezone?` parameter. Never call bare `Date` methods (`.getDate()`, `.getMonth()`) or an `Intl.DateTimeFormat` without an explicit `timeZone` on event dates — the server's runtime timezone (which differs between local dev and the VPS) is not the event's timezone, and this exact bug shipped once already in the event detail page.

### Deployment: build-time vs runtime env split (Docker)

`PUBLIC_FIREBASE_*` vars are inlined into the browser JS bundle **at `docker build` time** (Vite/Astro static replacement), while `FIREBASE_PROJECT_ID`/`FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY` are read **at container runtime** via `astro:env`. `.dockerignore` excludes `.env` (correctly, so the private key never lands in an image layer), which means the `PUBLIC_*` vars must be passed explicitly as `--build-arg` — both in the `Dockerfile` (`ARG`/`ENV` in the `build` stage) and in `docker-compose.yml` (`build.args`, which Compose resolves from `.env` via its own variable-interpolation mechanism, separate from the `env_file:` directive that only injects into the running container). If a new `PUBLIC_*` var is ever added, **both** places need it or the browser bundle silently bakes in `undefined` and Firebase Auth breaks client-side with `auth/invalid-api-key` while everything server-rendered keeps working fine — this exact failure has already happened once in production.

The VPS is **arm64**; the image is built on the VPS itself (not the GitHub Actions runner) so `sharp`'s native binaries resolve for the right architecture — see `.github/workflows/deploy.yml` and `docker-compose.yml` for the full deploy pipeline (SSH + `git reset --hard` + `docker compose up -d --build`, triggered on every push to `main`). Deploy secrets live in `/opt/nodo/.env` on the VPS, outside git.

## Convention: one commit per implementation

Established with the user: each feature/fix is its own commit, without a co-authorship trailer (differs from the default Claude Code attribution behavior — this repo explicitly opted out). Before pushing, `git fetch` and check `main..origin/main` — other sessions (Gemini, or the user directly) have pushed infrastructure changes (`docker-compose.yml`, the CI workflow) directly to this repo without going through this agent.
