# Revisión de MDZ Online — 18/11/2026

## Resultado técnico

Se consultó por HTTPS el RSS histórico oficial indicado por el usuario:

<https://www.mdzol.com/files/rss/mediamzaeconomia.xml>

La petición directa desde el equipo respondió HTTP 404, sin contenido, sin tipo de contenido y sin redirección. La herramienta de navegación también informó 404. No existe XML en esa respuesta para validar ni fechas de noticias para comprobar actualidad. Un error de DNS de la primera consulta dentro del entorno restringido no se interpretó como un fallo del proveedor: se repitió la comprobación con acceso a red y entonces se obtuvo el 404.

Se buscaron referencias a RSS en el dominio oficial. La publicación «Qué es RSS» de 2009 remite al sistema histórico; no se pudo recuperar su página completa durante esta revisión. No se encontró y verificó un feed alternativo oficial vigente. Esto no prueba que MDZ no tenga uno privado o sin documentación pública.

La [sección de Economía](https://www.mdzol.com/economia) sí muestra publicaciones recientes. Su disponibilidad no demuestra que el RSS funcione. No se extrajeron sus notas como sustituto del feed ni se implementó scraping HTML, proxies o evasión de bloqueos.

Resultado para la fuente: **pendiente**, con identificador `mdz`, nombre «MDZ Online» y categoría «Economía». El resultado de la comprobación está en `qa/mdz-feed-verificacion.json`.

## Condiciones de uso

Se revisaron los [términos oficiales](https://www.mdzol.com/p/terminos-y-condiciones), especialmente «Restricciones de uso» y «Propiedad intelectual». Restringen el uso fuera del ámbito estrictamente personal y la distribución de contenidos. No se encontró en ellos una autorización específica para sindicar públicamente titulares, descripciones o imágenes en Flujario. El acceso gratuito o un enlace al original no se deben registrar como una licencia confirmada.

No se descargaron fotografías ni artículos completos. Antes de habilitar una integración pública hay que verificar tanto un feed vigente como una autorización compatible con el uso previsto. Mientras tanto se puede enlazar a la sección oficial, sin republicar sus noticias.

## Diferencia con el módulo solicitado

En este workspace todavía existe la base de Noticias mediante `NEWS_FEED_URL`, un contrato JSON editorial y ediciones diarias/semanales. No se encontraron las cinco fuentes RSS, el filtro de medios ni un cron de noticias cada 30 minutos. La tabla actual es `news_editions`; los horarios de noticias siguen siendo diarios y lunes a las 10:00 de Argentina. La revisión de MDZ no modificó esas tareas, las tablas ni otras fuentes.

El archivo adjunto describe un módulo completo nuevo. Se consultó al usuario si quiere implementarlo con las seis fuentes, preparar sólo MDZ sobre la base actual o indicar la carpeta/versión que ya lo contiene. Esta elección afecta arquitectura, tablas y programación de tareas, por lo que queda pendiente antes de cambiar ese alcance.

Actualización posterior del 18/11/2026: el usuario aprobó la implementación del módulo. MDZ quedó configurado como fuente pendiente en `app/data/news-sources.ts`, sin consultas automáticas ni artículos publicados, y aparece en el selector de medios. El 404 y el permiso no confirmado deben resolverse antes de habilitarlo. Las otras cinco fuentes tienen sus adaptadores independientes.
