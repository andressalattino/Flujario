# Catálogo de Mercados: Wikipedia cada 15 días

Implementado el 24/11/2026. El usuario eligió la alternativa **sin tabla nueva**, reutilizando `stock_indices.verified_at`. No hay migraciones, claves de proveedor, planes pagos ni recursos remotos nuevos.

## Fuente y alcance

Se consultan exclusivamente dos rutas JSON de la [API oficial de MediaWiki](https://www.mediawiki.org/wiki/API:REST_API/Reference/en):

- `https://en.wikipedia.org/w/rest.php/v1/page/S%26P_100`
- `https://en.wikipedia.org/w/rest.php/v1/page/List_of_NASDAQ-100_companies`

La API devuelve wikitext y metadata; se lee sólo la tabla identificada como `constituents`. No se hace scraping HTML ni se siguen URLs del contenido. Son listas comunitarias de integrantes de S&P 100 y Nasdaq-100, **no un ranking por capitalización ni una fuente oficial del índice**. Pueden tener errores o demoras. La consulta no envía preferencias, saldos ni identificadores personales.

Se guardan el enlace permanente de la revisión en `source_url`, el día de edición de la fuente en `composition_date` y la fecha argentina de consulta exitosa en `verified_at`. La interfaz distingue estas fechas: **la edición de Wikipedia no equivale al día efectivo de entrada/salida del índice**. El nombre SQL anterior se conserva para evitar migrar. Se enlaza Wikipedia y [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), incluyendo acceso a historial/autores desde la revisión. Las tablas reales de prueba conservan atribución en `tests/fixtures/WIKIPEDIA-LICENSE.md`.

## Frecuencia y fallos

El nuevo cron `0 14 * * *` comprueba diariamente a las **11:00 de Argentina**. Descarga sólo si pasaron quince días calendario desde la última revisión exitosa. La primera adopción desde la semilla anterior se intenta inmediatamente; luego se aplica el intervalo persistido. Una consulta exitosa con la misma revisión también renueva la fecha de comprobación.

La revisión local del 24/11/2026 obtuvo 101 instrumentos por índice. La próxima corresponde al **09/12/2026**. No se usa `*/15` en el día del mes, que reinicia el conteo al cambiar de mes y no representa un intervalo uniforme.

Un fallo conserva lista, favoritas y fecha anteriores y se vuelve a intentar en la comprobación diaria siguiente. No hay descargas por visitante. En desarrollo, `localCatalogPlugin` ejecuta el mismo scheduled al iniciar Vite y cada 24 horas mientras está abierto. Tras un futuro despliegue, Cloudflare podrá ejecutarlo con la web cerrada; este trabajo no desplegó nada. Si el servidor local estaba cerrado, el siguiente inicio comprueba la fecha guardada.

La alternativa elegida no registra intentos/fallos en otra tabla ni tiene lease de descarga: dos ejecuciones pueden repetir las dos consultas. El estado resumido se registra en logs sin información financiera. La UI señala revisión pendiente cuando corresponde y conserva la copia anterior. No se prometen alertas de cambios inmediatas ni disponibilidad garantizada del servicio externo.

## Validación y guardado

Antes de escribir se comprueban título, modelo wikitext, licencia, revisión numérica, fecha válida/no futura, formato de encabezado y una sola tabla de integrantes. Se rechazan símbolos extraños, marcado en nombres, duplicados, menos de 90 o más de 110 instrumentos y cambios de más de veinte altas/bajas combinadas. Son límites de protección revisables, no una definición del índice. Un cambio legítimo mayor o un formato nuevo requiere revisión de implementación; no se recorta ni rellena para forzar cien.

Las respuestas están limitadas a 256 KiB y doce segundos; redirecciones y respuestas no JSON/no exitosas se rechazan. La revisión no puede retroceder respecto de una revisión de Wikipedia ya guardada. Al adoptar por primera vez, una fuente comunitaria anterior a la verificación manual no puede cambiar integrantes; si coinciden, puede adoptarse sin alterar el conjunto.

Cada índice se guarda mediante un batch transaccional D1. Todas sus escrituras comprueban que fecha y URL anteriores sigan siendo las mismas. Una ejecución que perdió esa versión no escribe ni elimina filas, aunque termine más tarde. Fallar a mitad revierte el índice completo; un índice puede actualizarse aunque el otro falle. Se usan lotes `VALUES` acotados: el runtime D1 rechazó inicialmente un `UNION ALL` que SQLite local aceptaba, y la prueba real permitió corregir esa incompatibilidad.

Se reemplazan sólo pertenencias y metadata de los índices. **No se eliminan empresas**, ni se cambian cuentas, movimientos, favoritas o preferencias. Las empresas que salen siguen guardadas para sus favoritos existentes; se indica «Fuera de los índices actuales». El buscador ofrece los miembros actuales. La lectura pública obtiene sólo catálogo y no preferencias de ningún dueño.

Wikipedia no proporciona de forma suficiente una bolsa verificada para todos los símbolos nuevos. Se crean con referencia de TradingView nula; se conservan las referencias verificadas anteriores. La UI indica la cobertura faltante y no inventa NYSE/Nasdaq, precios o gráficos. Es necesario verificar esa metadata para cotizar un nuevo instrumento; el seguimiento como favorita permanece disponible. El radar usa el catálogo D1 vigente, no sólo la semilla JSON. La portada muestra ejemplos estáticos identificados, sin consultar estos datos.

## Archivos y comprobaciones

- `app/domain/market-catalog.ts`: parser, contrato y cálculo del intervalo.
- `app/services/market-catalog.server.ts`: descarga limitada, validación, guardado condicionado y sincronización.
- `workers/app.ts`, `wrangler.jsonc`: comprobación diaria programada.
- `tools/local-schedules-plugin.ts`, `vite.config.ts`: scheduled durante desarrollo.
- `app/db/markets.server.ts`, `app/routes/preview.tsx`: catálogo público sin preferencias privadas.
- Componentes Mercados, Resumen y radar: procedencia, cobertura y favoritas conservadas.

```powershell
npm run check
npm run format:check
node qa/verificar-catalogo-d1.mjs
node qa/verificar-catalogo-d1.mjs --live
```

El modo normal usa las tablas de prueba atribuidas; `--live` consulta Wikipedia real contra D1 efímera y no modifica la base de desarrollo. Comprueba recepción, escritura, intervalo, claves foráneas y conservación de registros financieros sintéticos. Las regresiones de Vitest incluyen concurrencia, rollback, fallo/reintento, cambio de mes y bisiestos.

`node qa/verificar-catalogo-local.mjs` ejecuta el scheduled de catálogo contra Vite local, **actualizando el catálogo público local**. Antes hace una copia consistente dentro de `.wrangler/backups/` y compara huellas de 17 tablas privadas sin imprimir sus datos. La primera revisión pasó; el informe público está en `qa/catalogo-wikipedia-verificacion.json`. Este comando no es necesario por cada visitante ni por cada build.

Antes de publicar: configurar D1/Clerk reales, revisar condiciones de Wikipedia y los demás proveedores, y dar al User-Agent del cliente una identificación/contacto público apropiado para el servicio. El código actual identifica el prototipo local. No se habilita una API de capitalizaciones ni se extraen cotizaciones de TradingView para cálculos propios.
