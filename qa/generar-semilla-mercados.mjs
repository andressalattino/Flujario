// Genera una semilla revisable a partir de los metadatos contrastados. No descarga datos.
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const reviewed = JSON.parse(await readFile(".wrangler/qa-markets/web-constituents.json", "utf8"));
const holdings = JSON.parse(await readFile(".wrangler/qa-markets/sp100-holdings.json", "utf8"));
const ndx = JSON.parse(await readFile(".wrangler/qa-markets/ndx-current.json", "utf8"));
const ndxFund = JSON.parse(await readFile(".wrangler/qa-markets/ndx-holdings.json", "utf8"));
assert.deepEqual(ndx.map((c) => c.symbol).sort(), ndxFund.constituents.map((c) => c.symbol).sort());
assert.deepEqual(
  reviewed.sp100.map((c) => c.symbol).sort(),
  holdings.constituents.map((c) => c.symbol).sort(),
);
const all = new Map();
for (const c of [...ndx, ...reviewed.sp100]) {
  const exchange = holdings.constituents.find((h) => h.symbol === c.symbol)?.exchange ?? "NASDAQ";
  assert(["NYSE", "NASDAQ"].includes(exchange));
  const name =
    reviewed.sp100.find((s) => s.symbol === c.symbol)?.name ??
    ndxFund.constituents.find((s) => s.symbol === c.symbol)?.name ??
    c.name;
  all.set(c.symbol, {
    id: c.symbol,
    symbol: c.symbol,
    name: name
      .replace("(Class A)", "(clase A)")
      .replace("(Class B)", "(clase B)")
      .replace("(Class C)", "(clase C)"),
    exchange,
    tradingviewSymbol: exchange + ":" + c.symbol,
    verifiedAt: "2026-11-19",
  });
}
const indices = [
  {
    id: "sp100",
    name: "S&P 100",
    description:
      "Grandes compañías de Estados Unidos, de distintos sectores, seleccionadas por S&P Dow Jones Indices.",
    verifiedAt: "2026-11-19",
    compositionDate: "2026-11-18",
    sourceUrl: "https://www.spglobal.com/spdji/en/indices/equity/sp-100/",
  },
  {
    id: "ndx",
    name: "Nasdaq-100",
    description:
      "Grandes compañías no financieras que cotizan en Nasdaq. Incluye empresas de Estados Unidos y de otros países.",
    verifiedAt: "2026-11-19",
    compositionDate: ndxFund.dataAsOf,
    sourceUrl: "https://indexes.nasdaq.com/Index/Overview/NDX",
  },
];
const members = [
  ...reviewed.sp100.map((c) => ({ indexId: "sp100", companyId: c.symbol })),
  ...ndx.map((c) => ({ indexId: "ndx", companyId: c.symbol })),
];
const catalog = {
  companies: [...all.values()].sort((a, b) => a.symbol.localeCompare(b.symbol)),
  indices,
  members,
};
await writeFile("app/data/stock-catalog.json", JSON.stringify(catalog, null, 2) + "\n");
const quote = (v) => (v == null ? "NULL" : "'" + String(v).replace(/'/g, "''") + "'");
const rows = (table, columns, values) =>
  `INSERT INTO ${table} (${columns.join(",")}) VALUES\n${values.map((v) => "(" + v.map(quote).join(",") + ")").join(",\n")};\n--> statement-breakpoint\n`;
let sql = "\n--> statement-breakpoint\n";
sql += rows(
  "stock_companies",
  ["id", "symbol", "name", "exchange", "tradingview_symbol", "verified_at"],
  catalog.companies.map((c) => [
    c.id,
    c.symbol,
    c.name,
    c.exchange,
    c.tradingviewSymbol,
    c.verifiedAt,
  ]),
);
sql += rows(
  "stock_indices",
  ["id", "name", "description", "verified_at", "composition_date", "source_url"],
  indices.map((i) => [i.id, i.name, i.description, i.verifiedAt, i.compositionDate, i.sourceUrl]),
);
sql += rows(
  "stock_index_members",
  ["index_id", "company_id"],
  members.map((m) => [m.indexId, m.companyId]),
);
sql += `CREATE TRIGGER stock_favorites_limit BEFORE INSERT ON stock_favorites
WHEN NOT EXISTS (SELECT 1 FROM stock_favorites WHERE user_id=NEW.user_id AND company_id=NEW.company_id)
 AND (SELECT count(*) FROM stock_favorites WHERE user_id=NEW.user_id)>=5
BEGIN SELECT RAISE(ABORT,'stock_favorites_limit'); END;
--> statement-breakpoint
CREATE TRIGGER stock_favorite_identity BEFORE UPDATE OF user_id,company_id ON stock_favorites
WHEN NEW.user_id != OLD.user_id OR NEW.company_id != OLD.company_id
BEGIN SELECT RAISE(ABORT,'stock_favorite_identity_immutable'); END;
--> statement-breakpoint
-- Conserva símbolos anteriores, incluso si no pertenecen a los índices nuevos.
INSERT INTO stock_companies(id,symbol,name,exchange,tradingview_symbol,verified_at)
 SELECT DISTINCT symbol,symbol,symbol,NULL,NULL,NULL FROM favorites WHERE true ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- El límite provoca un rollback si una base anterior necesita revisión; nunca recorta listas.
INSERT INTO stock_favorites(user_id,company_id,created_at)
 SELECT user_id,symbol,'2026-11-19T00:00:00.000Z' FROM favorites WHERE true ON CONFLICT DO NOTHING;
`;
await writeFile(".wrangler/qa-markets/seed.sql", sql);
console.log(
  JSON.stringify({
    companies: catalog.companies.length,
    sp100: reviewed.sp100.length,
    ndx: ndx.length,
    shared: members.length - catalog.companies.length,
  }),
);
