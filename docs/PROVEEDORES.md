# Proveedores y tareas programadas

TradingView es el proveedor aprobado para mostrar la tabla bursátil, el radar y los gráficos mediante sus widgets oficiales gratuitos. No hay una API bursátil aprobada para obtener precios y calcular inversiones en Flujario. Para divisas se aprobó DolarApi. Noticias tiene un lector RSS local operativo con cinco medios y publicación pública pendiente de revisión por fuente. No se usan scraping ni precios estáticos aparentando ser actuales.

## Mercados

Se reemplazó el catálogo de veinte empresas por S&P 100 y Nasdaq-100: **101 instrumentos por índice y 167 únicos**, con composición de referencia del **18/11/2026** y verificación del **19/11/2026**. No es un Top 100 mundial. Las clases GOOG y GOOGL son instrumentos distintos; AAPL, presente en ambos índices, es un solo registro.

La definición y los cambios se contrastaron con [S&P Dow Jones Indices](https://www.spglobal.com/spdji/en/indices/equity/sp-100/), su [aviso efectivo el 21/09/2026](https://press.spglobal.com/2026-09-04-Bloom-Energy,-Illumina,-and-Everpure-Set-to-Join-S-P-500-Others-to-Join-S-P-100,-S-P-MidCap-400,-and-S-P-SmallCap-600), [Nasdaq NDX](https://indexes.nasdaq.com/Index/Overview/NDX) y el [cambio de Moderna por Warner Bros. Discovery](https://ir.nasdaq.com/node/111076/pdf). Las listas públicas completas de [S&P 100](https://en.wikipedia.org/wiki/S%26P_100) y [Nasdaq-100](https://en.wikipedia.org/wiki/List_of_NASDAQ-100_companies) se cruzaron símbolo por símbolo con las posiciones de los fondos replicadores: [iShares OEF](https://www.ishares.com/us/products/239723/ishares-sp-100-etf) e [Invesco QQQ](https://www.invesco.com/qqq-etf/en/about.html), ambos con archivo del 18/11. Los conjuntos coincidieron después de excluir efectivo, garantías y derivados. Los fondos sirven como contraste; sus posiciones no se presentan como archivos oficiales de constituyentes del índice.

La página educativa de Nasdaq revisada contenía una composición anterior, con KHC/WBD y sin MRNA; se descartó como fuente vigente de pertenencia. El catálogo fechado está en `app/data/stock-catalog.json` y se siembra en D1 mediante `0006_stock_markets.sql`. La revisión de componentes es manual y fechada, sin tarea automática ni consulta de posiciones de fondos por visitante. Una actualización futura necesita revisión y una migración nueva. `qa/contrastar-sp100.mjs` y `qa/contrastar-ndx.mjs` sólo conservan nombres, símbolos y metadatos de contraste, sin precios ni posiciones financieras del fondo.

**Actualización del 24/11/2026:** el usuario aprobó sincronizar desde la API JSON de Wikipedia cada quince días. Sustituye la revisión manual anterior para la composición activa; el JSON sigue siendo la semilla histórica. Se reutilizan fechas/URL existentes y batch transaccional, sin nuevas migraciones ni tablas. Se atribuye cada revisión bajo CC BY-SA 4.0 y se aclara que es fuente comunitaria. La primera consulta local obtuvo 101 instrumentos por índice y preservó 17 tablas privadas. Alcance, límites, próximos intentos y pruebas: [CATALOGO-AUTOMATICO.md](CATALOGO-AUTOMATICO.md).

TradingView se integra según su [documentación oficial de widgets](https://www.tradingview.com/widget-docs/tutorials/iframe/build-page/widget-integration/), mediante `embed-widget-advanced-chart.js`, para un solo instrumento seleccionado. Se mantienen la atribución y los controles nativos de período. Cobertura, fuente y demora son las indicadas por el widget; el gráfico usa UTC. No se accede a su DOM de cotizaciones, API interna ni respuestas para alimentar la tabla. Cambiar de favorita o tema elimina el contenedor anterior y monta un único gráfico. El enlace permite abrirlo en TradingView si falla la carga.

El usuario aprobó el 24/11/2026 el componente oficial [Market Data](https://www.tradingview.com/widget-docs/widgets/watchlists/market-data/), con su vista Performance y sus propios períodos: Precio, Hoy, 1W, 1M, 6M y 1Y. También se puede elegir Overview, con precio y variación diaria. La selección de índice, búsqueda y filtro de favoritas configuran los símbolos públicos de esa tabla; los precios los presenta el proveedor. El catálogo separado permite marcar las cinco favoritas de Flujario. Resumen usa el componente oficial [Market Summary](https://www.tradingview.com/widget-docs/widgets/watchlists/market-summary/) con sus cinco símbolos, priorizando favoritas: tarjetas compactas desplazables con precio, moneda, variación diaria y minigráfico del proveedor. Un símbolo anterior sin bolsa verificada nunca se transforma en una cotización especulativa.

Se utiliza el módulo público `https://widgets.tradingview-widget.com/w/es/tv-market-data.js`, disponible en el host expuesto por el configurador oficial. Se conserva atribución, enlaces y avisos de cobertura/demora. El radar utiliza `https://widgets.tradingview-widget.com/w/es/tv-market-summary.js`, verificado con HTTP 200 y configuración contrastada con el configurador oficial: modo custom, disposición vertical, tamaño compacto y período 1D. Cada módulo se comparte entre sus instancias y el elemento se retira al cambiar selección o desmontar. La configuración valida símbolos, vista y tema; no admite claves, importes ni identificadores personales. El usuario eligió expresamente el componente nuevo frente al iframe clásico: su JavaScript se ejecuta en el documento de la app y técnicamente tiene acceso a él. No se declara aislado. No se leen su DOM de precios, API interna ni respuestas para cálculos propios.

Los períodos 1M y 1Y son los de TradingView; no se promete una ventana exacta de 30 días ni una captura fija de cierres. La actualización es responsabilidad del widget mientras se visualiza: no se agregó cron bursátil, descarga histórica ni almacenamiento de precios en D1. No requiere una clave de API de Flujario. La ausencia de un símbolo o de datos se conserva como la informa el proveedor; no se completa con cifras ficticias. Para calcular ganancias de inversiones se necesitaría otra fuente autorizada o una valoración ingresada por el usuario: TradingView indica en sus [preguntas sobre datos](https://www.tradingview.com/widget-docs/faq/data/) que los widgets no ofrecen descarga ni API de datos.

Antes de conectar precios hay que acordar mercado y bolsa, acciones/ADR/CEDEAR, licencia de exhibición, costo, retraso, límites y disponibilidad. Una cotización futura deberá incluir moneda, bolsa, hora de la fuente, hora de recepción y estado de demora. No mezclar un precio de una acción de EE. UU. con el de su CEDEAR.

## Noticias: RSS y permisos por medio

La configuración central vive en `app/data/news-sources.ts`. iProfesional, El Economista, Página/12, Infobae y Bloomberg respondieron con RSS válido y reciente durante la revisión del 18/11/2026. MDZ permanece pendiente: su RSS histórico respondió 404. Los resultados están en `docs/NOTICIAS-VIABILIDAD.md` y `docs/NOTICIAS-MDZ.md`.

**El lector local está habilitado por pedido del usuario.** `newsSourcesForEnvironment(true)` selecciona las cinco fuentes verificadas con `publication: "local-reader"`; guarda titulares, origen, fecha, enlace y las URLs de imágenes incluidas en los feeds de iProfesional, Página/12 e Infobae. Las bajadas siguen desactivadas. Las fotos se cargan directamente desde sus hosts HTTPS verificados: `resizer.iproimg.com`, `grupooctubre-pagina12-prod.web.arc-cdn.net` y `www.infobae.com`. No se descargan archivos de imagen al servidor ni se busca contenido en el HTML de los artículos. El Economista y Bloomberg no aportaron fotos en los feeds revisados; conservan la ilustración de Flujario. Lo mismo ocurre si una imagen falta o falla. MDZ continúa pendiente por su RSS no funcional. Esta modalidad no declara una autorización de republicación pública.

En producción `newsSourcesForEnvironment(false)` conserva las fuentes pendientes. Un permiso aplicable puede constar en condiciones públicas o en una autorización individual; no se exige siempre una carta. Para un uso público aprobado se documenta su alcance con `publication: "approved"` y `permissionReference`, un enlace o identificador sin secretos ni documentos privados. La disponibilidad del feed por sí sola no acredita cualquier redistribución. Las imágenes y bajadas requieren revisar su alcance por separado.

| Cron UTC       | Argentina            | Función                                                             |
| -------------- | -------------------- | ------------------------------------------------------------------- |
| `*/30 * * * *` | Cada media hora      | Consultar fuentes habilitadas y limpiar artículos de más de 15 días |
| `0 13 * * MON` | Lunes a las 10:00    | Sincronizar y fijar la selección de los siete días anteriores       |
| `0 13 * * *`   | Cada día a las 10:00 | Extender vencimientos; ya no publica una edición diaria fija        |
| `0 */3 * * *`  | Cada tres horas      | Conservar la actualización de divisas                               |

Los [Cron Triggers de Cloudflare](https://developers.cloudflare.com/workers/configuration/cron-triggers/) ejecutan el handler `scheduled` en UTC. Cloudflare no ejecuta sus horarios automáticamente en desarrollo. Por eso `tools/local-schedules-plugin.ts` invoca la API oficial local del Worker al iniciar Vite y cada treinta minutos; se detiene al cerrar el servidor. Usa el puerto efectivo, no modifica D1 directamente ni inicia otro importador. Un fallo de transporte/ejecución se reintenta al minuto. No se desplegó el proyecto ni se crearon recursos remotos.

En desarrollo, después de sincronizar también se intenta recuperar la edición del lunes correspondiente. Su rango sigue siendo los siete días anteriores al lunes a las 10:00 y una edición existente nunca cambia. Si el RSS no trae historial suficiente, la selección semanal queda vacía hasta que existan artículos del período; no se rellenan con noticias posteriores al corte.

Hoy usa el día de publicación en Argentina. La semanal es una selección fija identificada por el lunes y no cambia por actualizaciones posteriores. Noticias presenta hasta cinco entradas por medio; Ver todas abre ese medio con páginas de veinte. No se afirma relevancia editorial ni se rellenan lugares con otros rubros. Infobae usa categorías económicas explícitas o su ruta oficial `/economia/`. El alternativo general de Bloomberg sólo acepta metadatos económicos verificables.

El parser valida RSS y Atom, prohíbe DTD/entidades declaradas, limita la respuesta a 2 MiB y 500 entradas, y exige fecha válida con zona, no futura, URL HTTPS y host del medio. CDATA es texto literal: un `<!DOCTYPE html>` dentro de una descripción CDATA no se interpreta como una declaración XML. La comprobación recorre los bloques en orden para impedir que una marca CDATA escrita dentro de comentarios o instrucciones oculte una declaración real. El timeout es de doce segundos por feed. Sólo se sigue la redirección oficial observada de `feeds.bloomberg.com/news.rss` al feed general de `www.bloomberg.com`. Un 401/403 detiene el intento de esa fuente; no se usa la alternativa para evadirlo. No se solicita el HTML de los artículos ni se almacena su texto completo.

D1 guarda artículos normalizados, estado/lease por medio, diarios favoritos, artículos guardados y pertenencia a la selección semanal. Una clave SHA-256 basada en medio y URL canónica, más un índice único de URL, evita duplicados. Un lote transaccional con `json_each` guarda los metadatos cambiados sin exceder el límite de variables por artículo. Un token evita que un worker anterior pise una sincronización posterior. Los fallos de un medio no interrumpen los otros.

Los diarios favoritos personalizan Resumen; los artículos guardados se consultan en Guardadas y no alteran Resumen. Cada lectura/cambio privado verifica Clerk y usa el identificador de sesión. Las noticias de más de quince días se eliminan junto con sus guardados y pertenencia semanal. Las preferencias de diarios permanecen.

La API privada es `GET /app/noticias/datos`, con `period=daily|weekly`, `source=all|identificador`, `category=all|temática`, `search`, `page`, `limit` (máximo 50) y `saved=yes|no`. La selección de todos los medios devuelve hasta cinco por fuente; para paginar se elige un medio. POST admite `favorite-source` y `save-article`, siempre como establecimiento idempotente del estado deseado y con comprobación de origen. Nunca se consulta RSS por visitante. Actualizar vista sólo relee D1.

### Prueba local

```powershell
npm run db:migrate:local
npm run dev
```

`npm run dev` inicia la sincronización local automáticamente. Para ejecutar además una revisión manual del mismo sincronizador:

```powershell
Invoke-RestMethod 'http://127.0.0.1:5173/cdn-cgi/local/scheduled?cron=%2A%2F30+%2A+%2A+%2A+%2A&format=json'
```

`/vista-previa/noticias` y `/vista-previa/resumen` muestran los titulares reales de D1 local. La vista previa lee el catálogo sin dueño (`userId: null`), nunca guardados ni preferencias de cuentas reales. Los saldos y movimientos siguen siendo ejemplos identificados. Las consultas privadas conservan Clerk y sus filtros de dueño. Actualizar vista relee D1; ningún visitante consulta los RSS. Si la primera carga coincide con la importación inicial, el panel relee el caché cada quince segundos hasta que termine; después utiliza su revisión habitual.

Para pruebas aisladas, `node qa/verificar-noticias-d1.mjs` usa workerd/D1 temporal y RSS ficticio. `/vista-previa/noticias?noticias=ejemplo` conserva la maqueta explícita con titulares ficticios y enlaces a example.com. Toda la vista previa devuelve 404 en producción.

Las migraciones aditivas son `0004_news_rss.sql` y `0005_news_preferences_weekly.sql`. Se aplicaron sólo a D1 local, con copia consistente y huellas de las diez tablas previas. Las tablas financieras no se modificaron. `news_editions` y el adaptador JSON anterior se conservan como historial; `NEWS_FEED_URL` no activa el módulo nuevo.

Antes de un futuro despliegue autorizado: resolver permisos, configurar un D1 real, aplicar sus migraciones con `npm run db:migrate:remote`, ejecutar `npm run check` y luego `npm run deploy`. Esos comandos remotos no se ejecutaron durante la implementación. Los costes y la cobertura dependen de los proveedores y el uso; no se prometió una licencia gratuita.

## Divisas: DolarApi aprobado

Se usan `https://dolarapi.com/v1/dolares` y `https://dolarapi.com/v1/cotizaciones`. Se normalizan oficial, MEP y blue, euro, real, peso chileno y uruguayo. No se envían saldos, movimientos ni identificadores personales al servicio.

Según [Uso de los datos](https://dolarapi.com/docs/uso), se permite consultar y publicar con atribución y se recomienda una consulta cada tres horas por serie. La licencia MIT corresponde al programa; no reemplaza las licencias de fuentes de terceros. El [aviso legal](https://dolarapi.com/docs/legal) identifica los datos como informativos, sin garantía de exactitud o disponibilidad.

Un claim atómico en D1 evita multiplicar peticiones entre usuarios. Se conservan versiones de precios para que una operación mantenga su referencia original. Una respuesta anterior no reemplaza una más reciente. Los valores cero, negativos, invertidos, futuros o con formato no admitido se rechazan. La respuesta se limita a 64 KiB y ocho segundos por feed; no se siguen redirecciones.

La pantalla distingue la fecha de la fuente de la fecha de consulta. Si falla una actualización, conserva los valores anteriores con su fecha o indica ausencia de referencia. Los movimientos personales y el ingreso manual de cotización siguen disponibles. Un error no permite afirmar que hay precios actuales.

El cron `0 */3 * * *` sólo actualiza divisas; no ejecuta noticias. Como los demás cron, necesita desplegarse para funcionar automáticamente con la web cerrada. En local se revisa al consultar Cotizaciones o abrir el formulario, respetando el plazo compartido de tres horas.

La vista previa no consulta el backend privado. Resumen y Cotizaciones leen las referencias públicas de D1, respetando el caché de tres horas y los datos anteriores ante fallos. Se actualizan al volver a cargar o revisar el caché vencido. La portada y las demás ilustraciones conservan la captura pública fechada de `app/data/captured-quotes.json`. Los saldos y movimientos siguen siendo ficticios y los formularios no guardan. La vista previa devuelve 404 en producción.

La consulta usa `redirect: "manual"` y rechaza cualquier estado no exitoso. workerd no admite `redirect: "error"`: esa opción impedía hacer las solicitudes. `qa/verificar-cotizaciones-d1.mjs` ejecuta el adaptador completo dentro de workerd con D1 efímera y una red ficticia; `qa/diagnosticar-divisas.mjs` permite comprobar sólo los dos endpoints públicos reales, sin usar la base ni datos personales.

## Lectores locales de resúmenes — 20/11/2026

No son conexiones bancarias. Papa Parse 5.7.1 (MIT), SheetJS CE 0.20.3 (Apache 2.0), PDF.js 6.5.438 (Apache 2.0) y Tesseract.js 7.0.0 (Apache 2.0) trabajan en el navegador. El modelo español se distribuye con `@tesseract.js-data/spa` 1.0.0. Los recursos y sus licencias se copian desde los paquetes fijados, sin usar un CDN al leer el documento. Se cargan al elegir la herramienta/formato, sin enviar archivos a un servicio OCR.

Se usó el [tarball oficial de SheetJS](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/) de CE 0.20.3: la distribución `xlsx` del registro npm estaba desactualizada. [Papa Parse](https://www.papaparse.com/docs) mantiene el texto original sin `dynamicTyping`; [PDF.js](https://mozilla.github.io/pdf.js/) extrae texto y renderiza páginas; [Tesseract.js](https://github.com/naptha/tesseract.js) reconoce imágenes, por eso PDF.js renderiza primero un PDF escaneado. Fórmulas, macros y acciones de documentos no se ejecutan como operaciones de Flujario. Los valores guardados de Excel pueden requerir corrección.

Las bibliotecas no tienen coste por documento ni se contrató una API. El trabajo de lectura consume CPU/memoria del dispositivo, especialmente con OCR. Cloudflare D1/Workers mantienen sus límites y cuotas: no se promete gratuidad a cualquier volumen. No se usa R2 ni se crearon recursos remotos. [Cuotas de Workers](https://developers.cloudflare.com/workers/platform/limits/) y [precios de D1](https://developers.cloudflare.com/d1/platform/pricing/) deben revisarse al planear un despliegue.

Entidades de procedencia: Nación, Credicoop, Santander, BBVA, Galicia, Macro, Patagonia y Mercado Pago. No se accede a sus APIs ni se afirma compatibilidad con cada plantilla. Los lectores permiten asignar columnas y revisar todas las filas. Todavía falta contrastar muestras de los diseños bancarios reales; el OCR no garantiza exactitud ni reemplaza esa validación.

## Flujario AI: Workers AI — 24/11/2026

Proveedor aprobado expresamente: Cloudflare Workers AI, sin contratar un plan pago. Modelo seleccionado `@cf/ibm-granite/granite-4.0-h-micro`, por coste, español y disponibilidad vigente. Fuentes: [ficha Cloudflare](https://developers.cloudflare.com/workers-ai/models/granite-4.0-h-micro/) y [ficha IBM](https://huggingface.co/ibm-granite/granite-4.0-h-micro). Usa el [binding del Worker](https://developers.cloudflare.com/workers-ai/configuration/bindings/); sin clave de IA en frontend, n8n ni entrenamiento propio.

Se envían preguntas e historial acotados, instrucciones y fecha; no se envían movimientos consultados, saldos, originales ni dueño. El modelo devuelve un plan validado, sin SQL o cálculos. El texto escrito puede contener datos sensibles; el usuario debe conocer ese recorrido. Los informes se calculan en el servidor. Las sugerencias estadísticas no consultan al proveedor.

Los [precios](https://developers.cloudflare.com/workers-ai/platform/pricing/) revisados indican 10.000 Neurons gratuitos por cuenta/día UTC, compartidos, y tarifas de 1.542/M tokens de entrada y 10.158/M de salida para este modelo. Presupuesto estimado de Flujario: 8.000, cinco intentos por usuario/día argentino y máximo 400 tokens de salida. Reserva conservadora variable, recibo real si existe y sin liberar la reserva ante fallos. No equivale a imponer un techo de cobro a toda la cuenta.

Local deshabilita la inferencia remota por defecto; los [límites](https://developers.cloudflare.com/workers-ai/platform/limits/) también cuentan llamadas desde desarrollo. Se verificaron contratos y cuotas con proveedor ficticio/D1 real aislada; la llamada real y su precisión quedan pendientes de configurar la cuenta. No se activaron planes, recursos ni inferencias remotas. Configuración y comandos: [FLUJARIO-AI.md](FLUJARIO-AI.md).
