export const sections = [
  "resumen",
  "movimientos",
  "estadisticas",
  "pagos",
  "cotizaciones",
  "mercados",
  "noticias",
] as const;
export type Section = (typeof sections)[number];
export function validateSection(section?: string): Section {
  if (section && !sections.includes(section as Section))
    throw new Response("Página no encontrada", { status: 404 });
  return (section as Section) || "resumen";
}
