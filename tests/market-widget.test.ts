import { expect, it } from "vitest";
import { marketWidgetAttributes, verifiedWidgetSymbols } from "../app/domain/tradingview-widget";
import { marketSelection } from "../app/components/workspace/market-brief";
import catalog from "../app/data/stock-catalog.json";

it("el widget recibe referencias verificadas y únicas, sin inventar una bolsa para símbolos anteriores", () => {
  expect(
    verifiedWidgetSymbols([
      { tradingviewSymbol: "NASDAQ:AAPL" },
      { tradingviewSymbol: "NASDAQ:AAPL" },
      { tradingviewSymbol: "NYSE:BRK.B" },
      { tradingviewSymbol: null },
      { tradingviewSymbol: "AAPL" },
      { tradingviewSymbol: "https://example.com" },
      { tradingviewSymbol: 'NYSE:KO\"><script>' },
    ]),
  ).toEqual(["NASDAQ:AAPL", "NYSE:BRK.B"]);
  expect(verifiedWidgetSymbols(catalog.companies)).toHaveLength(catalog.companies.length);
});

it("el radar conserva cinco lugares, distingue las favoritas y sólo completa con referencias del catálogo", () => {
  const selected = marketSelection(["KO", "AAPL", "KO"]);
  expect(selected).toHaveLength(5);
  expect(selected.slice(0, 2).map(({ tradingviewSymbol }) => tradingviewSymbol)).toEqual([
    "NASDAQ:AAPL",
    "NYSE:KO",
  ]);
  expect(verifiedWidgetSymbols(selected)).toHaveLength(5);
  expect(marketSelection(["ANTERIOR"])[0]).toMatchObject({
    symbol: "ANTERIOR",
    tradingviewSymbol: null,
  });
});

it("la configuración sólo admite símbolos públicos y apariencia, sin claves ni información personal", () => {
  const input = {
    symbols: ["NASDAQ:AAPL", "NYSE:BRK.B"],
    view: "performance" as const,
    theme: "dark" as const,
  };
  const attributes = marketWidgetAttributes(input);
  expect(JSON.parse(attributes["symbol-sectors"])).toEqual([
    { sectionName: "Acciones", symbols: input.symbols },
  ]);
  expect(attributes).toMatchObject({ view: "performance", theme: "dark" });
  expect(marketWidgetAttributes({ ...input, compact: true })).toMatchObject({
    mode: "custom",
    direction: "vertical",
    "time-frame": "1D",
    "symbol-sectors": attributes["symbol-sectors"],
  });
  for (const invalid of [
    { ...input, symbols: ['NASDAQ:AAPL\"><script>'] },
    { ...input, symbols: [] },
    { ...input, symbols: Array(201).fill("NYSE:KO") },
    { ...input, symbols: ["https://example.com/code.js"] },
    { ...input, view: "30-dias" },
    { ...input, theme: "system" },
    { ...input, userId: "owner" },
    { ...input, balance: 10000 },
    { ...input, scriptUrl: "https://example.com/code.js" },
  ])
    expect(() => marketWidgetAttributes(invalid as typeof input)).toThrow();
});
