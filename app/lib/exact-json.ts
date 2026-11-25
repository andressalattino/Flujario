/** Conserva el token decimal original de JSON. Nunca usamos el Number ya redondeado. */
export function parseExactJSON(text: string): unknown {
  return JSON.parse(text, (_key: string, value: unknown, context?: { source?: string }) => {
    if (typeof value !== "number") return value;
    if (!context?.source) throw new Error("El runtime no admite lectura decimal exacta de JSON.");
    return context.source;
  });
}
