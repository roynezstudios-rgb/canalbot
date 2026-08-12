# Probar CanalBot con el dashboard local

El dashboard local une la interfaz visual con el código real de CanalBot. La primera ejecución fuerza un modo seguro:

- permite generar y escanear el QR;
- conserva la sesión de WhatsApp en `auth/main`;
- desactiva los comandos entrantes;
- desactiva los trabajos automáticos;
- bloquea la función que envía mensajes a WhatsApp;
- no publica ni aunque un canal antiguo estuviera marcado como activo.

## 1. Instalar dependencias

Desde la carpeta de CanalBot:

```powershell
npm install
npm --prefix dashboard install
```

## 2. Preparar MySQL

Con un usuario administrador de MySQL, crea la base y el usuario local. Cambia la contraseña del ejemplo:

```sql
CREATE DATABASE canalbot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'canalbot'@'127.0.0.1' IDENTIFIED BY 'CAMBIA-ESTA-CONTRASEÑA';
GRANT ALL PRIVILEGES ON canalbot.* TO 'canalbot'@'127.0.0.1';
FLUSH PRIVILEGES;
```

Copia `.env.example` como `.env` y completa `MYSQL_PASSWORD`. Conserva estas protecciones para la primera prueba:

```dotenv
WA_DRY_RUN=true
CANALBOT_ENABLE=false
CANALBOT_PUBLISH_ENABLED=false
CANALBOT_DASHBOARD_ENABLED=true
CANALBOT_DASHBOARD_HOST=127.0.0.1
```

Aplica el esquema:

```powershell
npm run migrate
```

## 3. Encender el entorno local

```powershell
npm run local
```

Abre [http://localhost:3000](http://localhost:3000). La misma orden levanta:

- el dashboard en `localhost:3000`;
- la API local en `127.0.0.1:3210`;
- la conexión de WhatsApp en modo seguro.

Para apagar ambos procesos:

```powershell
npm run local:stop
```

### Vista de demostración

Si todavía no tienes MySQL preparado, puedes revisar el diseño completo con datos ficticios:

```text
http://localhost:3000/?demo=1
```

La vista incluye estadísticas, tres canales, campañas y una cola con textos, imágenes y videos de ejemplo. No escribe en la base de datos y cualquier botón que normalmente ejecutaría una acción real queda bloqueado.

Para ver directamente la pantalla de conexión demostrativa usa:

```text
http://localhost:3000/?demo=1&view=connection
```

La vista normal no carga estos ejemplos. Además, cuando existe una sesión vinculada, el dashboard oculta por completo el número de teléfono en las superficies visibles.

La API rechaza cualquier intento de escuchar directamente fuera de localhost. Para acceso remoto usa un túnel o proxy con autenticación y HTTPS que mantenga la API enlazada a `127.0.0.1`.

## 4. Vincular el teléfono

En el teléfono abre:

1. WhatsApp.
2. Ajustes.
3. Dispositivos vinculados.
4. Vincular un dispositivo.
5. Escanea el QR del dashboard.

El QR es temporal y se renueva automáticamente. La sesión se guarda localmente y no se sube al repositorio.

## 5. Registrar un canal

Antes de agregarlo, el número vinculado debe ser administrador del canal. El formulario requiere:

- enlace `https://whatsapp.com/channel/...`;
- un nombre explícito para guardarlo;
- confirmación del permiso de administrador.

El flujo usa la misma resolución de canal que este comando existente:

```text
!ac https://whatsapp.com/channel/INVITE Nombre del canal
```

## Funciones conectadas al código real

| Interfaz | Respaldo real |
|---|---|
| Estado y QR | Eventos de conexión de Baileys y `data/latest-qr.png` |
| Estadística de publicados | `wa_channel_queue.status='published'` |
| Canales | `wa_channels` y resolución de newsletters de WhatsApp |
| Cola editorial | `wa_channel_queue` |
| Nueva publicación | Inserta texto/imagen/video en la cola y copia multimedia al almacenamiento local |
| Campañas | `wa_campaigns` y sus contadores de piezas |
| Actividad | `wa_actions_log` |

La carga de piezas dentro de una campaña sigue usando el flujo real de WhatsApp (`!camp iniciar`, contenido, `!camp fin`). No se agregó un botón web ficticio para una función que aún no existe en el backend.

## Qué no hacer durante la primera prueba

No cambies todavía `WA_DRY_RUN`, `CANALBOT_ENABLE` ni `CANALBOT_PUBLISH_ENABLED`. La activación de publicaciones reales debe hacerse como una etapa separada después de validar número, canal, permisos y MySQL.
