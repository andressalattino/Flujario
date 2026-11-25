import { z } from "zod";
import { yesNoSchema } from "./field-schemas";

export const stockIndexIds = ["sp100", "ndx"] as const;
export type StockIndexId = (typeof stockIndexIds)[number];
export const STOCK_FAVORITES_LIMIT = 5;
export const STOCK_FAVORITES_LIMIT_MESSAGE =
  "Solo podés guardar 5 acciones. Quitá una para agregar otra";
export interface StockCompany {
  id: string;
  symbol: string;
  name: string;
  exchange: "NASDAQ" | "NYSE" | null;
  tradingviewSymbol: string | null;
  verifiedAt: string | null;
}
export interface StockIndex {
  id: StockIndexId;
  name: string;
  description: string;
  verifiedAt: string;
  compositionDate: string;
  sourceUrl: string;
}
export interface MarketSnapshot {
  companies: StockCompany[];
  indices: StockIndex[];
  members: { indexId: StockIndexId; companyId: string }[];
  favorites: string[];
  selectedIndex: StockIndexId;
}
export function stockFavoriteSchema(maxLength: number, invalidSymbol: string) {
  return z.object({
    intent: z.literal("favorite"),
    symbol: z
      .string()
      .trim()
      .toUpperCase()
      .regex(new RegExp(`^[A-Z0-9][A-Z0-9.^:-]{0,${maxLength - 1}}$`), invalidSymbol),
    saved: yesNoSchema,
  });
}
export const marketMutationSchema = z.discriminatedUnion("intent", [
  stockFavoriteSchema(32, "Revisá el símbolo de la acción."),
  z.object({ intent: z.literal("market-index"), indexId: z.enum(stockIndexIds) }),
]);
export type MarketMutation = z.infer<typeof marketMutationSchema>;
export function marketIndex(value: unknown): StockIndexId {
  return value === "ndx" ? "ndx" : "sp100";
}
const searchable = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f\s\p{P}]/gu, "")
    .toLowerCase();
export function selectIndexCompanies(
  snapshot: MarketSnapshot,
  indexId: StockIndexId,
  search: string,
  onlyFavorites: boolean,
  descending = false,
) {
  const members = new Set(
    snapshot.members.filter((m) => m.indexId === indexId).map((m) => m.companyId),
  );
  const needle = searchable(search);
  return snapshot.companies
    .filter(
      (c) =>
        members.has(c.id) &&
        (!onlyFavorites || snapshot.favorites.includes(c.id)) &&
        searchable(c.name + c.symbol).includes(needle),
    )
    .sort(
      (a, b) =>
        (descending ? -1 : 1) *
        (a.name.localeCompare(b.name, "es") || a.symbol.localeCompare(b.symbol)),
    );
}
export function tradingviewUrl(company: Pick<StockCompany, "tradingviewSymbol">) {
  return company.tradingviewSymbol
    ? `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(company.tradingviewSymbol)}`
    : null;
}
export function chartConfiguration(symbol: string, theme: "light" | "dark") {
  if (!/^(NASDAQ|NYSE):[A-Z0-9][A-Z0-9.]{0,19}$/.test(symbol))
    throw new Error("Símbolo de gráfico no verificado.");
  return {
    autosize: true,
    symbol,
    interval: "D",
    timezone: "Etc/UTC",
    theme,
    style: "1",
    locale: "es",
    allow_symbol_change: false,
    calendar: false,
    support_host: "https://www.tradingview.com",
  };
}
