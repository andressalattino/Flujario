import { today } from "./dates";
import type { Currency } from "./currencies";
export const quoteSeries = [
  "usd-oficial",
  "usd-mep",
  "usd-blue",
  "eur",
  "brl",
  "clp",
  "uyu",
] as const;
export type QuoteSeries = (typeof quoteSeries)[number];
export const quoteDefinitions: Record<
  QuoteSeries,
  { name: string; currency: Currency; feed: "dollars" | "currencies"; house: string }
> = {
  "usd-oficial": { name: "Dólar oficial", currency: "USD", feed: "dollars", house: "oficial" },
  "usd-mep": { name: "Dólar MEP", currency: "USD", feed: "dollars", house: "bolsa" },
  "usd-blue": { name: "Dólar blue", currency: "USD", feed: "dollars", house: "blue" },
  eur: { name: "Euro", currency: "EUR", feed: "currencies", house: "oficial" },
  brl: { name: "Real brasileño", currency: "BRL", feed: "currencies", house: "oficial" },
  clp: { name: "Peso chileno", currency: "CLP", feed: "currencies", house: "oficial" },
  uyu: { name: "Peso uruguayo", currency: "UYU", feed: "currencies", house: "oficial" },
};
export interface ExchangeQuote {
  id: string;
  series: QuoteSeries;
  currency: Currency;
  buyRate: string;
  sellRate: string;
  sourceAsOf: string;
  fetchedAt: string;
}
export interface QuoteState {
  status: "never" | "refreshing" | "ok" | "partial" | "error";
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
}
export const emptyQuoteState: QuoteState = {
  status: "never",
  lastAttemptAt: null,
  nextAttemptAt: null,
};
export function quoteDate(quote: ExchangeQuote): string {
  return today(new Date(quote.sourceAsOf));
}
export function quoteSide(quote: ExchangeQuote, from: Currency): string {
  // Compra/venta se expresan desde la perspectiva de la fuente.
  return from === "ARS" ? quote.sellRate : quote.buyRate;
}
