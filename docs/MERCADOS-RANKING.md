# Ranking por tamaño: propuesta para Flujario

El usuario eligió capitalización bursátil de mayor a menor. Es el valor bursátil de la empresa, calculado a partir del precio de sus acciones y las acciones en circulación; no equivale al precio de una acción ni a una recomendación de compra. Referencia: [Investor.gov](https://www.investor.gov/introduction-investing/investing-basics/glossary/market-capitalization).

## Comportamiento propuesto

- Usar «Tamaño: mayor a menor» como orden inicial dentro de S&P 100 o Nasdaq-100 y conservar el orden por nombre como alternativa.
- Mostrar posición, capitalización, moneda, fuente y fecha. La búsqueda y Sólo favoritas conservarían la posición dentro del índice completo, para que una empresa no pase a ser número uno sólo por filtrarla.
- No atribuir un puesto real cuando falta información. Un conjunto incompleto debe identificarse y no aparentar una clasificación completa.
- Conservar los instrumentos y sus clases de acciones. El proveedor debe aclarar si devuelve capitalización de la compañía o de la clase, y cómo trata ADR. No sumar valores de compañía repetidos en GOOG/GOOGL. La presentación de sus posiciones se debe resolver antes de implementarla.

Estos detalles son una propuesta; la decisión confirmada hasta ahora es el criterio por tamaño.

## Dato que falta

`stock_companies` contiene nombres, símbolos y bolsa. Las pertenencias indican el índice y una fecha de composición. Ninguno incluye capitalización. Los archivos de posiciones de OEF/QQQ revisados anteriormente se usaron sólo para contrastar pertenencias; el peso de una posición no es una clasificación exacta de tamaño. [Nasdaq usa ponderaciones modificadas](https://indexes.nasdaq.com/docs/Methodology_NDX.pdf), distintas de ordenar simplemente por capitalización total.

El widget de TradingView no proporciona los datos de una tabla propia. Se mantiene el límite de usar su integración oficial, sin extraer cotizaciones de DOM o APIs internas.

## Vía técnica revisada, sin activar

[Financial Modeling Prep documenta un endpoint de capitalización por lote](https://site.financialmodelingprep.com/developer/docs), `stable/market-capitalization-batch`, con símbolo, fecha y `marketCap`. Requiere una clave y confirmar cobertura del plan. No se consultó con credenciales ni se habilitó como proveedor.

Sus [planes y condiciones de exhibición](https://site.financialmodelingprep.com/developer/docs/pricing) y su [explicación para aplicaciones](https://site.financialmodelingprep.com/insights/platform/can-you-use-fmp-data-in-a-public-app-website-or-client-dashboard) exigen acordar el alcance de exhibición y licencia. Esto comprende rankings derivados; acceder a un endpoint o pagar un plan individual no acredita por sí solo el uso en una web para varios usuarios. No se presupone un costo comercial ni se solicita contratarlo.

También se revisaron las [condiciones de Finnhub](https://finnhub.io/terms-of-service): sus planes personales no autorizan compartir datos o resultados derivados con terceros sin aprobación escrita. No se lo seleccionó como una alternativa gratuita de exhibición. Esto no demuestra que no existan otras opciones gratuitas; sólo descarta dar por habilitados esos planes personales para Flujario.

Si se elige una API, la propuesta técnica es consultar desde el servidor y compartir una captura fechada en D1, en lugar de una petición por visitante. Para ordenar por tamaño podría bastar una revisión diaria tras el cierre, con caché anterior identificado ante un fallo. Las capitalizaciones se guardarían como importes exactos con moneda, sin float; los datos globales de mercado permanecerían separados de saldos y preferencias privadas. Se debe acordar el modelo y la frecuencia antes de añadir una migración o un cron.

## Pendiente de decisión

Definir si se consideran proveedores pagos o sólo gratuitos con permiso aplicable, verificar la fuente elegida y acordar la frecuencia. Después se puede concretar la migración/adaptador y probar clasificación, datos ausentes, clases múltiples, persistencia y conservación de favoritas. Hasta entonces la tabla mantiene su orden existente, sin números que aparenten un ranking por tamaño.

## Precios e inversiones: investigación del 20/11/2026

El nuevo pedido incluye precios y variación diaria para todas las acciones del catálogo, no sólo las invertidas, y una carga de inversiones con valoración actual o histórica. Se consultaron alcance de instrumentos, cantidad/costo real frente a simulación, impacto en efectivo y presupuesto. Todavía no hay una fuente bursátil nueva aprobada.

El radar actual muestra explícitamente «Sin cotización». El widget de gráficos existente no entrega sus datos a Flujario. Los widgets oficiales [Market Data](https://en.tradingview.com/widget-docs/widgets/watchlists/market-data/) y [Tickers](https://www.tradingview.com/widget-docs/widgets/tickers/tickers/) permiten exhibir precios y cambios con atribución, sujetos a cobertura y demora por mercado. Las [preguntas de datos de TradingView](https://en.tradingview.com/widget-docs/faq/data/) aclaran los límites de exportación. Mostrar un widget no habilita usar sus cifras en un cálculo propio ni extraerlas de un iframe.

En las páginas oficiales consultadas, [Twelve Data](https://twelvedata.com/pricing) ofrece Basic con 8 créditos por minuto y 800 por día. Una consulta por símbolo consume créditos por cada símbolo, aunque se agrupe en un request. Cubrir los 167 instrumentos únicos requiere presupuestar también históricos, reintentos y actualización; no se promete actualización por segundo con ese plan. Su [plan empresarial](https://twelvedata.com/pricing-business) distingue el acceso gratuito de uso interno sin exhibición de los derechos de exhibición/distribución. No se da por aprobada una licencia pública por tener una clave gratuita. Las condiciones específicas de [acciones de EE. UU.](https://support.twelvedata.com/en/articles/9935903-us-equities-market-data) también distinguen cobertura del feed y distribución externa.

[Alpha Vantage](https://www.alphavantage.co/support/) ofrece 25 solicitudes gratuitas diarias y reserva precios estadounidenses en tiempo real o demorados quince minutos a ofertas premium: no se presume que ese cupo cubra el catálogo completo y sus históricos. [Massive](https://massive.com/stocks) distingue planes personales de uso empresarial/exhibición a clientes. Los límites y derechos se volverán a verificar al elegir un proveedor; no se contrató ningún plan ni se crearon claves.

Propuesta pendiente de acuerdo: separar el resultado por variación de precio de dividendos, comisiones, impuestos y ventas. Una fecha sin rueda necesita una regla explícita para el cierre anterior; una compra pasada requiere considerar splits y cantidades válidas en cada fecha. No se puede sustituir automáticamente el precio de ejecución por un cierre diario ni tratar la variación de una acción como la rentabilidad total de una cartera. Los cálculos deben usar cantidades y precios decimales exactos y probar compras múltiples, fracciones, moneda, datos ausentes y eventos corporativos antes de informar ganancias.

## Definiciones confirmadas y opciones gratuitas — 24/11/2026

El usuario eligió **cierres, últimos 30 días, últimos 12 meses y coste cero**. Esto resuelve frecuencia, ventanas y presupuesto para la tabla de precios; no aprueba automáticamente una fuente ni modifica el criterio de capitalización del ranking pendiente.

La opción técnicamente más ajustada entre las verificadas es **Massive Stocks Basic**. Su [resumen diario del mercado](https://massive.com/docs/rest/stocks/aggregates/daily-market-summary) está incluido en el plan gratuito, cubre acciones estadounidenses por fecha y ofrece dos años de historia. Los [límites del plan](https://massive.com/stocks) indican cinco consultas por minuto. Una consulta por fecha puede cubrir el catálogo, evitando pedir un precio por visitante o por favorita. El parámetro `adjusted` corresponde a splits, no a una rentabilidad total con dividendos.

Según su [explicación específica para Basic](https://massive.com/knowledge-base/article/on-the-free-basic-plan-when-can-i-pull-the-previous-trading-days-data), los datos de una rueda se consultan después de la medianoche de Nueva York, cuando esa fecha ya no es el día en curso. Existe una nota general de publicación EOD a las 20:15 ET, pero no se presume que amplíe los derechos del plan gratuito frente a la restricción específica de Basic. Cualquier integración debe verificar esa disponibilidad con la clave elegida y mostrar la fecha real del cierre.

La limitación decisiva es la licencia: sus [términos individuales](https://massive.com/legal/individuals-terms-of-service) permiten aplicaciones y análisis personales, no uso empresarial/comercial, y la [página de planes](https://massive.com/stocks) exige Business para exhibición a clientes o redistribución. El coste cero de Basic no acredita mostrar los datos a todos los usuarios de Flujario. No se activó ni se crearon cuentas o claves; se consultó si se prioriza una integración personal/local o una alternativa publicable con widgets.

Se verificó directamente en el navegador el [widget Market Data](https://www.tradingview.com/widget-docs/widgets/watchlists/market-data/): el selector View ofrece Overview/Performance; Performance muestra Price, Today, 1W, 1M, 6M y 1Y. Es una alternativa de exhibición con sus controles y atribución, no una API de datos para Flujario. No se da por equivalente 1M a 30 días exactos ni se afirma que permita fijar una fotografía exclusivamente de cierres. No se integra silenciosamente como si cumpliera todas las condiciones de la tabla propia.

Otras fuentes verificadas no mejoraron la combinación solicitada: [Tiingo](https://www.tiingo.com/products/end-of-day-stock-price-data) separa la licencia gratuita de uso interno de la de redistribución; [StockData.org](https://www.stockdata.org/pricing) ofrece un mes EOD en su plan gratuito, insuficiente para doce meses; los [términos históricos educativos de Market Data](https://www.marketdata.app/terms/public-use/) no autorizan incorporar esos datos en plataformas para terceros. No se generaliza esta revisión a que sea imposible toda API gratuita: no se encontró una que pudiera darse por aprobada para el conjunto de requisitos y la publicación prevista.
