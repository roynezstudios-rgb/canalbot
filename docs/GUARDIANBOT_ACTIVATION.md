# GuardianBot - Activacion controlada

## Objetivo

Activar GuardianBot por etapas, sin saltar directamente a acciones destructivas.

Etapas:

1. `observe`: registra eventos, reportes, infracciones y estadisticas.
2. `delete`: permite preparar eliminacion de contenido, solo despues de revisar falsos positivos.
3. `mute`: permite preparar mute real.
4. `kick`: permite preparar expulsion real.

## Comandos locales

```bash
npm run guardian:activation -- readiness --group "120363...@g.us" --stage observe
npm run guardian:activation -- plan --group "120363...@g.us" --stage observe --notes "grupo privado de prueba"
npm run guardian:activation -- next --stage observe
```

## Checklist antes de pasar de observe

- `GUARDIAN_ENABLE=true`.
- Grupo habilitado con `!guardian observe`.
- `!mod baseline` ejecutado.
- `!horario` configurado si se usara apertura/cierre.
- `!salud` sin casos abiertos criticos.
- Revisar falsos positivos de enlaces, spam y malas palabras.
- Confirmar que el bot es admin solo en grupo privado de prueba.
- Confirmar respaldo reciente.

## Variables por etapa

Observe:

```env
GUARDIAN_ENABLE=true
GUARDIAN_DRY_RUN=true
GUARDIAN_OBSERVE_ONLY=true
GUARDIAN_DESTRUCTIVE_ACTIONS=false
```

Delete preparado:

```env
GUARDIAN_ENABLE=true
GUARDIAN_DRY_RUN=true
GUARDIAN_OBSERVE_ONLY=false
GUARDIAN_DESTRUCTIVE_ACTIONS=false
```

Mute/Kick preparado:

```env
GUARDIAN_ENABLE=true
GUARDIAN_DRY_RUN=false
GUARDIAN_OBSERVE_ONLY=false
GUARDIAN_DESTRUCTIVE_ACTIONS=true
```

No usar la ultima combinacion fuera de grupo privado hasta cerrar pruebas.

## Rollback

1. Volver a:

```env
GUARDIAN_ENABLE=false
GUARDIAN_DRY_RUN=true
GUARDIAN_OBSERVE_ONLY=true
GUARDIAN_DESTRUCTIVE_ACTIONS=false
```

2. Reiniciar el servicio:

```bash
systemctl restart whatsapp-guardian.service
```

3. Confirmar:

```bash
npm run cli -- status
npm run guardian:activation -- readiness --group "120363...@g.us" --stage observe
```

4. Revisar auditoria:

```bash
npm run cli -- actions --limit 30
```
