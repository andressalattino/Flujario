# Propuesta: monedas, cambios y cotizaciones

Estado: decisiones aprobadas e implementadas. Investigación y decisiones del 17 de noviembre de 2026. El registro definitivo está en `DECISIONES.md`.

## Qué solicitaste

- Comprar dólares o pesos mediante una conversión, con cotización sugerida y editable.
- Una sección de cotizaciones de dólar, euro y real brasileño.
- Agregar monedas desde una lista de diez opciones, ocultando las ya incorporadas.

Se aprobó registrar y calcular cambios, mostrar oficial/MEP/blue y ofrecer diez monedas en total, priorizando la región.

Catálogo aprobado para el contexto de Flujario: ARS, USD, EUR, BRL, CLP, UYU, GBP, CAD, AUD y CHF. Es una selección de uso, no un ranking de volumen negociado. Una cuenta general por moneda mantiene el criterio ya elegido para ARS y USD. El saldo inicial opcional de una moneda nueva es independiente de los ingresos.

| Código | Moneda               | Decimales para importes |
| ------ | -------------------- | ----------------------- |
| ARS    | Peso argentino       | 2                       |
| USD    | Dólar estadounidense | 2                       |
| EUR    | Euro                 | 2                       |
| BRL    | Real brasileño       | 2                       |
| GBP    | Libra esterlina      | 2                       |
| CAD    | Dólar canadiense     | 2                       |
| AUD    | Dólar australiano    | 2                       |
| CHF    | Franco suizo         | 2                       |
| CLP    | Peso chileno         | 0                       |
| UYU    | Peso uruguayo        | 2                       |

## Decisión técnica revisada

Antes de este cambio, un movimiento guardaba un importe y una moneda. Una transferencia conserva esa moneda, también en las claves foráneas. Una conversión necesita guardar dos importes distintos y las dos monedas. Cargarla como gasto más ingreso falsearía los indicadores del mes.

| Alternativa                                                                                | Ventaja                                                                                                            | Costo                                                                                                          |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Ampliar movimientos con un tipo «Cambio de moneda», importe de salida e importe de entrada | Un solo registro financiero contiene ambos efectos; reutiliza la identidad del envío y el historial de movimientos | Hay que adaptar las restricciones, los cálculos de saldo y cómo se muestra cada lado según el filtro de moneda |
| Tabla separada de cambios de moneda                                                        | Los campos de conversión quedan separados de ingresos y gastos                                                     | El saldo y la lista de movimientos pasan a combinar dos fuentes de registros                                   |

Se eligió ampliar los movimientos, conservando un registro por cambio. El servidor verifica ambas cuentas y sus monedas con el usuario de la sesión.

También hay que generalizar la unidad mínima: las diez monedas propuestas usan dos decimales salvo CLP, que usa cero. Se comprobó el listado XML oficial de [SIX / ISO 4217](https://www.six-group.com/en/products-services/financial-information/market-reference-data/data-standards.html). ARS y USD conservan exactamente los mismos enteros anteriores; no corresponde multiplicar ni reinterpretar sus saldos al migrarlos.

Para calcular, la propuesta es mantener importes enteros y tratar la tasa como decimal exacto, con redondeo explícito sólo al obtener la unidad mínima de destino. Se eligió mitad hacia arriba; la tasa admite ocho decimales y se lee del texto original de JSON. Se verificó su soporte en Node y workerd.

Los importes confirmados y la cotización usada se conservan en el registro. Actualizar una referencia del mercado nunca debe recalcular una operación pasada.

**Caso ficticio para probar, no es una cotización:** una cuenta empieza con ARS 200.000 y otra con USD 20. La persona registra que entregó ARS 150.000 y recibió USD 100. Los saldos esperados son ARS 50.000 y USD 120. Ingresos y gastos siguen en cero si no había otros movimientos. Una actualización posterior del precio del dólar no modifica esos saldos.

## Fuentes consultadas

| Fuente                                                                                                                                                                   | Aporte                                                                    | Límite para esta función                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| [DolarApi: dólares](https://ar.dolarapi.com/docs/argentina/operations/get-dolares) y [otras monedas](https://ar.dolarapi.com/docs/argentina/operations/get-cotizaciones) | Compra, venta y fecha para variantes del dólar y otras monedas argentinas | Información de referencia, no un precio garantizado para una operación                                                           |
| [BCRA: documentación de Estadísticas Cambiarias](https://www.bcra.gob.ar/archivos/Catalogo/Content/files/pdf/estadisticascambiarias-v1.pdf)                              | Referencias oficiales por fecha y moneda                                  | No sustituye la selección de mercado ni los valores de compra/venta de un intermediario                                          |
| [Frankfurter](https://frankfurter.dev/)                                                                                                                                  | Referencias internacionales con cobertura de múltiples monedas            | Sus tasas no son cotizaciones de compra/venta ejecutables; sería otro proveedor que acordar si se amplía la cobertura automática |

[DolarApi permite consultar y publicar resultados con atribución](https://dolarapi.com/docs/uso). Recomienda conservar una copia y una consulta cada tres horas por serie. Su licencia MIT cubre el programa, no cambia las licencias de las fuentes originales. Su [aviso legal](https://dolarapi.com/docs/legal) aclara el carácter informativo y la ausencia de garantía de exactitud o disponibilidad.

Se consultaron respuestas públicas para investigar el contrato, sin conectar el proyecto. Una respuesta del buscador para otras monedas conservaba una fecha anterior; al verificar directamente el endpoint, USD, EUR y BRL llevaban fecha del 17 de noviembre. Esto demuestra por qué hay que leer la fecha dentro de cada dato, sin inferirla del momento de descarga ni del caché de un intermediario. Esta verificación puntual no acredita disponibilidad continua.

Se aprobó DolarApi y la revisión cada tres horas. La implementación permite consultar desde el servidor, conservar datos en D1, mostrar fuente y fecha por cotización y mantener la última referencia identificada si falla una actualización. No se enviarán saldos ni movimientos personales al proveedor.

## Propuesta de interfaz

La apariencia conserva Ventriloc y `DISENO.md`: títulos livianos, controles grafito/perla, foco visible y naranja como acento. No se cambian los colores de ingresos y gastos para representar un cambio entre monedas.

| Elemento                                                            | Referencia o requisito                                                                                                    | Motivo                                                              |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Selección de origen y destino, montos y revisión antes de confirmar | [Flujo explicado por Wise](https://wise.com/help/articles/2596980/how-can-i-convert-money), adaptado al registro personal | Hace explícito qué moneda sale y cuál entra                         |
| Cotización sugerida editable y fecha visible                        | Pedido del usuario y contrato de las fuentes                                                                              | Permite registrar el precio real sin confundirlo con una referencia |
| «Agregar moneda» oculta las ya existentes                           | Pedido del usuario                                                                                                        | Evita duplicaciones y reduce opciones                               |
| Cotizaciones como sección con nombre propio                         | Pedido del usuario; sección incorporada al panel                                                                          | Facilita encontrar dólar, euro y real                               |

La integración registra cambios entre saldos y permite calcularlos. No ejecuta una compra bancaria. Para una moneda o fecha sin referencia verificada, se necesita ingreso manual, sin fabricar una cotización. Las comisiones y los impuestos no se calculan por inferencia.

## Criterios de aceptación para dirigir al agente

1. Agregar EUR no modifica los saldos ARS/USD, no crea un ingreso y no permite una segunda cuenta EUR del mismo usuario.
2. Un cambio registrado afecta ambos saldos juntos. No aumenta los totales de ingresos o gastos.
3. Reenviar el mismo formulario no duplica la conversión. Una cuenta de otro usuario se rechaza aunque se envíe su identificador.
4. El selector oculta las monedas existentes; el servidor también rechaza una duplicación o un código fuera del catálogo.
5. Los cálculos respetan centavos para ARS/USD y pesos enteros para CLP. Se prueban redondeos, límites e inversión de dirección.
6. Una tasa inválida, cero o negativa nunca genera un registro. Cambiar la sugerencia no altera operaciones anteriores.
7. Una referencia anterior, futura o incompleta no se presenta como un precio actual. Los fallos de red no borran los datos previos ni bloquean los movimientos personales.
8. La migración conserva importes, identidades, pagos y avisos anteriores. Se eligió quitar los futuros heredados posteriores a noviembre de 2026, conservando ajustes propios y pagos confirmados.
9. Se ejecutan `npm run check`, pruebas del repositorio contra D1 temporal y revisión visual de formularios y selección de monedas en escritorio y celular.

Para aprender ingeniería agéntica, se compararon alternativas, el usuario eligió el modelo, la fuente y el redondeo, y los criterios se comprobaron con pruebas antes de migrar la base habitual. Las decisiones se aprobaron en la conversación; escribir esta propuesta no las había autorizado por sí solo.
