# Recorrer el proyecto para poder explicarlo

## 1. Seguir un gasto de principio a fin

Abrí `app/components/dashboard.tsx`. El formulario envía descripción, moneda, importe, categoría, fecha e identificador. No envía un usuario.

Seguí en `app/routes/workspace.tsx`, función `action`:

1. `requireUser` comprueba la sesión en el servidor.
2. `requireSameOrigin` verifica el origen del envío.
3. `readBoundedForm` limita el cuerpo.
4. `operationSchema` valida y convierte el importe a centavos.
5. `performOperation` guarda el registro con el dueño verificado.
6. React Router vuelve a ejecutar el loader y la pantalla recibe datos actualizados.

**Cómo explicarlo:** «El navegador pide guardar, pero el servidor decide si se puede y qué datos son válidos».

## 2. Ver por qué el dinero es entero

Abrí `app/domain/money.ts` y `tests/money.test.ts`. Probá seguir `1.234,56`: se quitan los separadores de miles, se separan pesos y centavos como texto y se calcula con enteros. Nunca se crea primero el decimal `1234.56` para después multiplicarlo.

**Cómo explicarlo:** «Guardamos la unidad más pequeña de cada moneda; 123.456 centavos representa exactamente 1.234,56».

La división usada para la anchura visual de una barra no calcula dinero: sólo convierte una proporción a píxeles. Los totales que alimentan esa barra ya se calcularon en centavos.

## 3. Entender saldo versus proyección

Abrí `app/domain/finance.ts`. El saldo parte del saldo inicial y de los movimientos registrados. La proyección resta los pagos pendientes hasta fin de mes, incluidos los vencidos. No anticipa ingresos no registrados ni realiza cambios de moneda.

**Ejemplo:** saldo ARS 100.000; impuesto pendiente ARS 20.000. El saldo sigue siendo 100.000 y la proyección es 80.000. Al confirmar el pago aparece un gasto de 20.000: el saldo pasa a 80.000 y ese vencimiento deja de estar pendiente.

## 4. Entender una recurrencia

Abrí `app/domain/dates.ts`. Cada fecha se calcula desde el ancla original. Si calculáramos marzo sumando un mes a febrero 28, perderíamos el día 31. Por eso marzo se calcula como «enero 31 más dos meses».

La tabla `payment_rules` responde «qué compromiso se repite». `payment_occurrences` responde «cuándo vence cada instancia y cuánto se espera pagar». Un gasto asociado responde «cuándo se pagó».

El importe futuro de la regla puede ser `null`: se generará un pendiente sin monto. Cada vencimiento guarda además si su importe es propio (`manual`) o heredado (`inherited`). Esa procedencia permite cambiar una sugerencia sin reemplazar los meses que ya ajustaste. `entries.amountCents` guarda siempre el monto real que confirmaste al pagar.

Si falta un importe pendiente, la proyección aparece incompleta. El saldo real sí se puede calcular porque sólo usa movimientos confirmados.

## 5. Entender dos usuarios

Abrí `tests/repository.test.ts`. Ana y Bea tienen cuentas separadas. La prueba intenta pagar un vencimiento de Ana como Bea y espera un rechazo. También intenta cruzar cuentas mediante SQL y comprueba que falla.

**Cómo explicarlo:** «Autenticación identifica quién soy; autorización comprueba qué datos me pertenecen».

## 6. Entender una actualización programada

Abrí `workers/app.ts`. Cloudflare ejecuta `scheduled` aunque nadie tenga abierta la web. `services/news.server.ts` pide una edición al proveedor, valida su estructura y sólo entonces la publica. Si falla, conserva la edición anterior.

**Cómo explicarlo:** «El horario dispara una tarea del servidor; no depende de que un usuario abra su navegador a las diez».

## 7. Modificar la interfaz sin romper reglas

Abrí `components/workspace/overview.tsx` para el resumen y `app/app.css` para los tokens. Cambiar el espacio entre elementos no debería requerir tocar cómo se suma el dinero. Los botones, campos y diálogos reutilizables viven en `components/ui/`.

En celular, las tablas se presentan como tarjetas con las acciones visibles. En escritorio conservan columnas alineadas para comparar importes.

## 8. Seguir la lista mensual y los avisos

`app/domain/payments.ts` selecciona los vencimientos del mes elegido; no crea nuevas obligaciones al cambiar de pantalla. La recurrencia ya produjo cada vencimiento, con su propio identificador. Por eso pagar noviembre no afecta diciembre.

El selector guarda `mes=AAAA-MM` en la URL y comprueba los límites respecto del mes actual. “Meses anteriores” es una vista de recuperación de pendientes, para que una deuda vieja no desaparezca al salir del rango de las flechas.

La preferencia de silenciar un aviso vive en `dismissed_payment_notices`. El estado pagado sigue dependiendo únicamente de un gasto registrado en `entries`. Es la misma idea de separar responsabilidades: un aviso es comunicación, un pago cambia el registro financiero.

“Recordar más tarde” usa estado de React durante la visita actual. “No volver a mostrar” necesita persistencia por usuario para funcionar también al volver o desde otro dispositivo. El servidor comprueba el propietario y la lista antes de guardar esa preferencia.

## Propuesta para nuestra próxima revisión

Practicar el flujo de trabajo de [APRENDER-CON-AGENTES.md](APRENDER-CON-AGENTES.md): definir un error posible, revisar una alternativa técnica y comprobar si una prueba detecta ese error. Consultamos antes tanto las decisiones nuevas de producto como las técnicas relevantes.

## 9. Diferenciar un widget de una API

Un widget es una interfaz del proveedor dentro de nuestra página. Una API entrega datos que nuestro programa puede validar, conservar y utilizar. Ver un precio en TradingView no autoriza ni habilita técnicamente a extraerlo para calcular ganancias en Flujario.

`app/domain/tradingview-widget.ts` limita la configuración a símbolos públicos, vista y tema. `MarketWidget` comparte la carga del módulo, sigue el tema y retira la instancia anterior al cambiar la selección. El código oficial se ejecuta en la página por decisión explícita del usuario; un esquema de configuración estricto evita enviar información por accidente, pero no aísla ese código externo del documento.

Para una inversión real, el valor a una fecha se obtiene de cantidad adquirida por precio de valoración; la diferencia con el costo total permite calcular el resultado, antes de definir dividendos, ventas e impuestos. La cantidad puede ser fraccionaria y requiere decimales exactos; el dinero sigue usando unidades mínimas enteras. Monto y fecha sin precio o cantidad sólo permitirían una simulación si otra fuente autorizada aporta los precios históricos. Ese modelo todavía no está implementado.

En ingeniería agéntica separamos el requisito de su evidencia: que un módulo cargue no demuestra que tenga cotizaciones, y que una tabla se vea no demuestra que sus precios estén disponibles para nuestro backend. La revisión combina tipos/pruebas de nuestra configuración y selección con observación real del widget, sin leer APIs internas ni inventar datos faltantes.
