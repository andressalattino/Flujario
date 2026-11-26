# Flujario

Base local de una web de finanzas personales para Argentina. React Router **8 en modo framework**, TypeScript estricto, Tailwind **4**, componentes shadcn/ui con Radix, Drizzle ORM, Cloudflare Workers + D1 y Clerk.

## Empezar

Requisito: Node.js 24 LTS y npm. Las versiones concretas están fijadas en `package-lock.json`.

```powershell
npm install
npm run db:migrate:local
npm run dev
```

Abrir la URL que imprime Vite, normalmente `http://127.0.0.1:5173`.

- `/`: portada pública con vistas HTML nítidas del producto y aparición de bloques al bajar; saldos ficticios y referencias de divisas capturadas con fecha.
- `/app`: panel privado. Necesita configurar Clerk.
- `/app/cotizaciones`: referencias de dólar, euro y monedas de la región; fuente y fecha visibles.
- `/vista-previa/resumen`: vista **sólo de desarrollo** para revisar las pantallas sin claves. Los formularios no guardan. En producción devuelve 404.
- `/iniciar-sesion` y `/crear-cuenta`: autenticación con Clerk cuando se configura.

La vista previa no es una sesión ficticia ni habilita el backend privado. No hay un usuario por defecto. La base real comienza vacía.

## Configurar Clerk

`.env.example` es una plantilla versionable con nombres de variables y sin claves reales. `.env` es la configuración local que Vite carga y que Git ignora. Mantener ambos permite explicar el entorno necesario sin compartir credenciales. En Cloudflare, los secretos locales del Worker van en `.dev.vars`; tampoco se versiona. Ambos archivos terminados en `.example` se conservan como plantillas vacías.

1. Crear una aplicación en [Clerk](https://dashboard.clerk.com/).
2. Copiar `.env.example` a `.env` y completar `VITE_CLERK_PUBLISHABLE_KEY`.
3. Copiar `.dev.vars.example` a `.dev.vars` y completar `CLERK_SECRET_KEY`.
4. Reiniciar `npm run dev`.

También es válido guardar los secretos locales del Worker en `.env`: el plugin de Cloudflare lo admite, y el build de este entorno detectó esa configuración. Si existe `.dev.vars`, sus valores tienen prioridad y el Worker no toma los secretos de `.env`. Las instrucciones anteriores muestran la separación entre clave pública en `.env` y clave privada en `.dev.vars`; conviene elegir una sola fuente para cada secreto. Ver [la documentación de Cloudflare](https://developers.cloudflare.com/workers/vite-plugin/reference/cloudflare-environments/#secrets-in-local-development).

La clave `VITE_` es pública y se incorpora al build. La clave secreta se lee exclusivamente en el servidor. Ambos archivos locales están ignorados por Git. **No compartir claves secretas en el chat ni subirlas al repositorio.**

Sin claves, la portada funciona y las rutas privadas rechazan el acceso. La prueba real de registro, cierre de sesión y recuperación de contraseña queda pendiente hasta tener una instancia de Clerk configurada.

## Configurar D1 en Cloudflare

La base local tiene migraciones SQL versionadas en `drizzle/`. No necesita cuenta de Cloudflare.

Para un despliegue futuro:

```powershell
npx wrangler login
npx wrangler d1 create flujario-db
```

Reemplazar el `database_id` de ceros de `wrangler.jsonc` por el ID que devuelve Cloudflare. El ID de ceros es **sólo un marcador para desarrollo**, no identifica una base remota.

```powershell
npx wrangler secret put CLERK_SECRET_KEY
npm run db:migrate:remote
npm run deploy
```

`VITE_CLERK_PUBLISHABLE_KEY` debe estar disponible al compilar. Configurar también los dominios de producción en Clerk. No se ha creado una base remota ni publicado un sitio durante este trabajo.

## Qué hace esta base

| Sección      | Implementado                                                                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Portada      | Explica las funciones, las diferencias, el estado de los proveedores y muestra vistas HTML del producto                                                    |
| Resumen      | Saldos ARS/USD con vistas Pesos/Dólares/Ambos; radar de cinco acciones, noticias en carrusel, cinco divisas, vencimientos y actividad de todas las monedas |
| Movimientos  | Registrar ingresos y gastos, buscar y filtrar por tipo y moneda                                                                                            |
| Pagos        | Crear pagos únicos, mensuales, trimestrales y anuales; filtrar pendientes/pagados; registrar un gasto al confirmar un vencimiento                          |
| Mercados     | S&P 100 y Nasdaq-100 completos, búsqueda, orden por nombre, hasta cinco favoritas privadas y un gráfico oficial de TradingView por vez                     |
| Cotizaciones | Dólar oficial, MEP y blue, euro, real y referencias regionales; fecha y fuente, copia local y tasa editable al registrar un cambio                         |
| Noticias     | Vistas diaria/semanal, estados sin edición y de edición anterior; adaptador editorial validado y Cron Triggers preparados                                  |

**No hay cotizaciones ni noticias inventadas.** Las referencias de divisas usan DolarApi, con copia local y revisión cada tres horas. La tabla bursátil, el radar de Resumen y los gráficos usan widgets oficiales gratuitos de TradingView, con sus períodos, cobertura y demora. No hay una API bursátil para cálculos propios de inversiones. Noticias lee los cinco RSS acordados en desarrollo, con titulares y enlaces reales. Las favoritas pueden guardarse en una cuenta configurada.

## Reglas del dinero

La lista de pagos se muestra por mes, con cinco meses anteriores y cinco siguientes. Los pendientes más viejos siguen accesibles en “Meses anteriores”. Al cerrar un mes, el panel muestra un aviso: “Recordar más tarde” lo oculta hasta la próxima entrada al panel y “No volver a mostrar” silencia sólo los vencimientos de ese aviso. Ninguna de esas preferencias marca un pago como pagado.

- Importes en **unidades mínimas enteras**, con moneda obligatoria: centavos en nueve monedas y pesos enteros en CLP. `1234,56` se convierte en `123456`, sin `parseFloat` ni multiplicaciones decimales.
- Los importes se presentan con dos decimales, salvo CLP, que no tiene decimales. La presentación usa BigInt para conservar centavos en saldos grandes.
- Límite por movimiento y saldo inicial: `1.000.000.000.000` unidades mínimas de su moneda. Los totales se verifican contra el rango entero seguro de JavaScript; un desbordamiento genera error, nunca un resultado redondeado.
- Cada persona comienza con una cuenta ARS y una USD. Puede agregar EUR, BRL, CLP, UYU, GBP, CAD, AUD y CHF. Los saldos se muestran por separado: no se suman monedas distintas.
- El saldo inicial no es un ingreso del mes y se configura una sola vez.
- Se permiten saldos negativos. Los movimientos representan dinero ya recibido o pagado: no admiten fechas futuras.
- Un pago pendiente no toca el saldo. Su estado pagado se deriva del gasto asociado; no existe un segundo booleano de estado que pueda quedar desincronizado.
- Una transferencia no es ingreso ni gasto. Un cambio entre monedas tampoco: un movimiento `exchange` guarda las cuentas de origen/destino y ambos importes reales. Las transferencias de la misma moneda siguen siendo una regla del dominio, sin interfaz para múltiples cuentas de una moneda.
- Los pagos recurrentes conservan el día original. `31/01 → 28/02 → 31/03`; un pago anual del 29 de febrero recupera ese día en el siguiente año bisiesto.
- La regla recurrente y sus vencimientos son entidades separadas. Se materializan vencimientos hasta 12 meses hacia adelante; el trabajo diario extiende el horizonte sin duplicar los existentes. La recurrencia no termina después de 12 meses.
- El monto inicial corresponde a ese vencimiento. Mantenerlo para los siguientes es opcional. Si falta, el pago sigue visible y el formulario Pagar exige el importe real.
- Sólo se editan pendientes. Los cambios a próximos importes conservan los ajustes manuales de cada mes y los pagos registrados. Una edición no modifica el saldo.
- Los montos desconocidos son `NULL`, nunca cero. La proyección aparece incompleta cuando faltan importes, junto con el subtotal conocido.
- En ediciones simultáneas gana el último guardado del servidor. Los reintentos idénticos se reconocen; no vuelven a ejecutar una edición anterior ni duplican gastos.

El helper de distribución exacta de cuotas tiene pruebas, pero **la interfaz de compras en cuotas todavía no está implementada**. No confundir recurrencia con financiación en cuotas.

## Cómo está organizado

```text
app/
  routes/                  Entrada, loaders y actions de cada URL
  components/workspace/    Pantallas del panel, separadas por función
  components/ui/           Componentes shadcn/ui editables
  domain/                  Dinero, fechas, saldos y validación; sin dependencia de React o D1
  db/                      Esquema Drizzle y operaciones del servidor
  lib/                     Autorización, protección de formularios y utilidades
  services/                Adaptadores de noticias, divisas e interpretación IA
  data/                    Catálogos y ejemplo público compartido por portada y revisión local
workers/app.ts             Entrada a Cloudflare y ejecución programada
drizzle/                   Migraciones SQL y metadatos de Drizzle Kit
tests/                     Reglas, SQL, aislamiento, reintentos y noticias
docs/                      Decisiones y explicaciones para aprender
public/images/             Logo, mascota transparente y capturas históricas
```

Leer primero [DECISIONES.md](docs/DECISIONES.md), luego [APRENDER.md](docs/APRENDER.md) y [APRENDER-CON-AGENTES.md](docs/APRENDER-CON-AGENTES.md). Las explicaciones describen el código que existe, incluyendo sus límites.

## Verificar y trabajar

```powershell
npm run typecheck
npm test
npm run build
npm run format:check
```

`npm run check` ejecuta tipos, pruebas y build en ese orden. `npm run db:generate` genera una migración al cambiar el esquema; revisarla antes de aplicarla. No editar una migración que ya fue aplicada: crear otra.

Las pruebas de persistencia ejecutan el SQL real con SQLite mediante un adaptador D1 de pruebas. También se verificó que la migración se aplica con Wrangler a D1 local. No reemplazan la prueba completa del login real ni una prueba de despliegue.

Como verificación adicional, `node qa/verificar-d1.mjs` ejecuta migraciones y operaciones del repositorio contra workerd/D1 temporal con datos ficticios. Usa las herramientas de desarrollo ya instaladas con el lockfile, sin recursos remotos. Es una comprobación separada de `npm run check` porque necesita iniciar el runtime local.

La configuración `overrides` actualiza el esbuild indirecto de Drizzle Kit para eliminar la alerta de seguridad de su versión anterior. No se aplicó `npm audit fix --force` ni se bajó Drizzle a una versión antigua. El generador de migraciones debe seguir verificándose al actualizar dependencias.

## Estado y siguientes bloques

Base local funcional y comprobada. Antes de usarla como producto público quedan decisiones e integraciones que debemos revisar juntos:

1. Configurar y probar una instancia real de Clerk y D1 remota.
2. Elegir el proveedor de acciones y confirmar permisos de las fuentes de Noticias ya configuradas, con cobertura, coste y condiciones de uso. DolarApi ya está aprobado para divisas.
3. Diseñar correcciones de pagos registrados y cancelación de recurrencias. Los gastos manuales y los importados se corrigen desde **Movimientos → Editar**, con historial.
4. Diseñar compras en cuotas y reglas específicas de impuestos. Los importes variables de obligaciones ya se pueden cargar por vencimiento; no se calculan impuestos automáticamente.
5. Añadir paginación, trabajo por lotes para grandes cantidades de reglas, monitoreo y pruebas de carga antes de escalar.
6. Definir política de privacidad, retención/exportación y cierre de cuenta, según el alcance real del producto.

Los Cron Triggers funcionan en Cloudflare después de desplegar. El servidor de Vite no simula por sí solo el paso de los días. Ver [PROVEEDORES.md](docs/PROVEEDORES.md).

El catálogo de S&P 100 y Nasdaq-100 se revisa mediante la API de Wikipedia cada quince días desde la última consulta exitosa, con comprobación diaria. Se conserva la última lista válida y las favoritas que salgan de los índices. Se reutilizan tablas existentes, sin migraciones nuevas. En DEV el scheduled corre al iniciar Vite y cada 24 horas abierto; en Cloudflare necesita despliegue. [Funcionamiento y pruebas](docs/CATALOGO-AUTOMATICO.md).

La portada pública describe las funciones actuales e incluye vistas HTML inertes de resúmenes, favoritas, Noticias y Flujario AI. No lee cuentas reales ni consulta IA o cotizaciones remotas para sus ilustraciones. Sus datos de ejemplo están identificados.

## Referencias técnicas

- [React Router: middleware y contextos](https://reactrouter.com/how-to/middleware)
- [Cloudflare: React Router en Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/)
- [Clerk: React Router Quickstart](https://clerk.com/docs/react-router/getting-started/quickstart)
- [Drizzle: conexión con D1](https://orm.drizzle.team/docs/sqlite/connect-cloudflare-d1)
- [D1: batch y atomicidad](https://developers.cloudflare.com/d1/worker-api/d1-database/)

## Comprar, vender y agregar moneda

«Comprar / vender moneda» abre el registro de un cambio que ya hiciste. Elegí las monedas, la fecha y una referencia o cotización manual. El importe recibido se calcula con enteros y redondeo de mitad hacia arriba; podés corregirlo antes de confirmar. Se guardan ambos montos reales en un solo movimiento, sin inflar ingresos o gastos. No se conecta a bancos ni ejecuta una compra.

Las referencias automáticas de esta base cubren pares con ARS disponibles en DolarApi. Otros pares o fechas se registran con tasa manual. Las comisiones y los impuestos no se calculan por inferencia. Actualizar precios no recalcula operaciones anteriores.

«Agregar moneda» muestra sólo las opciones aún no agregadas. El saldo inicial es opcional y no cuenta como ingreso. El servidor también verifica la moneda, la propiedad de ambas cuentas y la ausencia de duplicados.

La migración 0003 conserva los enteros ARS/USD y los registros pagados. Por elección del usuario, deja sin importe los vencimientos recurrentes heredados posteriores a noviembre de 2026 y la sugerencia de las reglas anteriores; conserva importes propios de un vencimiento, pagos únicos y meses anteriores. Los nombres SQL históricos `*_cents` ahora representan unidades mínimas; TypeScript usa `*Minor`.

`qa/verificar-d1.mjs --capturar-cotizaciones` puede capturar referencias públicas verificadas para las ilustraciones. Resumen y Cotizaciones de la vista previa local leen ahora el caché público de DolarApi en D1 y revisan su vencimiento de tres horas. Las referencias llevan la fecha real de la fuente; una ausencia o un dato anterior no se presenta como precio actual. Los movimientos siguen siendo ficticios y la vista previa no habilita el backend privado.

Antes y después de migrar la base local se guardaron exportaciones privadas dentro de `.wrangler/backups/`. `node qa/verificar-respaldo.mjs <antes.sql> <despues.sql>` compara registros sin imprimir datos financieros; sólo lee esos archivos y trabaja en memoria.

## Resumen y apariencia

El selector de saldos muestra pesos, dólares o ambos por separado; no convierte patrimonio ni filtra los pagos y movimientos de otras monedas. El radar completa cinco empresas priorizando favoritas. Sin proveedor de acciones no se inventan precios ni variaciones. Actualidad financiera tiene RSS, filtros, hasta cinco noticias por diario y Ver todas. Los diarios favoritos personalizan el carrusel de Resumen; guardar un artículo sólo lo agrega a Guardadas. El carrusel comienza pausado.

## Mercados

Los selectores S&P 100 / Nasdaq-100 conservan filtros y guardan el último índice en D1 para el usuario autenticado. La composición está fechada al 18/11/2026, verificada el 19/11: 101 instrumentos por índice y 167 únicos. «Mis favoritas» admite cinco globales, sin duplicar una acción compartida. La base aplica el máximo también ante solicitudes simultáneas. Elegir una favorita carga un único gráfico de TradingView, con sus controles y avisos de demora. El componente oficial Market Data muestra precio y rendimiento de los símbolos filtrados, incluidas las columnas Hoy, 1M y 1Y de TradingView. Esos períodos no se presentan como 30 días exactos ni como una captura fija de cierres. Resumen utiliza el widget oficial Market Summary para su radar de cinco acciones, con precio y variación diaria en tarjetas compactas desplazables; se conservan la atribución y los enlaces. Sus precios no se extraen para cálculos dentro de Flujario.

La migración aditiva `0006_stock_markets.sql` se aplicó sólo localmente, con copia previa y comparación de las tablas anteriores. Conserva las favoritas existentes. `node qa/verificar-mercados-d1.mjs` prueba concurrencia, reintentos, preferencias y aislamiento en D1 temporal. Fuentes y límites: [PROVEEDORES.md](docs/PROVEEDORES.md). En `/vista-previa/mercados`, las estrellas son ejemplos que no se guardan en la cuenta; el índice de ejemplo se conserva en la URL.

## Actualidad financiera

Las fuentes y sus alcances se configuran en `app/data/news-sources.ts`. El lector local está habilitado para iProfesional, El Economista, Página/12, Infobae y Bloomberg; no copia bajadas ni artículos completos. Muestra las imágenes incluidas en los RSS de iProfesional, Página/12 e Infobae, desde sus hosts verificados, sin descargar archivos al servidor. Cuando falta una foto o falla su carga conserva la ilustración de Flujario. La publicación pública conserva su revisión por fuente y no declara permisos inexistentes. MDZ queda pendiente por su feed histórico no disponible. Los estados vacíos enlazan a las secciones originales sin inventar artículos.

Hoy se actualiza cada treinta minutos; la edición semanal se fija los lunes a las 10:00 de Argentina con los siete días anteriores. La retención es de quince días, también para los artículos guardados. Las preferencias de medios no vencen. En desarrollo, Vite ejecuta el scheduled local al iniciar y cada treinta minutos mientras el servidor está abierto; en Cloudflare se utilizarán sus cron tras un futuro despliegue autorizado.

Se agregaron y aplicaron sólo localmente las migraciones `0004_news_rss.sql` y `0005_news_preferences_weekly.sql`, después de una copia consistente. El esquema anterior se conserva. `node qa/verificar-noticias-d1.mjs` prueba el flujo completo con RSS ficticio y D1 temporal. `npm run dev` sincroniza los RSS reales al iniciar y cada treinta minutos mediante el scheduled local del Worker. `/vista-previa/noticias` y `/vista-previa/resumen` muestran sus titulares, fechas y enlaces al diario, sin datos personales. Los saldos de la vista previa siguen siendo ejemplos. La maqueta ficticia se conserva explícitamente en `/vista-previa/noticias?noticias=ejemplo`.

Ver [proveedores y pruebas locales](docs/PROVEEDORES.md), [viabilidad y permisos](docs/NOTICIAS-VIABILIDAD.md) y [decisiones aprobadas](docs/DECISIONES.md).

La franja de divisas muestra USD, EUR, BRL, CLP y UYU, con Oficial/MEP/Blue para USD. La variación compara venta con la última referencia guardada de una fecha argentina anterior y la identifica; si falta historia muestra «Sin comparación». No representa cierre oficial. Usa el historial ya almacenado, sin migrar el esquema ni consultar otra fuente.

Claro/Oscuro/Sistema se aplica a toda la web y se guarda en este navegador. El script inicial acepta sólo esos valores y no almacena datos financieros. La preferencia sigue disponible durante la visita aunque el navegador bloquee almacenamiento. Las ilustraciones HTML públicas comparten el nuevo bloque de saldos y permanecen inertes.

## Importar resúmenes y crear gráficos

En **Movimientos → Importar resumen** se leen CSV, XLSX, XLS y PDF digitales. Al elegir un PDF de Santander con el formato de cajas de ahorro verificado, Flujario abre la revisión de categorías directamente. Usa el signo del movimiento y comprueba el saldo de cada fila y el cierre. Si la descripción no da una categoría clara, propone **Otros**. Las categorías se pueden corregir antes de confirmar. Pesos y dólares se confirman por separado. Para los demás formatos está disponible la lectura asistida. **Opciones de lectura** permite configurar contraseña, OCR para escaneos o codificación de CSV. El archivo original y su contraseña se procesan en el navegador. Sólo se envían las filas confirmadas.

Antes de importar, confirmá la fecha del saldo inicial de esa moneda: corresponde al **inicio de ese día**. Las filas anteriores se guardan para análisis sin tocar el saldo. Desde esa fecha, ingresos/egresos confirmados sí lo modifican. La fecha debe respetar los movimientos existentes y queda fija al utilizarse. Las coincidencias por día, moneda, importe y sentido requieren revisión; repetir el mismo envío no duplica movimientos.

Para una tarjeta, elegí «Detalle de tarjeta» y su pago ya registrado. Las compras se guardan como desglose, sin otro egreso. Se aplica a categorías sólo si suma exactamente el pago en la misma moneda. Una diferencia conserva el pago y deja el detalle pendiente. Los desgloses se pueden revisar desde Análisis; los movimientos de dinero confirmados siguen sin edición por este módulo.

**Ver análisis** permite elegir fechas, moneda y agrupación diaria, mensual, trimestral o anual. El resultado incluye los históricos y excluye transferencias/cambios de moneda; no representa el saldo total ni garantiza cobertura de todas las cuentas. «Crear gráficos» muestra categorías de gastos e ingresos/egresos por período con los mismos enteros del análisis.

Límites: 10 MB, 30 páginas PDF, 2.000 filas de revisión y 500 por confirmación. Las restantes permanecen para otro lote. Los archivos corruptos, las columnas desplazadas, las monedas mezcladas en el lector manual, las fórmulas detectadas y los errores OCR requieren revisión. La detección automática se verificó con el formato digital de cajas de ahorro de Santander.

`npm install`, `npm run dev` y `npm run build` preparan los recursos OCR/PDF locales mediante `tools/prepare-statement-assets.mjs`. Si se instala con `--ignore-scripts`, ejecutar `npm run assets:statements` antes de usar OCR. Son archivos públicos de las bibliotecas, sin documentos del usuario. Las migraciones aditivas `0007_statement_imports.sql` y `0008_steady_spirit.sql` se aplicaron sólo localmente, con copia previa y comparación de las tablas anteriores. Prueba D1 aislada: `node qa/verificar-importaciones-d1.mjs`; prueba del motor OCR con imagen sintética: `node qa/verificar-ocr-local.mjs`.

## Flujario AI

El botón flotante **Abrir chat** combina mascota transparente, etiqueta e ícono de conversación. El chat mantiene mensajes al cerrar/minimizar o navegar en el panel, en ambos temas; recargar los borra. Cinco preguntas estadísticas funcionan sin modelo ni cupo de IA. La vista previa sólo usa ejemplos identificados, sin acceder al backend privado.

El backend privado interpreta texto libre mediante Workers AI (`@cf/ibm-granite/granite-4.0-h-micro`) y calcula sobre las tablas existentes con enteros, monedas separadas, dueño de Clerk y SQL parametrizado. Sólo lectura: ingresos/egresos, categorías, períodos, porcentajes, saldo, descripciones, tarjetas y recurrentes. No proporciona recomendaciones ni inventa cuotas futuras.

Configuración inicial: cinco intentos por usuario/día argentino, 8.000 Neurons globales/día UTC y máximo de salida de 400 tokens, con reserva atómica variable y reintentos idempotentes. La migración `0009_past_donald_blake.sql` está aplicada localmente, con respaldo y trece tablas anteriores intactas; en D1 remota queda pendiente. **La inferencia real todavía requiere configurar/probar Cloudflare; local la deshabilita por defecto.** No hubo despliegue ni contratación de servicios.

Ver [modelo, archivos, presupuesto, límites y comandos de despliegue](docs/FLUJARIO-AI.md). Pruebas: `npm run check`, `node qa/verificar-asistente-d1.mjs` y `node qa/auditar-asistente-local.mjs`.
