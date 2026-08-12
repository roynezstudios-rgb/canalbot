# CanalBot

![Portada de CanalBot](docs/assets/canalbot-portada-v1.png)

Programador seguro de contenido para canales de WhatsApp. Desde un grupo de control puedes capturar textos, imágenes y videos en orden, definir su ritmo de publicación, programar campañas diarias y mantener un stock independiente de stickers por canal.

Licencia: [MIT](LICENSE).

Nombre técnico histórico del proyecto: `whatsapp-guardian`.

Módulos disponibles:

- **CanalBot**: administra, programa y publica contenido en canales de WhatsApp.
- **GuardianBot**: administra grupos con reportes, filtros, horarios, bienvenida, XP, revistas y moderacion.
- **Suite CanalBot + GuardianBot**: ambos productos con una sola sesion Baileys.

Objetivos iniciales:

- Guardian: observar grupos donde el numero sea admin, detectar spam/enlaces, registrar reportes y preparar acciones de moderacion.
- Publisher: publicar contenido en canales de WhatsApp cuando se confirme soporte estable de `@newsletter`.
- CanalBot: operar canales de WhatsApp desde un grupo de control con seleccion de canal, cola, intervalos, carga multiple por frases y comandos cortos.

Estado actual:

- Publicación en canales validada para texto, imagen, video y sticker con el parche de newsletter incluido.
- Por defecto no conecta WhatsApp y no publica automáticamente.
- Cada canal conserva sus propios stocks, colas, captura y programación.
- La publicación se serializa globalmente: nunca hay dos envíos a canales en vuelo al mismo tiempo.
- Las publicaciones ya publicadas en un canal **no se pueden borrar de forma fiable** con Baileys; CanalBot no es una herramienta de limpieza.

Instalacion, ediciones y vinculacion de numero: ver `docs/INSTALACION.md`.

## Inicio rápido

Requiere Node.js 20+, MySQL 8+ y un número de WhatsApp que sea administrador de los canales que usará.

```bash
unzip canalbot-0.2.1.zip
cd canalbot-0.2.1
npm run setup -- canalbot
# configura MYSQL_* en .env
npm run pair:qr
# tras vincular: cambia WA_ENABLE_CONNECT=true en .env
npm start
```

Para vincular sin QR:

```bash
npm run pair:code -- --phone 5215551234567
```

La guía completa, MySQL y systemd está en [docs/INSTALACION.md](docs/INSTALACION.md). Para el uso diario de colas, campañas y stickers consulta [docs/CANALBOT_OPERACION.md](docs/CANALBOT_OPERACION.md).

## Comandos

```bash
cd whatsapp-guardian
npm run doctor
npm run migrate
npm test
npm run setup -- canalbot
npm run setup -- guardianbot
npm run setup -- suite
npm run pair:qr
npm run pair:code -- --phone 5215551234567
npm run package:release
npm run guardian:seed-questions
npm run guardian:activation -- readiness --group "120363...@g.us" --stage observe
npm run status
npm start
```

CLI operativa:

```bash
npm run cli -- status
npm run cli -- channels
npm run cli -- channel:upsert --jid "120363411910836005@newsletter" --name "Frases Y Más" --mode active --profile frasesymas
npm run cli -- queue --status queued --limit 20
npm run cli -- messages --limit 10
npm run cli -- actions --limit 10
```

Comandos desde WhatsApp en el grupo de control:

```text
!ay
!cn
!ac https://whatsapp.com/channel/INVITE Canal Nuevo
!ca Frases
!pub iniciar
!pub fin
!pub cada 2h
!pub activar
!pub estado
!st iniciar
!st fin
!st bloque 5 15s 1h
```

`!ac` agrega un canal desde enlace o JID `@newsletter`; `!ca` selecciona el canal sobre el que trabajas.

### Cola continua de publicaciones

Usa `!pub iniciar`, envía textos, imágenes y videos en el orden final y cierra con `!pub fin`. La tanda se agrega al final de la cola del canal seleccionado. `!pub cada 2h`, `!pub cada 1d` o `!pub cada 15m` define el ritmo de toda la cola pendiente; al cambiarlo, se reordenan sólo los elementos aún no publicados. `!pub activar`, `!pub pausar` y `!pub estado` controlan y muestran la cola.

### Stickers

Los stickers tienen stock y ritmo independientes: `!st iniciar` / `!st fin`, `!st cada 2h` o `!st bloque 5 15s 1h`, luego `!st activar`. Un bloque admite hasta cinco stickers. Al agotarse el stock se pausa; nunca recicla ni reintenta automáticamente un fallo.

### Campañas editoriales

Una campaña es una cola independiente con hora fija diaria y zona horaria:

```text
!camp crear FraseDelDia 09:00 America/Mexico_City
!camp iniciar FraseDelDia
<envía texto, imagen o video>
!camp fin
!camp activar FraseDelDia
!camp estado FraseDelDia
```

Puedes rellenarla con `!camp iniciar FraseDelDia` cuando quieras: conserva su secuencia, hora y contenido ya publicado. Si se queda vacía, espera la siguiente hora diaria; al rellenarla no publica de golpe. Las campañas, la cola y los stickers comparten el candado global de seguridad.

En grupos, sólo los administradores pueden usar los comandos. Imágenes y videos pueden ir sin caption.

Publicar en canal:

```bash
npm run newsletter:publish:safe -- \
  "120363411910836005@newsletter" \
  "/ruta/imagen.png" \
  "/ruta/caption.txt"
```

`newsletter:publish:safe` es una herramienta de diagnóstico puntual. Antes de usarla verifica que no exista otra instancia conectada con la misma sesión.

Para canales `@newsletter`, la respuesta de Baileys confirma que la solicitud fue aceptada, no sustituye una revisión visual del post en WhatsApp. CanalBot registra el resultado técnico; para pruebas de multimedia confirma también desde la app.

### Límites de seguridad

- Un único candado global impide publicaciones simultáneas, incluso entre distintos canales, campañas y bloques de stickers.
- Tras una caída/reinicio, cualquier elemento que estaba enviándose pasa a fallo y el canal afectado queda pausado para revisión; no se reintenta automáticamente.
- Un error de publicación pausa el flujo afectado. El contenido pendiente se puede revisar o cancelar antes de que salga.
- No se ofrece borrado de publicaciones ya visibles en canales: la API no lo confirma de forma fiable. Bórralas desde la app oficial como administrador.

## Crédito

CanalBot es gratuito. Ocasionalmente puede publicar una mención al canal del creador como apoyo al proyecto.

Para vincular WhatsApp mas adelante:

1. Confirmar con Roy.
2. Cambiar `WA_ENABLE_CONNECT=true`.
3. Ejecutar `npm start`.
4. Escanear QR o usar flujo de codigo si se implementa.

## Base de datos

Base local: `whatsapp_guardian`

Tablas principales:

- `wa_sessions`
- `wa_groups`
- `wa_channels`
- `wa_users`
- `wa_messages`
- `wa_reports`
- `wa_strikes`
- `wa_rules`
- `wa_media_cache`
- `wa_actions_log`

Migraciones nuevas de GuardianBot:

- `sql/002_guardian_core.sql`
- `sql/003_guardian_moderation.sql`
- `sql/004_guardian_reputation.sql`
- `sql/005_guardian_engagement.sql`
- `sql/006_guardian_moderation_rules.sql`
- `sql/007_guardian_admin.sql`
- `sql/008_guardian_community.sql`
- `sql/009_guardian_magazines.sql`
- `sql/010_guardian_activation.sql`

`npm run migrate` aplica todos los archivos `sql/NNN_*.sql` en orden.

## GuardianBot

GuardianBot queda integrado como modulo separado dentro del mismo proyecto y usa el mismo socket Baileys que CanalBot. No abre otra sesion ni otro listener principal.

Variables nuevas, apagadas por defecto:

```env
CANALBOT_ENABLE=true
CANALBOT_CREATOR_MENTIONS_ENABLED=true
BOT_PERSONAL_AUTOREPLY=false
BOT_PERSONAL_AUTOREPLY_COOLDOWN_HOURS=12
GUARDIAN_ENABLE=false
GUARDIAN_DRY_RUN=true
GUARDIAN_OBSERVE_ONLY=true
GUARDIAN_DESTRUCTIVE_ACTIONS=false
GUARDIAN_COMMAND_PREFIX=!
GUARDIAN_DEFAULT_TIMEZONE=America/Mexico_City
GUARDIAN_REPORT_WINDOW_MINUTES=120
GUARDIAN_REPORT_MUTE_THRESHOLD=3
GUARDIAN_REPORT_ACTION_THRESHOLD=5
GUARDIAN_COMMAND_LIMIT_WINDOW=10
GUARDIAN_COMMAND_LIMIT_COUNT=5
GUARDIAN_GROUP_AUTOREPLY_PER_MINUTE=6
GUARDIAN_OUTBOUND_MIN_DELAY_MS=2500
GUARDIAN_STICKER_SHORT_WINDOW_SECONDS=30
GUARDIAN_STICKER_SHORT_WINDOW_LIMIT=5
GUARDIAN_STICKER_LONG_WINDOW_SECONDS=60
GUARDIAN_STICKER_LONG_WINDOW_LIMIT=15
GUARDIAN_MULTIMEDIA_WINDOW_SECONDS=60
GUARDIAN_MULTIMEDIA_DEFAULT_LIMIT=12
GUARDIAN_INFRACTION_WINDOW_HOURS=24
GUARDIAN_INFRACTION_WARN_THRESHOLD=3
GUARDIAN_INFRACTION_MUTE_THRESHOLD=5
GUARDIAN_INFRACTION_KICK_THRESHOLD=7
GUARDIAN_INFRACTION_MUTE_HOURS=12
GUARDIAN_SCHEDULE_CHECK_SECONDS=60
GUARDIAN_XP_DAILY_CAP=80
GUARDIAN_XP_MESSAGE_MIN_LENGTH=8
GUARDIAN_XP_VALID_MESSAGE=1
GUARDIAN_XP_REPLY_BONUS=2
GUARDIAN_XP_QUESTION_ANSWER=3
GUARDIAN_DAILY_QUESTION_CHECK_SECONDS=300
GUARDIAN_DAILY_QUESTION_AFTER_OPEN_MINUTES=60
GUARDIAN_MAGAZINE_CHECK_SECONDS=300
GUARDIAN_MAGAZINE_BEFORE_OPEN_MINUTES=30
```

Comandos iniciales reconocidos:

```text
!guardian on|off|observe
!report
!xp
!perfil
!insignias
!misiones
!top
!resumen
!riesgos
!salud
!estadisticas
!mod
!caso <id>
!desmutear <usuario>
!desban <usuario>
!strikes <usuario>
!horario
!abrir
!cerrar
!link
!palabra / !palabras
!antispam
!cerrarvoz
!mal
!respeto
!ban
```

Estado de esta fase:

- `!guardian on|off|observe` valida admin real del grupo y guarda configuracion por grupo.
- `!report` exige mensaje citado, deduplica reportantes y al llegar a 3 reportes borra el mensaje citado y registra infraccion.
- `!xp`, `!perfil`, `!insignias`, `!misiones`, `!top`, `!resumen`, `!riesgos`, `!salud` y `!estadisticas` responden con estado seguro.
- Eventos `group-participants.update` y `groups.update` se enrutan y auditan sin revertir cambios.
- Todas las acciones destructivas siguen bloqueadas por configuracion.
- Reportes comunitarios ya se deduplican por reportante y mensaje citado.
- Umbral comunitario: 3 reportes del mismo mensaje disparan borrado del mensaje e infraccion al autor.
- Bad words esta preparado, pero la lista inicia vacia y requiere aprobacion antes de importar.
- Link guard mejorado detecta enlaces disfrazados basicos y dominios sin protocolo.
- Antispam de stickers y multimedia registra eventos separados por tipo.
- Infracciones recientes escalan por ventana configurable: advertencia y expulsión; el mute lógico no es un escalón normal.
- Durante mute lógico, cada intento se borra/registra; al intento 10 avisa y al intento 15 intenta expulsar si las acciones reales están activas.
- `!palabras load palabra1, palabra2` permite carga masiva y omite duplicados normalizados del grupo.
- Comandos administrativos validan admin real del grupo.
- `!mal` permite a admins responder a un mensaje, borrarlo y registrar/notificar una infraccion a la persona.
- `!respeto` permite a admins responder a una conversacion conflictiva, borrar el mensaje y registrar/notificar una infraccion por falta de respeto.
- `!horario 08:00 22:00 America/Mexico_City` guarda horario activo y aplica apertura/cierre real del grupo.
- El horario avisa una sola vez 20 minutos y 5 minutos antes del cierre automatico del grupo.
- `!abrir` y `!cerrar` registran solicitud, pero no cambian permisos reales.
- `!mod baseline` captura base de protección del grupo.
- Cambios de grupo y participantes se auditan para protección, sin revertir todavía.
- `!perfil` muestra XP y nivel real.
- `!top` muestra ranking real del grupo.
- `!xp` explica como se gana XP, limites diarios y niveles.
- Pregunta diaria activa: GuardianBot publica una pregunta por dia dentro de la primera hora del horario abierto; responderla directamente da XP extra.
- `!insignias` explica como funciona el sistema, muestra insignias disponibles con emojis y lista las ganadas.
- `!misiones` lista misiones activas.
- XP tiene limite diario y evita mensajes demasiado cortos/repetitivos.
- `npm run guardian:seed-questions` prepara 365 preguntas diarias.
- `!revista` genera vista previa de revista semanal.
- `!revista monthly` genera vista previa mensual.
- `!revista mesaniversario` genera vista previa de mesaniversario.
- El scheduler prepara revistas por grupo con cache/registro de ejecucion.
- `npm run guardian:activation` revisa readiness y crea planes de activacion controlada.
- Ver `docs/GUARDIANBOT_ACTIVATION.md` antes de activar delete/mute/kick.

### Respuesta privada local del numero bot

`BOT_PERSONAL_AUTOREPLY=true` activa una respuesta automatica solo para chats privados con el numero conectado. Esta funcion esta pensada para el numero operativo local, no como parte obligatoria del producto vendible.

- Mensajes normales reciben una aclaracion amable con cooldown por chat.
- Comandos privados disponibles: `!faq`, `!grupo`, `!reportar`, `!humano`.
- El texto deja claro que el numero es principalmente bot, no soporte humano inmediato.
- Para problemas del grupo, redirige a `!report`, `!mal` y `!respeto` dentro del grupo para conservar contexto.

Activacion controlada:

1. Ejecutar `npm run migrate`.
2. Ejecutar `npm test`.
3. Mantener `GUARDIAN_DESTRUCTIVE_ACTIONS=false`.
4. Probar en grupo privado con `GUARDIAN_ENABLE=true`, `GUARDIAN_DRY_RUN=true` y `GUARDIAN_OBSERVE_ONLY=true`.
5. Usar `!guardian observe` dentro del grupo.
6. Revisar `npm run cli -- actions --limit 20` y la tabla `wa_moderation_cases`.

Rollback de esta fase:

1. Restaurar archivos desde `backups/20260712-guardian-phase1/`.
2. Reiniciar el servicio solo si estaba autorizado operar la sesion.
3. Las tablas nuevas son aditivas; no se requiere borrarlas para que CanalBot siga funcionando.

## Seguridad

- No guardar conversaciones completas si no hace falta.
- Guardar solo eventos necesarios para moderacion.
- No expulsar automaticamente en MVP.
- Registrar cada accion del bot.
- Mantener MySQL en `127.0.0.1`.
