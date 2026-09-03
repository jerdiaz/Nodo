# Por hacer en Firebase

Tareas que **no se pueden hacer desde el código** y que necesitan a alguien con
acceso a la consola de Firebase / Google Cloud del proyecto.

| | |
|---|---|
| **Proyecto** | `nodo-comunidad` |
| **Número de proyecto** | `99790926806` |
| **Consola** | <https://console.firebase.google.com/project/nodo-comunidad> |
| **Sitio** | <https://nodo-eventos.duckdns.org> |

Ninguna de estas tareas requiere volver a desplegar la aplicación: las reglas y
la configuración viven en Firebase, no en el contenedor del VPS. El código que
las aprovecha **ya está desplegado y esperando**.

---

## 1. Activar Firebase Storage — el bloqueo real

**Sin esto no se puede subir ninguna imagen a Nodo.** Ni banners de eventos ni
fotos de perfil.

### Por qué

Firebase Storage nunca se activó en este proyecto: **no existe ningún bucket**.
Se comprobaron los dos nombres posibles (`nodo-comunidad.firebasestorage.app` y
`nodo-comunidad.appspot.com`) y ninguno existe.

Esto significa que la subida de imágenes **nunca ha funcionado**, desde que se
implementó. No se había notado porque los eventos de ejemplo traen imágenes
externas de Unsplash: los cinco `bannerUrl` guardados en Firestore apuntan a
`images.unsplash.com`, ninguno a Firebase.

### Qué hacer

1. Consola de Firebase → **Storage** → **Comenzar / Get started**.
2. Elegir ubicación. **Es irreversible**: conviene `us-central1` o la región más
   cercana a los usuarios (Colombia). No se puede cambiar después.
3. Al terminar, el bucket queda creado.

### Cómo verificar

Entrar al sitio, ir a **Configuración**, subir una foto de perfil y guardar.
Debe aparecer sin error. Si falla, revisar la tarea 2.

---

## 2. Publicar las reglas de Storage

**Prioridad baja.** Es higiene, no un bloqueo: la aplicación escribe con el
Admin SDK, que no pasa por estas reglas.

### Qué hacer

Consola → **Storage** → pestaña **Rules** → reemplazar **todo** el contenido
por lo que hay en [`storage.rules`](storage.rules) de este repositorio, y
publicar.

> ⚠️ **Pegar el bloque completo.** Publicar reemplaza las reglas enteras: pegar
> solo un fragmento rompe lo que no se incluya.

Con el CLI, desde la raíz del repositorio actualizado:

```bash
firebase deploy --only storage
```

### Por qué las reglas deniegan toda escritura

Las imágenes ya no van del navegador a Storage: pasan por `POST /api/imagenes`,
que las revisa y recorta antes de guardarlas con el Admin SDK. Ningún cliente
necesita permiso de escritura, así que se deniega por completo. La lectura
pública no depende de estas reglas: las URLs llevan el token de descarga que
genera la propia subida.

---

## 3. Activar Cloud Vision — moderación de imágenes

**Sin esto las imágenes se aceptan sin revisar.** No se rompe nada, pero nadie
comprueba lo que se sube a una cartelera pública.

### Estado actual

La API responde `PERMISSION_DENIED`: no está habilitada en el proyecto.

El código lo detecta y **acepta la imagen sin revisarla**, registrándola en la
colección `image_moderation` con `checked: false`. Se eligió así a propósito:
ese error significa "la API no está activada" — un estado del despliegue, no
una señal sobre la imagen, y que quien sube no puede provocar. Fallar cerrado
dejaría el producto sin subida de imágenes. **Cualquier otro fallo sí rechaza
la subida.**

### Opción A — activarla en el proyecto de Nodo (recomendada)

<https://console.developers.google.com/apis/api/vision.googleapis.com/overview?project=99790926806>

Pulsar **Habilitar**. Requiere que el proyecto tenga facturación activa (plan
Blaze). Tarda unos minutos en propagarse.

No hay que tocar nada más: el código ya usa la cuenta de servicio de Firebase
para llamar a Vision, y la moderación empieza a funcionar sola.

### Opción B — usar Cloud Vision de otro proyecto

Solo si activarla en Nodo no es posible. Por ejemplo, el proyecto de TransCar
(`transcar-da12c`) ya la tiene habilitada.

1. En la consola de **ese** proyecto: crear una cuenta de servicio con permiso
   para usar Cloud Vision y descargar su clave JSON.
2. Añadir a `/opt/nodo/.env` en el VPS:

   ```
   VISION_PROJECT_ID=transcar-da12c
   VISION_CLIENT_EMAIL=...
   VISION_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

   Conservar las comillas y los `\n` literales, igual que `FIREBASE_PRIVATE_KEY`.
3. Reiniciar el contenedor: `docker compose up -d`.

**Las tres variables tienen que estar presentes**; con dos de tres se ignoran y
se usa la cuenta de Firebase.

> ⚠️ **El consumo se factura al proyecto de las credenciales.** Con la opción B,
> la cuota y el gasto de Vision se cargan a TransCar, no a Nodo.

### Cómo verificar

Subir una imagen y mirar la colección `image_moderation` en Firestore: el
documento nuevo debe tener `checked: true` y las puntuaciones de SafeSearch.

### Umbrales

Se rechaza si `adult`, `violence` o `racy` salen `LIKELY` o `VERY_LIKELY`. Son
los mismos que usa TransCar en su moderación del feed comunitario.

---

## 4. Marcar el primer administrador

**Sin esto nadie puede conceder verificaciones**, y la página `/admin` responde
404 para todo el mundo.

Es el único eslabón manual del sistema, y no se puede evitar sin dejar una
puerta abierta: si la aplicación pudiera nombrar administradores, cualquiera
podría nombrarse a sí mismo.

### Orden obligatorio

La colección `users` está vacía. **El documento no existe hasta que la persona
entra por primera vez**, así que no se puede editar antes.

1. **Manuel primero**: entrar al sitio con Google o Microsoft. Como es el primer
   inicio de sesión, la aplicación lleva a `/bienvenida`: elegir nombre de
   usuario y pulsar *Continuar*. **Eso crea el documento.**
2. **Después, en la consola**: *Firestore Database* → colección `users` →
   documento con ID `wJrgMsYFGEXx1KYj6dBYGJQprVq1` → **Añadir campo**:

   | Campo | Tipo | Valor |
   |---|---|---|
   | `admin` | boolean | `true` |

### Cómo verificar

Recargar el sitio y abrir <https://nodo-eventos.duckdns.org/admin>. Debe
mostrar el panel en vez de un 404.

A partir de ahí se conceden verificaciones desde la propia aplicación, sin
volver a la consola.

---

## Pendiente de decisión (no es una tarea)

Las reglas de Firestore (`firestore.rules`) permiten hoy que **cualquier usuario
autenticado escriba documentos de eventos directamente** con el SDK de cliente,
saltándose toda la validación de la aplicación.

Nada en Nodo escribe así —todo pasa por las rutas API con el Admin SDK—, pero
la puerta está abierta. Un documento malformado tumbaría el listado de eventos
para todo el mundo, porque el mapeo llama `.toDate()` sin defensa.

El arreglo es cambiar el bloque de `events` a `allow write: if false;`. **No se
ha hecho porque no está decidido**, no por olvido.

---

## Qué funciona mientras tanto

Todo lo demás. Concretamente:

- Publicar, editar y eliminar eventos **sin imagen**.
- Perfil, configuración, nombre de usuario, biografía y enlaces sociales.
- Suscripción iCal al calendario propio.
- Asistencias (RSVP) y el calendario.
- Eliminación de cuenta con transferencia o borrado en cascada.

Lo único que no funciona sin la tarea 1 es **subir imágenes**.
