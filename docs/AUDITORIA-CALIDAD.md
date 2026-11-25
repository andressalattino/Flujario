# Auditoría de calidad de Flujario — 25/11/2026

Se revisaron primero la arquitectura, `package.json`, el árbol de dependencias instaladas y las convenciones del repositorio. La revisión cruzó referencias en rutas, módulos, pruebas, estilos, scripts y documentación. Como esta copia no tiene un repositorio Git, el inventario se verificó con huellas SHA‑256 tomadas antes de editar. Las credenciales y los archivos generados quedaron fuera del inventario.

## Hallazgos y correcciones

| Hallazgo                                                                                                                          | Corrección                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Los lectores de JSON y formularios duplicaban el recuento de bytes, la cancelación y el ensamblado de fragmentos.                 | Comparten un lector acotado. Cada formato mantiene su decodificación, orden de validación, límites y mensajes. Se probó un formulario dividido entre fragmentos.                                                                                                                                                   |
| Los esquemas Zod repetían moneda, categoría, valores sí/no y el contrato de favoritas.                                            | Se comparten los campos y la construcción del esquema de favoritas. Se comprobaron por separado los límites de 20 y 32 caracteres y la normalización del símbolo.                                                                                                                                                  |
| El repositorio de noticias volvía a validar consultas que todas sus entradas ya habían validado.                                  | La consulta se analiza en el punto de entrada y el repositorio recibe el resultado tipado. Se conservan los valores predeterminados, filtros y límites.                                                                                                                                                            |
| La respuesta de IA validaba dos veces el consumo y la lectura financiera repetía conversiones y objetos de salida.                | El recibo se analiza una vez antes del plan, para conservarlo también si el plan es inválido. La lectura financiera usa una salida común y conserva los filtros por dueño y moneda.                                                                                                                                |
| Dos cron locales duplicaban temporizadores, transporte y lógica de cierre.                                                        | Comparten la implementación de Vite. Cada cron mantiene su demora inicial, su intervalo, su tiempo de espera y su política de reintento.                                                                                                                                                                           |
| La tabla y el gráfico de TradingView observaban el tema con dos copias de la misma lógica.                                        | Ambos usan el mismo hook de tema, con el estado inicial y el observador anteriores.                                                                                                                                                                                                                                |
| El importador recorría todas las series por cada barra.                                                                           | El componente de gráficos calcula una vez el máximo de cada grupo. Se mantienen el marcado, los textos y las proporciones calculadas con enteros.                                                                                                                                                                  |
| Quedaron componentes, tipos, exportaciones y estilos sin consumidores.                                                            | Se retiraron `SectionHeading`, `MobileMarkets`, `DialogTrigger`, `ArticleRow`, `NewsPeriod` e `isHistorical`. Se acotaron otras exportaciones al módulo que las usa y se quitaron más de 200 reglas CSS sin coincidencias en la aplicación. Se conservaron los selectores activos, incluidas las clases dinámicas. |
| Algunos parámetros de presentación seguían llamándose `cents` aunque el módulo también maneja monedas con otras unidades mínimas. | Se alinearon con la convención `amountMinor`. Las reglas de dinero y el formato quedaron iguales.                                                                                                                                                                                                                  |

Se revisó el uso de Zod en formularios, consultas, importaciones y respuestas de proveedores. Los esquemas estrictos del asistente y las validaciones de fechas, importes y lotes conservan su comportamiento. No se encontraron declaraciones explícitas de `any` en el código TypeScript revisado. La auditoría de imports no detectó módulos de aplicación huérfanos después de la limpieza.

## Archivos modificados (33)

| Área                        | Archivos                                                                                                                                                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Estilos                     | `app/app.css`, `app/markets.css`, `app/overview.css`                                                                                                                                                                                                                      |
| Componentes base            | `app/components/assistant/financial-chart.tsx`, `app/components/theme.tsx`, `app/components/ui/dialog.tsx`                                                                                                                                                                |
| Panel                       | `app/components/workspace/market-widget.tsx`, `app/components/workspace/mobile-data.tsx`, `app/components/workspace/shared.tsx`, `app/components/workspace/statement-tools.tsx`, `app/components/workspace/stock-chart.tsx`, `app/components/workspace/stock-markets.tsx` |
| Base de datos               | `app/db/assistant.server.ts`, `app/db/news.server.ts`                                                                                                                                                                                                                     |
| Dominio                     | `app/domain/assistant.ts`, `app/domain/markets.ts`, `app/domain/money.ts`, `app/domain/news.ts`, `app/domain/statements.ts`, `app/domain/validation.ts`                                                                                                                   |
| Rutas y HTTP                | `app/lib/form.server.ts`, `app/lib/json.server.ts`, `app/routes/news-data.ts`, `app/routes/workspace.tsx`                                                                                                                                                                 |
| Servicios                   | `app/services/assistant.server.ts`, `app/services/statement-files.client.ts`                                                                                                                                                                                              |
| Configuración y referencias | `vite.config.ts`, `docs/CATALOGO-AUTOMATICO.md`, `docs/PROVEEDORES.md`                                                                                                                                                                                                    |
| Pruebas                     | `tests/assistant-usage.test.ts`, `tests/markets.test.ts`, `tests/news-local.test.ts`, `tests/security.test.ts`                                                                                                                                                            |

## Archivos agregados (5)

- `app/components/workspace/statement-charts.tsx`
- `app/domain/field-schemas.ts`
- `app/lib/request-body.server.ts`
- `tools/local-schedules-plugin.ts`
- `docs/AUDITORIA-CALIDAD.md`

## Archivos eliminados (2)

- `tools/local-news-plugin.ts`
- `tools/local-catalog-plugin.ts`

Ambos quedaron reemplazados por `tools/local-schedules-plugin.ts`. Se actualizaron Vite, las pruebas y las referencias de documentación, y se verificó que los nombres antiguos ya no tienen consumidores.

## Dependencias

Se verificaron 36 dependencias directas. Todas tienen un uso en la aplicación, CSS, tipos, scripts o herramientas de compilación. `npm ls --depth=0` no informó problemas. No hubo instalaciones ni cambios en el manifiesto o su lockfile.

## Biome

Se intentó `npx biome check --write .` con las instalaciones automáticas deshabilitadas. npm devolvió `ENOTCACHED`. Esta copia carece del binario y de un archivo `biome.json` o `biome.jsonc`. La comprobación de formato existente, `npm run format:check`, pasó con Prettier.

## TypeScript

Pasaron `npm run typecheck` y `tsc --noEmit --noUnusedLocals --noUnusedParameters`. El segundo chequeo había detectado el tipo `ArticleRow` antes de la limpieza.

## Lint

`package.json` no define un script `lint`. `npm run lint --if-present` no ejecutó un linter.

## Tests

Pasaron 318 pruebas en 35 archivos. También pasó `node qa/verificar-asistente-d1.mjs` con D1 efímera. Esa prueba verificó cuotas, concurrencia, reintentos, aislamiento y movimientos intactos con un modelo ficticio.

## Build

Compilación de cliente y servidor exitosa. Vite sigue informando que el fragmento del lector PDF supera 500 kB minificados antes de comprimir.

## Pendientes

- Biome requiere el ejecutable y la configuración de equipo para aplicar sus reglas con el alcance esperado.
- Los scripts de QA importan `esbuild` y `miniflare` desde dependencias transitivas. El lockfile actual permite ejecutarlos. Una futura actualización del árbol puede requerir declararlos explícitamente.
- El adaptador editorial anterior está documentado como historial y conserva pruebas propias. Su retiro y el de sus variables de entorno quedan como una decisión separada por compatibilidad.
- La verificación de esta auditoría se hizo con compilación, pruebas y referencias estáticas. Queda pendiente una comparación visual en navegador y la inferencia desde un panel autenticado.
