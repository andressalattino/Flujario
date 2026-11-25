import { currencyInfo, type Currency } from "./currencies";
export { currencies, type Currency } from "./currencies";
// Límite por movimiento en unidades mínimas. CLP usa pesos enteros, no centavos.
export const MAX_MINOR = 1_000_000_000_000;
export function assertMinor(value: number): number {
  if (!Number.isSafeInteger(value)) throw new Error("El importe supera el límite permitido.");
  return value;
}
// Formato es-AR estricto: 1234,56 o 1.234,56. Nunca parseFloat ni multiplicar decimales.
export function parseMoney(input: string, currency: Currency = "ARS"): number {
  const value = input.trim();
  if (!/^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(value)) {
    throw new Error("Usá un importe como 1.234,56, con hasta dos decimales.");
  }
  const [whole = "0", fraction = ""] = value.replaceAll(".", "").split(",");
  const digits = currencyInfo[currency].digits;
  if (!digits && value.includes(","))
    throw new Error("Los importes en pesos chilenos se ingresan sin decimales.");
  const minor = BigInt(whole) * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits, "0") || "0");
  if (minor > BigInt(MAX_MINOR)) throw new Error("El importe supera el límite permitido.");
  return Number(minor);
}
export function sumMinor(values: number[]): number {
  const total = values.reduce((sum, value) => sum + BigInt(assertMinor(value)), 0n);
  return assertMinor(Number(total));
}
export function formatMoney(amountMinor: number, currency: Currency = "ARS"): string {
  assertMinor(amountMinor);
  // BigInt también al presentar: no pierde un centavo en saldos grandes ni redondea.
  const absolute = BigInt(Math.abs(amountMinor));
  const digits = currencyInfo[currency].digits;
  const scale = 10n ** BigInt(digits);
  const fraction = String(absolute % scale).padStart(digits, "0");
  const parts = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).formatToParts(absolute / scale);
  return `${amountMinor < 0 ? "−" : ""}${parts.map((part) => (part.type === "fraction" ? fraction : part.value)).join("")}`;
}
export function moneyInput(amountMinor: number | null, currency: Currency = "ARS"): string {
  if (amountMinor === null) return "";
  assertMinor(amountMinor);
  const value = BigInt(amountMinor);
  const digits = currencyInfo[currency].digits;
  if (!digits) return String(value);
  return `${value / 100n},${String(value % 100n).padStart(2, "0")}`;
}
export function splitInstallments(totalMinor: number, count: number): number[] {
  assertMinor(totalMinor);
  if (totalMinor <= 0 || !Number.isInteger(count) || count < 1 || count > 120 || count > totalMinor)
    throw new Error("Cantidad de cuotas inválida.");
  const base = BigInt(totalMinor) / BigInt(count);
  const remainder = BigInt(totalMinor) % BigInt(count);
  return Array.from({ length: count }, (_, i) => Number(base + (BigInt(i) < remainder ? 1n : 0n)));
}
