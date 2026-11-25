export const TIMEZONE = "America/Argentina/Buenos_Aires";
export type Frequency = "once" | "monthly" | "quarterly" | "yearly";
export function isISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01" || value > "2200-12-31")
    return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function today(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"]
    .map((type) => parts.find((p) => p.type === type)!.value)
    .join("-");
}
export function addMonthsFromAnchor(anchor: string, months: number): string {
  if (!isISODate(anchor) || !Number.isInteger(months) || months < 0)
    throw new Error("Fecha o período inválido.");
  const [year, month, day] = anchor.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1 + months, 1, 12));
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  const result = date.toISOString().slice(0, 10);
  if (!isISODate(result)) throw new Error("El vencimiento queda fuera del rango admitido.");
  return result;
}
export function occurrenceDates(anchor: string, frequency: Frequency, count = 12): string[] {
  if (!Number.isInteger(count) || count < 1 || count > 120) throw new Error("Cantidad inválida.");
  const interval = { once: 0, monthly: 1, quarterly: 3, yearly: 12 }[frequency];
  return Array.from({ length: frequency === "once" ? 1 : count }, (_, index) =>
    addMonthsFromAnchor(anchor, index * interval),
  );
}
export function formatDate(value: string, long = false): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: long ? "long" : "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}
export function formatFullDate(value: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value));
}
export const frequencyLabels: Record<Frequency, string> = {
  once: "Una vez",
  monthly: "Mensual",
  quarterly: "Trimestral",
  yearly: "Anual",
};
