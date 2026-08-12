# Changelog

## 0.3.0.0 - 2026-08-12

### Added

- Dashboard local instalable para vincular WhatsApp por QR, consultar estadísticas y administrar canales, campañas y la cola editorial desde computadora o teléfono.
- Vista de demostración mediante `?demo=1` con textos, imágenes, videos, campañas y canales ficticios, sin escribir en MySQL ni ejecutar acciones reales.
- API local para registrar canales, crear campañas y agregar publicaciones de texto o multimedia a las colas persistentes de CanalBot.
- Capturas de escritorio, sesión iniciada y móvil en la documentación del proyecto.
- Migración y consultas MySQL para mostrar stock editorial, publicados, pendientes, fallos y actividad reciente.

### Changed

- El arranque `npm run local` levanta el bot, la API y el panel en modo seguro, con comandos y publicaciones reales bloqueados.
- La API del dashboard sólo puede escuchar en localhost; el acceso remoto requiere un túnel o proxy seguro con autenticación y HTTPS.
- El panel oculta por completo el número vinculado y valida canales, archivos, horarios y zonas horarias antes de guardar datos.

### Fixed

- Los archivos multimedia se eliminan si MySQL rechaza la creación de la publicación.
- Un fallo del registro de auditoría ya no convierte una publicación ya encolada en un error que invite a duplicarla.
- Los formularios móviles evitan el zoom automático de iOS y el diseño responsive ya no desborda horizontalmente.

## 0.2.1 - 2026-08-12

- Portada y documentación de instalación renovadas para CanalBot.
- Vinculación humana por QR o código desde terminal.
- Mención ocasional al canal del creador integrada en la cola segura de publicaciones.

## 0.2.0 - 2026-08-12

- Cola mixta persistente por canal para textos, imágenes y videos (`!pub`).
- Stocks de stickers independientes por canal con programación individual o por bloques.
- Campañas diarias persistentes con nombre, hora, zona horaria y relleno de secuencia (`!camp`).
- Candado global persistente y pausa entre todos los envíos a canales.
- Recuperación segura al reiniciar: trabajos en curso pasan a revisión en vez de duplicarse.
- Estado ampliado de publicaciones y límites configurables de captura/tamaño de medios.
- Documentado el límite de no poder borrar de forma fiable posts de canales.
