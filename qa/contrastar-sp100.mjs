// Contraste de nombres/símbolos contra posiciones del ETF OEF del emisor.
// El ETF es una fuente de contraste, no se presenta como el archivo del índice.
import { mkdir, writeFile } from "node:fs/promises";
const url = "https://www.ishares.com/us/products/239723/ishares-s-p-100-etf/latest-holdings.csv";
const response = await fetch(url, {
  redirect: "error",
  signal: AbortSignal.timeout(15000),
  headers: { "User-Agent": "Flujario-Catalog-Review/1.0" },
});
if (!response.ok) {
  await response.body?.cancel();
  throw Error("HTTP " + response.status);
}
const reader = response.body.getReader(),
  decoder = new TextDecoder();
let csv = "",
  size = 0;
try {
  while (true) {
    const p = await reader.read();
    if (p.done) break;
    size += p.value.byteLength;
    if (size > 2097152) throw Error("Archivo demasiado grande");
    csv += decoder.decode(p.value, { stream: true });
  }
  csv += decoder.decode();
} finally {
  await reader.cancel();
  reader.releaseLock();
}
const rows = csv
  .split(/\r?\n/)
  .map((line) => [...line.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1].replace(/""/g, '"')));
const constituents = rows
  .filter((r) => r[3] === "Equity")
  .map((r) => ({ symbol: r[0].replace("BRK B", "BRK.B"), name: r[1], exchange: r[10] }));
if (constituents.length < 90) throw Error("Lista incompleta");
const report = {
  source: url,
  checkedAt: new Date().toISOString(),
  dataAsOf: /Fund Holdings as of,"([^"]+)"/.exec(csv)?.[1] ?? null,
  constituents,
};
await mkdir(".wrangler/qa-markets", { recursive: true });
await writeFile(".wrangler/qa-markets/sp100-holdings.json", JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    count: constituents.length,
    dataAsOf: report.dataAsOf,
    exchanges: [...new Set(constituents.map((c) => c.exchange))],
    symbols: constituents.map((c) => c.symbol),
  }),
);
