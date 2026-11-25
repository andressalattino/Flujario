// Archivo público del emisor, enlazado como fuente de posiciones de QQQ.
// Se descartan todos los valores, pesos, unidades y rendimientos recibidos.
import { readFile, writeFile } from "node:fs/promises";
const source =
  "https://dng-api.invesco.com/cache/v1/accounts/en_US/shareclasses/46090E103/holdings/fund?productType=ETF&idType=cusip";
const response = await fetch(source, { redirect: "error", signal: AbortSignal.timeout(15000) });
if (!response.ok) {
  await response.body?.cancel();
  throw Error("HTTP " + response.status);
}
const data = await response.json();
const types = {};
for (const h of data.holdings) types[h.securityTypeName] = (types[h.securityTypeName] ?? 0) + 1;
const rows = data.holdings
  .filter((h) => /stock|equity|deposit|ADR|ordinary/i.test(h.securityTypeName))
  .map((h) => ({ symbol: h.ticker.trim(), name: h.issuerName, securityType: h.securityTypeName }));
const reviewed = JSON.parse(await readFile(".wrangler/qa-markets/ndx-current.json", "utf8"));
const symbols = new Set(rows.map((c) => c.symbol)),
  known = new Set(reviewed.map((c) => c.symbol));
const result = {
  source,
  checkedAt: new Date().toISOString(),
  dataAsOf: data.effectiveDate,
  businessDate: data.effectiveBusinessDate,
  types,
  constituents: rows,
  onlyFund: [...symbols].filter((s) => !known.has(s)),
  onlyList: [...known].filter((s) => !symbols.has(s)),
};
await writeFile(".wrangler/qa-markets/ndx-holdings.json", JSON.stringify(result, null, 2));
console.log(
  JSON.stringify({
    count: rows.length,
    date: result.dataAsOf,
    types,
    onlyFund: result.onlyFund,
    onlyList: result.onlyList,
  }),
);
