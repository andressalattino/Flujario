# Practicar ingeniería agéntica con Flujario

El objetivo es que puedas dirigir y evaluar el trabajo técnico del agente. Vamos a usar los cambios reales del proyecto como ejercicios, con decisiones que puedas explicar y resultados que puedas comprobar.

## Cómo trabajamos

1. **Definir el problema con ejemplos.** Escribir qué debe pasar con datos concretos antes de elegir tablas o componentes.
2. **Dar contexto acotado.** Indicar los archivos relevantes, el stack, las decisiones anteriores y qué datos no se pueden modificar. `AGENTS.md` conserva las reglas generales; `docs/DECISIONES.md` conserva las decisiones del producto.
3. **Comparar alternativas.** Revisar complejidad, migración, autorización, concurrencia y mantenimiento. Elegir con razones, no sólo porque una herramienta lo sugiera.
4. **Convertir requisitos en pruebas.** Definir casos normales y casos que deben rechazarse. Para dinero, las pruebas deben comprobar saldos y conservación de datos, no sólo que se llamó una función.
5. **Implementar un cambio acotado.** El agente usa herramientas para leer, editar y ejecutar verificaciones dentro del alcance acordado.
6. **Revisar evidencia.** Inspeccionar el diff, la salida real de las pruebas y la pantalla. Un mensaje del agente diciendo «funciona» no reemplaza esas comprobaciones.
7. **Decidir el siguiente paso.** Registrar qué quedó terminado, qué no se verificó y qué cambios requieren una nueva decisión.

Este proceso adapta al proyecto la idea de construir un entorno donde el agente tenga instrucciones claras y mecanismos de comprobación. Referencia: [Harness engineering, OpenAI](https://openai.com/index/harness-engineering/).

## Ejercicio actual: pagos con importe variable

Ejemplo de requisito: noviembre tiene un importe previsto de ARS 30.000. Si no se elige mantenerlo, diciembre sigue existiendo como vencimiento, pero sin importe definido. Al pagarlo, se pregunta cuánto se pagó. Ninguna edición de un pendiente debe modificar por sí sola un saldo.

Decidiste conservar los ajustes manuales de cada mes y editar sólo pendientes. También elegiste que gane el último guardado frente a detectar conflictos mediante versiones. La alternativa de versiones evita pisar cambios, pero exige gestionar conflictos; último guardado simplifica el flujo y acepta que una pestaña pueda reemplazar el importe pendiente que guardó otra.

| Pregunta técnica                            | Por qué importa                                                                                           |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| ¿Cómo representamos un importe desconocido? | `null` significa que falta definirlo; `0` afirma que se conoce y es cero                                  |
| ¿De dónde salió un importe?                 | Distinguir un valor propio del mes de uno heredado permite conservar ajustes manuales                     |
| ¿Qué puede cambiar una edición?             | Debe tener alcance explícito: un vencimiento o una regla hacia adelante                                   |
| ¿Qué pasa con un pago ya registrado?        | El gasto confirmado es evidencia financiera y requiere un mecanismo de corrección distinto                |
| ¿Cómo se evita un reintento duplicado?      | La operación conserva una clave de idempotencia y verifica el contenido asociado                          |
| ¿Cómo se resuelven ediciones concurrentes?  | Elegiste último guardado; el batch sigue comprobando que el vencimiento no esté pagado                    |
| ¿Cómo se conserva la base anterior?         | La prueba de migración debe sembrar datos viejos y verificar gastos, avisos, IDs y relaciones al terminar |

## Un prompt que podés practicar

```text
Objetivo: permitir pagos recurrentes con importe variable.
Contexto: Flujario; React Router, TypeScript, Drizzle y D1.
Reglas: centavos enteros, ARS y USD separados, usuario verificado en cada acción.
Antes de editar: explicá las alternativas del modelo y los riesgos de migración.
Alcance: no cambiar gastos ya registrados sin acordar cómo se conserva su historial.
Aceptación: un importe desconocido no cuenta como cero; pagar un mes no paga el siguiente;
una edición de otro usuario se rechaza; repetir una operación no duplica el gasto.
Evidencia: mostrar las pruebas ejecutadas, las limitaciones y los archivos modificados.
```

El próximo ejercicio consiste en que elijas un caso de error y expliques qué resultado debería tener. Después comprobamos si la prueba realmente detecta ese error.

## Evidencia para revisar en el código

1. `tests/variable-payments.test.ts`: la prueba de dos pestañas pausa una edición después de sus lecturas, registra un pago y luego intenta terminar la edición. Debe rechazarla y conservar el saldo y los meses futuros.
2. En el mismo archivo, un reintento de una edición vieja después de otra nueva no puede restaurar el importe anterior. Se reconoce por el comprobante del envío, no por comparar únicamente el monto actual.
3. `tests/migration.test.ts`: crea gastos y avisos con el esquema anterior y luego aplica la migración. Compara filas completas y revisa las claves foráneas.
4. `drizzle/0002_variable_payment_amounts.sql`: el SQL generado necesitó revisión. La prueba inicial detectó un fallo de claves foráneas al reconstruir tablas con dependencias. La versión corregida conserva copias dentro de la transacción, reconstruye en orden y restaura los registros.
5. `tests/snapshot.test.ts`: intercala un pago externo después de leer movimientos. Las lecturas agrupadas deben conservar el saldo y los pendientes del mismo instante; la siguiente captura debe mostrar ambos actualizados.

**Pregunta de revisión:** si el agente borrara el registro del pago y lo volviera a crear para cambiar su monto, ¿qué requisito rompería aunque los totales finales parecieran correctos? Revisá identidad, historial e idempotencia antes de mirar sólo el saldo.

## Ejercicio completado: registrar cambios de moneda

Elegiste ampliar Movimientos, usar DolarApi con copia local y redondear mitad hacia arriba. Antes se comparó ampliar la tabla frente a crear otra fuente de registros, y redondear hacia arriba frente a redondear al par.

La aceptación se expresa con un caso ficticio: ARS 200.000 y USD 20; entregar ARS 150.000 y recibir USD 100 debe dejar ARS 50.000 y USD 120, sin ingresos ni gastos. `tests/exchange.test.ts` comprueba ambos saldos, no sólo que se haya llamado a un INSERT.

`tests/quotes.test.ts` comprueba otra propiedad: el mercado puede cambiar, pero una operación pasada conserva sus montos y tasa. La fecha dentro de la cotización importa más que el momento en que descargamos la respuesta. Las pruebas de fallo deben conservar información anterior e identificarla, en lugar de inventar un dato actual.

CLP también obligó a revisar un supuesto: «entero» no significa siempre «centavo». El catálogo define cuántas unidades mínimas tiene cada moneda. La lectura exacta de JSON usa el texto original del número; las cuentas se hacen con `BigInt`, redondeando sólo la sugerencia final.

Después de probar la migración con datos ficticios en D1 temporal se aplicó a la base local respaldada. La comparación privada de exportaciones verificó los registros anteriores sin imprimir datos financieros. Ese resultado es evidencia adicional: el mensaje del agente no reemplaza las pruebas ni el respaldo.

**Para practicar:** cambiá un criterio de aceptación, anticipá qué prueba debe fallar y revisá si realmente falla antes de pedir una implementación. No agregues agentes o herramientas sólo por cantidad; elegí el contexto y las comprobaciones que necesita el problema.

## Ejercicio: calidad visual con una decisión técnica

El requisito era que los textos aparecieran al bajar y que el producto se viera nítido. Separar los dos problemas evita elegir una biblioteca de animación para corregir una captura borrosa. Elegiste vistas HTML frente a PNG de más resolución: usamos piezas visuales compartidas con el panel, junto a datos públicos de ejemplo. Los importes siguen saliendo de las funciones del dominio; no se escribieron cifras calculadas a mano en el diseño.

La animación mejora una página que ya funciona: el servidor entrega el texto visible y el navegador agrega el movimiento sólo si puede hacerlo. Esto se llama mejora progresiva. Se comprueba también qué pasa sin JavaScript, con movimiento reducido, al navegar con teclado y en pantallas chicas.

`tests/landing.test.ts` verifica el HTML entregado sin JavaScript, la ausencia de consultas a fuentes o al backend privado y los controles inertes de cada ilustración. En navegador se revisan los estados antes y después de entrar en pantalla y los anchos internos; una página sin desborde exterior puede tener importes recortados dentro de una tarjeta.

## Aprender con el nuevo Resumen

La primera decisión fue semántica: mostrar pesos y dólares separados evita confundir cambiar la vista con convertir patrimonio. También elegiste que el selector no esconda pagos o movimientos de otra moneda. Esa decisión se comprueba en pruebas de renderizado y en los cálculos de saldos, antes de revisar colores.

«Subió» necesita una base de comparación. Elegiste la última fuente guardada de una fecha argentina anterior. El código consulta ese historial con el índice por serie/fecha y calcula el porcentaje con fracciones exactas; incluye la fecha y no lo presenta como cierre oficial. Una hora UTC cercana a medianoche puede pertenecer al día anterior en Argentina: las pruebas cubren ese límite. Una diferencia positiva muy pequeña aparece como menor a 0,01 %, no como cero.

El modo oscuro se resuelve con variables CSS y una preferencia local. No exige modificar la base ni las reglas de autorización. El pequeño script inicial evita mostrar un tema distinto antes de que React inicie; acepta únicamente Claro, Oscuro o Sistema. Las pruebas ejecutan ese script con almacenamiento permitido, bloqueado y valores inválidos.

La composición se divide por responsabilidad: saldos, radar, noticias, divisas, vencimientos y actividad. Reutilizar una pieza visual no debe traer consigo acceso al backend: la ilustración pública mantiene datos de ejemplo y controles inertes. El carrusel inicia pausado; una interfaz más activa también tiene que permitir leer sin apuro.

## Aplicar una corrección durante la implementación

En Noticias, «favorito» podía significar dos cosas: elegir un artículo o elegir un diario. La aclaración del usuario cambió el modelo antes de terminar: los medios elegidos personalizan Resumen; los artículos guardados sirven para leer después. Por eso existen dos tablas y dos intenciones de servidor. Una prueba verifica expresamente que guardar un artículo no cambie Resumen.

La selección semanal requiere otra separación: consultar datos nuevos no debe cambiar una edición ya publicada. Se conserva una lista de identificadores fijada los lunes. Una clave única y un token de publicación permiten repetir la tarea sin reemplazar esa selección. Otra prueba comprueba el horario de Argentina y que las consultas de noticias no alteren el trabajo de vencimientos.

La evidencia se revisa en tres niveles: reglas/parsing con muestras ficticias, consultas reales en SQLite y ejecución en workerd/D1 temporal. El parser se prueba con XML roto, fechas imposibles y hosts ajenos al medio; el servidor, con otro usuario y otro origen. La revisión visual usa datos de prueba identificados, para no convertir una maqueta en una publicación de terceros.

## Un ejemplo aplicado: cinco favoritas globales

El pedido de Mercados muestra cómo convertir una decisión de producto en evidencia técnica. «Hasta cinco» se traduce en una regla verificable: veinte solicitudes simultáneas para un mismo usuario deben dejar exactamente cinco filas, y repetir una de ellas no debe crear otra. La prueba se ejecuta tanto con SQLite como con el runtime local de Cloudflare.

El agente no decide el dueño del registro: Clerk lo verifica en el servidor. Tampoco basta con desactivar una sexta estrella en React, porque otra pestaña o una petición directa puede omitir ese control. El trigger de D1 aplica la regla dentro de la escritura. Esa es la razón de ubicar este límite en la base además de comunicarlo en la interfaz.

Otra frontera de herramientas es TradingView: aprobar un gráfico no autoriza a extraer su DOM para llenar una tabla propia. Por eso se integra su widget oficial y se deja la tabla sin cifras hasta acordar una fuente adecuada. La revisión visual comprueba selección, tema y un solo gráfico; las pruebas de servidor comprueban persistencia, permisos y concurrencia. Cada tipo de evidencia responde una pregunta distinta.

Al pedir un cambio a un agente, especificá la regla, dónde debe cumplirse y qué prueba demostraría que se cumple. Después revisá el resultado y los límites declarados. El código, las pruebas y los documentos de decisiones deben contar la misma historia.

## Ejercicio propuesto: un pago y varias categorías

El usuario definió un pago de tarjeta de 100, desglosado en 30 de ropa, 40 de comida y 30 de impuestos. El requisito verificable es conservar un único egreso de dinero: con saldo inicial de 1.000, el saldo final debe ser 900; el análisis por categorías debe sumar 100, nunca 200. Las partes son una explicación del pago, no otros movimientos de caja.

Antes de modificar el esquema se consultan dos alternativas de persistencia: tablas relacionadas para lotes/desgloses o JSON validado por el servidor. También queda pendiente qué hacer cuando el detalle no coincide con el pago y dónde guardar la fecha que separa el histórico del saldo inicial. Este párrafo es un plan de pruebas, no evidencia de una implementación ya terminada.

Los casos de aceptación previstos incluyen monedas distintas sin mezclarlas, diferencias de un centavo, otra persona que intenta desglosar un pago ajeno, confirmaciones repetidas o simultáneas, dos compras legítimas iguales que generan aviso sin desaparecer y un histórico que se puede analizar sin modificar el saldo. Un reconocimiento OCR dudoso exige revisión; que el motor extraiga texto no demuestra que interpretó bien las filas de dinero.

## Del acuerdo a una prueba ejecutable: importaciones

Las decisiones anteriores ya se acordaron: tablas relacionadas, fecha del saldo inicial por moneda y discrepancias pendientes. `tests/statements.test.ts` y `qa/verificar-importaciones-d1.mjs` comprueban el ejemplo de 100 con categorías 30/40/30. Un detalle de 120 conserva el pago de 100, queda pendiente y no reemplaza su categoría. Una nueva revisión conciliada sí puede hacerlo; repetir un envío viejo no debe volver a activar esa versión.

La clave de un envío y la coincidencia entre movimientos resuelven problemas distintos. Una clave repetida con el mismo contenido es un reintento y no duplica nada. Dos compras del mismo día e importe pueden ser legítimas: se avisan y requieren revisión para conservar ambas. La restricción se vuelve a verificar en la escritura, porque una segunda pestaña puede confirmar durante la revisión de la primera.

El límite de confianza es explícito: PDF.js, SheetJS, Papa Parse y Tesseract producen borradores en el navegador. El servidor recibe sólo filas confirmadas, vuelve a validar el esquema, toma el dueño de Clerk y ejecuta todo el lote de forma atómica. Las tablas guardan revisiones normalizadas; no los archivos originales ni sus contraseñas. La fecha del saldo inicial se bloquea una vez utilizada para que un cambio posterior no convierta históricos en dinero nuevo.

Para trabajar con un agente, podés pedir: «Primero ejecutá el caso que falla; mostrame qué regla protege; hacé el cambio mínimo y volvé a probar ese caso y sus límites». La evidencia tiene alcance: un Excel sintético prueba fechas y centavos del lector; una imagen sintética prueba el motor OCR; ninguna acredita el diseño de un resumen real de Galicia o Nación. Falta revisar muestras de cada entidad y la interfaz en navegador, cuya automatización se interrumpió en esta sesión.

## Una prueba que Node no detectó: cotizaciones

El diagnóstico del 20/11 mostró cinco filas de divisas en el HTML pero una captura vieja en la vista previa. Al conectarla con D1 apareció otro problema: el adaptador pedía `redirect: "error"`, una opción válida en Node que workerd rechaza antes de salir a la red. Una respuesta simulada en Node no reprodujo esa diferencia.

Se comprobó primero el error con workerd, luego se usó `manual` y se rechazaron respuestas 3xx. `qa/verificar-cotizaciones-d1.mjs` ejecuta el adaptador real en ese runtime con red simulada: exige siete tasas exactas, una única consulta compartida por feed y conservación del caché si hay una redirección. La comprobación separada de los endpoints públicos devolvió tres dólares y cuatro divisas. Cada evidencia cubre una capa distinta; el test de Node no reemplaza al del entorno de ejecución.
