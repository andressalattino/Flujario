# Trabajo en Flujario

- Idioma de comunicación y producto: español de Argentina.
- El usuario quiere aprender: explicar el motivo de las decisiones y consultar antes de implementar decisiones nuevas de producto. Leer `docs/DECISIONES.md` para no volver a consultar lo ya aprobado.
- La participación también es técnica: antes de cambios relevantes de arquitectura, modelo de datos o seguridad, explicar alternativas, consecuencias y criterios de prueba, y acordar la decisión con el usuario. Usar Flujario para enseñar ingeniería agéntica mediante requisitos verificables, contexto acotado, límites de herramientas y revisión de evidencia; no limitar la explicación a la apariencia o al comportamiento del producto.
- No delegar en subagentes salvo solicitud explícita del usuario.
- React Router framework + TypeScript + Tailwind + shadcn/ui + Drizzle + D1 + Clerk. Mantener este stack.
- No usar float para importes ni sumar monedas distintas. Mantener separación entre transferencias, ingresos, gastos y obligaciones.
- Verificar sesión en cada loader/action privado y filtrar datos por el dueño verificado en el servidor. La vista previa local no autoriza acceso al backend.
- No inventar cotizaciones o noticias ni activar proveedores sin acordarlos. No exponer claves secretas.
- Aplicar pruebas significativas de dinero, recurrencias, cambios de mes, bisiestos, duplicación, autorización y saldos. Ejecutar `npm run check` antes de entregar cambios funcionales.
- El diseño sigue `docs/DISENO.md`: títulos livianos y base Ventriloc, actualizada con las paletas del usuario (durazno/sienna en claro, cobre en oscuro), composición asimétrica y profundidad contenida. Tema Claro/Oscuro/Sistema para toda la web, guardado en el navegador. No inventar tendencias ni ganancias para dar actividad visual.
- No desplegar ni crear recursos remotos como parte de un pedido que sólo solicita la base local del proyecto.
