# Por hacer en Firebase

Tareas que **no se pueden hacer desde el código** y que necesitan a alguien con
acceso a la consola de Firebase / Google Cloud del proyecto.

| | |
|---|---|
| **Proyecto** | `nododb` |
| **Número de proyecto** | `1005485040427` |
| **Consola** | <https://console.firebase.google.com/project/nododb> |
| **Sitio** | <https://nodo-eventos.duckdns.org> |

> **Migración de proyecto (3 de septiembre de 2026).** Nodo vivía en
> `nodo-comunidad`, cuya cuenta creadora tenía la facturación desactivada. Todo
> se movió a `nododb`, con plan Blaze. Los 5 UIDs de Firebase Auth se
> conservaron intactos con `importUsers`, que es lo que evita que los eventos
> queden huérfanos: el uid es la llave del documento en `users`, de
> `events.organizer.uid` y del documento en `events/{id}/rsvps`.
>
> No se migraron los 4 eventos de ejemplo (sus organizadores `seed-organizer-*`
> no son cuentas reales; se regeneran con `npm run db:seed`) ni la bitácora
> `image_moderation`. Se perdió un RSVP, el de un usuario real a un evento de
> ejemplo. Storage no tenía nada que migrar: el bucket viejo nunca llegó a
> existir.

---

## 1. Activar Cloud Vision — moderación de imágenes

**Sin esto las imágenes se aceptan sin revisar.** No se rompe nada, pero nadie
comprueba lo que se sube a una cartelera pública.

### Estado actual

La API no está habilitada en `nododb`. El código lo detecta y **acepta la
imagen sin revisarla**, registrándola en la colección `image_moderation` con
`checked: false`. Se eligió así a propósito: ese error significa "la API no
está activada" — un estado del despliegue, no una señal sobre la imagen, y que
quien sube no puede provocar. Fallar cerrado dejaría el producto sin subida de
imágenes. **Cualquier otro fallo sí rechaza la subida.**

### Qué hacer

<https://console.developers.google.com/apis/api/vision.googleapis.com/overview?project=1005485040427>

Pulsar **Habilitar**. El proyecto ya está en Blaze, que es el requisito. Tarda
unos minutos en propagarse.

No hay que tocar nada más: el código ya usa la cuenta de servicio de Firebase
para llamar a Vision, y la moderación empieza a funcionar sola.

### Alternativa — usar Cloud Vision de otro proyecto

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

> ⚠️ **El consumo se factura al proyecto de las credenciales.** Con esta vía,
> la cuota y el gasto de Vision se cargan a TransCar, no a Nodo.

### Cómo verificar

Subir una imagen y mirar la colección `image_moderation` en Firestore: el
documento nuevo debe tener `checked: true` y las puntuaciones de SafeSearch.

### Umbrales

Se rechaza si `adult`, `violence` o `racy` salen `LIKELY` o `VERY_LIKELY`. Son
los mismos que usa TransCar en su moderación del feed comunitario.

---

## 2. Configurar el proveedor de Microsoft

**Sin esto, quien tenga cuenta de Microsoft no puede entrar.** Afecta hoy a un
usuario real: `wJrgMsYFGEXx1KYj6dBYGJQprVq1`
(`estebanmanuel600@hotmail.com`), que además es el candidato a administrador de
la tarea 3.

Google sí está habilitado y funciona.

### Qué hacer

1. Registrar la app en <https://portal.azure.com> → *App registrations*, con
   esta URL de redirección:

   ```
   https://nododb.firebaseapp.com/__/auth/handler
   ```

2. Consola de Firebase → *Authentication* → *Sign-in method* → **Microsoft** →
   pegar *ID de aplicación* y *Secreto de aplicación*, y guardar.

El registro del proyecto viejo no sirve: apuntaba al dominio de callback de
`nodo-comunidad`.

---

## 3. Marcar el primer administrador

**Sin esto nadie puede conceder verificaciones**, y la página `/admin` responde
404 para todo el mundo.

Es el único eslabón manual del sistema, y no se puede evitar sin dejar una
puerta abierta: si la aplicación pudiera nombrar administradores, cualquiera
podría nombrarse a sí mismo.

### Qué hacer

A diferencia de antes de la migración, **los documentos de `users` ya existen**:
se importaron con sus uids. No hace falta iniciar sesión primero.

*Firestore Database* → colección `users` → **Añadir campo**:

| Campo | Tipo | Valor |
|---|---|---|
| `admin` | boolean | `true` |

Sobre uno de estos dos documentos:

| uid | Cuenta | Se puede usar hoy |
|---|---|---|
| `wJrgMsYFGEXx1KYj6dBYGJQprVq1` | `estebanmanuel600@hotmail.com` (Microsoft) | No, hasta la tarea 2 |
| `9trpWTAUMBUuKpSNPjMW9V0sQBy2` | `estebangood209@gmail.com` (Google) | Sí |

### Cómo verificar

Recargar el sitio y abrir <https://nodo-eventos.duckdns.org/admin>. Debe
mostrar el panel en vez de un 404.

A partir de ahí se conceden verificaciones desde la propia aplicación, sin
volver a la consola.

---

## 4. Publicaciones de Instagram en la home (opcional)

La home tiene una sección que muestra las últimas publicaciones de
[@redglobalcol](https://www.instagram.com/redglobalcol/). **Hoy está apagada
con un interruptor explícito en el código**, así que no aparece.

### Cómo funciona

`POST /api/instagram/sync` consulta la Graph API y guarda las publicaciones en
la colección `instagram_posts` de Firestore. La página lee de ahí, no de
Instagram: consultar en cada visita gastaría cuota, ataría el tiempo de
respuesta de la home a un servicio ajeno y expondría el token.

Las URLs de imagen de Instagram van firmadas y **caducan**, así que la
sincronización rehospeda cada imagen en Storage. El bucket ya existe, así que
esto funciona.

### Qué hace falta

1. La cuenta de Instagram debe ser **Business o Creator** (no personal).
2. Crear una app en <https://developers.facebook.com> con *Instagram Login for
   Business* y obtener un **token de larga duración** y el **id de la cuenta**.
3. Añadir a `/opt/nodo/.env` en el VPS:

   ```
   INSTAGRAM_TOKEN=...
   INSTAGRAM_USER_ID=...
   SYNC_SECRET=<una cadena larga y aleatoria, inventada por vosotros>
   ```

4. **Encender el interruptor**: poner `MOSTRAR_PUBLICACIONES = true` en
   `src/pages/index.astro`, commitear y desplegar. A diferencia del resto de
   este documento, **esta tarea sí requiere volver a desplegar**, porque vive en
   el código y no en la consola.
5. Programar la sincronización, por ejemplo en el cron del VPS cada 6 horas:

   ```bash
   curl -s -X POST -H "Authorization: Bearer $SYNC_SECRET" \
     https://nodo-eventos.duckdns.org/api/instagram/sync
   ```

> ⚠️ **El token de larga duración caduca a los 60 días.** Hay que renovarlo, o
> la sección se quedará congelada en las últimas publicaciones sincronizadas.
> El endpoint devuelve el mensaje de error de Instagram cuando eso pasa.

No se usa scraping: va contra las condiciones de Instagram y se rompe cada vez
que cambian el HTML. La Basic Display API, que era la vía sencilla, fue
retirada por Meta.

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

## Qué funciona

Todo lo demás, **incluida la subida de imágenes**, que nunca había funcionado
antes de la migración porque el proyecto viejo no llegó a tener bucket:

- Publicar, editar y eliminar eventos, con imagen o sin ella.
- Perfil, configuración, nombre de usuario, biografía y enlaces sociales.
- Suscripción iCal al calendario propio.
- Asistencias (RSVP) y el calendario.
- Eliminación de cuenta con transferencia o borrado en cascada.
- Inicio de sesión con Google.
