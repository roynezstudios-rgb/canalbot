# ADR-001: publicación serializada y recuperación segura

Fecha: 2026-08-12

## Decisión

CanalBot usa un único candado persistente para todo envío a un canal: cola normal, campañas, stickers y pruebas. Después de cada envío mantiene una pausa global configurable. Ningún flujo puede publicar simultáneamente con otro, aunque apunte a otro canal.

Cada canal conserva sus propios stocks y programaciones. La cola `!pub` es continua y tiene un único intervalo para todos sus elementos pendientes. Las campañas son secuencias independientes con hora diaria fija y zona horaria.

Al arrancar, las publicaciones que quedaron en `publishing`/`sending` se marcan como fallidas y se pausan sus flujos afectados. El bot nunca las reintenta automáticamente.

## Consecuencias

- Se reduce el riesgo de ráfagas y de estados duplicados.
- Una publicación lenta puede retrasar la siguiente; es preferible a solaparlas.
- Un usuario debe revisar un fallo y reprogramar o cancelar el contenido si procede.
- No se implementa borrado de posts de newsletter porque Baileys puede aceptar la orden sin que WhatsApp la aplique.
