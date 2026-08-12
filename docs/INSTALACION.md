# Instalar CanalBot

CanalBot es un programador de contenido para canales de WhatsApp. GuardianBot se conserva como módulo opcional en la misma base técnica.

- **CanalBot**: publica y programa contenido en canales de WhatsApp desde un grupo de control.
- **GuardianBot**: administra grupos, reportes, filtros, horarios, bienvenida, XP, revistas y moderacion.
- **Suite CanalBot + GuardianBot**: usa ambos productos con una sola sesion de WhatsApp/Baileys.

La sesion de WhatsApp es unica. Si se instala la suite, CanalBot y GuardianBot comparten el mismo numero vinculado.

## Requisitos

- VPS o servidor Linux.
- Node.js 20 o superior.
- MySQL 8 o compatible.
- Un numero de WhatsApp que pueda vincularse como dispositivo.
- El numero debe ser admin de los grupos/canales donde vaya a operar.

## Instalacion rapida desde terminal

```bash
unzip canalbot-0.2.1.zip
cd canalbot-0.2.1
npm run setup -- canalbot
```

Ediciones disponibles:

```bash
npm run setup -- canalbot
npm run setup -- guardianbot
npm run setup -- suite
```

El instalador:

- crea `.env` desde `.env.example` si no existe;
- crea carpetas `auth/main`, `data/media-cache` y `logs`;
- configura la edicion elegida;
- instala dependencias;
- ejecuta migraciones;
- ejecuta pruebas.

Si la base de datos todavia no esta lista:

```bash
SKIP_MIGRATE=true npm run setup -- suite
```

## Configuracion de base de datos

Editar `.env`:

```env
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=whatsapp_guardian
MYSQL_USER=wa_guardian
MYSQL_PASSWORD=replace-me
```

Crear base y usuario:

```sql
CREATE DATABASE whatsapp_guardian CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'wa_guardian'@'127.0.0.1' IDENTIFIED BY 'CAMBIAR_PASSWORD';
GRANT ALL PRIVILEGES ON whatsapp_guardian.* TO 'wa_guardian'@'127.0.0.1';
FLUSH PRIVILEGES;
```

Aplicar migraciones:

```bash
npm run migrate
```

## Elegir producto manualmente

En `.env`:

### CanalBot

```env
CANALBOT_ENABLE=true
GUARDIAN_ENABLE=false
```

### GuardianBot

```env
CANALBOT_ENABLE=false
GUARDIAN_ENABLE=true
GUARDIAN_DRY_RUN=true
GUARDIAN_OBSERVE_ONLY=true
GUARDIAN_DESTRUCTIVE_ACTIONS=false
```

### Suite

```env
CANALBOT_ENABLE=true
GUARDIAN_ENABLE=true
GUARDIAN_DRY_RUN=true
GUARDIAN_OBSERVE_ONLY=true
GUARDIAN_DESTRUCTIVE_ACTIONS=false
```

Por seguridad, GuardianBot empieza en observacion. Para borrar mensajes, mutear logicamente o expulsar, activar acciones destructivas solo despues de pruebas controladas.

## Vincular el numero de WhatsApp

La vinculacion tiene su propia ruta y no depende de arrancar todo el bot. Esto evita errores durante la primera instalacion.

### Metodo 1: QR en terminal

En `.env` dejar:

```env
WA_PAIRING_PHONE=
WA_AUTH_DIR=auth/main
WA_QR_IMAGE_PATH=data/latest-qr.png
```

Ejecutar:

```bash
npm run pair:qr
```

El sistema imprime el QR en terminal y guarda una imagen en:

```text
data/latest-qr.png
```

En el telefono:

1. Abrir WhatsApp.
2. Ir a Dispositivos vinculados.
3. Tocar Vincular dispositivo.
4. Escanear el QR.

Cuando el script confirme la conexion, la sesion queda guardada en `auth/main`.

### Metodo 2: codigo de emparejamiento

Este metodo es mejor cuando el cliente no puede escanear un QR del servidor.

Ejecutar con el telefono en formato internacional, solo digitos:

```bash
npm run pair:code -- --phone 5215551234567
```

Tambien se puede dejar fijo en `.env`:

```env
WA_PAIRING_PHONE=5215551234567
WA_AUTH_DIR=auth/main
```

Y ejecutar:

```bash
npm run pair:code
```

El sistema muestra el codigo directamente en pantalla. En WhatsApp:

1. Ir a Dispositivos vinculados.
2. Elegir Vincular con numero de telefono.
3. Escribir el codigo mostrado por el bot.

Cuando el script confirme la conexion, la sesion queda guardada en `auth/main`.

### Despues de vincular

Activar conexion normal:

```env
WA_ENABLE_CONNECT=true
```

Arrancar:

```bash
npm start
```

Si se instala desde un panel propio, el panel puede pedir el telefono, ejecutar `npm run pair:code -- --phone NUMERO`, capturar el codigo mostrado por stdout y presentarlo al cliente. Para QR, el panel puede leer `data/latest-qr.png` y mostrarlo en pantalla.

## Primeros comandos

### CanalBot

En el grupo elegido como control:

```text
!canalbot on
!ac https://whatsapp.com/channel/INVITE Nombre del canal
!ca Nombre
!in 90
!pr Texto para publicar
!po texto1 ; texto2 ; texto3
!co
```

El numero vinculado debe ser admin del canal de WhatsApp.

### GuardianBot

En cada grupo donde se usara:

```text
!guardian on
!guardian estado
!palabra lista
!palabras load palabra1, palabra2
!horario 08:00 22:00 America/Mexico_City
!ejemplo
!salud
```

Para activar acciones reales, revisar primero:

```bash
npm run guardian:activation -- readiness --group "120363...@g.us" --stage observe
```

## Servicio systemd

Ejemplo:

```ini
[Unit]
Description=CanalBot
After=network.target mysql.service

[Service]
Type=simple
WorkingDirectory=/opt/canalbot
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
User=whatsappbot

[Install]
WantedBy=multi-user.target
```

Activar:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now canalbot.service
sudo systemctl status canalbot.service
```

## Archivos que no deben compartirse

Nunca incluir en soporte, ZIPs publicos ni backups de entrega:

- `.env`
- `auth/`
- `data/`
- `logs/`
- `node_modules/`

`auth/` contiene la sesion del WhatsApp vinculado.

## Empaquetar una entrega limpia

```bash
npm run package:release
```

El ZIP se crea en `release/` y excluye sesiones, logs, datos, `.env`, dependencias y backups.
