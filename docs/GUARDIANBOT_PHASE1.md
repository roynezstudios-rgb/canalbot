# GuardianBot - Fase 0 y Fase 1

Fecha: 2026-07-12

## Diagnostico inicial

- Proyecto localizado en `/root/.openclaw/workspace/whatsapp-guardian`.
- Nombre historico del paquete: `whatsapp-guardian`; nombre de producto actual para canales: `CanalBot`.
- Baileys instalado: `@whiskeysockets/baileys` `^7.0.0-rc13`.
- Entrada principal: `src/index.js`.
- Inicio de Baileys: `src/wa/connect.js`.
- Listener original `messages.upsert`: `src/wa/messages.js`.
- Cola actual de canales: `src/queue/channelQueue.js`.
- Base actual antes de migrar: 12 tablas (`wa_sessions`, `wa_groups`, `wa_channels`, `wa_control_chats`, `wa_channel_queue`, `wa_users`, `wa_messages`, `wa_reports`, `wa_strikes`, `wa_rules`, `wa_media_cache`, `wa_actions_log`).
- Servicio systemd: `whatsapp-guardian.service`, activo y habilitado.
- El servicio usa `scripts/run-bot-loop.sh`, que fuerza `WA_ENABLE_CONNECT=true`, `WA_DRY_RUN=true`, `WA_AUTH_DIR=auth/main` y `WA_SESSION_NAME=main`.

## Mapa de integracion

GuardianBot queda dentro del mismo proceso y la misma sesion:

```text
src/wa/connect.js
  -> crea un solo socket Baileys
  -> attachEventRouter(sock)

src/core/eventRouter.js
  -> messages.upsert -> src/wa/messages.js
  -> group-participants.update -> auditoria observe
  -> groups.update -> auditoria observe

src/wa/messages.js
  -> CanalBot mantiene comandos de canal y cola
  -> mensajes de grupo pasan a GuardianBot
  -> si GuardianBot no atiende, sigue link_guard existente

src/guardianbot/index.js
  -> comandos GuardianBot
  -> settings por grupo
  -> casos de moderacion en observacion
```

## Archivos modificados

- `.env.example`
- `README.md`
- `package.json`
- `src/config.js`
- `src/db.js`
- `src/migrate.js`
- `src/queue/channelQueue.js`
- `src/wa/connect.js`
- `src/wa/messages.js`

## Archivos nuevos

- `src/core/eventRouter.js`
- `src/core/messageUtils.js`
- `src/core/outboundQueue.js`
- `src/core/permissions.js`
- `src/guardianbot/index.js`
- `sql/002_guardian_core.sql`
- `sql/003_guardian_moderation.sql`
- `sql/004_guardian_reputation.sql`
- `sql/005_guardian_engagement.sql`
- `test/messageUtils.test.js`
- `test/linkGuard.test.js`
- `docs/GUARDIANBOT_PHASE1.md`

## Respaldo

Respaldo de archivos tocados:

```text
backups/20260712-guardian-phase1/
```

## Variables nuevas

Todas inician en modo seguro:

```env
GUARDIAN_ENABLE=false
GUARDIAN_DRY_RUN=true
GUARDIAN_OBSERVE_ONLY=true
GUARDIAN_DESTRUCTIVE_ACTIONS=false
```

## Riesgos y controles

- Riesgo: abrir dos sockets con la misma sesion. Control: no se creo otra conexion; GuardianBot usa el socket existente.
- Riesgo: acciones destructivas prematuras. Control: no hay eliminacion, mute real, expulsion ni cambios de permisos en esta fase.
- Riesgo: saturar respuestas. Control: respuestas pasan por `src/core/outboundQueue.js` con retardo por chat.
- Riesgo: duplicar procesamiento. Control: se conserva `insertMessageEvent` con llave unica `(chat_jid, message_id)`.
- Riesgo: tocar credenciales. Control: no se modifico `auth/`, `.env` ni credenciales.

## Estado implementado

- Router interno central agregado.
- GuardianBot agregado como modulo separado.
- Configuracion segura agregada.
- Comandos GuardianBot iniciales reconocidos.
- `!guardian on|off|observe` valida admin real.
- `!report` exige respuesta directa y crea caso auditable en observacion.
- Eventos de grupo se auditan sin revertir ni sancionar.
- Migraciones versionadas aplicadas.
- Pruebas basicas agregadas y pasando.

## Delegacion

No se delego a Gemma 4 ni DeepSeek en esta fase. La tarea fue de arquitectura, seguridad e integracion directa con el repo activo.

## Verificacion

Comandos ejecutados:

```bash
npm run migrate
npm test
npm run cli -- status
node --check src/guardianbot/index.js
node --check src/core/eventRouter.js
node --check src/wa/messages.js
node --check src/wa/connect.js
systemctl restart whatsapp-guardian.service
```

Resultado:

- Migraciones aplicadas: `001_init.sql` a `005_guardian_engagement.sql`.
- Tests: 5/5 pasando.
- Servicio: activo.
- Sesion: conectada con `auth/main`.

## Siguiente fase

Fase 2 debe implementar moderacion real en observe-only:

- reportes comunitarios con deduplicacion completa y umbrales 3/5;
- sanciones progresivas sin acciones destructivas reales;
- mute logico;
- bad words en archivo de revision;
- link guard mejorado;
- antispam de stickers y multimedia con estadisticas.

## Fase 2 implementada

Fecha: 2026-07-12

Estado: observable, sin acciones destructivas.

Agregado:

- Migracion `sql/006_guardian_moderation_rules.sql`.
- Tablas `wa_user_sanctions`, `wa_bad_words`, `wa_bad_words_events`, `wa_allowed_domains` y `wa_spam_events`.
- Motor de infracciones en `src/guardianbot/moderation/infractions.js`.
- Reportes comunitarios con deduplicacion por `(grupo, mensaje reportado, reportante)`.
- Umbrales configurables de reporte:
  - `GUARDIAN_REPORT_MUTE_THRESHOLD=3`
  - `GUARDIAN_REPORT_ACTION_THRESHOLD=5`
- Bad words preparado con normalizacion y lista de revision en `data/guardianbot/bad-words-review.es-mx.json`.
- Link guard GuardianBot con deteccion de `http`, `https`, `www`, dominios sin protocolo, `wa.me`, `chat.whatsapp.com`, `t.me`, acortadores, caracteres invisibles y variantes `punto/dot`.
- Antispam de stickers:
  - 6to sticker en 30 segundos registra infraccion.
  - 16to sticker en 60 segundos registra infraccion.
  - Evita contador combinado con otros medios.
- Antispam multimedia separado por tipo: imagen, video, audio, GIF/documento segun metadata disponible.

Controles:

- Si `GUARDIAN_ENABLE=false`, GuardianBot no observa moderacion y queda activo el `link_guard` historico.
- Si `GUARDIAN_ENABLE=true` y el grupo esta habilitado, GuardianBot toma la moderacion para evitar doble sancion con el `link_guard` historico.
- Toda sancion se guarda como `observe`/`blocked` mientras `GUARDIAN_DRY_RUN=true`, `GUARDIAN_OBSERVE_ONLY=true` o `GUARDIAN_DESTRUCTIVE_ACTIONS=false`.
- No hay eliminacion real de mensajes.
- No hay mute real.
- No hay expulsion real.

## Fase 3 implementada

Fecha: 2026-07-12

Estado: administracion observable, sin cambios reales de permisos.

Agregado:

- Migracion `sql/007_guardian_admin.sql`.
- Tablas:
  - `wa_group_protection_state`
  - `wa_group_schedules`
  - `wa_group_admin_audit`
- Comandos administrativos con validacion real de admin:
  - `!salud`
  - `!riesgos`
  - `!resumen`
  - `!estadisticas`
  - `!horario`
  - `!abrir`
  - `!cerrar`
  - `!mod baseline`
- Captura de base autorizada del grupo con `!mod baseline`.
- Observacion de `groups.update` y `group-participants.update` para auditoria de proteccion.
- Scheduler observable para horarios de apertura/cierre.

Controles:

- `!abrir` y `!cerrar` solo registran solicitud.
- El scheduler solo calcula estado esperado y audita transiciones.
- No se modifica `announce`, descripcion, nombre, foto, enlace ni permisos.
- No se revierte automaticamente ningun cambio de grupo.

## Fase 4 implementada

Fecha: 2026-07-12

Estado: comunidad observable y gamificacion segura.

Agregado:

- Migracion `sql/008_guardian_community.sql`.
- Tablas:
  - `wa_achievements`
  - `wa_user_achievements`
  - `wa_missions`
  - `wa_mission_progress`
  - `wa_daily_question_answers`
- XP por mensaje valido y respuesta directa.
- Limite diario de XP por usuario.
- Niveles:
  - Nuevo miembro
  - Participante
  - Colaborador
  - Destacado
  - Leyenda
- Insignias base por XP.
- Misiones iniciales individuales y comunitarias.
- `!perfil` con XP/nivel real.
- `!top` con ranking real.
- `!insignias` con logros reales.
- `!misiones` con misiones activas.
- Script `npm run guardian:seed-questions` para sembrar 365 preguntas diarias.

Controles:

- No se otorga XP si GuardianBot esta desactivado para el grupo.
- No se otorga XP por mensajes muy cortos.
- No se duplica XP por el mismo `messageId`.
- Los niveles no otorgan permisos administrativos.

## Fase 5 implementada

Fecha: 2026-07-12

Estado: revistas generables y cacheables.

Agregado:

- Migracion `sql/009_guardian_magazines.sql`.
- Tablas:
  - `wa_group_magazine_runs`
  - `wa_group_magazine_cache`
- Generador de revista semanal, mensual y mesaniversario.
- Estadisticas de periodo:
  - mensajes
  - stickers
  - reportes
  - spam
  - top de XP
  - salud del grupo
- Scheduler de revistas conectado al servicio.
- Comando admin `!revista` para vista previa semanal.
- Comando admin `!revista monthly`.
- Comando admin `!revista mesaniversario`.

Controles:

- Las revistas se registran por `group_jid`, tipo y periodo para evitar duplicados.
- El envio programado usa la salida central con pausa por chat.
- La publicacion programada queda separada de la generacion/cache.

## Fase 6 implementada

Fecha: 2026-07-12

Estado: activacion controlada preparada, sin activar acciones destructivas.

Agregado:

- Migracion `sql/010_guardian_activation.sql`.
- Tablas:
  - `wa_guardian_activation_runs`
  - `wa_guardian_activation_checks`
- Evaluador de readiness por grupo y etapa.
- CLI:
  - `npm run guardian:activation -- readiness --group "..." --stage observe`
  - `npm run guardian:activation -- plan --group "..." --stage observe`
  - `npm run guardian:activation -- next --stage observe`
- Documento `docs/GUARDIANBOT_ACTIVATION.md`.

Controles:

- La etapa `observe` exige Guardian habilitado para grupo y ambiente.
- `delete`, `mute` y `kick` fallan readiness si las variables de seguridad no corresponden.
- Las activaciones quedan auditadas en base de datos.
- No se cambia `.env` automaticamente.
- No se activa eliminacion, mute ni expulsion desde este proceso.
