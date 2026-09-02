# Nodo

Plataforma minimalista de eventos y cartelera comunitaria.

## Stack

- [Astro](https://astro.build) (TypeScript estricto, `output: 'server'`)
- [Tailwind CSS v4](https://tailwindcss.com)
- [`@astrojs/node`](https://docs.astro.build/en/guides/integrations-guide/node/) (adaptador SSR, modo `standalone`)
- `lucide-astro`, `clsx`, `tailwind-merge`

## Estructura

```text
src/
├── components/
│   ├── ui/          # componentes de interfaz genéricos
│   ├── events/       # componentes del dominio de eventos
│   └── common/        # Navbar, Footer, etc.
├── layouts/           # BaseLayout.astro
├── lib/                # utilidades (cn, etc.)
├── types/              # tipos de dominio (NodoEvent, etc.)
└── pages/               # rutas
```

## Requisitos

- Node.js **>= 22.12.0** (requerido por Astro; ver `engines` en [package.json](package.json))
- npm

## Instalación local

```bash
npm install
```

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

```bash
docker build -t nodo:latest .
```

### Ejecutar el contenedor

```bash
docker run -d --name nodo -p 4321:4321 nodo:latest
```

La app queda disponible en `http://localhost:4321`.

### Variables de entorno relevantes

| Variable | Default (Dockerfile) | Descripción                          |
| :------- | :-------------------- | :------------------------------------ |
| `HOST`   | `0.0.0.0`              | Host donde escucha el servidor Node   |
| `PORT`   | `4321`                 | Puerto donde escucha el servidor Node |

Para desplegar en un proveedor (Fly.io, Railway, Render, un VPS, etc.), construye y publica la imagen con `docker build`/`docker push` y expón el puerto `4321` (o el que definas vía `PORT`).

## Scripts

| Comando            | Acción                                          |
| :------------------ | :----------------------------------------------- |
| `npm run dev`        | Servidor de desarrollo en `localhost:4321`       |
| `npm run build`       | Build de producción a `./dist/`                  |
| `npm run preview`      | Sirve el build localmente antes de desplegar     |
| `npm run astro ...`     | Ejecuta el CLI de Astro (`astro add`, `astro check`, etc.) |
