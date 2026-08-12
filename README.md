# CanalBot

![Portada de CanalBot](docs/assets/canalbot-portada-v1.png)

Programador seguro de contenido para canales de WhatsApp. Captura textos, imágenes y videos desde un grupo de control, publícalos con un ritmo definido, crea campañas diarias y programa stickers por stock.

## Inicio rápido

Requiere Node.js 20+, MySQL 8+ y un número administrador de los canales de destino.

```bash
unzip canalbot.zip
cd canalbot
npm run setup
# configura MYSQL_* en .env
npm run pair:qr
# después: cambia WA_ENABLE_CONNECT=true en .env
npm start
```

También puedes vincular sin QR:

```bash
npm run pair:code -- --phone 5215551234567
```

Consulta [la instalación completa](docs/INSTALACION.md) y [la guía de operación](docs/CANALBOT_OPERACION.md).

## Qué hace

- Cola continua por canal para texto, imagen y video.
- Ritmos por minutos, horas o días.
- Campañas con nombre, horario diario y zona horaria.
- Stock de stickers por canal, individual o en bloques.
- Candado global: no permite publicaciones simultáneas entre canales, colas, campañas y stickers.
- Recuperación segura: un envío interrumpido se pausa para revisión y no se duplica.

## Límite importante

CanalBot no borra de forma fiable publicaciones ya visibles en un canal. Para eso usa la app oficial de WhatsApp.

## Crédito

CanalBot es gratuito. Ocasionalmente puede publicar una mención al canal del creador como apoyo al proyecto.

## Licencia

[MIT](LICENSE)
