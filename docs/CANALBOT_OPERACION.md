# Operar CanalBot

CanalBot se controla desde un grupo de WhatsApp. El número vinculado debe ser administrador de cada canal de destino.

## Preparar un canal

```text
!canalbot on
!ac https://whatsapp.com/channel/INVITE Nombre del canal
!ca Nombre
```

`!ca` selecciona el canal que recibiría los comandos posteriores. Cada canal conserva su propio contenido, ritmos, campañas y stock de stickers.

## Cola continua

```text
!pub iniciar
<envía textos, imágenes y videos en el orden final>
!pub fin
!pub cada 2h
!pub activar
```

`!pub cada` admite minutos, horas y días, por ejemplo `15m`, `2h` o `1d`. La configuración afecta únicamente a lo pendiente del canal seleccionado; lo publicado nunca se altera. Una nueva captura se añade al final de la misma cola.

Control:

```text
!pub estado
!pub pausar
!pub activar
```

## Campañas

Una campaña tiene nombre, secuencia propia, hora diaria y zona horaria.

```text
!camp crear FraseDelDia 09:00 America/Mexico_City
!camp iniciar FraseDelDia
<envía contenido>
!camp fin
!camp activar FraseDelDia
!camp estado FraseDelDia
```

Al rellenar una campaña se conserva su secuencia. Si no hay contenido pendiente, espera hasta que se agregue más y retoma en la siguiente hora programada.

## Stickers

Los stickers usan un stock separado para poder manejar bloques sin alterar las publicaciones normales.

```text
!st iniciar
<envía stickers>
!st fin
!st cada 2h
!st activar
```

Para bloques:

```text
!st bloque 5 15s 1h
```

El ejemplo envía hasta cinco stickers, con 15 segundos entre ellos y una hora entre bloques. Al agotarse el stock se pausa; no se recicla ni reintenta automáticamente tras un fallo.

## Seguridad y límites

- Todas las rutas esperan el mismo candado global: no hay dos publicaciones de canal en vuelo al mismo tiempo.
- Tras un reinicio, un envío que quedó a medias pasa a revisión y no se duplica.
- Texto, imagen, video y stickers han sido validados como tipos de publicación de canal.
- La confirmación técnica de Baileys para multimedia no sustituye la comprobación visual en WhatsApp.
- CanalBot no borra de forma fiable publicaciones que ya están visibles en un canal. Usa la app oficial para eso.
