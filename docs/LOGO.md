# Archivos del logo

Referencia: logo completo enviado por el usuario el 17/11/2026. Se usó la herramienta integrada de edición de imágenes para preparar fondo transparente y variantes de tema; no se usaron claves de API ni servicios nuevos para la aplicación.

- `public/images/flujario-wordmark-dark.png`: letras y emblema blancos, flecha y punto de la j dorados.
- `public/images/flujario-wordmark-light.png`: letras y emblema negros, flecha y punto de la j dorados.
- `public/favicon.svg`: emblema vectorial simplificado para tamaños chicos.
- `app/components/brand-artwork.tsx`: presentación compartida, sin duplicar el nombre como texto.

Resumen de los prompts: aislar el logo original, respetar composición y escritura «Flujario», quitar fondo y márgenes grandes, mantener la flecha y punto de la j dorados. Para claro, sustituir blanco y plata por negro, con formas lisas y bordes limpios. Se revisaron los archivos sobre los fondos de la web, además de la vista de imagen, para comprobar la transparencia real y la lectura a tamaño de uso.

Las variantes son PNG de alta resolución dentro de un recorte SVG de presentación; no son vectores trazados del logo. El `viewBox` sólo elimina el margen visible, sin modificar el bitmap. No se deben ampliar para impresión; para ese uso conviene obtener el archivo vectorial original del diseñador.
