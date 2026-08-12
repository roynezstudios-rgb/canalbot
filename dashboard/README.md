# CanalBot · Dashboard local

Interfaz responsive del centro editorial de CanalBot. Consume la API local que vive en el proceso principal y muestra el QR, la conexión de WhatsApp y los datos persistidos en MySQL.

No se ejecuta de forma aislada para las pruebas normales. Desde la raíz del repositorio usa:

```powershell
npm run local
```

Esto abre el dashboard en `http://localhost:3000` y la API local en `http://127.0.0.1:3210`, con todos los envíos bloqueados.

Las funciones visibles tienen respaldo en el bot: conexión por QR, canales, cola, publicaciones, campañas, estadísticas y registro de actividad. Consulta [la guía local](../docs/DASHBOARD_LOCAL.md) para preparar MySQL y vincular el teléfono.
