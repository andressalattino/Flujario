# Viabilidad del módulo de noticias — 18/11/2026

Nota posterior: el usuario aprobó implementar y corrigió la propuesta de favoritos y retención. El comportamiento vigente está en `docs/DECISIONES.md` y `docs/PROVEEDORES.md`: diarios favoritos para Resumen, artículos guardados aparte, limpieza a los quince días y selección semanal fija los lunes a las 10:00. Este informe conserva la evaluación técnica y de permisos previa; sus propuestas no reemplazan las decisiones finales.

Evaluación previa a implementar, solicitada por el usuario. Se ejecutó `qa/verificar-rss.ps1` contra las URLs oficiales indicadas, con un identificador propio de Flujario, sin scraping HTML, sin evasión de restricciones y sin descargar fotografías. No se activaron fuentes, tareas o recursos remotos. Los resultados técnicos están en `qa/rss-viabilidad.json`.

## Comprobación de los feeds

Todos respondieron HTTP 200, XML válido y entradas de los últimos siete días. La entrada más reciente de cada uno tenía fecha del 18/11/2026. Se comprobaron dos veces; la siguiente tabla corresponde a la segunda consulta, alrededor de las 15:59 de Argentina. La cantidad de entradas de un RSS es variable.

| Fuente                                                                                   | Entradas | Última publicación, UTC | Observación                                                                                                                                   |
| ---------------------------------------------------------------------------------------- | -------: | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [iProfesional](https://www.iprofesional.com/rss/economia)                                |       22 | 2026-11-18 18:40        | Incluye enlaces a Economía, Finanzas y otras secciones. Sus categorías son etiquetas operativas; no se deben presentar como temas económicos. |
| [El Economista](https://eleconomista.com.ar/economia/feed/)                              |       20 | 2026-11-18 18:03        | Incluye la categoría Economía.                                                                                                                |
| [Página/12](https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/economia/notas/) |       25 | 2026-11-18 15:08        | Feed específico de Economía, sin categorías individuales en la muestra.                                                                       |
| [Infobae](https://www.infobae.com/arc/outboundfeeds/rss/)                                |      100 | 2026-11-18 18:57        | Feed general, sin categorías en la muestra; sólo una URL pertenecía a `/economia/`.                                                           |
| [Bloomberg, Economía](https://www.bloomberg.com/feeds/economics/news.rss)                |       20 | 2026-11-18 18:16        | Feed específico, sin categorías individuales en la muestra.                                                                                   |
| [Bloomberg, alternativa](https://feeds.bloomberg.com/news.rss)                           |       20 | 2026-11-18 18:45        | Redirige a `https://www.bloomberg.com/feeds/news.rss`. Es general: no equivale al feed específico de Economía.                                |

No hubo fechas ausentes, inválidas o futuras en esas muestras. La herramienta web inicialmente rechazó varios feeds por tipo de contenido XML; la comprobación directa desde el equipo los procesó correctamente. Ese rechazo no se registró como un fallo de los diarios. Esta revisión no comprueba aún la disponibilidad desde una ejecución real en Cloudflare Workers.

Los elementos RSS inspeccionados no proporcionan un ranking de relevancia editorial. La propuesta verificable es ordenar por fecha, después de seleccionar contenido económico. Se deben mostrar hasta cinco entradas elegibles por medio, sin rellenar con noticias de otras temáticas para alcanzar una cantidad fija. En el feed general de Infobae se puede usar la ruta oficial `/economia/` como criterio explícito, sujeto a revisión si el proveedor cambia sus URLs. No hace falta leer el HTML de sus artículos para ese filtro.

El feed general alternativo de Bloomberg necesita una verificación temática propia antes de servir como reemplazo automático. Su disponibilidad técnica no confirma que todas sus entradas sean de Economía ni que estén en español. No se propone traducir o generar resúmenes automáticamente en esta base.

## Permisos de uso público

El acceso técnico al RSS no se registró como licencia para redistribuirlo. Tampoco una imagen presente en el XML autoriza a mostrarla o almacenarla.

| Fuente        | Resultado de la revisión                                                                                                                                                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| iProfesional  | La [página oficial de contacto](https://www.iprofesional.com/contacto) reserva derechos y permite consultar al medio. No se encontró una licencia pública específica de RSS compatible con la integración propuesta. La política de privacidad no equivale a esa licencia.                                         |
| El Economista | Los [términos indexados](https://eleconomista.com.ar/terminos-condiciones) restringen reproducción y explotación de contenidos. La apertura directa de esa página respondió 403; queda pendiente verificar una versión accesible actual y obtener una autorización aplicable. No se intentó evadir la restricción. |
| Página/12     | Sus [términos, punto 26](https://www.pagina12.com.ar/terminos-y-condiciones/) reservan derechos sobre materiales y requieren autorización expresa para reproducción y distribución. No se identificó una excepción específica que autorice esta integración.                                                       |
| Infobae       | Sus [términos, sección 3.4](https://www.infobae.com/terminos-y-condiciones/) exigen autorización expresa por escrito para reutilizar o comunicar sus contenidos. La sección 3.5 indica `contacto@infobae.com` para consultas de licencia.                                                                          |
| Bloomberg     | [Condiciones](https://www.bloomberg.com/notices/tos/): uso personal; publicación pendiente de permiso.                                                                                                                                                                                                             |

Resultado: no hay una autorización de publicación pública confirmada para estas cinco integraciones. Priorizar titulares y enlaces minimiza el contenido reproducido, pero no reemplaza esa verificación. Tampoco estar detrás de Clerk convierte automáticamente la exhibición a usuarios de Flujario en uso personal autorizado. Las fotografías, resúmenes, traducciones y logotipos se revisan por separado según el alcance que permita cada medio.

## Propuesta funcional para acordar

- Noticias: mostrar hasta cinco noticias económicas recientes por medio habilitado, con filtro de diario/tema, fecha real, medio y enlace original. No etiquetarlas como «las más relevantes» sin un criterio editorial verificable.
- Resumen inicial: una noticia reciente por cada medio habilitado y con contenido disponible, hasta cinco en total.
- Favoritos: el usuario guarda artículos desde Noticias y selecciona cuáles quiere ver en su Resumen. Hay que acordar qué mostrar cuando guarda menos de cinco y si desea un límite de favoritos o sólo un límite de elementos visibles.
- Temas diario/semanal: siguen siendo una decisión pendiente de integración con la renovación cada treinta minutos. La consulta de RSS y la selección de una edición son tareas separadas; se pueden actualizar los metadatos sin alterar los horarios de ediciones ya aprobados.
- Diseño: la imagen aportada fija tarjetas con jerarquía editorial, superficies oscuras, acento champagne, filtros breves, origen/enlace y un botón para guardar. Se puede reproducir el patrón con los tokens de los dos temas. Las fotos se sustituyen por elementos propios hasta contar con permiso suficiente.

## Arquitectura posible, sin implementar todavía

Un Worker consulta los feeds autorizados cada treinta minutos, valida XML y metadatos, conserva noticias normalizadas en D1 y registra errores por medio. El frontend lee esa copia y no hace consultas a los RSS por visitante. Los datos generales de noticias se comparten; los favoritos pertenecen al usuario verificado por Clerk y se filtran por dueño en cada operación.

Esto requiere ampliar la tabla actual de ediciones con un almacenamiento de artículos y otro de favoritos, mediante una migración aditiva. Antes de hacerlo se debe acordar el comportamiento de favoritos, la combinación con las ediciones y la política de retención. No se cambiaron `news_editions`, los saldos, los vencimientos ni los cron existentes durante esta evaluación.

La publicación necesita comprobar primero la ejecución real de RSS desde Workers, los límites de las fuentes y los permisos. Los costes dependen de escrituras nuevas, lecturas, retención y tráfico; no se garantizó gratuidad ni una cuota de licencia sin oferta del proveedor.

## Caminos posibles

1. **Implementar la base y habilitar medios con permiso confirmado.** Mantiene la estructura solicitada y permite dar de alta cada fuente por separado, con titulares/enlaces y elementos visuales propios al principio.
2. **Acuerdos directos de sindicación.** Pedir a cada medio autorización para el alcance concreto: titulares, almacenamiento, enlaces, frecuencia de consulta, descripción, imágenes y uso comercial. Puede incluir coste. [Bloomberg Media Distribution](https://www.bloombergmedia.com/about/) ofrece distribución de contenido a otras empresas; no se verificó una oferta ni un precio para Flujario.
3. **Un proveedor con licencia de redistribución.** Verificar contrato, cobertura de los cinco medios, idioma, metadatos e imágenes antes de contratar; una API accesible o un plan de desarrollo no acreditan esos derechos.
4. **Directorio y selección editorial propia.** Ofrecer acceso a las secciones de Economía y enlaces elegidos manualmente, con etiquetas y elementos visuales propios, mientras se resuelven autorizaciones. No promete las cinco noticias automáticas de cada medio.

Recomendación: avanzar primero con el diseño y la infraestructura preparados para fuentes habilitadas individualmente, sin publicar fotos o contenido de terceros con permisos no confirmados. El usuario pidió evaluar viabilidad antes de implementar, por lo que esta propuesta no activa el módulo.
