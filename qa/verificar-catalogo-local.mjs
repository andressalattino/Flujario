// Activa sólo el scheduled local de catálogo; compara datos privados sin imprimirlos.
import { DatabaseSync, backup } from "node:sqlite";
import { readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const folder = resolve(".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
const names = (await readdir(folder)).filter(
  (n) => n.endsWith(".sqlite") && n !== "metadata.sqlite",
);
assert.equal(names.length, 1, "Se esperaba una única base local.");
const file = resolve(folder, names[0]);
const fingerprint = (db) =>
  Object.fromEntries(
    [
      "accounts",
      "entries",
      "payment_rules",
      "payment_occurrences",
      "payment_mutations",
      "dismissed_payment_notices",
      "statement_imports",
      "statement_rows",
      "breakdown_revisions",
      "expense_breakdowns",
      "stock_favorites",
      "user_market_preferences",
      "favorites",
      "ai_daily_usage",
      "ai_global_usage",
      "ai_rate_windows",
      "ai_requests",
    ].map((table) => [
      table,
      createHash("sha256")
        .update(JSON.stringify(db.prepare("SELECT * FROM " + table + " ORDER BY rowid").all()))
        .digest("hex"),
    ]),
  );
let db = new DatabaseSync(file, { readOnly: true });
const before = fingerprint(db);
await mkdir(resolve(".wrangler/backups"), { recursive: true });
await backup(
  db,
  resolve(
    ".wrangler/backups/catalog-" + new Date().toISOString().replace(/[:.]/g, "-") + ".sqlite",
  ),
);
db.close();
const response = await fetch(
  "http://127.0.0.1:5173/cdn-cgi/local/explorer/api/local/scheduled?worker=flujario",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cron: "0 14 * * *" }),
    signal: AbortSignal.timeout(45000),
  },
);
assert(response.ok, "El scheduled local no respondió.");
const outcome = await response.json();
assert(outcome.success && outcome.result?.outcome === "ok", "El scheduled local no terminó.");
db = new DatabaseSync(file, { readOnly: true });
try {
  assert.deepEqual(fingerprint(db), before, "Cambió una tabla privada durante la comprobación.");
  const indices = db
    .prepare(
      "SELECT id,verified_at AS checkedAt,source_url AS source,composition_date AS sourceEdition FROM stock_indices ORDER BY id",
    )
    .all();
  const counts = db
    .prepare("SELECT index_id AS id,count(*) AS members FROM stock_index_members GROUP BY index_id")
    .all();
  assert(
    indices.every((i) =>
      String(i.source).startsWith("https://en.wikipedia.org/w/index.php?oldid="),
    ),
    "No se actualizó la fuente local.",
  );
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  const report = {
    checkedAt: new Date().toISOString(),
    indices,
    counts,
    privateTablesUnchanged: 17,
    foreignKeysValid: true,
  };
  await writeFile(
    "qa/catalogo-wikipedia-verificacion.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  db.close();
}
