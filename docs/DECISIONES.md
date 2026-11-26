# Decisiones de Flujario

Este archivo registra qué aprobaste y por qué se implementó así. Las decisiones nuevas de producto se consultan antes de escribirlas.

| Decisión aprobada                               | Por qué                                                             | Dónde se refleja                                |
| ----------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------- |
| Nombre Flujario                                 | Nombre elegido por vos                                              | Marca, metadatos y configuración                |
| Argentina, ARS y USD desde el inicio            | Refleja el contexto de uso sin conversiones implícitas              | `domain/money.ts`, esquema y selector de moneda |
| Una cuenta general por moneda                   | Reduce decisiones al registrar gastos                               | Índice único `(user_id, currency)` en cuentas   |
| Portada pública y cinco secciones privadas      | Explica el servicio antes de pedir registro                         | `routes.ts` y componentes del panel             |
| Capturas del propio producto en la portada      | Muestra qué se va a usar sin inventar resultados                    | `public/images/`                                |
| Saldo inicial opcional, cero por defecto        | Permite comenzar hoy sin cargar todo el historial                   | Operación `setup`, atómica para ambas monedas   |
| Permitir saldos negativos                       | Un registro debe reflejar lo ocurrido aunque falten ingresos        | Resumen y prueba de saldo negativo              |
| Pagos únicos, mensuales, trimestrales y anuales | Cubre los compromisos solicitados con pocas opciones                | Regla y vencimientos separados                  |
| Usar el último día si el día original no existe | Evita perder o desplazar el ancla al pasar por febrero              | `addMonthsFromAnchor`                           |
| Confirmar un pago crea un gasto en esa moneda   | Mantiene pendientes separados del saldo real                        | Gasto con `occurrence_id` único                 |
| Catálogo de 20 empresas y favoritos             | Da un punto de partida sin afirmar un ranking financiero            | `data/companies.ts`                             |
| Preparar noticias/cotizaciones sin inventarlas  | Una base financiera no debe aparentar información actual sin fuente | Estados vacíos explícitos                       |
| Diario y lunes a las 10:00 argentinas           | Horarios confirmados por vos                                        | Cron `13:00 UTC` diario y lunes                 |

## Cambios aprobados: colores y pagos mensuales

- Controles en grafito y gris perla; ingresos con fondo verde claro y texto verde oscuro, egresos con fondo naranja claro y texto oscuro. Los signos y las etiquetas acompañan el color para que el significado no dependa sólo de la vista.
- Pagos abre en el mes actual. Las flechas permiten cinco meses anteriores y cinco siguientes, con límite anclado al mes actual, no al mes que se está recorriendo. El filtro de mes vive en la URL.
- Los filtros Pendientes, Pagados y Todos se aplican al mes elegido. “Meses anteriores” mantiene accesibles los pendientes viejos, incluso los de hace más de cinco meses y los cuyos avisos fueron silenciados.
- El botón “Pagar” abre la confirmación del registro de ese vencimiento. No realiza una transferencia bancaria ni paga automáticamente los otros meses.
- Un aviso dentro del panel señala los vencimientos de meses ya cerrados. Conserva ARS y USD separados.
- “Recordar más tarde” oculta el aviso durante esa visita al panel, incluida la navegación entre sus secciones. Volver desde la portada o recargar inicia otra visita y vuelve a mostrarlo.
- “No volver a mostrar” guarda una preferencia del usuario sólo para los vencimientos que incluyó el aviso. No modifica el estado del pago, el saldo o la proyección, ni silencia futuros vencimientos del mismo servicio.

La persistencia de los avisos utiliza una tabla propia, vinculada al vencimiento y al propietario. Antes de guardar un silencio, el servidor compara una huella de la lista que se mostró. Si apareció un pendiente nuevo, pide revisar el aviso actualizado. Así no se silencian vencimientos que la persona no vio.

El panel comprueba el cambio de fecha de Argentina al volver a enfocarlo y una vez por minuto mientras está abierto. Esto permite pasar de mes sin mantener indefinidamente la fecha de la carga inicial. Al cargar el panel, el servidor completa los vencimientos faltantes sólo para el usuario verificado; así también se recupera de una pausa larga sin depender únicamente del cron. Los registros existentes no se duplican. La vista previa conserva su fecha ficticia y no escribe preferencias.

## Decisiones técnicas que sostienen lo aprobado

**React Router en modo framework.** Una ruta puede cargar datos en el servidor con un `loader` y recibir cambios con una `action`. Así no hace falta crear un servidor Express aparte. Elegimos v8 porque es la versión estable consultada, compatible con el SDK instalado de Clerk; no requiere el flag futuro de middleware de v7.

**TypeScript estricto más Zod.** TypeScript revisa el código mientras programamos, pero no puede confiar en un formulario que llega por Internet. Zod valida los datos en tiempo de ejecución. Ambos cumplen funciones diferentes.

**Tailwind y shadcn/ui.** Tailwind aporta utilidades; shadcn/ui aporta componentes cuyo código vive en el proyecto. Radix resuelve el comportamiento accesible de los diálogos, como el foco y el cierre con teclado. El estilo visual sigue tu referencia, no la apariencia predeterminada de una biblioteca.

**Reglas independientes de la interfaz.** `domain/` no importa React, Clerk ni la base de datos. Podemos probar febrero, centavos y saldos sin abrir el navegador.

**Drizzle sobre D1.** El esquema se escribe con tipos y produce SQL versionado. D1 usa SQLite; por eso evitamos asumir que existen transacciones interactivas de PostgreSQL. Cuando una operación necesita varias escrituras, se usa un batch atómico de D1.

**Clerk comprueba identidad; el backend comprueba propiedad.** El `userId` viene de la sesión verificada, nunca de un campo del formulario. Cada loader/action privado llama a `requireUser`. Las consultas personales incluyen `user_id`; las claves foráneas compuestas también comprueban propietario y moneda.

**Idempotencia.** Un envío tiene una clave y una huella de su contenido. Repetir el mismo envío devuelve el resultado existente; reutilizar la clave con otro contenido produce un conflicto. Un índice único adicional impide dos gastos para un mismo vencimiento, incluso con identificadores distintos.

**No duplicar el estado del pago.** El gasto asociado es la evidencia de que el vencimiento fue pagado. El estado se consulta con `EXISTS`; no hay un booleano separado que pueda quedar marcado sin un gasto, o viceversa.

**Protecciones de formularios.** Se comprueba el origen, se limita el tamaño del cuerpo aunque no traiga `Content-Length` y se validan campos en el servidor. Las respuestas privadas no se almacenan en cachés compartidas. Los mensajes públicos de error no incluyen secretos ni detalles SQL.

**Movimientos conservados.** Se pueden editar importes pendientes. Los gastos confirmados no se editan ni se eliminan: antes hay que acordar cómo se revierte una operación y cómo se conserva su historial.

**Una ruta privada y vistas separadas.** Las secciones del panel comparten un loader/action, pero los componentes de cada pantalla viven separados. Por eso cada consulta y cambio pasa por el mismo límite de autorización, sin duplicar reglas financieras. La ruta adicional de referencias de divisas comprueba la sesión de manera independiente.

## Decisiones aún abiertas

Proveedores de acciones y noticias, cotizaciones ARS/CEDEAR versus acciones de EE. UU., compras en cuotas, correcciones de movimientos pagados, cancelación de recurrencias y operación a escala. No se eligieron silenciosamente. Para divisas se aprobó DolarApi.

## Importes variables y participación técnica

- El importe ingresado al crear un pago corresponde a su primer vencimiento. Mantenerlo para los siguientes es opcional y viene desmarcado.
- Un vencimiento sin importe sigue pendiente y visible. Al tocar Pagar se exige el monto realmente pagado, incluso si había un importe sugerido; ese campo se puede corregir antes de confirmar.
- Se pueden editar sólo los pendientes. Un cambio de importe por sí solo nunca registra un gasto.
- La edición y el registro de pago permiten conservar la política futura, sugerir ese importe para los siguientes o dejarlos sin importe. Se conservan los ajustes manuales de cada vencimiento, incluido dejar uno sin monto, y todos los pagos registrados.
- Los cambios hacia adelante afectan fechas posteriores al vencimiento elegido, no los meses anteriores.
- Si falta un importe, el resumen muestra el subtotal conocido y la proyección incompleta. No convierte lo desconocido en cero.
- Entre dos ediciones de pendientes, gana el último guardado que ejecuta el servidor. Fue la alternativa elegida por el usuario frente a controlar versiones y rechazar formularios desactualizados.
- Se explican y consultan también las decisiones técnicas relevantes. La práctica de ingeniería agéntica usa requisitos concretos, contexto acotado, pruebas, inspección de resultados y límites de herramientas.

El modelo distingue la sugerencia futura en `payment_rules`, el importe previsto y su origen (`manual`/`inherited`) en `payment_occurrences`, y el monto real en `entries`. `NULL` representa un importe desconocido; un gasto confirmado siempre exige unidades mínimas enteras positivas de su moneda.

`payment_mutations` conserva la clave y la huella de cada envío de edición o pago. Permite reconocer un reintento viejo sin volver a ejecutar sus cambios, aun después de otras ediciones. La comprobación de pendiente y todas las escrituras ocurren en un batch atómico. Así, la política de último guardado no permite editar un pago confirmado ni duplicar el gasto. No es un historial de correcciones de gastos.

El resumen se lee en un solo batch transaccional: los movimientos y el estado de los vencimientos pertenecen a la misma captura. Las lecturas independientes podían mezclar información de antes y después de un pago concurrente.

## Monedas y conversiones: decisiones aprobadas el 17/11/2026

- El catálogo tiene diez monedas: ARS, USD, EUR, BRL, CLP, UYU, GBP, CAD, AUD y CHF. Se sustituyeron JPY y CNY por CLP y UYU para priorizar la región. No se presenta como un ranking.
- ARS y USD se crean al comenzar. Agregar otra moneda crea una cuenta general propia, con saldo inicial opcional y cero por defecto. El selector oculta las ya agregadas.
- Comprar o vender moneda registra un cambio realizado por la persona y también permite calcularlo. Un movimiento `exchange` contiene los dos importes y cuentas; se amplió Movimientos en lugar de crear otra tabla de operaciones.
- Ambos saldos se modifican juntos a partir de ese registro. El cambio no se cuenta como ingreso ni gasto. Los importes confirmados son la evidencia; la tasa sólo calcula una sugerencia editable.
- Se muestran dólar oficial, MEP y blue, euro, real y referencias regionales disponibles del mismo feed. DolarApi fue aprobado como fuente informativa, con consultas desde el servidor, copia local, atribución y revisión cada tres horas.
- La persona elige una referencia o ingresa una tasa manual. Al comprar se usa venta de la fuente; al vender, compra. Para otra fecha se ingresa la tasa usada manualmente. No se presupone que el precio actual sea histórico.
- Se eligió redondeo a la unidad mínima más cercana, con empates hacia arriba. CLP usa pesos enteros; las otras nueve monedas usan centavos según ISO 4217.
- Se conservan las versiones de las referencias usadas. Una actualización de cotizaciones nunca recalcula un movimiento anterior.
- Se aprobó dejar sin importe los futuros vencimientos heredados anteriores. La migración 0003 usa el corte de diciembre de 2026: conserva noviembre y los meses anteriores, los ajustes manuales, los pagos únicos y todos los gastos registrados. También deja vacía la sugerencia de las reglas recurrentes existentes.

Los nombres TypeScript pasan de `amountCents`/`openingCents` a `amountMinor`/`openingMinor`. Los nombres SQL históricos `amount_cents` y `opening_cents` se conservan para reducir cambios de migración; representan unidades mínimas de la moneda indicada. Los enteros existentes de ARS/USD se copian sin reinterpretarlos.

Las tasas son texto decimal exacto, con hasta ocho decimales, y las operaciones usan `BigInt`. El servidor lee los tokens decimales originales con el contexto de `JSON.parse`; si el runtime no lo soportara, rechazaría esa actualización en lugar de usar un valor redondeado. La compatibilidad se verificó en Node y workerd local. No se agregó una dependencia de cálculo decimal.

## Ajuste solicitado de hover y logo

El usuario pidió reemplazar el hover negro por gris claro que se note. Se aplica `#d4d8dd` con texto oscuro en botones y navegación, mediante variables compartidas. También pidió ver el logo que había enviado: las tres barras y la flecha naranja pasan a ser el símbolo de Flujario, en lugar del asterisco provisional. Se usa SVG para evitar pixelado al cambiar de tamaño y se actualiza el favicon.

## Portada: movimiento y nitidez

El usuario pidió tomar Clara Global como referencia para la aparición de textos al bajar. Se incorpora una entrada suave por bloque al entrar en pantalla, respetando la reducción de movimiento y dejando el contenido accesible sin JavaScript.

Ante la pérdida de calidad de las capturas JPEG, se consultaron dos alternativas: PNG de mayor resolución o vistas HTML hechas con las piezas del panel. El usuario eligió HTML. La portada presenta ejemplos nítidos y adaptables, con datos ficticios identificados y controles inertes. Se comparten componentes visuales con el panel; la portada no obtiene datos personales ni ejecuta operaciones privadas. Las referencias de DolarApi siguen capturadas con fecha y atribución.

## Nuevo Resumen y modo oscuro

- Se aprobaron saldos ARS y USD reales por separado, con tres vistas: Pesos, Dólares y Ambos. Este selector sólo cambia los saldos; Pagos y Últimos movimientos conservan todas las monedas e identifican cada importe.
- El radar muestra cinco empresas. Prioriza las favoritas, ordenadas por símbolo, y completa los lugares faltantes con la selección inicial del catálogo. Se distinguen las favoritas de los ejemplos iniciales; no se afirma un ranking. Sin proveedor acordado, precios y variación de acciones siguen sin cotización. La carga de inversiones y sus ganancias/pérdidas diarias queda para el futuro.
- Noticias muestra hasta cinco artículos, uno por vez, con edición diaria o semanal, flechas, contador y reproducción opcional. Comienza pausado, permite detenerse y pausa por foco, puntero o pestaña oculta. La reducción de movimiento desactiva la reproducción. Sin artículos publicados no se simula una edición ni se activa un proveedor.
- La franja de divisas tiene USD, EUR, BRL, CLP y UYU, con selector Oficial/MEP/Blue para USD. Identifica venta en ARS por unidad.
- Se aprobó comparar con la última referencia guardada de una fecha argentina anterior, con fecha de comparación explícita. No equivale a cierre oficial ni necesariamente a ayer. Si no hay historia compatible se muestra «Sin comparación». Las diferencias y porcentajes se calculan con `BigInt`, sin modificar registros anteriores.
- El tema Claro/Oscuro/Sistema abarca toda la web y se conserva en este navegador. No se sincroniza en D1. Se toman durazno/sienna para claro y cobre para oscuro de las imágenes entregadas; se conservan verde para ingresos y naranja para egresos.

El Resumen reutiliza la ruta privada de cotizaciones para actualizar su franja después de cargar los saldos. Esa ruta sigue comprobando sesión y respeta el caché compartido de tres horas. Las referencias actuales y previas se leen juntas; los datos financieros personales continúan en su captura transaccional y filtrados por dueño. No se hicieron migraciones de esquema ni se activaron fuentes nuevas.

## Reemplazo de logo solicitado el 17/11/2026

El logo completo enviado por el usuario reemplaza las barras con flecha naranja. Se conservan el emblema circular y la palabra Flujario con su punto dorado sobre la j. Por indicación expresa, las partes blancas pasan a negro en modo claro; en oscuro quedan blancas. El dorado permanece en los dos temas. Se aplica a toda la marca compartida y a las vistas HTML de la portada. El favicon usa el emblema simplificado, sin la palabra, para que se reconozca en la pestaña.

## Requisitos confirmados de Noticias — 18/11/2026

- En Noticias se muestran hasta cinco noticias económicas de cada diario. Si un medio aporta menos, se muestran las disponibles; no se completa con otras temáticas.
- Resumen conserva un selector entre noticias del día y de la semana. Cada artículo debe enlazar a la noticia original del medio; el título y una acción explícita permiten abrirla.
- La selección inicial de Resumen es una noticia por medio habilitado con contenido disponible. El usuario quiere personalizarla seleccionando artículos favoritos desde Noticias.
- El usuario consulta cómo actualizar automáticamente y cómo establecer relevancia. Ante la falta de un criterio fiable, considera permitir todas las noticias económicas, al menos las diarias. El acceso a todas y su relación con las cinco visibles todavía se deben acordar; no se registró como aprobado un límite nuevo ni un botón de ampliación.

La consulta automática de RSS cada treinta minutos sigue siendo una propuesta de integración. Las ediciones fijas ya acordadas son diaria a las 10:00 de Argentina y semanal los lunes a esa hora. Falta resolver si se conservan esas ediciones o se sustituyen por vistas de noticias del día/semana actualizadas durante la jornada. Los RSS todavía no están conectados al módulo y no se modificaron los cron durante esta definición.

## Implementación acordada de Noticias y corrección de favoritos — 18/11/2026

El usuario aprobó avanzar y aclaró el alcance durante la implementación. Esta sección reemplaza las propuestas anteriores que difieran:

- Noticias muestra hasta cinco entradas económicas por diario; «Ver todas» abre el medio con paginación. Nunca se completa con otro rubro. Se conserva el orden cronológico y no se afirma un ranking de relevancia.
- Hoy se filtra por fecha argentina de publicación. Las fuentes habilitadas se consultan automáticamente cada treinta minutos. El listado abierto puede releer la copia local; ningún visitante dispara una consulta RSS.
- La semanal es una selección fija, publicada los lunes a las 10:00 de Argentina, con artículos de los siete días anteriores a ese corte. No se modifica durante la semana. Esta corrección del usuario sustituye la propuesta de una ventana semanal móvil.
- **Un diario favorito personaliza Resumen.** Se priorizan los medios elegidos, con una noticia por medio, y se completa con otros disponibles hasta cinco. Los titulares enlazan al artículo original en una pestaña nueva.
- **Una noticia guardada se consulta en Guardadas.** No altera la selección de Resumen. Diario favorito y artículo guardado se guardan como preferencias diferentes, siempre vinculadas al usuario verificado.
- La retención es de **15 días desde la publicación**, incluidas las noticias guardadas. Se eliminan sus referencias guardadas y semanales al limpiar el artículo. Las preferencias de diarios permanecen. Esto sustituye la propuesta de 30 días y de preservar artículos guardados.
- La disponibilidad técnica no habilita la publicación. Las cinco fuentes verificadas y MDZ quedan pendientes hasta documentar un permiso aplicable. MDZ mantiene su RSS histórico con 404 como referencia pendiente; no se realiza scraping.

La implementación agrega artículos, guardados, preferencias de medios, estado de sincronización y pertenencia semanal mediante migraciones aditivas. Las ediciones JSON anteriores se conservan como historial, sin alimentar las pantallas nuevas. Se usa `fast-xml-parser` en el servidor para validar RSS/Atom; se rechazan DTD, entidades declaradas, URLs no HTTPS o ajenas al medio, fechas inválidas/futuras y respuestas excesivas. Cada fuente tiene su lease y su próximo intento en D1. Un token impide escrituras de ejecuciones que perdieron el lease.

## Lectura de noticias reales en desarrollo — 18/11/2026

El usuario pidió que aparezcan noticias reales ahora. Se corrige el bloqueo general anterior para el entorno local: las cinco fuentes acordadas se habilitan como lector RSS de titulares, con medio, fecha y enlace al original; no se guardan bajadas, cuerpos completos ni imágenes del diario. No se declara un permiso inexistente de publicación pública. MDZ continúa pendiente por la falta de un RSS funcional.

La vista previa local lee exclusivamente el caché compartido de noticias, sin un dueño ni preferencias reales. Los datos financieros de esa vista siguen siendo ficticios. La sesión y propiedad se siguen comprobando en todos los loaders/actions privados.

Cloudflare no ejecuta automáticamente cron en desarrollo. Un plugin de Vite invoca el mismo scheduled del Worker al iniciar y cada treinta minutos mientras `npm run dev` esté abierto. Reutiliza el lease, filtros económicos, deduplicación, límites de descarga y retención existentes. La configuración de producción mantiene el control de uso por fuente; un permiso aplicable puede estar en condiciones públicas, sin exigir siempre una autorización individual. No se desplegó ni se crearon recursos remotos.

## Imágenes de noticias en el lector local — 18/11/2026

El usuario eligió mostrar las imágenes incluidas en los RSS y conservar la ilustración actual cuando no haya foto. También se conserva ante un error de carga, incluido un fallo anterior a la hidratación de React. Una URL nueva puede volver a intentarse sin mantener el error de la anterior.

Se verificaron las URLs de imágenes de iProfesional, Página/12 e Infobae y se habilitaron sólo sus hosts HTTPS exactos. D1 guarda las URLs; el navegador carga la foto directamente con `no-referrer`. No se descargan fotografías al servidor ni se buscan imágenes mediante scraping. El Economista y Bloomberg no aportaron imágenes en los RSS revisados, por lo que conservan la ilustración. Las fotos se habilitan en el lector local; las autorizaciones de publicación pública no se dan por aprobadas.

La inspección detectó que Infobae incluía un `<!DOCTYPE html>` literal dentro de CDATA. Se corrigió el falso rechazo distinguiendo texto literal de marcado, manteniendo el rechazo de DTD y declaraciones de entidades reales. Se agregaron regresiones de comentarios e instrucciones que intenten ocultar una declaración real. No se cambia el modelo de datos ni la autorización de las rutas.

## Mercados: decisiones definitivas del usuario — 19/11/2026

El pedido adjunto reemplaza el catálogo inicial de veinte acciones y la entrada manual por dos índices: S&P 100 y Nasdaq-100. Se muestran todas sus pertenencias verificadas y fechadas, búsqueda por nombre/símbolo y orden alfabético. El cambio de índice es inmediato, mantiene filtros y favoritas y guarda el último índice en D1 por usuario. No se usa un Top 100 mundial ni se presupone exactamente cien símbolos.

El usuario aprobó expresamente cinco tablas normalizadas: `stock_companies`, `stock_indices`, `stock_index_members`, `stock_favorites` y `user_market_preferences`. La identidad corresponde al instrumento: AAPL se comparte entre índices; GOOG y GOOGL conservan identidades distintas por clase. Las claves compuestas evitan duplicar pertenencias y favoritas. Las claves foráneas impiden apuntar a instrumentos o índices inexistentes. El catálogo de referencia tiene 101 instrumentos en cada índice, 167 únicos y 35 compartidos; las fuentes y fechas están en `PROVEEDORES.md`.

El máximo aprobado es **cinco favoritas globales**, con el mensaje exacto «Solo podés guardar 5 acciones. Quitá una para agregar otra». Se controla mediante un trigger `BEFORE INSERT` de SQLite/D1 dentro de la escritura, no mediante un conteo previo en JavaScript: dos solicitudes pueden leer el mismo conteo antes de escribir. Los reintentos del mismo instrumento son idempotentes incluso con cinco guardadas. La identidad de una favorita no se puede cambiar mediante UPDATE; quitar/agregar pasa por las mismas restricciones. Los tests incluyen veinte altas concurrentes y aislamiento entre dueños.

La migración aditiva `0006_stock_markets.sql` copia las favoritas antiguas y conserva su tabla original como archivo. Los símbolos anteriores fuera del catálogo se conservan sin atribuirles una bolsa o gráfico no verificado. No se permite agregar nuevos instrumentos fuera de los índices. Si una base anterior tuviera más de cinco favoritas por dueño, el trigger abortaría la migración completa para revisión, sin recortar silenciosamente la lista. La base local tenía como máximo una; se respaldó antes de aplicar y se verificó que las diez tablas anteriores conservaran exactamente sus filas e importes.

El panel «Mis favoritas» es global y carga **un solo widget oficial de TradingView**. Elegir otra favorita o tema desmonta el anterior. Se usan sus controles nativos de período, con atribución y enlace externo. No se extraen precios del widget. Las columnas personalizadas de precio y variación quedan explícitamente sin datos y sin orden por rendimiento hasta elegir una API con permisos apropiados. No se inventan datos ni se activa otro proveedor.

Cada loader y action de Mercados comprueba Clerk por separado y usa exclusivamente el dueño verificado; el formulario no decide el userId. Las escrituras comprueban origen, tamaño y esquema; las respuestas privadas no se cachean. La action financiera anterior delega al mismo repositorio para no dejar un camino alternativo que eluda el máximo. Cambiar de índice o favoritas no modifica cuentas ni movimientos.

La vista previa DEV usa el mismo catálogo público fechado; sus estrellas son sólo estado de ejemplo en esa pantalla y el índice se conserva en la URL, sin acceder a preferencias reales. La persistencia D1 corresponde al espacio autenticado. La vista previa sigue devolviendo 404 en producción. Se mantiene Claro/Oscuro/Sistema y la paleta Obsidiana & Champagne solicitada para este módulo.

## Noticias: menos filtros e imágenes en Resumen — 19/11/2026

El usuario pidió quitar el selector de temas porque todo el módulo ya muestra noticias económicas. Se conservan período, búsqueda por título, diario y Guardadas. Los enlaces antiguos con `categoria` se interpretan sin ese filtro y las interacciones lo limpian de la URL, para evitar una restricción invisible. La categoría continúa como metadato del artículo y del clasificador RSS; no se amplía la selección a otros rubros.

Resumen muestra la imagen RSS del artículo seleccionado tanto en Del día como en De la semana. La imagen enlaza al original y reutiliza la misma pieza `NewsArtwork` de Noticias: proporción 2:1, carga diferida, `no-referrer` e ilustración de Flujario cuando falta o falla la foto, incluso antes de la hidratación. El carrusel recibe el artículo completo en lugar de convertirlo al formato editorial antiguo que descartaba la imagen. Se mantienen flechas, contador y reproducción opcional pausada inicialmente. No se agregan fuentes, permisos, consultas RSS ni tablas; se conserva el control de imágenes por medio y entorno en el servidor.

## Ranking de Mercados: tamaño de la empresa — 19/11/2026

El usuario eligió ordenar por capitalización bursátil de mayor a menor, frente a peso en el índice o rendimiento. El número expresa posición por tamaño dentro del índice seleccionado; no una calificación de inversión. El catálogo actual no contiene capitalizaciones: no se puede deducir ese orden del precio por acción, de la lista alfabética ni del peso de un ETF replicador.

La fuente y la frecuencia todavía requieren acuerdo. No se habilitó un proveedor nuevo ni se atribuyó un puesto a instrumentos sin datos. Debe conservarse fuente y fecha de referencia y resolverse de forma coherente el tratamiento de compañías con varias clases, sin sumar dos veces una capitalización que el proveedor ya informa a nivel compañía. Las 101 filas actuales no se recortan a cien para simular un ranking completo.

La viabilidad técnica y los puntos pendientes están en `MERCADOS-RANKING.md`. Esta decisión aprueba el criterio de orden, no una suscripción, licencia o cambio de esquema específico.

## Importación de resúmenes: alcance confirmado — 20/11/2026

El usuario quiere importar movimientos desde PDF, CSV y Excel, revisar fechas, importes, tipo de movimiento y categorías antes de confirmar, obtener un balance por período y disponer de una opción para crear gráficos. Se prioriza usar herramientas gratuitas. Estas son decisiones de alcance; el módulo todavía no está implementado.

- Entidades iniciales solicitadas: Banco Nación, Banco Credicoop, Santander (Río), BBVA (Francés), Galicia, Macro, Patagonia y Mercado Pago. Se incluyen resúmenes de movimientos/gastos y se considera incluir resúmenes de tarjetas de crédito. La compatibilidad de cada diseño de archivo debe comprobarse con muestras antes de anunciar un adaptador como operativo.
- Los originales se leen en el navegador y no se suben ni guardan en el servidor. Se enviarán únicamente los movimientos que la persona confirme; el servidor deberá volver a validarlos y comprobar propiedad. No se incorpora almacenamiento R2 para originales.
- Se mantiene una cuenta general por moneda. El usuario rechazó distinguir cuentas bancarias/billeteras con sus propios saldos. El banco de origen podrá identificarse como procedencia del archivo/movimiento, pero no representa una nueva cuenta financiera. El resumen de un banco no acredita por sí solo el saldo global de esa moneda.

Siguen pendientes la regla para consumos/pagos de tarjeta, la fecha de corte y tratamiento de historia anterior al saldo inicial, el alcance del OCR y el modelo de persistencia de lotes/correcciones. No se eligieron silenciosamente ni se modificaron las reglas de saldo. Se mantendrá la distinción entre movimientos reales, obligaciones, cambios de moneda y transferencias propias.

## Importación: tarjetas como desglose, coincidencias y OCR — 20/11/2026

El usuario precisó el funcionamiento de tarjetas: el resumen de cuenta contiene el pago y ese es el único egreso de dinero. Sobre ese pago debe existir «Evaluar resumen de tarjeta de crédito», para revisar el detalle y distribuir el mismo importe entre categorías. Su ejemplo es un pago de 100 con 30 de ropa, 40 de comida y 30 de impuestos. Los consumos no crean otros egresos ni vuelven a descontar el saldo. El desglose reemplaza la categoría general en el análisis de ese pago, sin sumar el padre y sus partes. No se aprobó modelar deuda, financiación o calcular intereses de tarjetas.

Pidió tratar el historial anterior y avisar cuando haya dos pagos o ingresos iguales en la misma fecha, para revisarlos y modificarlos. La interpretación de trabajo conserva ese historial para análisis sin volver a afectar el saldo inicial; falta acordar la fecha de corte que lo delimita, porque las cuentas actuales no guardan una fecha del saldo inicial. Las coincidencias por fecha, moneda, importe y sentido se presentan como posibles duplicados, sin borrar automáticamente compras legítimas iguales. La edición del borrador es parte de la revisión; no se amplía por este pedido la edición de movimientos confirmados. Los reintentos de un mismo envío deben seguir siendo idempotentes.

El usuario quiere leer escaneados si existe una solución gratuita y admite comenzar por PDF con texto si el OCR resulta demasiado complejo. Existe una vía local con PDF.js para renderizar y Tesseract.js para OCR; su incorporación se plantea como lectura asistida sujeta a pruebas, con revisión obligatoria, sin API paga y sin enviar originales. Esto no acredita compatibilidad automática con todos los diseños bancarios ni precisión de lectura no medida.

Se deben acordar antes de migrar: el modelo de lotes y desgloses, el tratamiento de un pago cuyo importe no coincide con el detalle del resumen, y la fecha de corte para los históricos. No se modificaron todavía las tablas financieras ni los cálculos de saldos.

## Importación: modelo y límites financieros aprobados — 20/11/2026

El usuario aprobó tablas relacionadas para los lotes y los desgloses, con validación del total. Cada pago sigue siendo un único movimiento. Un desglose cuyo total no coincide con el pago se conserva pendiente de revisión; no modifica el egreso, no se escala proporcionalmente y no sustituye su categoría en los gráficos hasta coincidir exactamente en la misma moneda.

También aprobó guardar por moneda la fecha a la que corresponde el saldo inicial. Se interpreta como **inicio de ese día**: los movimientos anteriores importados se conservan para análisis; desde esa fecha pueden afectar el saldo una vez revisados. La interfaz explicará esta frontera. Las cuentas existentes conservan importes y movimientos y comienzan sin una fecha inferida; se debe confirmar una fecha compatible con su historial antes de importar. No se reinterpreta ni se borra dinero histórico durante la migración.

Las importaciones confirmadas son lotes inmutables con sus filas y claves de reintento. Cada nueva evaluación de tarjeta es una revisión que conserva el detalle anterior; una referencia activa selecciona cuál se utiliza. Repetir un envío viejo no reactiva esa revisión sobre una posterior. Los posibles duplicados requieren una decisión explícita en la revisión, manteniendo la idempotencia de los reintentos.

La implementación mantendrá Movimientos como entrada al importador y al análisis, sin otra cuenta por banco. Los gráficos agrupan importes confirmados exactos y excluyen el doble conteo del padre y sus partes. Se agregan Ropa e Impuestos al catálogo de categorías para cubrir el ejemplo del usuario; Comida usa Alimentación. La lectura genérica asistida no se anuncia como una plantilla bancaria verificada sin muestras que lo comprueben.
<!-- Esta sección y la implementación posterior sustituyen los pendientes históricos anteriores. -->

## Estado del importador local — 20/11/2026

Se implementaron el lector asistido, la revisión, el endpoint privado y el análisis con gráficos optativos. Las migraciones 0007 y 0008 se aplicaron sólo a D1 local, tras una copia consistente, sin cambiar importes ni filas anteriores. Las decisiones anteriores de esta sección ya no están pendientes.

Se usan lectores gratuitos y recursos OCR/PDF alojados con la app; los originales y contraseñas no se envían. Los límites iniciales son 10 MB, 30 páginas PDF, 2.000 filas y 500 por confirmación. Los cálculos del análisis usan enteros; las proporciones visuales de las barras se derivan de esos enteros. Las tablas conservan tanto revisiones de tarjetas como el puntero a la revisión activa.

Las muestras sintéticas y D1 aislada pasaron las pruebas. Sigue pendiente validar plantillas reales por entidad y revisar la interfaz en navegador: Computer Use interrumpió esa revisión al no poder determinar la URL. No se declara compatibilidad bancaria universal ni exactitud garantizada del OCR.

## Solicitud de inversiones y recuperación de divisas — 20/11/2026

El usuario pidió agregar inversiones con fecha e importe, consultar ganancias/pérdidas actuales o a una fecha elegida, completar los precios y variaciones de las acciones del catálogo y volver a mostrar las divisas del día en Resumen. Esto reemplaza la postergación del módulo de inversiones, pero todavía requiere acordar instrumentos admitidos, datos de la compra, efecto sobre el saldo y fuente/licencia de precios. Se consultaron esas decisiones; no se eligieron por el usuario ni se agregaron tablas o un proveedor bursátil.

La corrección independiente de divisas conserva DolarApi y el caché compartido de tres horas. `redirect: "error"` impedía toda consulta en workerd porque no está implementado allí. Se reemplaza por `manual` y se rechaza cualquier respuesta no exitosa, incluidas redirecciones, manteniendo la restricción original sin seguir URLs ajenas.

Resumen y Cotizaciones de la vista previa DEV ahora leen las referencias públicas de D1 y pueden revisarlas al vencer el caché. Esto sustituye la captura fija en esas dos pantallas, atendiendo al pedido de datos actuales. La portada conserva su ilustración fechada. La ruta de vista previa sigue devolviendo 404 en producción; el endpoint privado conserva Clerk. No se leen cuentas reales desde la vista previa ni se cambian saldos. Si falla la fuente, se conserva la copia fechada o se indica ausencia; no se rellena con la captura de la portada ni se inventa una variación cuando falta historia.

## Referencia concreta para la tabla de Mercados — 24/11/2026

El usuario entregó una imagen de una tabla de Rava Mercado para aclarar que Mercados debe mostrar el precio y cuánto subió o bajó cada acción. La referencia presenta símbolo, nombre, último precio y variaciones porcentuales diaria, mensual y anual en filas comparables. Se toma como referencia de presentación; no constituye aprobación de Rava como fuente ni reemplaza los índices actuales por el Merval. Los volúmenes, rango de 52 semanas y minigráficos de esa imagen no se incorporan automáticamente por esta aclaración.

El código actual ya contiene columnas de precio y variación diaria/mensual/anual, pero muestra ausencia de datos porque no hay un proveedor bursátil conectado. El trabajo pendiente es obtener datos verificables, no rellenar esas columnas con precios ilustrativos. El listado debe servir para todas las acciones del catálogo, independientemente de la cartera personal.

Se consultan dos definiciones para concretar la referencia: actualización durante la rueda con demora informada frente a cierre diario, y acumulado desde el comienzo del mes/año frente a ventanas móviles de 30 días/12 meses. No se registran como aprobadas sin respuesta. La fuente/licencia y el presupuesto consultados anteriormente siguen pendientes; todavía no se activó otro proveedor ni se alteraron preferencias, saldos o tablas.

## Mercados: cierres, ventanas móviles y coste cero — 24/11/2026

El usuario respondió: precios de cierre, últimos 30 días y 12 meses, y una solución gratuita. Estas definiciones sustituyen los períodos genéricos «mensual» y «anual» de la tabla: se muestran «Último cierre», «Diaria (%)», «30 días (%)» y «12 meses (%)». No se sustituye 30 días por el mes en curso ni 12 meses por el año calendario. La variación diaria compara cierres de ruedas consecutivas.

Se verificó Massive Stocks Basic como opción técnicamente compatible con coste cero para uso personal: incluye dos años de historia y el endpoint Daily Market Summary con cierres de las acciones estadounidenses por fecha, a cinco solicitudes por minuto. Su licencia individual no autoriza exhibir los datos a otros usuarios. Se consultó si se priorizan widgets oficiales gratuitos publicables con sus controles/períodos, o una API personal/local con publicación pendiente. La fuente no está aprobada todavía; no se creó una cuenta, clave ni migración ni se contrataron servicios. No se afirma que un widget reproduzca exactamente los períodos y cierres solicitados sin verificarlo.

## TradingView gratuito y límite de inversiones — 24/11/2026

El usuario eligió los widgets oficiales gratuitos frente a una API de uso personal. Después de explicar la ejecución de código externo en la página, eligió expresamente el componente nuevo Market Data con tabla de rendimiento 1M y 1Y frente al iframe clásico aislado. El componente se integra con la misma confianza en TradingView que el gráfico existente; no se afirma que esté aislado del documento. La configuración propia incluye exclusivamente símbolos públicos, vista y tema, nunca saldos, movimientos ni claves.

Esta decisión sustituye los guiones de la tabla y adapta el pedido anterior de cierres/30 días/12 meses a los períodos y actualizaciones del widget: Precio, Hoy, 1W, 1M, 6M y 1Y. No se identifica 1M con 30 días exactos ni se promete que los valores permanezcan en el cierre durante la rueda. Se conservan cobertura, demoras, atribución y enlaces del proveedor. No se habilita una API bursátil ni se descarga historia ni se guardan precios del widget en D1.

Mercados conserva S&P 100, Nasdaq-100, búsqueda, filtros y cinco favoritas globales. La tabla del proveedor recibe la selección filtrada; el catálogo de Flujario permite elegir favoritas. Resumen muestra sus cinco símbolos con precio y variación diaria mediante Market Summary, completando el radar como ya estaba aprobado. Se utiliza su formato compacto desplazable para conservar esos datos visibles en poco ancho. La composición y el orden alfabético del catálogo no se convierten en un ranking por capitalización.

La consulta sobre ganancia/pérdida con monto y fecha es viable si se cuenta también con el precio de adquisición o cantidad comprada y una valoración actual o de la fecha elegida. Los widgets no entregan una API de precios para calcularlo. Una compra real y una simulación al cierre de una fecha son cosas distintas. Antes de implementar la inversión faltan acordar datos de la compra, fuente o ingreso manual de la valoración, comisiones/dividendos y efecto sobre el saldo. No se crearon tablas, movimientos ni resultados estimados por este pedido.

## Flujario AI: backend autorizado y acceso reconocible — 24/11/2026

El usuario autorizó expresamente crear el backend desde cero en esta copia con Workers AI, modelo económico en español, cinco intentos por usuario/día, presupuesto estimado de 8.000 Neurons globales y 400 tokens de salida, configurables. Esto resuelve los pendientes del documento anterior. No se contratan servicios ni se despliega. Se eligió Granite 4.0 H Micro tras revisar la ficha vigente de Cloudflare y los idiomas de IBM; modelo y tarifas permitidos quedan juntos para evitar cambios sin presupuestar.

La IA interpreta un contrato cerrado; TypeScript y SQL parametrizado autorizan y calculan. Reutiliza movimientos, históricos y desgloses existentes, con enteros y monedas separadas. Sin herramientas de escritura, asesoramiento ni SQL generado. Las cinco sugerencias se resuelven sin IA. El prompt lleva preguntas acotadas y fecha, sin consultar ni enviar documentos o registros financieros al proveedor; el texto que escriba el usuario puede contener información sensible.

Se agregan cuatro tablas de consumo/reintentos y triggers para reservar antes de llamar, evitando carreras. Una llamada por pregunta, sin reintentos automáticos; reserva variable conservadora retenida ante fallos y recibos observados cuando existen. Día individual argentino y global UTC, con doble reserva cerca del cambio UTC. El endpoint verifica sesión y dueño de forma independiente en loader/action. La migración 0009 se aplicó sólo localmente después del respaldo y la auditoría de trece tablas sin cambios.

La conversación vive en React, separada por dueño, y se conserva al cerrar, minimizar y navegar; recargar la borra. El avatar adjunto se editó con Imagegen para quitar el fondo, preservando personaje y colores, y se optimizó a WebP transparente. El pedido posterior exige que se note que abre un chat: etiqueta permanente «Flujario AI / Abrir chat» e ícono de conversación junto a la mascota, en un único botón. Esta señal reemplaza el tooltip como único acceso; no requiere hover ni crea otra sección.

Quedan pendientes configuración/prueba de inferencia real en la cuenta Cloudflare y despliegue remoto. No se anuncian cuotas futuras sin calendario estructurado, un comercio identificado a partir de nombres ni precisión medida del modelo. Configuración, pruebas y comandos: `FLUJARIO-AI.md`.

## Mercados: búsqueda directa de favoritas — 24/11/2026

El usuario pidió un buscador para elegir favoritas. El filtro general ya existía, pero sus estrellas quedaban después de la tabla de TradingView. Se agrega una búsqueda visible dentro de Mis favoritas, antes del gráfico, con resultados y estrella directa. Reutiliza búsqueda por nombre/símbolo, catálogo del índice seleccionado, máximo de cinco globales y la misma operación protegida existente. No modifica la búsqueda/filtros de la tabla de precios ni necesita recargar el widget por cada carácter escrito. Se muestran hasta seis coincidencias y se indica cuando hay más, para precisar el texto. El índice consultado y el estado sin resultados son explícitos.

El usuario preguntó si cambia la lista cuando cambian los primeros cien. Se comprobó que la composición actual se revisa manualmente y se siembra mediante migración; TradingView no sincroniza las pertenencias de Flujario. La interfaz explica esta diferencia junto a la fecha de composición. Son S&P 100 y Nasdaq-100, no un ranking mundial de capitalización. Se consultó si el siguiente bloque debe automatizar esos índices o investigar ese ranking; no se activó una fuente ni una tarea de sincronización sin elegirla y revisar gratuidad/permisos. No se agregaron tablas ni se modificaron favoritas reales.

## Catálogo automático y portada vigente — 24/11/2026

El usuario aprobó Wikipedia por API cada quince días y pidió actualizar funciones e imágenes antes del login. Tras revisar las alternativas eligió **reutilizar la fecha existente sin tabla de control nueva**. Se comprueba diariamente, se actualiza al cumplir quince días calendario, se conserva la última lista válida ante fallos y se reintenta al día siguiente. No se modifican favoritas personales ni se añade un ranking de capitalización.

La fecha `verified_at` pasa a significar consulta exitosa de la fuente comunitaria; `composition_date` guarda la edición de esa fuente, sin atribuirle la fecha efectiva del índice. `source_url` conserva su revisión permanente y se muestra atribución/licencia. Un guardado condicionado a fecha y URL anteriores dentro de batch D1 impide que una descarga que perdió su versión pise la ganadora. No existe lease ni historial adicional de intentos; se acepta repetir descargas concurrentes. Los límites del parser y de cambios inesperados conservan el catálogo anterior en vez de completar datos por suposición.

Las referencias de bolsa anteriores se conservan. Un integrante nuevo sin bolsa verificada aparece en el catálogo, pero no recibe un gráfico/precio inferido; la cobertura faltante se informa. Las favoritas que dejan ambos índices permanecen y se identifican. La vista previa DEV lee el catálogo público D1 sin datos de dueños; el radar recibe ese mismo catálogo vigente.

La portada mantiene la composición editorial y las vistas HTML nítidas aprobadas. Se añaden ejemplos inertes de importación, búsqueda de favoritas, estadísticas de Flujario AI y Noticias, además de actualizar pagos, disponibilidad y preguntas frecuentes. No consulta backend privado ni proveedores desde esas ilustraciones, ni muestra datos personales o noticias/precios inventados como reales. Se aclaran las fuentes habilitadas y el cupo/habilitación de texto libre. Detalles y verificaciones en `CATALOGO-AUTOMATICO.md`.

## Chat: escritura y lectura ampliada — 24/11/2026

El usuario pidió poder escribir preguntas y ampliar/reducir el chat para leer mejor. El campo deja de bloquearse por estar en vista previa o por no tener IA disponible. Las cinco consultas estadísticas se reconocen también al escribirlas, tolerando puntuación, mayúsculas y tildes; no se presenta ese reconocimiento exacto como interpretación de cualquier pregunta. En la cuenta privada el servidor sigue verificando identidad, origen, cupo y habilitación antes de una inferencia. Sin IA o con cupo agotado devuelve un aviso y mantiene las estadísticas disponibles; el frontend no autoriza el consumo.

La vista previa resuelve las mismas cinco consultas sobre datos ficticios en el navegador. Cualquier otra pregunta explica el límite sin solicitar el endpoint privado ni llamar al modelo. No se habilita Workers AI, cambia su presupuesto ni se añade un proveedor por hacer editable el campo. Esto sustituye la decisión anterior de deshabilitar la escritura al agotar el cupo: se bloquean los envíos simultáneos, no la redacción.

Ampliar/reducir usa un estado de React en la misma instancia del chat, sin navegar, crear conversaciones ni reenviar consultas. Se conservan borrador, moneda y mensajes al cambiar de tamaño, minimizar/cerrar y navegar entre secciones; recargar sigue borrando esa memoria. Ventana ampliada de hasta 860 × 820 px, acotada al espacio visible. Sigue siendo no modal, sin overlay ni encierro de foco. Escape cierra y devuelve el foco al lanzador; los controles tienen nombre accesible. No requiere migraciones, cambios de autorización ni persistencia adicional.

## Ayuda del chat y disponibilidad real — 24/11/2026

La captura del usuario mostró «qué preguntas te puedo hacer» rechazado por falta de IA. Esa ayuda de producto ahora se responde en el cliente, identificada como «Ayuda de Flujario · sin IA», con las cinco consultas disponibles y acceso directo a sus informes. Se reconocen formulaciones de ayuda acotadas, no preguntas financieras arbitrarias. No consulta datos privados ni consume cupo y también funciona en vista previa. Los informes financieros siguen usando el cálculo existente.

Un rechazo definitivo del backend (IA no habilitada, cuota agotada, entrada inválida o fallo ya contabilizado) retira la opción de recuperar ese envío; no hay un resultado pendiente que prometer. Fallos de transporte o respuestas inciertas conservan su clave para la comprobación existente. Sin IA configurada no se muestra una hora de renovación, porque esperar al día siguiente no habilita la conexión. No cambia el presupuesto ni se activa el proveedor por estos ajustes.

El usuario confirmó que ya tiene una cuenta Cloudflare. Se comprobó mediante `wrangler whoami --json`, sin exponer identidad ni credenciales, que Wrangler todavía no tiene sesión. La conexión y una inferencia real siguen pendientes hasta completar la autorización oficial.

## Estadísticas del panel — 25/11/2026

Sección independiente con categoría de mayor y menor gasto, período de mayor gasto y mejores y peores resultados. El resultado es ingresos menos egresos. La vista inicial abarca el mes en curso y los once anteriores, hasta la fecha argentina de la consulta. Hay fechas personalizadas y agrupación por mes, trimestre o año. Cada informe trabaja en una moneda. Los gráficos muestran gastos por categoría, ingresos frente a egresos y evolución del resultado, con importes exactos en una tabla.

El cálculo comparte `statementAnalysis` con el importador. Incluye históricos confirmados, excluye transferencias propias, cambios de moneda y obligaciones impagas, y sólo usa un desglose de tarjeta para categorizar si concilia con el pago. El ranking de menor gasto usa categorías con egreso neto positivo. Los períodos sin registros no compiten y se informan los empates. El servidor verifica al dueño en el loader de Workspace y consulta sus movimientos, históricos y desgloses del rango en una sola lectura de D1. El cálculo no llama a IA ni requiere migraciones.

## Edición de gastos — 26/11/2026

Desde Movimientos se pueden corregir la descripción, la categoría, el importe y la fecha de un gasto manual. Para gastos importados se habilitan descripción y categoría. El resumen bancario conserva sus filas originales y los importes y fechas siguen conciliando con ellas. La moneda identifica el saldo, y el flujo de pagos registrados conserva su regla de edición propia.

Se conserva el identificador del gasto para que el saldo y las estadísticas usen un solo movimiento. Un batch de D1 registra los valores anteriores y nuevos en `expense_edits` y actualiza el gasto en la misma operación. La clave de envío evita que un reintento antiguo vuelva a aplicar una modificación. El servidor verifica dueño, origen, tipo de movimiento y fecha del saldo inicial.
