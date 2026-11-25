// Preparación única, antes de aplicar 0006. No reescribe una semilla existente.
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const path = "drizzle/0006_stock_markets.sql",
  sql = await readFile(path, "utf8");
assert(!sql.includes("CREATE TRIGGER stock_favorites_limit"), "La semilla ya está preparada.");
const before = 'exchange" IS NOT NULL AND "stock_companies"."tradingview_symbol" =';
const after =
  'exchange" IS NOT NULL AND "stock_companies"."tradingview_symbol" IS NOT NULL AND "stock_companies"."tradingview_symbol" =';
assert(sql.includes(before));
const snapshotPath = "drizzle/meta/0006_snapshot.json",
  snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
snapshot.tables.stock_companies.checkConstraints.stock_company_chart.value =
  snapshot.tables.stock_companies.checkConstraints.stock_company_chart.value.replace(before, after);
const journalPath = "drizzle/meta/_journal.json",
  journal = JSON.parse(await readFile(journalPath, "utf8"));
journal.entries.at(-1).tag = "0006_stock_markets";
await writeFile(
  path,
  sql.replace(before, after) + (await readFile(".wrangler/qa-markets/seed.sql", "utf8")),
);
await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2) + "\n");
await writeFile(journalPath, JSON.stringify(journal, null, 2) + "\n");
console.log(
  "Migración preparada: catálogo, pertenencias, límite atómico y conservación de favoritos anteriores.",
);
