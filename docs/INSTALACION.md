# Instalar CanalBot

## Requisitos

- Node.js 20 o superior.
- MySQL 8 o compatible.
- Un número de WhatsApp que sea administrador de los canales que operará.

## Preparar

```bash
unzip canalbot.zip
cd canalbot
npm run setup
```

Edita `.env` con los datos de MySQL. La instalación aplica migraciones y pruebas.

## Vincular WhatsApp

Por QR:

```bash
npm run pair:qr
```

El QR aparece en la terminal y se guarda en `data/latest-qr.png`.

Por código:

```bash
npm run pair:code -- --phone 5215551234567
```

En WhatsApp abre **Dispositivos vinculados** y completa el método elegido. Después cambia `WA_ENABLE_CONNECT=true` en `.env` y ejecuta:

```bash
npm start
```

No compartas `.env`, `auth/`, `data/` ni `logs/`: contienen configuración, sesión y contenido local.
