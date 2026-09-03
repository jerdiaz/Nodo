# Nodo

Plataforma minimalista de eventos y cartelera comunitaria.

## Stack

- [Astro](https://astro.build) (TypeScript estricto, `output: 'server'`)
- [Tailwind CSS v4](https://tailwindcss.com)
- [`@astrojs/node`](https://docs.astro.build/en/guides/integrations-guide/node/) (adaptador SSR, modo `standalone`)
- [Firebase](https://firebase.google.com) (`firebase` en el cliente para Auth, `firebase-admin` en el servidor para Firestore)
- `@lucide/astro`, `clsx`, `tailwind-merge`

## Estructura

```text
src/
├── components/
│   ├── ui/          # componentes de interfaz genéricos
│   ├── events/       # componentes del dominio de eventos
│   └── common/        # Navbar, Footer, etc.
├── layouts/           # BaseLayout.astro
├── lib/
│   ├── firebase/       # client.ts (Auth), server.ts (Admin SDK), events.ts (getEvents)
│   └── utils.ts         # cn, etc.
├── types/              # tipos de dominio (NodoEvent, etc.)
└── pages/               # rutas
```

## Requisitos

- Node.js **>= 22.12.0** (requerido por Astro; ver `engines` en [package.json](package.json))
- npm
- Un proyecto de Firebase (opcional para desarrollo local: sin credenciales, la home cae de forma silenciosa al estado vacío del catálogo)

## Instalación local

```bash
npm install
```

### Variables de entorno

```bash
cp .env.example .env
```

Completa `.env` con las credenciales de tu proyecto de Firebase:

- `PUBLIC_FIREBASE_*`: config del SDK cliente (Auth), tomada de la consola de Firebase → configuración del proyecto.
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`: credenciales de una cuenta de servicio (Firebase Admin), usadas solo en el servidor para leer/escribir en Firestore. `FIREBASE_PRIVATE_KEY` debe conservar los `\n` tal como los entrega la consola.

Si `.env` no está configurado, el build y el servidor funcionan igual: `getEvents()` falla de forma controlada y la home muestra el estado vacío del catálogo.

### Desarrollo

```bash
npm run dev
```

Levanta el servidor de desarrollo en `http://localhost:4321`.

### Build de producción

```bash
npm run build
```

Genera el build SSR en `dist/` (`dist/client` para estáticos, `dist/server` para el servidor Node).

### Previsualizar el build

```bash
npm run preview
```

Sirve el build de `dist/` localmente con el adaptador Node, tal como correría en producción.

## Despliegue con Docker

El [`Dockerfile`](Dockerfile) es multi-stage (`deps` → `build` → `prod-deps` → `runtime`) sobre `node:22-alpine`, y ejecuta el servidor standalone del adaptador Node como usuario no-root.

### Build de la imagen

Las variables `PUBLIC_FIREBASE_*` se incrustan en el JavaScript del navegador **en el momento del build** (no al arrancar el contenedor), así que hay que pasarlas como `--build-arg`. Con un `.env` local ya completado, este comando las toma automáticamente:

```bash
docker build $(grep '^PUBLIC_' .env | sed 's/^/--build-arg /') -t nodo:latest .
```

(Si prefieres no depender de `grep`/`sed`, pasa cada `--build-arg PUBLIC_FIREBASE_X=valor` a mano — son las mismas seis variables `PUBLIC_*` de [`.env.example`](.env.example).)

### Ejecutar el contenedor

Los secretos del Admin SDK (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`), en cambio, se leen en tiempo de ejecución — nunca se hornean en la imagen, se pasan al arrancar el contenedor:

```bash
docker run -d --name nodo -p 4321:4321 \
  -e FIREBASE_PROJECT_ID=... \
  -e FIREBASE_CLIENT_EMAIL=... \
  -e FIREBASE_PRIVATE_KEY='...' \
  nodo:latest
```

La app queda disponible en `http://localhost:4321`. Ojo con `FIREBASE_PRIVATE_KEY`: si usas `docker run --env-file` en vez de `-e`, ese mecanismo de Docker no quita comillas como sí hace `dotenv` — pasa el valor sin comillas envolventes en ese caso, o usa `-e` con comillas de shell simples como en el ejemplo.

### Variables de entorno relevantes

| Variable | Default (Dockerfile) | Cuándo se usa | Descripción                          |
| :------- | :-------------------- | :--- | :------------------------------------ |
| `HOST`   | `0.0.0.0`              | runtime | Host donde escucha el servidor Node   |
| `PORT`   | `4321`                 | runtime | Puerto donde escucha el servidor Node |
| `PUBLIC_FIREBASE_*` (6 variables) | — | **build** (`--build-arg`) | Config del SDK cliente de Firebase, incrustada en el bundle del navegador |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | — | runtime (`-e`) | Credenciales del Admin SDK, nunca en la imagen |

Para desplegar en un proveedor (Fly.io, Railway, Render, un VPS, etc.), construye y publica la imagen con `docker build`/`docker push` y expón el puerto `4321` (o el que definas vía `PORT`).

## Scripts

| Comando            | Acción                                          |
| :------------------ | :----------------------------------------------- |
| `npm run dev`        | Servidor de desarrollo en `localhost:4321`       |
| `npm run build`       | Build de producción a `./dist/`                  |
| `npm run preview`      | Sirve el build localmente antes de desplegar     |
| `npm run check`        | Chequeo de tipos estricto (`astro check`)          |
| `npm run astro ...`     | Ejecuta el CLI de Astro (`astro add`, `astro check`, etc.) |
