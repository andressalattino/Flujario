// Copia consistente y huellas de datos financieros; nunca imprime sus valores.
import { DatabaseSync, backup } from "node:sqlite";
import { readdir, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
const folder = resolve(".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
const files = (await readdir(folder)).filter(
  (n) => n.endsWith(".sqlite") && n !== "metadata.sqlite",
);
if (files.length !== 1) throw Error("Se esperaba una única base D1 local.");
const db = new DatabaseSync(resolve(folder, files[0]), { readOnly: true });
const tables = [
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
];
const before = process.argv.includes("--before"),
  fingerprint = resolve(".wrangler/backups/assistant-before.json");
try {
  const result = {};
  for (const table of tables) {
    const rows = db.prepare('SELECT * FROM "' + table + '" ORDER BY rowid').all();
    result[table] = {
      count: rows.length,
      sha256: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
    };
  }
  if (before) {
    await mkdir(resolve(".wrangler/backups"), { recursive: true });
    await backup(
      db,
      resolve(
        ".wrangler/backups/assistant-" + new Date().toISOString().replace(/[:.]/g, "-") + ".sqlite",
      ),
    );
    await writeFile(fingerprint, JSON.stringify(result));
    console.log("Copia consistente e inventario de trece tablas financieras guardados.");
  } else {
    if (JSON.stringify(result) !== (await readFile(fingerprint, "utf8")))
      throw Error("Cambió un registro financiero anterior.");
    if (db.prepare("PRAGMA foreign_key_check").all().length)
      throw Error("Hay referencias inválidas.");
    console.log(
      "Trece tablas financieras conservan exactamente sus filas e importes; claves foráneas válidas.",
    );
  }
} finally {
  db.close();
}
