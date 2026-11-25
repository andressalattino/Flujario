import { z } from "zod";

export const TRADINGVIEW_MARKET_MODULE =
  "https://widgets.tradingview-widget.com/w/es/tv-market-data.js";
export const TRADINGVIEW_RADAR_MODULE =
  "https://widgets.tradingview-widget.com/w/es/tv-market-summary.js";
export const TRADINGVIEW_MARKETS_URL = "https://www.tradingview.com/markets/stocks-usa/";
const symbolPattern = /^(NASDAQ|NYSE):[A-Z0-9][A-Z0-9.]{0,19}$/;
export type MarketWidgetView = "overview" | "performance";
export function verifiedWidgetSymbols(companies: { tradingviewSymbol: string | null }[]) {
  return [
    ...new Set(
      companies.flatMap((c) =>
        c.tradingviewSymbol && symbolPattern.test(c.tradingviewSymbol) ? [c.tradingviewSymbol] : [],
      ),
    ),
  ];
}
const settingsSchema = z
  .object({
    symbols: z.array(z.string().regex(symbolPattern)).min(1).max(200),
    view: z.enum(["overview", "performance"]),
    theme: z.enum(["light", "dark"]),
    compact: z.boolean().optional(),
  })
  .strict();

// Sólo configuración pública. No se aceptan datos financieros ni URLs ejecutables.
export function marketWidgetAttributes(
  input: z.infer<typeof settingsSchema>,
): Record<string, string> & { "symbol-sectors": string } {
  const settings = settingsSchema.parse(input);
  const shared = {
    "symbol-sectors": JSON.stringify([{ sectionName: "Acciones", symbols: settings.symbols }]),
    theme: settings.theme,
  };
  return settings.compact
    ? {
        ...shared,
        mode: "custom",
        direction: "vertical",
        "item-size": "compact",
        "layout-mode": "flow",
        "time-frame": "1D",
      }
    : { ...shared, view: settings.view };
}
