# FUSE OPS — despliegue en Vercel (base compartida)

Con esto la plataforma queda en una URL pública compartible (https://tu-proyecto.vercel.app)
y todos los perfiles —sensores desde sus celulares, emprendedor y analista— leen y
escriben LA MISMA base en tiempo real. Se acaban los problemas de almacenamiento local.

## Qué contiene esta carpeta

- `index.html` — la app completa. Al abrirse detecta la API y entra en modo
  "base compartida"; si la API no está, cae sola a almacenamiento local.
- `api/db.js` — la base compartida (registros, consultas, avisos). Fusiona por id,
  así dos perfiles guardando a la vez no se pisan.
- `api/media.js` — fotos y audio de cada registro, separados para mantener la base liviana.
- `package.json`, `vercel.json` — configuración mínima.

## Despliegue (10 minutos, todo en el plan gratuito)

### Paso 1 — Sube el proyecto a Vercel

**Opción A · con GitHub (recomendada):**
1. Crea un repositorio nuevo en github.com y sube el contenido de esta carpeta
   (los archivos sueltos en la raíz, no la carpeta comprimida).
2. Entra a vercel.com → **Add New → Project** → importa ese repositorio → **Deploy**.

**Opción B · con la línea de comandos:**
1. Instala Node.js y luego: `npm i -g vercel`
2. Dentro de esta carpeta: `vercel` (sigue las preguntas) y después `vercel --prod`

Al terminar tendrás una URL tipo `https://fuse-ops.vercel.app`. La app ya abre,
pero todavía guarda en el navegador: falta el paso 2.

### Paso 2 — Conecta la base de datos (Upstash Redis, gratis)

1. En el panel de tu proyecto en Vercel → pestaña **Storage**.
2. **Create Database** → elige **Upstash for Redis** (o "Redis") → plan **Free** → crea.
3. En la base creada: **Connect Project** → selecciona tu proyecto → conectar.
   (Vercel inyecta solo las variables `UPSTASH_REDIS_REST_URL` y
   `UPSTASH_REDIS_REST_TOKEN`; el código también acepta las `KV_*` antiguas.)
4. Redespliega para que las variables entren: pestaña **Deployments** →
   menú `⋯` del último deployment → **Redeploy**.

### Paso 3 — Verifica

- Abre `https://TU-URL.vercel.app/api/db` → debes ver
  `{"registros":[],"consultas":[],"avisos":[]}`. Si ves un error que menciona
  Storage, repite el paso 2 y el redeploy.
- Abre la app en dos dispositivos: registra un incidente de prioridad alta desde
  el celular (perfil Sensor) y míralo aparecer solo, con su alerta, en el perfil
  Emprendedor de la laptop. Al entrar verás el aviso
  "Conectado a la base compartida".

### Compartir

Manda la URL por WhatsApp al equipo. Cada quien elige su perfil al entrar; no
hay nada que instalar.

## Notas y límites del plan gratuito

- **Adjuntos:** hasta ~900 KB por registro (≈3 fotos comprimidas + un audio de
  2 minutos entra bien). Si se excede, la app guarda el texto igual y avisa que
  los adjuntos no subieron.
- **Privacidad:** la URL es pública para quien la tenga; el prototipo no tiene
  contraseñas. No registres datos sensibles reales durante las pruebas.
- **Borrar la base para una demo limpia:** en Upstash (consola de la base) →
  Data Browser → elimina las claves que empiezan con `fuse-ops:`. O desde la
  terminal: `curl -X POST TU_UPSTASH_URL -H "Authorization: Bearer TU_TOKEN"
  -d '["DEL","fuse-ops:db"]'`
- **El borrador con IA del analista** usa la API de Anthropic solo cuando la app
  corre dentro del visor de Claude; en la versión desplegada ese botón indicará
  que no está disponible y el analista redacta a mano con las cifras que la
  pantalla ya le calcula (conteos por área, incidentes, términos repetidos).
