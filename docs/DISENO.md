# Dirección de diseño

Base: referencia Ventriloc entregada por el usuario. La búsqueda en vivo de Refero devolvió NO_SUBSCRIPTION; se usaron la referencia y las guías de tipografía y accesibilidad incluidas en la skill. Se revisó también el patrón de exploración antes del registro de Mercury (https://mercury.com/); el usuario eligió explicaciones y capturas del panel para Flujario.

## Referencia fijada antes de implementar

Conservar blanco y superficies ash/ivory, títulos Inter Tight de peso 400 como sustituto permitido de PolySans, Inter para lectura, naranja #ff682c exclusivamente en acentos, CTA grafito con esquinas rectas, navegación en cápsula, paneles destacados asimétricos y ausencia de sombras. Los gráficos se construyen con datos y SVG; no hacen falta fotos ni imágenes generadas.

La composición se adapta a Flujario: portada explicativa y panel con navegación lateral, resumen primero y vencimientos en segundo plano. En móvil la navegación pasa a una fila desplazable con etiquetas completas.

| Decisión                                          | Fuente                   | Regla y motivo                                           |
| ------------------------------------------------- | ------------------------ | -------------------------------------------------------- |
| Títulos livianos, aire, monocromo                 | Referencia Ventriloc     | La jerarquía depende de tamaño y espacio; reduce ruido   |
| Naranja pequeño, CTA negro                        | Referencia Ventriloc     | El acento no cambia de rol ni se usa como relleno de CTA |
| Vista previa local y capturas etiquetadas         | Brief + patrón Mercury   | Permite explicar las pantallas sin mezclar datos reales  |
| Etiquetas completas y errores junto al formulario | Brief + craft-details.md | Público con poca experiencia tecnológica                 |
| Importes alineados y cifras tabulares             | typography.md            | Facilita comparar dinero sin depender del color          |
| Ingresos, gastos, transferencias separados        | Requisito del usuario    | Evita confundir mover dinero con gastarlo                |
| Sin indicadores de inversión inventados           | Brief financiero         | Precio sin proveedor aparece como no disponible          |

No usar degradados, estadísticas comerciales inventadas, fotografías decorativas, sombras ni titulares en negrita. Las subidas y bajadas se expresan con signo y texto además del acento. Foco visible y controles de al menos 40 px.

## Revisión de color aprobada por el usuario

Los controles y el panel de saldo pasan a grafito y gris perla (`#eef0f2`). El crema editorial permanece sólo en otras superficies de presentación; deja de identificar los ingresos o los controles activos.

El usuario pidió verde claro para ingresos y naranja claro para egresos. Se incorporan como colores semánticos, sin extenderlos a toda la marca:

| Uso            | Fondo              | Texto     | Motivo                                          |
| -------------- | ------------------ | --------- | ----------------------------------------------- |
| Ingreso        | `#e7f5ec`          | `#286447` | Fondo suave y cifras oscuras legibles           |
| Egreso         | `#fff0e8`          | `#964426` | Naranja cálido que acompaña el acento existente |
| Control neutro | `#eef0f2` o blanco | `#202020` | Selección clara sin crema                       |

La actualización es una excepción explícita a la paleta monocromática original solicitada por el usuario. Las etiquetas Ingreso/Gasto y los signos siguen visibles. En pantallas pequeñas, los dos indicadores se apilan para no partir importes entre líneas.

Después de probar el hover grafito, el usuario pidió un gris claro perceptible. Los botones y enlaces de navegación usan `#d4d8dd` al pasar el puntero, con texto oscuro `#202020` y borde `#a2a9b1` donde el control tiene borde. El cambio se centraliza con variables CSS para evitar diferencias entre pantallas. Los CTA conservan grafito en reposo; el foco visible y los estados deshabilitados mantienen su función.

## Logo entregado por el usuario

El usuario reemplazó el símbolo anterior por el logo completo «Flujario»: dos flechas circulares, tres barras ascendentes, una flecha de crecimiento dorada y el punto dorado de la j. Se prepararon versiones transparentes con la herramienta integrada de edición de imágenes: negro/dorado para claro y blanco/dorado para oscuro. El dorado se conserva en ambos temas; invertir todos los canales con CSS también invertiría ese color.

`BrandArtwork` centraliza las dos imágenes de 2172 × 724 px. Un `viewBox` recorta el margen transparente al mostrarlas y CSS elige la variante según el tema ya aplicado en el documento. El ancho y alto se reservan para evitar saltos al cargar. `Brand` agrega el enlace accesible «Flujario, inicio» en portada, panel, acceso y errores; las vistas HTML ilustrativas usan sólo la misma imagen, sin un enlace nuevo. Las imágenes son decorativas para no repetir el nombre al lector de pantalla. El favicon usa una simplificación vectorial del emblema sobre una base clara para seguir siendo legible en tamaños chicos.

## Monedas y referencias

El selector de saldo pasa a una lista con código y nombre para admitir diez monedas sin saturar la barra. Los códigos aparecen primero para seguir siendo visibles en los selectores angostos. Agregar moneda oculta las ya incorporadas, también en la validación del servidor.

El flujo de cambio conserva selección de origen/destino, revisión de importes y confirmación, investigado en la guía pública de Wise y adaptado a un registro manual. La referencia, su fecha y una edición de la tasa se distinguen del importe real recibido. El cambio usa grafito y signos, conservando verde/naranja exclusivamente para ingresos y gastos.

Cotizaciones usa paneles planos, títulos livianos y cifras alineadas; cada serie tiene compra, venta y fecha de la fuente. El comportamiento ante errores es parte del diseño: datos anteriores se identifican y una ausencia no se rellena con números inventados. En móvil los paneles y las acciones de formulario se apilan.

## Portada con aparición de bloques y vistas HTML

El usuario aportó [Clara Global](https://www.clara.com/global) como referencia para que los textos aparezcan al bajar. Se revisaron la portada y su sección de explicación: bloques de texto, entrada por opacidad y desplazamiento vertical, y una ilustración del producto junto a cada explicación. Clara aporta ese ritmo; Ventriloc sigue definiendo tipografía y paleta. La guía `motion.md` de Refero orienta duración, jerarquía y reducción de movimiento.

Los bloques entran una vez por visita, durante 480 ms y desde 24 px más abajo. `IntersectionObserver` observa la entrada al viewport, sin procesar cada evento de scroll. El contenido inicial está visible; sin JavaScript o sin soporte del observador sigue legible. La preferencia `prefers-reduced-motion` elimina el movimiento. Un bloque con foco de teclado se revela inmediatamente.

El usuario eligió reemplazar los JPEG por vistas HTML. `ProductPreview` reutiliza `BalancePanels`, `EntriesTable`, `MobilePayments` y `QuoteCards`: textos y SVG se dibujan a tamaño nativo y se adaptan al ancho, sin escalar una captura completa. Los controles ilustrados son `inert`; cada vista tiene descripción accesible y leyenda. Los datos públicos de ejemplo viven en `app/data/product-example.ts`, compartidos con la revisión local. No se importan loaders, actions, sesión ni operaciones D1 en la portada. Las referencias de divisas son una captura fechada, no precios en vivo.

## Revisión del Resumen: profundidad y dos temas

La nueva fuente visual son las dos paletas adjuntas por el usuario. La primera fija el acento durazno `#fbe1d1` y la tinta sienna `#5d2a1a`; la segunda aporta cobre `#cc9166` sobre superficies oscuras. Se conserva la tipografía liviana de Ventriloc. La guía de color de Refero aporta roles semánticos y contraste; el gris de lectura se ajusta para no depender de los grises claros de la imagen como texto pequeño sobre blanco.

La jerarquía usa un área amplia de saldos con una esquina más recta, un radar lateral más estrecho, una franja de divisas delimitada por líneas, noticias editoriales abiertas, vencimientos en lista lateral y actividad en filas a todo el ancho. La dimensión solicitada se expresa con diferencias de superficie, bordes y sombras contenidas. Esta revisión sustituye la prohibición inicial de sombras; no convierte todos los sectores en tarjetas iguales.

`themes.css` centraliza los colores claros/oscuros. Las superficies, bordes, controles y textos existentes pasan a variables, incluido el aspecto de Clerk. El símbolo del logo usa `currentColor` para conservar contraste sin perder su flecha naranja. Un script mínimo y fijo aplica la preferencia local antes de hidratar; el HTML raíz permite esa diferencia de atributo. No evalúa datos del usuario ni almacena información financiera. `ThemeProvider` comparte el selector y escucha cambios del sistema y de otras pestañas.

El área de saldos se reutiliza en la ilustración HTML pública, que sigue siendo inerte. La reproducción de noticias es optativa; no se usa una animación ni un gráfico ficticio para cubrir datos de mercado ausentes.

Los nombres de variables de apariencia de Clerk se comprobaron contra los tipos del SDK instalado y su [documentación de variables](https://clerk.com/docs/react/guides/customizing-clerk/appearance-prop/variables). El uso de variables CSS permite seguir el tema sin reconstruir colores por separado en cada componente.

## Actualidad financiera

Referencia principal: imagen entregada por el usuario con tarjetas sobre obsidiana, acento champagne, filtros breves y acción de guardar. Se adapta al sistema existente con tipografía liviana, superficies y bordes de los dos temas. La investigación Refero previa no estuvo disponible por falta de suscripción; se conserva la referencia del usuario y la guía de foco/accesibilidad de la skill, sin inventar una dirección paralela.

El módulo usa encabezados abiertos por diario y tarjetas para los artículos, con tres columnas en escritorio, dos en tablet y una en móvil. El botón con estrella prioriza un **medio** para Resumen; el marcador de cada tarjeta guarda un **artículo** para leer después. Sus etiquetas explican las dos funciones y los errores se muestran junto al control.

`news.css` limita el champagne a etiquetas y preferencias: `#896322` en claro y `#e1c58a` en oscuro. Conserva las superficies y hovers grises de Flujario. Por pedido del usuario, el lector local muestra las fotos incluidas en el RSS cuando su host está verificado. Si falta una foto o falla al cargar, se conserva la misma ilustración SVG propia, sin cifras ni datos aparentando ser reales, con la etiqueta FLUJARIO. Las fotos mantienen la proporción 2:1 y el recorte del contenedor actual. Usan carga diferida, decodificación asíncrona y política de referrer sin origen. Las transiciones son discretas y se anulan con reducción de movimiento. Esta modificación no cambia la composición de las tarjetas ni el carrusel de texto de Resumen.

## Mercados: Obsidiana & Champagne

Referencia fijada: el módulo Actualidad financiera existente y el pedido definitivo del usuario con dos botones de índice, estrellas doradas y un gráfico grande. Se reutilizan sus tonos champagne, las superficies de ambos temas y los hovers grises aprobados; no se introduce otra paleta. Refero no estuvo disponible por falta de suscripción durante la investigación previa, por lo que la referencia concreta sigue siendo la del usuario y el producto existente.

La composición combina una introducción abierta con el número de instrumentos y fecha de verificación, el panel destacado de favoritas con selector compacto y un único gráfico ancho, y el listado denso con buscador. Así la jerarquía no depende de repetir tarjetas iguales. Los dos botones shadcn/ui distinguen el índice activo con fondo champagne tenue, borde y `aria-pressed`. Las estrellas tienen nombre accesible con empresa/símbolo y estado, además del color.

En escritorio se usa tabla con encabezados y región desplazable por teclado. Hasta 1000 px pasa a una lista compacta que conserva empresa, símbolo, bolsa, estrella y estado sin datos; evita siete columnas estrechas en móvil. Los controles se apilan al reducir ancho. El gráfico usa el tema de Flujario y conserva los controles, avisos y atribución de TradingView. No se dibujan tendencias ilustrativas para sustituir cotizaciones ausentes. El verde/rojo queda reservado para rendimientos verificados futuros, no para colorear guiones sin datos.

## Imágenes del carrusel de Resumen y simplificación de Noticias

Por pedido del usuario, Resumen adopta la foto o ilustración 2:1 de las tarjetas de Actualidad financiera, encima del origen, fecha y título del artículo. Esa pieza compartida conserva el recorte, los tonos champagne y el reemplazo de Flujario; la imagen enlaza al original y tiene foco de teclado visible. La referencia fijada sigue siendo la tarjeta entregada por el usuario y su implementación existente, con la guía de foco de `craft-details.md` de Refero. No se incorpora otra dirección visual.

El selector de temas desaparece; permanecen Hoy, De la semana, Guardadas, título y diario. El carrusel conserva el selector diario/semanal y los controles existentes. En ancho pequeño, origen, preferencia y fecha pueden ocupar varias líneas sin desbordarse. Este cambio sustituye la decisión visual anterior de mantener el carrusel sólo con texto.

## Importación asistida y análisis

Referencia fijada: Movimientos para formularios/filas y Actualidad financiera para acentos editoriales contenidos; ambas forman parte del producto ya aprobado. Se conserva la guía de formularios, foco y estados de Refero; la investigación en vivo no estuvo disponible por falta de suscripción. No se abre otra dirección visual.

La entrada vive sobre la lista de Movimientos, con acciones «Importar resumen» y «Ver análisis». El espacio se abre en la página para poder revisar filas sin encerrar una tabla extensa en un modal. La secuencia separa lectura local, asignación de columnas y revisión: la persona ve los errores, puede editar o excluir cada fila y confirma explícitamente. Los duplicados son advertencias revisables, nunca borrados silenciosos.

Las filas se apilan en móvil; los selectores y campos usan los componentes existentes. Se mantienen fondos verdes para ingresos y naranja claro para egresos. El resultado del período se diferencia del saldo total mediante texto explícito. Los gráficos son optativos y representan exclusivamente importes confirmados; transferencias propias y cambios de moneda se excluyen. La revisión visual con navegador quedó pendiente por interrupción de Computer Use: no se declara validada la apariencia final.

## Tabla y radar oficiales de TradingView

Referencias fijadas: tabla compacta de Rava entregada por el usuario para comparar filas, el módulo Mercados aprobado y la demostración oficial Market Data de TradingView. Se conserva Obsidiana & Champagne, los controles shadcn/ui y los hovers grises. La investigación Refero anterior estuvo limitada por falta de suscripción; no se afirma haber consultado una biblioteca nueva.

La tabla oficial tiene dos vistas: Rendimiento y Precio y variación diaria. Su región de 570 px en escritorio y 460 px en móvil evita extender una lista de más de cien instrumentos por toda la página. El catálogo de estrellas se mantiene separado, plegable y con desplazamiento propio: los precios pertenecen al proveedor, las favoritas pertenecen a Flujario. No se copian datos desde el componente para construir filas propias. Resumen usa el componente oficial Market Summary con altura compacta de 310 px y una leyenda que distingue favoritas de símbolos iniciales. Las cinco tarjetas se recorren dentro del radar, con una indicación visible; muestran precio, moneda, variación diaria y minigráfico real del proveedor. Este formato evita que Market Data oculte la variación diaria por falta de ancho.

El tema del componente sigue Claro/Oscuro/Sistema y sus tokens públicos usan superficies, texto y acentos de Flujario. La atribución y los enlaces de TradingView permanecen visibles. Se explica el significado de Hoy, 1M y 1Y y la posibilidad de demora. Si falla la carga del módulo, se ofrece reintentar y abrir TradingView. La carga del módulo no se presenta como una validación independiente de sus cotizaciones.

En anchos inferiores a 760 px, la tabla mantiene todas sus columnas en una región con desplazamiento horizontal y foco de teclado, acompañada por una indicación visible. El radar usa desplazamiento vertical propio. La página completa conserva su ancho. Los cambios de búsqueda e índice mantienen la posición de lectura en Mercados.

## Flujario AI: mascota y botón explícito

Referencia fijada: panel Flujario existente, Obsidiana & Champagne, imagen oficial del usuario y especificaciones de chat flotante. La consulta Refero previa devolvió falta de suscripción; se usaron las guías de foco, formularios y movimiento junto a esas referencias, sin atribuir otra investigación visual.

La mascota conserva colores, pose y silueta, con transparencia real y sin círculo de fondo. Flotación suave de 5 px, brillo verde sólo en hover y movimiento reducido. El usuario precisó que el acceso debía parecer un botón: etiqueta permanente sobre superficie del tema, borde, sombra contenida, ícono de conversación y texto «Abrir chat», con identidad pequeña «Flujario AI». La etiqueta y la imagen son un único control. El hover gris y foco visible refuerzan esa señal; entenderla no depende de hover o animación. Mientras el chat está abierto se retira la etiqueta para no duplicar acciones.

Ventana no modal a la derecha, máximo 390 × 580 px según altura. Encabezado, conversación desplazable y entrada fija dentro del panel; no overlay. Los informes usan tipografía liviana, champagne para énfasis y datos exactos para gráficos. En móvil de 320 px se mantienen 24 px de margen real incluso con barra de scroll. Con poca altura se oculta el lanzador y el chat aprovecha el espacio disponible. La revisión visual comprobó los dos temas, apertura con teclado, Escape, navegación y conservación al minimizar/cerrar con datos de ejemplo claramente identificados.

El pedido posterior de ampliar/reducir agrega un control visible junto al cierre, sin cambiar la referencia Obsidiana & Champagne ni crear otra página. La misma ventana puede llegar a 860 × 820 px; las métricas aprovechan columnas y el texto de respuestas aumenta a 14 px. En móvil ampliado los márgenes pasan a 12 px y el encabezado ordena las acciones en una segunda línea; con altura reducida usa controles de 44 px en una sola línea y conserva sus nombres accesibles. El textarea de 16 px en móvil queda editable incluso sin IA, con disponibilidad informada por separado. Se mantienen foco, borrador y conversación al redimensionar. La guía `craft-details.md` de Refero fundamenta etiquetas, controles semánticos y estados de foco; la consulta en línea volvió a indicar suscripción no disponible. No se introduce una dirección visual nueva.

## Buscar favoritas junto a la selección

Referencia fijada: el panel Mis favoritas aprobado y los controles de búsqueda de Mercados; se conserva la guía de etiquetas, foco y formularios de Refero. La búsqueda directa ocupa una franja del mismo panel, con etiqueta visible y campo delimitado sobre la superficie del tema, antes de las favoritas y su gráfico. Los resultados son filas abiertas con nombre, símbolo/bolsa y estrella de 44 px; no requieren llegar hasta la tabla de cotizaciones ni abren otro modal. Texto de ayuda nombra el índice activo; el contador y estado vacío comunican las coincidencias. En móvil el campo usa texto de 16 px y las filas se ajustan sin desplazar horizontalmente la página.

## Portada: funcionalidades actuales e ilustraciones nítidas

Se mantiene como referencia la portada editorial existente y los paneles aprobados de Movimientos, Mercados y Flujario AI, siguiendo la guía de foco/formularios de Refero ya revisada. Sin cambio de paleta ni una nueva dirección visual. La composición alterna texto y figuras de distintos contenidos; conserva revelado al bajar y movimiento reducido.

Se incorporan vistas HTML inertes de revisión PDF/CSV/Excel, búsqueda y estrellas, estadística del asistente y una tarjeta ilustrativa de noticias. Comparten filas, cálculo del informe, gráficos y artwork con el panel, sin montar loaders, acciones o widgets remotos. Son ejemplos identificados, no capturas rasterizadas ni una demo que guarde cambios. El avatar transparente se reutiliza con tamaño explícito para que las reglas generales de imágenes de la portada no lo agranden. Los textos distinguen funciones disponibles, fuentes habilitadas y texto libre sujeto a configuración/cupo.

## Navegación móvil del panel

El logo y un botón «Menú» quedan en la primera fila. Hasta 640 px, el botón despliega debajo las mismas secciones de la barra lateral, con la sección activa marcada. Se usan las superficies y los estados de foco existentes, objetivos táctiles de 44 px y enlaces nativos. El botón anuncia si el menú está abierto. Elegir una sección o presionar Escape lo cierra y devuelve el foco al botón.

## Estadísticas del panel

Referencias fijadas antes de implementar: composición asimétrica de Resumen, etiquetas y barras de los gráficos de Movimientos, y guía de foco y controles táctiles de Refero. La búsqueda en vivo de estilos y pantallas indicó falta de suscripción. Se conservan los tokens del panel en ambos temas, el verde para ingresos y el naranja para egresos.

Los filtros y totales preceden a una tira de hallazgos con divisores. El gráfico de ingresos y egresos ocupa la columna principal, las categorías forman una lista de barras horizontales y el resultado usa una línea de cero para distinguir períodos positivos y negativos. En móvil se apilan las visualizaciones, con desplazamiento acotado a los gráficos y la tabla. La tabla desplegable da los importes exactos de cada período y los controles llevan etiquetas visibles y foco de teclado.
