# Mascota de Flujario AI

Referencia: imagen oficial aportada por el usuario el 24/11/2026. Autorizó usarla, modificarla y quitar el fondo. Se conservaron personaje completo, pose, silueta, flecha y colores; se retiraron fondo oscuro, iluminación ambiental y elipse del piso mediante Imagegen.

Fuente elegida: `avatar-source.png`, PNG RGBA generado desde esa referencia. Activo web: `../../public/images/flujario-avatar.webp`, WebP lossless de 384 × 384, 69.910 bytes y alfa real. Es imagen estática, no un pet o sprites.

## Prompt de edición

> Edit target: the attached official Flujario mascot. Create a production-ready transparent-background cutout for a website chatbot launcher. Preserve this exact character, full body, pose, proportions, white rounded financial chart head, green rising arrow wrapping over its head, green bars, black outlines, confident friendly expression, white shirt, black tie with green bars, pants and sneakers. Preserve original colors and polished cartoon shading. Remove ONLY the entire dark background, green ambient haze, floor ellipse and floor shadow; outside the actual character must be fully transparent alpha, including between arms and body and between legs. Keep the physical green outlined edge and green arrow intact; no opaque black square or background glow. Center the complete character with small balanced transparent padding, do not crop shoes or arrow tip. One mascot, no text, no extra objects, no circular container. Deliver genuinely transparent PNG.

## Conversión reproducible

```powershell
python tools/prepare-avatar.py assets/flujario-ai/avatar-source.png public/images/flujario-avatar.webp
```

Requiere Pillow sólo para trabajar localmente con el recurso; no es dependencia de la web. Comprueba transparencia y convierte/redimensiona mecánicamente, sin otra edición. La flotación de 5 px se hace por CSS y respeta movimiento reducido.
