# Verificación de esta base

Se verificó el resultado local. Se conectó la fuente pública de divisas aprobada, DolarApi; no se desplegó un servicio ni se crearon recursos remotos.

| Comprobación                         | Resultado                                                                         |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| TypeScript estricto y tipos de rutas | Aprobado                                                                          |
| Pruebas automatizadas                | 163 aprobadas, 18 archivos                                                        |
| Compilación cliente + Worker         | Aprobada                                                                          |
| Migración con Wrangler en D1 local   | 0000 a 0003 aplicadas en D1 local                                                 |
| SQL real con SQLite en pruebas       | Autorización por propietario/moneda, restricciones y rollback verificados         |
| Reintentos y envíos simultáneos      | Un solo gasto por clave; conflicto ante contenido diferente                       |
| Pagos y saldos                       | Pendiente separado de saldo; al pagar se crea un solo gasto                       |
| Fechas                               | Fin de mes, trimestre, cambio de año, 29 de febrero y fecha argentina verificados |
| Portada en producción local          | HTTP 200, vistas HTML de ejemplo accesibles                                       |
| Vista previa en producción local     | HTTP 404                                                                          |
| Panel sin Clerk configurado          | HTTP 503, sin exponer datos                                                       |
| Caché de HTML y panel                | `private, no-store`                                                               |
| Trabajo programado local             | Responde correctamente; sin proveedor no publica noticias                         |
| Diseño                               | Inspección de escritorio y móvil; formulario de 288 px en viewport de 320 px      |
| Móvil                                | Importes y acciones visibles en tarjetas; sin desborde de la página a 390 px      |

La revisión visual comparó la implementación con la referencia Ventriloc entregada: superficies cálidas, títulos livianos, acentos pequeños, CTA negro, paneles planos y navegación en cápsula. Se corrigieron contraste de enlaces con apariencia de botón, tamaños de lectura y acciones que quedaban fuera de las tablas en celular.

La portada usa vistas HTML compartidas con el panel. Las capturas históricas se conservan en `public/images/`; la evidencia nueva está en `qa/portada-html-escritorio.jpg` y `qa/portada-html-movil.jpg`. Los saldos y movimientos son ficticios; las referencias de divisas son capturas públicas de DolarApi identificadas con fecha.

## Límites de la verificación

En la actualización de pagos mensuales se verificaron los límites de cinco meses por dirección, el cambio de año, el filtro por moneda y estado, y el acceso a pendientes antiguos. Las pruebas SQL comprueban que silenciar un aviso persiste por usuario, no registra gastos y no silencia nuevos vencimientos de la misma regla. En navegador se comprobó que postergar permanece durante la navegación interna y vuelve a mostrar el aviso al recargar el panel.

También se probó la recuperación de vencimientos tras una pausa de más de un año sin duplicarlos ni completar los de otro usuario. Los pares de color de texto y fondo dan contrastes aproximados de 6,21:1 para ingresos y 5,99:1 para egresos. A 320 y 390 píxeles se comprobó que los importes habituales de la vista de ejemplo no se parten y que los botones Pagar permanecen dentro de la pantalla.

- El SDK de Clerk compila y la autorización tiene pruebas con sesiones simuladas; la autenticación completa con una instancia real de Clerk todavía no se verificó.
- No se probó una base D1 remota ni los cron desplegados. Sí se aplicó la migración y se ejecutó el trabajo programado en el runtime local de Workers.
- Noticias y cotizaciones de acciones siguen pendientes por decisión del usuario. Para divisas se revisaron documentación y condiciones publicadas del proveedor aprobado; una consulta puntual no acredita su disponibilidad ni exactitud continua.
- No se hicieron pruebas de carga ni se afirma ausencia absoluta de errores. Las funciones futuras están identificadas en el README.

## Importes variables: noviembre de 2026

`npm run check` pasó con 109 pruebas: tipos, reglas financieras y compilación cliente/Worker. Los nuevos casos verifican montos desconocidos, pago con un importe diferente del previsto, edición limitada a pendientes, conservación de ajustes manuales y de meses ya pagados, último guardado, reintentos antiguos, autorización y rollback completo.

Dos pruebas controlan el orden entre operaciones: una edición que llega después de que otra pestaña pagó debe rechazarse; la generación de meses debe usar la sugerencia vigente aunque haya cambiado después de leer la regla.

La migración se ejecutó sobre una base SQLite con datos del esquema anterior y sobre una D1 local aislada mediante Wrangler. Se conservaron gastos, avisos, IDs e importes; `foreign_key_check` no reportó problemas. No se desactivaron las claves foráneas. La primera reconstrucción falló al confirmar dependencias; se corrigió el orden de reconstrucción y restauración antes de aplicarla a datos de uso.

`node qa/verificar-d1.mjs` también pasó contra workerd/D1 temporal: ejecuta las migraciones con registros anteriores y las operaciones reales del repositorio Drizzle. Comprueba pago de un pendiente sin importe, reintento sin duplicación, edición, conservación de un ajuste mensual, propagación y aislamiento. Usa las herramientas de desarrollo de `package-lock.json`; no crea recursos remotos ni utiliza datos de la cuenta del usuario.

En navegador se verificó el hover real de un control secundario: fondo `rgb(32,32,32)` y texto blanco. La vista previa muestra un vencimiento sin importe y permite abrir Pagar y Editar importe. Las operaciones de persistencia se probaron mediante el repositorio y SQL; no se registraron gastos en una cuenta real desde la interfaz.

El hover del CTA termina en `rgb(52,52,52)`. A 320 px se corrigió un desborde interno del diálogo: el formulario usa una columna que puede encogerse y las acciones se apilan. Se comprobaron tanto el ancho de la página como `scrollWidth`/`clientWidth` del diálogo y se revisaron sus acciones al desplazarse hasta el final.

La prueba de captura transaccional (`tests/snapshot.test.ts`) comprueba que el resumen no mezcle el saldo anterior con el estado posterior a un pago concurrente.

Las migraciones 0002 y 0003 se aplicaron a la base habitual después de las pruebas temporales y de un respaldo privado. La comparación de exportaciones verificó 18 registros anteriores y sólo la política autorizada de montos futuros. Las claves foráneas de la base real permanecieron activas.

## Monedas y cambios

La verificación completa pasó con 139 pruebas en 15 archivos, TypeScript y compilación cliente/Worker. Las pruebas nuevas cubren diez monedas, CLP sin decimales, tasa decimal exacta, compra/venta y ambos saldos, separación de ingresos/gastos, reintentos simultáneos, propiedad de cuentas y rollback. Los importes confirmados se conservan aunque difieran de la sugerencia.

Las pruebas de cotizaciones comprueban lado compra/venta, copia compartida durante tres horas, respuestas inválidas/grandes/futuras/invertidas, conservación ante errores y ausencia de regresión de fecha. Una nueva referencia no cambia el precio ni los saldos de un registro anterior. La nueva ruta de datos verifica sesión antes de usar la base o la fuente.

La prueba adicional contra D1/workerd temporal pasó. También verificó que el runtime expone el token decimal original de JSON; la consulta pública aprobada produjo siete referencias válidas, capturadas con fecha sin usar datos personales.

En navegador se verificaron las referencias de compra y venta, el recálculo al editar la tasa, la revisión de ambos importes y el cambio inmediato de moneda en el historial. El selector para agregar moneda excluye las existentes; el formulario de CLP pide pesos enteros. A 320 px, Cotizaciones y los diálogos no tienen desborde horizontal. Las capturas nuevas están en `qa/cotizaciones-escritorio.jpg`, `qa/cotizaciones-movil.jpg`, `qa/cambio-moneda-escritorio.jpg` y `qa/agregar-moneda-movil.jpg`; la portada incluye una imagen de la sección nueva.

No se registraron conversiones de prueba en cuentas reales ni se desplegaron recursos remotos. El login completo con una instancia real de Clerk y los cron desplegados siguen fuera de la verificación realizada.

## Ajuste de marca y hover

Se verificó la carga del logo SVG en portada y panel, y la distribución a 320 px sin desborde horizontal. El símbolo original de barras y flecha reemplaza el asterisco de la marca provisional; el favicon y la página de error usan la misma identidad.

En navegador se comprobó el hover de un botón primario, uno secundario y un CTA de portada: fondo `rgb(212,216,221)` y texto `rgb(32,32,32)`, una vez terminada la transición. El contraste entre texto y fondo es aproximadamente 11,38:1. Se conserva el foco de teclado visible. Evidencia: `qa/logo-hover-escritorio.jpg`, `qa/logo-hover-portada.jpg` y `qa/logo-movil.jpg`.

`npm run check` volvió a pasar con 139 pruebas, TypeScript y build. No se agregaron pruebas que sólo repitan los valores CSS; el cambio visual se revisó en el navegador. También pasó `npm run format:check`.

## Portada con movimiento y vistas HTML

`npm run check` pasó con 144 pruebas en 16 archivos, tipos y build. Los cinco casos nuevos comprueban que el servidor entrega el contenido de la portada visible sin JavaScript, que Home no consulta fuentes ni el backend privado y que las cuatro ilustraciones usan datos identificados y controles inertes, sin formularios. `npm run format:check` también pasó.

En navegador se observó el paso de `pending` con opacidad cero a `visible` al entrar los bloques en pantalla. Se verificaron los anchos de página e internos de las cuatro vistas a 320 px; las cotizaciones largas pasan a filas para conservar el importe completo, y ARS no se parte entre letras. También se revisó a 390 y 1440 px. Las vistas HTML no usan transformación de escala ni capturas rasterizadas. Evidencia final: `qa/portada-html-escritorio.jpg` y `qa/portada-html-movil.jpg`.

Se comprobó el atributo `inert` de los controles ilustrados. La reducción de movimiento está implementada tanto en CSS como en el observador; no se cambió la preferencia del sistema del usuario para probarla. Resumen y las siete cotizaciones siguieron renderizando en la revisión local tras extraer sus piezas visuales compartidas. La portada respondió HTTP 200; una referencia de módulos que había quedado en caché tras mover el ejemplo se corrigió usando su alias de importación.

## Resumen reorganizado y temas

La verificación completa pasó con 163 pruebas en 18 archivos, TypeScript y compilación cliente/Worker. Los casos nuevos verifican saldos ARS/USD separados, listas con otras monedas, ambos importes de una conversión, selección de hasta cinco acciones sin duplicados, carrusel de hasta cinco artículos inicialmente pausado y script de tema con preferencias válidas, inválidas y almacenamiento bloqueado.

Las comparaciones de divisas tienen pruebas de subida, bajada, empate, mitad hacia arriba, diferencias inferiores a 0,01 %, ausencia de historia y series incompatibles. El SQL real comprueba el corte de medianoche en Argentina, que no se use otra referencia del mismo día y que una consulta posterior no altere una captura anterior. `node qa/verificar-d1.mjs` volvió a pasar en D1/workerd temporal; no se modificó el esquema ni se migró la base habitual en este cambio.

En navegador se verificaron Pesos/Dólares/Ambos, conservación de pagos al cambiar sólo el saldo, cinco empresas con favoritas identificadas, selector de dólar, edición diaria/semanal y apertura de Pagar sin registrar una operación real. Se corrigió la combinación de filtros rápidos en la URL. Se comprobó Oscuro tras recargar, la portada con ese tema y el ancho exterior e interior de los módulos a 320 px. Los importes mensuales conservan sus dígitos en una sola línea. El aviso de meses anteriores sigue disponible, ahora después del área principal del Resumen.

Las acciones continúan sin proveedor de precios; las noticias no tienen artículos publicados. El carrusel se probó con artículos ficticios sólo en pruebas automatizadas y sus controles vacíos se revisaron en navegador. La reproducción con un feed real y el login completo de Clerk siguen pendientes de verificación. Las referencias sin historia se identifican como «Sin comparación» y no se publican ganancias de inversiones.

Las vistas finales están en `qa/resumen-nuevo-claro.jpg`, `qa/resumen-nuevo-oscuro.jpg`, `qa/resumen-completo-claro.jpg` y `qa/resumen-movil-oscuro.jpg`. Se verificaron cuatro pares de texto/fondo de la paleta: sienna sobre durazno 9,27:1, texto secundario claro 5,43:1, texto secundario oscuro 7,24:1 y acento de texto oscuro 9,44:1. Estos valores no constituyen una auditoría completa de accesibilidad.

## Reemplazo del logo

`npm run check` volvió a pasar con 163 pruebas en 18 archivos, tipos y build. `npm run format:check` pasó. No se agregaron pruebas que repitan los estilos de este cambio visual.

En navegador se verificó el wordmark negro/dorado en claro y blanco/dorado en oscuro, el cambio al usar el selector y la conservación del tema oscuro después de recargar. La marca conserva el nombre accesible «Flujario, inicio». Se revisaron la portada y sus cuatro vistas ilustrativas a 320 px, sin desborde horizontal, y la marca compacta del panel a 1280 px. El componente de marca se comparte con acceso y errores; no se ejecutaron registros ni operaciones financieras reales.

Capturas: `qa/logo-nuevo-movil.jpg`, `qa/logo-nuevo-panel-claro.jpg` y `qa/logo-nuevo-panel-oscuro.jpg`. Las variantes y su preparación están documentadas en `docs/LOGO.md`.

## Actualidad financiera: RSS, diarios favoritos y retención

`npm run check` pasó con **194 pruebas en 21 archivos**, TypeScript y compilación cliente/Worker. La suite conserva los casos de dinero, recurrencias, bisiestos, autorización, duplicación y saldos. Los casos nuevos cubren XML/RSS/Atom, entidades prohibidas, fechas imposibles/futuras/sin zona, URLs ajenas al medio, duplicados por seguimiento, filtros/paginación, permisos de imágenes, fallos de un diario, fallback permitido y límites de cron. Se comprueba también que una ejecución anterior no sobrescriba una posterior y que el historial editorial antiguo no se exponga por la captura financiera.

Los guardados y diarios favoritos se prueban por usuario. Un artículo guardado no altera Resumen. Se verifican el límite exacto de quince días, el borrado de guardados por clave foránea y la publicación semanal fija sin reescritura. La ruta nueva verifica Clerk independientemente en loader y action, ignora un userId del formulario y rechaza otro origen.

`node qa/verificar-noticias-d1.mjs` pasó en workerd/D1 temporal con cien artículos ficticios, escritura mediante `json_each`, cinco visibles, privacidad, semana fija y limpieza. `node qa/verificar-d1.mjs` volvió a pasar para las operaciones financieras. Ninguna de esas pruebas usa recursos remotos ni datos personales reales.

Se aplicaron `0004_news_rss.sql` y `0005_news_preferences_weekly.sql` sólo a D1 local, después de una copia consistente. Las huellas posteriores confirmaron que las diez tablas previas conservan exactamente sus filas e importes. La invocación manual del cron de treinta minutos en `/cdn-cgi/local/scheduled` respondió `outcome: ok`; con las fuentes pendientes no consultó proveedores.

`node qa/verificar-parser-rss.mjs` comprobó el parser con los cinco RSS reales el 18/11/2026, sin almacenar o publicar artículos. Aceptó 15 entradas de iProfesional, 20 de El Economista, 25 de Página/12, 1 de Infobae y 20 de Bloomberg en esa muestra, excluyendo rubros ajenos y metadatos inválidos. Las cantidades cambian con el feed; están registradas junto con fechas en `qa/rss-parser-verificacion.json`.

En navegador se verificaron cinco por medio, Ver todas, los filtros rápidos combinados, una selección con tres resultados sin relleno, la vista semanal, Guardadas, los botones de diario favorito y guardar artículo, y los enlaces externos con `noopener noreferrer`. Resumen priorizó El Economista en el ejemplo y cambió de noticias diarias a semanales con contador `1 / 5`. Se revisaron ambos temas y el ancho de 320 px sin desbordes del módulo. Las capturas ilustrativas son `qa/noticias-claro.jpg`, `qa/noticias-oscuro.jpg` y `qa/noticias-movil-oscuro.jpg`.

La vista habitual mostró cero artículos y las seis fuentes pendientes, incluida MDZ: `qa/noticias-fuentes-pendientes.jpg`. La vista DEV con `?noticias=ejemplo` usa titulares ficticios identificados y enlaces a example.com, sin acceso al backend. No se verificó un login real nuevo de Clerk ni una ejecución en Cloudflare desplegado. Las autorizaciones de publicación siguen pendientes; el cron automático necesita un futuro despliegue autorizado.

## Noticias reales en el lector local

El usuario pidió mostrar noticias reales. Se habilitaron las cinco fuentes acordadas únicamente como lector local de titulares y enlaces. Las configuraciones originales no se mutan ni se declaran permisos de publicación: producción mantiene su control por medio y MDZ sigue pendiente por RSS no funcional.

`npm run check` pasó con **203 pruebas en 22 archivos**, TypeScript y build cliente/Worker. Las pruebas nuevas cubren el alcance DEV/producción, la exclusión de bajadas e imágenes, la lectura sin dueño sin filtrar preferencias privadas, la ausencia de consultas RSS por visitante y el rechazo de la vista previa en producción. El reloj local se prueba al iniciar, a los treinta minutos, al cerrar el servidor y ante un scheduled fallido, que se reintenta al minuto sin anunciar éxito. El scheduled DEV recupera el corte semanal sin modificar una edición existente. Las comprobaciones financieras y de autorización anteriores siguen pasando.

Se invocó la API oficial local del scheduled con el cron de treinta minutos: respondió HTTP 200 y `outcome: ok`. D1 local recibió 83 titulares económicos: iProfesional 16, El Economista 20, Página/12 25, Infobae 2 y Bloomberg 20. No se guardaron descripciones ni imágenes. Se recuperó la edición del lunes 16/11/2026 con el rango 9/11 a las 10:00 hasta 16/11 a las 10:00 de Argentina. Los recuentos y fechas se conservan en `qa/noticias-reales-verificacion.json`; `node qa/verificar-noticias-reales.mjs` permite revisarlos sin imprimir titulares ni datos personales.

Antes de cargar el caché se realizó una copia SQLite consistente; `node qa/auditar-noticias-local.mjs` confirmó después que las diez tablas previas conservan exactamente sus registros e importes. No se hicieron migraciones ni despliegues en este ajuste.

En navegador, la vista habitual mostró titulares reales, fecha y enlaces del host correspondiente con `noopener noreferrer`. Se comprobó el filtro por diario, cinco noticias semanales de Página/12 y cero de Infobae sin completar con noticias posteriores al corte. En Resumen el carrusel diario pasó de `1 / 5` (iProfesional) a `2 / 5` (El Economista). Los controles de lectura no realizan operaciones financieras.

Se verificó una búsqueda por título con un único resultado real en los dos temas. A 320 px, el ancho de documento y su contenido fue de 305 px (descontando el scrollbar), sin desborde horizontal; el módulo midió 269 px. Se guardaron `qa/noticias-reales-movil.jpg`, `qa/noticias-reales-claro.jpg` y `qa/noticias-reales-oscuro.jpg`. La preferencia de tema se devolvió a Sistema y se limpiaron los filtros de prueba. `npm run format:check` pasó.

## Fotos RSS y conservación de la ilustración

El usuario aprobó mostrar las imágenes del RSS en el lector local y mantener la ilustración actual cuando falten. Se verificaron los metadatos de los cinco feeds sin descargar fotos ni HTML de artículos: iProfesional aportó 16 imágenes desde `resizer.iproimg.com`, Página/12 25 desde `grupooctubre-pagina12-prod.web.arc-cdn.net` e Infobae 6 desde `www.infobae.com`. El Economista y Bloomberg no aportaron imágenes. La evidencia con fechas vive en `qa/rss-imagenes-verificacion.json` y se puede repetir con `node qa/verificar-imagenes-rss.mjs`.

Durante la revisión, Infobae quedó rechazado por un `<!DOCTYPE html>` literal dentro de CDATA. `validateFeedXml` ahora distingue comentarios, CDATA e instrucciones en orden, conservando el rechazo de declaraciones DTD/entidades reales. Se prueban el literal inocuo, las declaraciones reales junto a CDATA y los intentos de ocultarlas mediante comentarios o instrucciones. También se comprueba HTTPS, el host exacto y el rechazo de credenciales, puertos y dominios que sólo parecen autorizados.

`npm run check` pasó con **207 pruebas en 22 archivos**, TypeScript y compilación cliente/Worker. Se actualizaron las pruebas del lector para aceptar sólo la URL de imagen del host configurado, mantener las bajadas vacías y no activar imágenes en producción. No se cambió el esquema ni la autorización de loaders/actions.

Se adelantó una única sincronización de las tres fuentes con fotos en D1 local, respetando cualquier lease activo. El scheduled respondió HTTP 200 y `outcome: ok`. El caché quedó con 96 noticias y 47 URLs de imagen, sin archivos de foto descargados al servidor, sin descripciones ni URLs duplicadas. Las huellas de las diez tablas anteriores conservaron exactamente sus registros e importes.

En navegador se observó una foto real de iProfesional cargada a 640 × 360 píxeles, con `loading="lazy"` y `referrerpolicy="no-referrer"`. Se verificó la tarjeta en Claro/Oscuro y a 320 px, sin desborde horizontal. El Economista conservó cinco ilustraciones y ningún elemento de imagen. El componente incluye recuperación a la ilustración ante errores, también si la carga falla antes de la hidratación, y permite intentar una URL nueva. Capturas: `qa/noticias-fotos-oscuro.jpg`, `qa/noticias-fotos-claro.jpg`, `qa/noticias-fotos-movil.jpg` y `qa/noticias-sin-foto.jpg`.

También se observó la carga completa de las cinco fotos visibles de Página/12 y las cinco de Infobae desde los hosts configurados; todas tenían ancho natural mayor a cero. Se devolvió la preferencia de tema a Sistema y el navegador a su tamaño habitual. La ilustración y la proporción reservada se conservaron sin cambios de diseño. `npm run format:check` pasó.

## Mercados: índices completos y cinco favoritas — 19/11/2026

`npm run check` pasó con **220 pruebas en 23 archivos**, TypeScript y build cliente/Worker. Se ejecutaron los casos anteriores de importes, recurrencias, bisiestos, duplicación, autorización y saldos junto con los nuevos de Mercados. El catálogo SQL coincide con el catálogo público de la vista previa: 101 instrumentos por índice, 167 únicos y 35 compartidos. Las pruebas comprueban MRNA frente a la lista educativa desactualizada, el símbolo BRK.B y la bolsa actual de WMT; no se inventa una cotización para completar columnas.

Los tests verifican veinte altas simultáneas con exactamente cinco resultados, reintentos sin duplicados incluso al llegar al máximo, una acción compartida que cuenta una vez, aislamiento entre dueños, preferencias persistidas, borrado propio y conservación de cuentas/movimientos. También prueban que la action anterior no elude el límite, las claves foráneas, la identidad inmutable y la migración de símbolos anteriores. Una base antigua con más de cinco provoca rollback en vez de perder favoritas. Loader y action nuevos exigen Clerk por separado, ignoran el userId del formulario y rechazan otro origen.

`node qa/verificar-mercados-d1.mjs` pasó en workerd/D1 temporal: migró todas las tablas, envió veinte solicitudes concurrentes, obtuvo cinco altas y quince errores 409 con el mensaje acordado, repitió diez veces una favorita al alcanzar el máximo y verificó privacidad, preferencia de índice, borrado y saldos sin cambios. No consultó proveedores ni usó datos personales. Las fuentes públicas y el método de contraste del catálogo están en `qa/catalogo-mercados-verificacion.json` y `docs/PROVEEDORES.md`.

Se aplicó `0006_stock_markets.sql` sólo a D1 local, tras una copia consistente en `.wrangler/backups/`. `node qa/auditar-noticias-local.mjs` confirmó que las diez tablas anteriores mantienen exactamente sus filas e importes. `node qa/auditar-mercados-local.mjs` confirmó pertenencias, conservación de todas las favoritas anteriores, máximo cinco y ausencia de violaciones de claves foráneas. No se desplegó ni se modificaron recursos remotos.

En navegador se comprobaron los dos índices con 101 filas, búsqueda por símbolo, filtros y orden conservados al alternarlos, favoritos globales, el mensaje exacto de la sexta estrella, eliminación y estado vacío sin iframe. Se comprobó que la URL de índice del ejemplo se conserva al terminar la navegación y recargar; la persistencia privada en D1 se comprobó en las pruebas del servidor, sin afirmar un nuevo login real de Clerk entre dispositivos.

El widget oficial cargó gráficos reales y cambió de favorita manteniendo un único iframe conectado. Se cambió desde su control nativo de velas diarias a una hora y se verificó visualmente el período. Los dos temas se reflejaron en la configuración del widget. Se revisaron escritorio a 1440 px y móvil de 320 px, sin desborde horizontal del módulo; en móvil se utiliza el listado compacto. La comprobación no extrae cotizaciones del iframe para la tabla ni valida las cifras de un proveedor independiente. Capturas: `qa/mercados-oscuro.jpg`, `qa/mercados-claro.jpg` y `qa/mercados-movil-claro.jpg`.

`npm run format:check` pasó. El proyecto no tiene un comando ESLint separado: se verifican formato con Prettier, tipos con TypeScript y comportamiento mediante las pruebas indicadas. La lista de constituyentes es una revisión manual fechada, no una sincronización diaria; la tabla de precios y variaciones sigue sin API aprobada y el gráfico informa cobertura/demora desde TradingView.

## Noticias sin temas e imágenes en Resumen — 19/11/2026

`npm run check` pasó con **223 pruebas en 23 archivos**, TypeScript y build cliente/Worker. Las regresiones nuevas verifican que la imagen del artículo y su enlace original llegan a Resumen tanto en la edición diaria como en la semanal, y que una URL antigua con `categoria` no aplica un filtro invisible ni rompe los demás filtros. La suite conserva los casos financieros y de autorización. `npm run format:check` también pasó.

En navegador se observó una foto real de iProfesional en Del día, la ilustración propia al pasar a El Economista sin imagen y una foto de Página/12 en De la semana. Se verificaron carga efectiva, enlace de la imagen igual al del titular y apertura externa con `noopener noreferrer`. Se revisaron ambos temas y 320 px sin desborde del módulo. Noticias conserva un único selector de diario y no muestra selector de temas, también al entrar desde una URL antigua. Las tarjetas mantienen las fotos mediante la misma pieza compartida con Resumen.

Capturas: `qa/resumen-noticias-imagen-oscuro.jpg`, `qa/resumen-noticias-imagen-semanal-claro.jpg`, `qa/resumen-noticias-imagen-movil.jpg` y `qa/noticias-sin-temas.jpg`. No se modificaron esquemas, cron, fuentes ni permisos de publicación; no hubo migraciones ni despliegue.

## Importación asistida — 20/11/2026

`npm run check` pasó con **267 pruebas en 27 archivos**, TypeScript y compilación cliente/Worker. `npm run format:check` pasó. La compilación avisa que la distribución compatible de PDF.js ocupa aproximadamente 500 kB minificados más su worker: ambos se cargan bajo demanda al leer PDF, no al abrir la portada. No se ocultó el aviso ni se añadió una API paga.

Las regresiones cubren el corte al inicio del día, historial sin alterar saldos, moneda separada, transferencias propias, compras legítimas coincidentes, reintentos, claves con distinto contenido, carreras entre importaciones, rollback de lotes y propiedad de Clerk en cada loader/action. El endpoint rechaza otro origen, cuerpos no JSON y cuerpos excesivos, incluso sin Content-Length. Las filas y revisiones confirmadas son inmutables.

El pago de 100 con categorías 30/40/30 conserva un único egreso y el total por categorías es 100. Un detalle de 120 queda pendiente; una revisión nueva que concilia se activa y repetir el envío anterior no la reemplaza. También se probaron históricos, reintegros negativos y rechazo de un pago ajeno. Los reportes mantienen períodos y monedas separados y excluyen transferencias/cambios.

El lector se probó con CSV reales como archivos de prueba (FileReader adaptado a Node; Papa Parse real), XLS/XLSX binarios generados y PDF digital sintético con PDF.js real. Incluye separadores argentinos/ingleses, exactitud de centavos, bisiestos, fechas inválidas, sistemas Excel 1900/1904, fórmulas detectadas, comillas rotas, tamaño y cancelación. La distribución moderna de PDF.js falló por una API reciente ausente; la distribución compatible resolvió la regresión.

`node qa/verificar-importaciones-d1.mjs` pasó en workerd/D1 efímera: diez reintentos produjeron un lote, dos lotes coincidentes generaron una confirmación y un 409, el fallo intermedio revirtió todos los registros y el otro usuario no pudo leer ni desglosar el pago. `node qa/verificar-ocr-local.mjs` pasó con el motor/modelo español local sobre una imagen sintética: reconstruyó columnas, fechas e importes esperados. Esto no mide precisión sobre estados bancarios reales ni prueba el worker OCR del navegador.

Las migraciones `0007_statement_imports.sql` y `0008_steady_spirit.sql` se aplicaron sólo a D1 local. `node qa/auditar-importaciones-local.mjs` compara huellas de diez tablas previas sin imprimir datos y revisa claves foráneas; no cambió el contenido previo. El HTML de `/vista-previa/movimientos` respondió 200 e incluyó Importar resumen y Ver análisis, sin error de ruta.

**Pendiente de revisión manual:** recorrido interactivo completo, ambos temas y móvil, OCR en navegador y muestras anonimizadas de cada banco/billetera. Computer Use se detuvo por no poder determinar la URL del navegador y no se continuó con entradas de UI. No se adjuntan capturas nuevas ni se presenta esa inspección como realizada. No se desplegó ni se crearon recursos remotos.

## Recuperación de cotizaciones y diagnóstico de inversiones — 20/11/2026

`npm run check` pasó con **273 pruebas en 28 archivos**, tipos y compilación cliente/Worker. `npm run format:check` pasó. La advertencia de tamaño del módulo PDF previamente documentada continúa; no afecta esta corrección de cotizaciones.

Se reprodujo que el Resumen DEV contenía el radar y cinco divisas en su HTML, pero usaba una captura fija del 17/11. Al conectar la copia D1 se observó un estado error sin ninguna referencia. `qa/diagnosticar-divisas.mjs` reprodujo dentro de workerd el rechazo de `redirect: "error"` antes de consultar la fuente. Con `manual`, ambos endpoints públicos devolvieron 200 y se validaron tres series del dólar más cuatro de otras divisas.

`qa/verificar-cotizaciones-d1.mjs` pasó con workerd, D1 efímera y red simulada: ejecuta el adaptador real, conserva las tasas decimales exactas, obtiene siete referencias, comparte el caché entre lectores y rechaza redirecciones sin reemplazar los datos anteriores. La regresión de Node verifica también que un 302 con JSON aparentemente válido se rechace.

Cinco pruebas de la vista previa comprueban referencias actuales/previas, caché de tres horas compartido entre Resumen y Cotizaciones, ausencia de cuentas reales, conservación de la copia anterior ante error, falta de datos sin relleno con la portada y rechazo de la ruta en producción. El endpoint privado continúa exigiendo Clerk por separado.

Se liberó una vez, sólo en D1 local, el plazo de reintento del caché que había quedado en error. La siguiente consulta de Resumen respondió 200, incluyó las cinco divisas sin ausencias y dejó el estado en ok con siete series. La fecha más reciente de la fuente fue 20/11/2026 a las 18:56 UTC. Las huellas de siete tablas financieras anteriores permanecieron iguales y no hubo errores de claves foráneas. No se modificaron saldos, movimientos, esquema ni recursos remotos.

Esta comprobación se hizo sobre el HTML y el estado público de D1, sin afirmar una nueva inspección visual del navegador. Las inversiones, ganancias/pérdidas y cotizaciones propias de acciones aún no están implementadas: las decisiones de alcance y proveedor se consultaron y permanecen pendientes de respuesta.

## Mercados: cierres y ventanas confirmadas — 24/11/2026

El usuario aprobó cierres, últimos 30 días, últimos 12 meses y coste cero. Se actualizaron encabezados, opciones de orden todavía deshabilitadas, etiquetas accesibles y explicación de la tabla, incluidas las filas móviles. No se generaron cifras ilustrativas ni se activó un proveedor; las celdas siguen indicando ausencia de datos.

`npm run check` pasó con **273 pruebas en 28 archivos**, tipos y compilación cliente/Worker. `npm run format:check` pasó. No se modificaron el esquema, las cuentas, los movimientos ni las fuentes activas.

La revisión del proveedor se hizo con documentación primaria. Massive Basic cubre técnicamente cierres por lote y dos años de historia de uso personal; no se probó una clave ni se autorizó su publicación a otros usuarios. Se revisó en navegador el widget oficial Market Data de TradingView: el menú View ofreció Overview y Performance; al aplicar Performance se observaron Price, Today, 1W, 1M, 6M y 1Y. Se mantuvo como alternativa con sus propios períodos y actualización, sin atribuirle una garantía de 30 días exactos ni una foto de cierres. No se extrajeron cotizaciones para la tabla de Flujario. La elección entre API personal/local y widget publicable se consultó y permanece pendiente de respuesta.

## Widgets oficiales en Mercados y Resumen — 24/11/2026

`npm run check` pasó con **276 pruebas en 29 archivos**, generación de tipos de React Router, TypeScript y compilación cliente/Worker. Las regresiones nuevas comprueban referencias de bolsa verificadas, deduplicación, símbolos anteriores sin bolsa, selección de cinco para el radar y rechazo de configuración con URLs ejecutables, información personal, vistas inválidas o listas excesivas. Se conservan las pruebas existentes de cinco favoritas globales, aislamiento por dueño, dinero e idempotencia. No se modificaron el esquema ni las rutas privadas.

La revisión en navegador mostró precios y variaciones reales de TradingView en el S&P 100 y Nasdaq-100, configurados con sus 101 símbolos. Se revisaron las vistas Rendimiento y Precio y variación diaria, la búsqueda AAPL/KO, la incorporación y retiro de KO como favorita de ejemplo y la vuelta a tres favoritas iniciales. Hay una sola instancia visible del widget de tabla; la carga del módulo se comparte y el elemento anterior se retira al cambiar selección. Se corrigió que los cambios de búsqueda/filtros reiniciaran la posición de lectura en Mercados.

Se comprobaron los temas claro y oscuro, el radar con cinco símbolos priorizando favoritas y el desplazamiento hasta NVDA/KO con precio, moneda y porcentaje diario. El radar usa Market Summary, porque Market Data ocultaba las columnas de variación en el ancho lateral. Se mantuvieron la atribución y los enlaces originales; no se extrajeron datos de mercado para el backend.

En móvil de 320 px se verificó que la página no desborda horizontalmente. La tabla conserva un ancho interno de 760 px para no perder las columnas; su contenedor desplazable y accesible por teclado permite llegar a 1M y 1Y. El radar mantiene tarjetas legibles con desplazamiento propio. La sobreescritura temporal del tamaño del navegador se restableció al terminar. Capturas: `qa/mercados-widget-claro.jpg`, `qa/mercados-widget-oscuro.jpg`, `qa/mercados-widget-movil.jpg` y `qa/resumen-widget-movil.jpg`.

Esta verificación comprueba integración y presentación; no contrasta independientemente las cifras de TradingView ni garantiza cobertura de todas las bolsas. Los períodos son los del proveedor, sin prometer 30 días exactos, ausencia de demora o una captura fija de cierres. No se implementó todavía la cartera ni se calcularon ganancias con precios extraídos del widget. El aviso existente de Vite sobre chunks grandes del lector PDF/Excel continúa y no impide la compilación.

## Flujario AI y botón Abrir chat — 24/11/2026

`npm run check` pasó con **299 pruebas en 34 archivos**, tipos React Router/TypeScript y build cliente/Worker. Las 23 regresiones nuevas cubren importes, monedas, históricos, saldo a fecha, tarjeta con créditos y consumos en mes distinto al pago, pago recurrente tardío con monto real diferente, pendientes sin monto, porcentajes y bisiestos. También autorización/origen, contrato sin SQL/userId/documentos, inyección sin ampliar capacidades, prompt sin registros financieros, reservas variables, límites AR/UTC, veinte solicitudes simultáneas, reintentos y recibos de consumo. El endpoint devuelve Response JSON explícita con estado HTTP y `private, no-store`, comprobados tanto en lectura como en validación y cupo agotado. El aviso de tamaño de los lectores PDF/Excel continúa; no es un error nuevo del chat. No hay ESLint separado.

`node qa/verificar-asistente-d1.mjs` pasó usando workerd/D1 efímera y proveedor de IA ficticio explícito. Comprobó cinco intentos, rechazo del sexto, veinte reservas concurrentes que no superan presupuesto, repetición sin otra llamada, separación de dueños y estadísticas sin consumo incluso al agotarse el cupo. El único movimiento sintético permaneció intacto. La pregunta breve de prueba reservó 15,830232 Neurons con máximo de salida de 400; no se mide consumo real del modelo.

La migración aditiva `0009_past_donald_blake.sql` se aplicó sólo a D1 local tras una copia consistente. `node qa/auditar-asistente-local.mjs` confirmó que trece tablas financieras conservaron exactamente filas/importes y que las claves foráneas siguen válidas. No se desplegó, no se crearon recursos remotos y no se consultó Workers AI real.

Navegador: etiqueta «Abrir chat» visible sin hover; clic/Enter abre una sola ventana, Escape/cerrar/minimizar devuelven el acceso y conservan la respuesta. Navegar de Pagos a Movimientos mantuvo el chat. Se probaron claro/oscuro, transparencia de la mascota, ancho de 320 px con altura 844 y 360 px, márgenes y ausencia de desborde horizontal. En poca altura permanecieron encabezado, entrada y desplazamiento, ocultando el lanzador. Se restauraron tamaño y preferencia Sistema al terminar. La vista previa usó estadísticas ficticias identificadas y no accedió a cuentas reales ni al modelo.

Capturas del acceso: `qa/flujario-ai-acceso-claro.jpg` y `qa/flujario-ai-acceso-oscuro.jpg`. Pendientes: prueba de inferencia real y su calidad, login/flujo remoto con dos sesiones y teclado físico de teléfono. Configuración y limitaciones en `FLUJARIO-AI.md`.

## Búsqueda directa de favoritas — 24/11/2026

`npm run check` pasó: 299 pruebas en 34 archivos, tipos y compilación cliente/Worker. Se reutiliza la función de búsqueda y la operación de favoritas ya verificadas, sin cambiar contratos financieros, cuotas ni persistencia. La composición sigue fechada y manual; no se añadió sincronización automática ni un proveedor.

En navegador DEV se buscó Coca-Cola por nombre y KO/NVDA/TSLA por símbolo; las estrellas agregaron/quitaron favoritas de ejemplo y la sexta mostró el mensaje exacto del máximo cinco. Al buscar KO en Nasdaq-100 se explicó la ausencia; volver a S&P 100 recuperó coincidencias. La búsqueda general permaneció vacía y la tabla de precios conservó sus símbolos mientras se escribía en el buscador de favoritas. Los cambios de prueba se revirtieron a las tres favoritas iniciales, sin tocar preferencias reales.

Se revisaron oscuro/claro y 320 px: campo, filas, ayuda y estrellas visibles, con ancho de página igual al disponible. Se restauraron preferencia Sistema y viewport. Capturas: `qa/mercados-buscador-favoritas-oscuro.jpg` y `qa/mercados-buscador-favoritas-movil-claro.jpg`. La revisión no es una actualización de constituyentes ni una validación independiente de precios de TradingView. Continúa el aviso existente del tamaño de los lectores PDF/Excel.

## Wikipedia cada quince días y portada vigente — 24/11/2026

`npm run check` pasó con **309 pruebas en 35 archivos**, generación de tipos, TypeScript y build cliente/Worker. Diez casos nuevos/ampliados comprueban las tablas wikitext reales atribuidas, duplicados, formato, fechas/licencia, cambios inesperados, intervalo de quince días con bisiestos/cambio de mes, conservación de favoritas que salen, guardados concurrentes, rollback y reintento tras error. Las ilustraciones públicas se verifican sin sesión, llamadas a fuentes ni endpoints privados; sus controles son inertes y sus datos de ejemplo están identificados. Continúa el aviso existente del tamaño del lector PDF/Excel.

`node qa/verificar-catalogo-d1.mjs --live` pasó con Wikipedia real y D1/workerd efímera: 101 instrumentos por índice, revisión persistida, ausencia de otra descarga durante catorce días, actualización al día quince, cuentas/movimientos/favoritas de prueba intactos y claves foráneas válidas. El runtime detectó inicialmente un límite de `UNION ALL` que SQLite local no reproducía; se corrigió con lotes `VALUES` y se volvió a comprobar allí.

`node qa/verificar-catalogo-local.mjs` pasó, con copia consistente previa. La primera revisión local dejó ambos índices consultados el 24/11/2026 y conservó las huellas de **17 tablas privadas**. El informe público está en `qa/catalogo-wikipedia-verificacion.json`. No se agregaron tablas ni migraciones ni se desplegaron recursos. La próxima revisión vence el 09/12/2026; Cloudflare la ejecutará después de un despliegue futuro, y DEV la comprueba al iniciar y cada 24 horas abierto.

Se revisaron las nuevas figuras de la portada y textos en claro/oscuro y 320 px. Importación se apila en tarjetas legibles; el avatar de AI conserva 52 px, los gráficos reflejan el ejemplo y la página no desborda horizontalmente. Hay ocho ilustraciones HTML y ninguna instancia del chat privado, iframe o widget de mercado en la portada. Se observaron la atribución/revisión de Wikipedia y fecha de consulta en Mercados DEV. Se restauraron tema Sistema y tamaño del navegador. Capturas: `qa/portada-funciones-ai-oscuro.jpg`, `qa/portada-funciones-mercados-claro.jpg`, `qa/portada-importacion-movil.jpg` y `qa/portada-ai-movil.jpg`.

Al reiniciar DEV se detectó una configuración anterior inválida de Workers AI: no existe simulador local y el binding intentaba abrir una sesión remota. Se corrigió en Vite omitiendo `AI` sólo durante desarrollo sin opt-in, con bindings remotos deshabilitados por defecto. El build conserva el binding real de producción. Se inició el servidor sin token Cloudflare y ambos scheduled locales respondieron desde sus cachés; no se ejecutó una inferencia. La prueba deliberada de IA local requiere `FLUJARIO_LOCAL_AI=true`, `AI_ALLOW_LOCAL=true` y cuenta autenticada. Detalles en `FLUJARIO-AI.md`.

## Escritura y tamaño del chat — 24/11/2026

Se verificó que el textarea permite redactar sin depender de la habilitación de IA, incluso durante una respuesta, y que el botón evita otro envío simultáneo. Las cinco preguntas estadísticas escritas con cambios de tildes, mayúsculas y puntuación devuelven estadísticas desde el endpoint autenticado aun con IA deshabilitada y límite cero, sin invocar el modelo ni crear reservas. Una variante de período distinta no se reconoce como la consulta predefinida. La disponibilidad no anuncia preguntas utilizables si falta habilitar IA o el presupuesto global está agotado.

En navegador DEV se escribió «¿En qué gasté más este mes?» y se obtuvo el informe ficticio con origen «Estadística · sin IA»; luego se probó evolución de ingresos. Shift+Enter agregó una línea sin enviar y Enter envió. Una pregunta libre mostró el límite de la vista previa, conservó el borrador y no creó una respuesta simulada. Ampliar/reducir y minimizar/reabrir conservaron borrador y respuestas; Escape devolvió el foco al lanzador. Se revisaron claro/oscuro, ancho 320 px sin desbordar la página (305 px útiles), ventana ampliada y altura reducida de 360 px con campo visible y conversación desplazable. No equivale a probar un teclado físico móvil o una inferencia real. Tema y tamaño del navegador restaurados. Captura: `qa/chat-ampliado-claro.jpg`.

`npm run check` pasó con **312 pruebas en 35 archivos**, tipos y compilación. `npm run format:check` pasó. Sin migraciones, nuevas dependencias, habilitación de inferencias ni despliegue.

## Ayuda y errores de disponibilidad del chat — 24/11/2026

La pregunta exacta de la captura («que preguntas te puedo hacer ?») se probó en navegador DEV: produjo ayuda de producto, con las cinco consultas y origen «Ayuda de Flujario · sin IA». Una consulta elegida desde esa ayuda produjo el informe de categorías con datos de ejemplo. Se mantuvo la ventana ampliada y no se modificaron estilos ni fuentes de datos.

Las regresiones comprueban las variantes acotadas de ayuda y que otras preguntas no se conviertan en ayuda por aproximación; distinguen errores definitivos de resultados inciertos y eliminan la renovación/counter de IA aún no habilitada. El endpoint autenticado sin IA devuelve `unconfigured`, mantiene uso cero, no invoca el proveedor ni crea una reserva y retira la comprobación del envío anterior. `npm run check` pasó con **315 pruebas en 35 archivos**, tipos y compilación; `npm run format:check` pasó.

El usuario confirmó que ya tiene cuenta Cloudflare. Wrangler indicó inicialmente `loggedIn: false`. La comprobación posterior confirmó una sesión activa sin exponer identidad ni credenciales.

## Inferencia real y arranque local — 24–25/11/2026

La primera inferencia con Granite reemplazó octubre de 2026 por el mes actual. Se ajustaron las instrucciones para dar prioridad a meses, años y rangos explícitos. La segunda interpretó correctamente del 1 al 31 de octubre. El servicio calculó ARS 9.000,00 de ingresos y ARS 4.250,00 de egresos con movimientos ficticios. Se comprobaron el aislamiento entre dueños, el reintento con la misma clave y la integridad de los movimientos. Cloudflare informó 1,409321 Neurons para esa segunda inferencia. Evidencia en `qa/asistente-ia-real-verificacion.json`.

El servidor de desarrollo abrió en `http://127.0.0.1:5173` con conexión a Workers AI. El permiso de consulta en desarrollo se establece en `.env.local` y la conexión en el entorno del proceso de Vite.
