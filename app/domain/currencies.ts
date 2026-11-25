export const currencies = [
  "ARS",
  "USD",
  "EUR",
  "BRL",
  "CLP",
  "UYU",
  "GBP",
  "CAD",
  "AUD",
  "CHF",
] as const;
export type Currency = (typeof currencies)[number];
export const currencyInfo: Record<Currency, { name: string; digits: 0 | 2 }> = {
  ARS: { name: "Peso argentino", digits: 2 },
  USD: { name: "Dólar estadounidense", digits: 2 },
  EUR: { name: "Euro", digits: 2 },
  BRL: { name: "Real brasileño", digits: 2 },
  CLP: { name: "Peso chileno", digits: 0 },
  UYU: { name: "Peso uruguayo", digits: 2 },
  GBP: { name: "Libra esterlina", digits: 2 },
  CAD: { name: "Dólar canadiense", digits: 2 },
  AUD: { name: "Dólar australiano", digits: 2 },
  CHF: { name: "Franco suizo", digits: 2 },
};
export function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && currencies.includes(value as Currency);
}
export function availableCurrencies(owned: readonly Currency[]): Currency[] {
  return currencies.filter((currency) => !owned.includes(currency));
}
export function currencyOptions(owned: readonly Currency[]) {
  return owned.map((currency) => [currency, `${currency} · ${currencyInfo[currency].name}`]);
}
