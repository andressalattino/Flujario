# Flujario AI: implementación y operación

Implementado localmente el 24/11/2026, después de la autorización de crear el backend en esta copia. Sustituye la propuesta anterior. Consulta las tablas financieras existentes; las cuatro tablas nuevas registran consumo y reintentos. No modifica movimientos, cuentas, pagos ni desgloses.

Se verificaron tipos, compilación, cuotas en D1/workerd aislada e interfaz con estadísticas ficticias. La prueba real con Workers AI del 24/11 interpretó correctamente octubre de 2026 tras ajustar las instrucciones de fechas. El servicio calculó los importes esperados con una D1 temporal y recuperó el mismo envío sin repetir la inferencia. El resultado documenta un caso de prueba, con evidencia en `qa/asistente-ia-real-verificacion.json`.

## Modelo y responsabilidades

Se eligió **`@cf/ibm-granite/granite-4.0-h-micro`** por coste, español y disponibilidad, revisados el 24/11/2026. Fuentes: [modelo en Cloudflare](https://developers.cloudflare.com/workers-ai/models/granite-4.0-h-micro/) y [ficha oficial de IBM](https://huggingface.co/ibm-granite/granite-4.0-h-micro). Falta medir su precisión con preguntas reales antes de prometer una tasa de acierto.

Recorrido de una pregunta:

1. El endpoint verifica Clerk, origen, tamaño, moneda y esquema; el formulario no determina el dueño.
2. Una de las cinco sugerencias predefinidas se resuelve sin modelo ni cupo de IA, incluso si se escribe su texto equivalente normalizado.
3. Para texto libre se reserva el cupo individual y global en una operación atómica de D1.
4. El modelo recibe fecha argentina, instrucciones, pregunta y hasta dos preguntas anteriores. **No recibe los movimientos consultados, saldos, originales, descripciones guardadas ni userId.** Si la persona escribe información sensible en la pregunta, ese texto sí se envía.
5. Devuelve un plan cerrado: operación, período, agrupación, métrica, fechas y término literal opcional de comercio. No devuelve SQL ni cifras utilizadas por Flujario.
6. Zod valida el plan. El servidor consulta sólo registros del dueño y calcula con enteros/BigInt; React muestra el informe generado por esas funciones.

Se hace una sola llamada por pregunta nueva, sin herramientas ni una segunda llamada para redactar. La [salida JSON](https://developers.cloudflare.com/workers-ai/features/json-mode/) no garantiza cumplir el esquema, por eso se valida de nuevo. Un plan válido puede interpretar mal la intención: el título, período y moneda visibles permiten revisarlo y reformular.

## Funcionalidades y reglas financieras

| Consulta                             | Regla                                                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ingresos, egresos y resultado        | Una moneda y período; excluye transferencias y cambios de moneda.                                                                                       |
| Mayor/menor categoría y distribución | Categorías registradas y porcentajes exactos; no inventa gasto cero en categorías ausentes.                                                             |
| Mayor/menor período                  | Agrupación diaria, mensual o anual, sólo períodos con egresos registrados.                                                                              |
| Evolución de ingresos                | Puntos registrados, sin rellenar huecos con valores supuestos.                                                                                          |
| Comparación                          | Diferencia y variación porcentual; base cero se explica sin dividir por cero.                                                                           |
| Saldo a una fecha                    | Reutiliza saldo inicial y movimientos reales, incluidos cambios de moneda. No descuenta históricos otra vez. Informa si falta una fecha inicial fiable. |
| Comercio                             | Agrupa descripciones guardadas; admite un término literal de la pregunta. No identifica como iguales nombres distintos.                                 |
| Tarjeta                              | Usa la revisión activa y fecha de consumo, separadas del pago bancario. No genera un segundo egreso.                                                    |
| Recurrentes                          | Reglas existentes, importe/fecha reales de pagos y vencimientos pendientes. No detecta suscripciones por el nombre.                                     |
| Pendientes                           | Suma importes conocidos y señala el total incompleto si hay montos sin definir. No descuenta saldo real.                                                |
| Cuotas                               | Informa que falta un calendario estructurado suficiente. No deduce futuras cuotas de descripciones.                                                     |

La clasificación reutiliza `statementAnalysis`: incluye históricos para análisis y sustituye el pago padre por las categorías de un desglose conciliado. No suma padre y partes. Los detalles pendientes de conciliación se señalan.

El mes/año actual se compara hasta el mismo día del anterior, ajustado al final del mes y contemplando bisiestos. Los intervalos personalizados se comparan con el tramo inmediatamente anterior de igual duración. Se muestran ambas fechas. Un período sin registros no demuestra que no existieran gastos.

Las cinco estadísticas gratuitas son: categoría de mayor gasto del mes, menor gasto del mes, mes de mayor gasto, evolución anual de ingresos y comparación con el mes anterior. Funcionan con IA deshabilitada o sin cupo, sujetas a protección contra spam.

## Configuración y presupuesto

Valores iniciales en `wrangler.jsonc`; no son secretos:

```text
AI_ENABLED=true
AI_ALLOW_LOCAL=false
AI_MODEL=@cf/ibm-granite/granite-4.0-h-micro
AI_DAILY_QUESTION_LIMIT=5
AI_GLOBAL_DAILY_NEURON_BUDGET=8000
AI_MAX_OUTPUT_TOKENS=400
```

Se validan números y modelo permitido. Cambiar el modelo requiere revisar disponibilidad/tarifa y actualizar esa lista. `AI_ENABLED=false` apaga inferencias, manteniendo estadísticas.

Los [precios oficiales](https://developers.cloudflare.com/workers-ai/platform/pricing/) consultados el 24/11/2026 indican **10.000 Neurons gratis por día y cuenta**, compartidos con otras aplicaciones. Granite Micro informa 1.542 Neurons por millón de tokens de entrada y 10.158 por millón de salida. Verificar nuevamente al operar o cambiar el modelo.

La reserva usa bytes UTF-8 del prompt/esquema como cota alta de tokens, suma 512 tokens de plantilla y el máximo de salida, y duplica el resultado como margen. Se registra en **micro-Neurons enteros**, sin coste fijo por pregunta.

Ejemplo reproducible de la prueba D1: «Analizá mis gastos», sin historial y con 400 tokens máximos, reserva **15,830232 Neurons**. Es una retención conservadora, **no consumo real medido**. Como referencia aritmética, 1.000 tokens de entrada y 150 de salida equivalen a 3,0657 Neurons con esas tarifas; no se midieron esos tokens en una inferencia. Longitud, historial y salida máxima cambian el cálculo.

Si el proveedor entrega Neurons, se guarda ese recibo; si entrega tokens, se estima con la tarifa. Si no hay uso, queda la reserva. **No se libera el presupuesto reservado**, aunque el uso sea menor o falle el proveedor: no conocemos con certeza todo lo facturable. Si el observado supera la reserva, se agrega la diferencia y se bloquean nuevas llamadas al alcanzar el presupuesto. Es una protección estimada de Flujario, no un límite de facturación de toda la cuenta.

- Cinco intentos por usuario/día argentino; reinicio 00:00 Argentina = 03:00 UTC.
- Presupuesto global por día UTC; reinicio 00:00 UTC = 21:00 Argentina.
- En los dos minutos anteriores al cambio UTC se reserva también en el día siguiente, para cubrir una llamada que cruce el límite.
- Veinte envíos por usuario/minuto, incluidas estadísticas; cinco segundos entre nuevas inferencias y una reserva en curso por usuario durante sesenta segundos.
- Pregunta de hasta 800 caracteres, dos antecedentes de 400 cada uno y JSON de hasta 8 KiB.
- Espera de 30 segundos, sin reintentos automáticos. Timeout conserva consumo: el proveedor puede seguir procesando.
- UUID y hash por envío. Repetirlo recupera su plan sin otra inferencia; otro contenido con esa clave devuelve 409. Conserva su fecha argentina original al recalcular con los registros actuales.
- Cupo agotado impide nuevas inferencias en el servidor, manteniendo las estadísticas y el mensaje solicitado. El campo sigue editable para redactar o escribir una consulta estadística reconocida.

No se activó un plan pago. También aplican cuotas Workers/D1 y consumo de otras apps; 8.000 de presupuesto local no reserva los 10.000 de la cuenta ni garantiza gratuidad a cualquier volumen. Las tablas de uso conservan su historial: antes de escalar, acordar retención/limpieza sin reabrir reintentos válidos.

## Interfaz y recurso gráfico

Se monta una instancia junto a `Dashboard` cuando la identidad de Clerk coincide con la del loader, separada por dueño. Cerrar, minimizar y navegar conserva conversación/borrador en React; **recargar los borra**. Salir o cambiar de identidad desmonta esa instancia. No hay historial en localStorage ni tabla de conversaciones.

El usuario pidió hacer reconocible la entrada: **«Flujario AI / Abrir chat»** queda visible, con ícono de conversación. Texto y mascota forman un solo botón, con teclado, foco y nombre accesible. Esto reemplaza el tooltip como única señal. La etiqueta se oculta mientras la ventana está abierta.

Ventana no modal, sin overlay ni encierro de foco; Escape cierra y devuelve el foco al botón. Compacta de hasta 390 × 580 px y ampliada de hasta 860 × 820 px, siempre limitadas al espacio visible. El botón «Ampliar / Reducir» conserva la instancia, el borrador y los mensajes sin reenviarlos. Avatar de 90 px en escritorio y 65 px en móvil. Márgenes de 24 px (12 px al ampliar en móvil), áreas seguras y visualViewport; con poca altura oculta el lanzador, compacta el encabezado y conserva contenido desplazable y entrada. Movimiento reducido anula flotación/transiciones.

El campo permite escribir aun sin IA habilitada y mientras se procesa un envío; el botón y Enter impiden otro envío simultáneo. Enter envía y Shift+Enter agrega una línea. Las cinco preguntas sugeridas se reconocen por coincidencia normalizada exacta en el dominio compartido; otras formulaciones requieren IA. El borrador sólo se limpia después de una respuesta exitosa si no fue modificado durante la espera.

«Qué preguntas te puedo hacer», «qué puedo preguntar» y otras formulaciones acotadas de ayuda se responden en el cliente sin modelo ni endpoint privado. La ayuda enumera las cinco consultas, permite ejecutarlas y distingue las capacidades que requieren IA habilitada. No simula una respuesta del proveedor. Un error definitivo retira la comprobación del envío anterior; la clave se conserva sólo ante un resultado incierto. Sin configuración tampoco se muestra una renovación de cupo que pueda sugerir activación automática.

La vista previa DEV permite escribir esas estadísticas ficticias identificadas, sin endpoint privado ni modelo. Una pregunta libre muestra un aviso y conserva el borrador; nunca envía el texto a una cuenta real o al proveedor. No hay chat en portada/autenticación. Informes con fechas, moneda, origen, notas, hasta 60 filas con aviso y 8 barras; consultas acotadas de más de 5.000 movimientos/vencimientos piden un período menor, sin dar un total truncado.

Activo: `public/images/flujario-avatar.webp`, RGBA de 384 × 384 y 69.910 bytes. Se preservaron personaje y colores y se quitó el fondo con Imagegen. [Procedencia, prompt y conversión](../assets/flujario-ai/README.md).

## Seguridad y persistencia

`GET /app/asistente/datos` devuelve cupo; `POST` devuelve informe. **Ambos verifican sesión**, independientemente del layout. POST exige mismo origen y cuerpo acotado. Esquemas estrictos rechazan `userId`, SQL, documentos y campos extra. Lecturas y reintentos filtran por el dueño verificado; no se exponen números globales del presupuesto. Respuestas privadas `private, no-store`.

El modelo sólo elige operaciones de lectura y parámetros validados. No hay herramientas de escritura, SQL, borrado, documentos ni navegación. Prompt injection no amplía esas capacidades. No se muestra HTML generado; React escapa descripciones. Una mala interpretación sigue siendo posible; nunca autoriza operaciones ni inventa importes.

No se guardan preguntas, historial, documentos ni respuestas financieras en tablas de consumo/logs del asistente. Sí hashes, fechas, estado, modelo, presupuesto, uso y **plan validado**, que puede incluir un término de comercio escrito por la persona. Revisar acceso/retención de esa metadata antes de publicar. El asistente no proporciona asesoramiento.

Migración aditiva **`drizzle/0009_past_donald_blake.sql`**:

| Tabla             | Contenido                                         |
| ----------------- | ------------------------------------------------- |
| `ai_daily_usage`  | Intentos por dueño y fecha argentina.             |
| `ai_global_usage` | Presupuesto reservado por día UTC.                |
| `ai_rate_windows` | Control por dueño/minuto.                         |
| `ai_requests`     | Reintento, plan validado, estado y uso observado. |

Triggers comprueban e incrementan contadores en la misma escritura. Liquidación mediante batch D1 sólo sobre estado `reserved`; dos pestañas no aprueban el mismo último cupo. La migración **ya está aplicada localmente**, con copia consistente en `.wrangler/backups/`; trece tablas anteriores conservaron sus huellas y claves foráneas válidas. Para D1 remota futura queda pendiente aplicar las migraciones.

## Archivos creados y modificados

| Archivo o grupo                                                                          | Responsabilidad                                        |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `app/domain/assistant.ts`, `assistant-analysis.ts`                                       | Contratos, períodos, porcentajes y reportes exactos.   |
| `app/db/assistant.server.ts`                                                             | Lecturas por dueño, reservas y liquidación.            |
| `app/services/assistant-config.server.ts`, `assistant.server.ts`                         | Modelo/tarifas, días AR/UTC, interpretación validada.  |
| `app/routes/assistant-data.ts`                                                           | Endpoint privado.                                      |
| `app/components/assistant/floating-chatbot.tsx`, `chat-parts.tsx`, `financial-chart.tsx` | Chat, transporte, memoria, entrada, tablas y gráficos. |
| `app/assistant.css`                                                                      | Estilos responsive de ambos temas.                     |
| `app/db/schema.ts`, `drizzle/0009*`, `drizzle/meta/*`                                    | Tablas, restricciones, migración y metadata.           |
| `app/env.ts`, `wrangler.jsonc`                                                           | Binding AI y configuración.                            |
| `app/routes.ts`, `app/routes/workspace.tsx`, `app/routes/preview.tsx`                    | Ruta y montaje único.                                  |
| `tests/assistant-*.test.ts`, `qa/verificar-asistente-d1.mjs`                             | Regresiones y runtime D1 real con proveedor ficticio.  |
| `qa/auditar-asistente-local.mjs`                                                         | Respaldo y comparación privada de datos.               |
| `assets/flujario-ai/*`, `tools/prepare-avatar.py`, `public/images/flujario-avatar.webp`  | Fuente, prompt y activo web.                           |

También se actualizaron README y docs de decisiones, diseño, proveedores y verificación. Sin nuevas dependencias de ejecución del chat.

## Configurar Cloudflare y desplegar más adelante

No se desplegó ni se crearon recursos remotos. Antes de ejecutar comandos remotos:

1. Usar cuenta Cloudflare con Workers AI en su asignación gratuita y revisar consumo compartido. El binding `AI` autentica; no se necesita clave IA en el navegador.
2. Configurar `database_id` real: el repositorio conserva uno de ejemplo. Comprobar proyecto/base de destino.
3. Configurar Clerk para el dominio, clave pública de compilación y secreto del servidor según README. No publicar `.env`/`.dev.vars` como activos.
4. Revisar límites, privacidad y permisos de terceros del producto antes de publicarlo.

Comandos, **cuando se decida desplegar**, con esa configuración lista:

```powershell
npx wrangler login
npm run db:migrate:remote
npm run deploy
```

`deploy` ejecuta `check`. Luego verificar con dos sesiones reales: aislamiento, estadística sin IA, pregunta libre, interpretación, contador y fallos. Contrastar el consumo D1 con el dashboard de Cloudflare antes de ampliar usuarios.

Local conserva `AI_ALLOW_LOCAL=false` y Vite deshabilita bindings remotos y omite `AI` sólo durante desarrollo. Workers AI no tiene simulador local: `remote:false` en el binding no permite simularlo y podía impedir iniciar Vite. La compilación conserva el binding con `remote:true` para producción. Estadísticas privadas funcionan con Clerk/D1 local; la vista previa sólo usa ejemplos.

Para probar desde el panel local, usar `FLUJARIO_LOCAL_AI=true` en el entorno del proceso de Vite y `AI_ALLOW_LOCAL=true` en `.env.local`, con la cuenta Cloudflare autenticada. El primero conecta el binding remoto y el segundo permite al backend usarlo en desarrollo. Entrar al panel con una sesión de Flujario. Las preguntas libres consumen parte de la asignación de Cloudflare. [Límites de Workers AI](https://developers.cloudflare.com/workers-ai/platform/limits/). [API del plugin Vite](https://developers.cloudflare.com/workers/vite-plugin/reference/api/).

## Verificar y aprender

```powershell
npm run check
npm run format:check
node qa/verificar-asistente-d1.mjs
node qa/auditar-asistente-local.mjs
```

La prueba D1 usa runtime real y proveedor de IA ficticio explícito: verifica cuotas/SQL sin Neurons, no la precisión del modelo. La auditoría final compara con el respaldo anterior; no volver a usar `--before` por rutina porque sobrescribe esa referencia.

Para repetir manualmente la prueba con el modelo real, ejecutar `node qa/probar-asistente-real.mjs --confirmar-consumo` con una sesión de Wrangler. Usa una pregunta genérica y una D1 temporal con movimientos ficticios. Verifica fechas, totales, aislamiento y un reintento con la misma clave. Cada ejecución hace una inferencia.

El 25/11 se corrigió el caso donde el modelo elegía un mes entero antes de que terminara. El servidor valida el período antes de guardar el plan y acota al día de la consulta los intervalos de movimientos que empezaron y se extienden al futuro. Una consulta de movimientos completamente futura explica que todavía no hay registros. Las operaciones de vencimientos, recurrentes y cuotas admiten fechas futuras según su regla existente. Al recuperar un plan guardado se usa el día original. La generación del informe ocurre después de registrar la interpretación, de modo que un problema de cálculo o lectura no se informa como un fallo del proveedor.

La variante `node qa/probar-asistente-real.mjs --confirmar-consumo --historial-ingresos` prueba «analiza mis ingresos completos». La ejecución real devolvió evolución mensual de todos los ingresos hasta la fecha y reprodujo el informe con la misma clave sin una segunda inferencia.

Regresiones: importes/monedas, históricos, tarjetas y créditos, pago tardío con monto diferente, bisiestos/cambio de mes, porcentajes con base cero, autorización/origen, concurrencia, reintentos, AR/UTC, recibos y prompt sin registros financieros. Revisión visual: ambos temas, navegación, minimizar/cerrar/Escape, teclado y 320 px con altura normal y 360 px. No equivale a probar un teclado físico de teléfono ni login/inferencia remotos. No hay comando ESLint; se comprueban formato, tipos, comportamiento y build.

La decisión central de ingeniería agéntica es limitar la autoridad: **el modelo propone una intención; el programa valida, autoriza y calcula**. «Cinco preguntas» se demuestra con solicitudes simultáneas; «no duplicar» con un envío repetido; «sólo mis datos» con dos dueños. La captura prueba interacción, no seguridad ni precisión financiera. Lo todavía no probado queda señalado.
