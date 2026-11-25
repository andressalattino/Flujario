// Respaldo consistente y comparación de las columnas anteriores, sin imprimir datos.
import { DatabaseSync, backup } from "node:sqlite";
import { readdir, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
const folder = resolve(".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
const files = (await readdir(folder)).filter(
  (n) => n.endsWith(".sqlite") && n !== "metadata.sqlite",
);
if (files.length !== 1) throw Error("Se esperaba una sola base local.");
const db = new DatabaseSync(resolve(folder, files[0]), { readOnly: true });
const tables = [
  "accounts",
  "entries",
  "payment_rules",
  "payment_occurrences",
  "payment_mutations",
  "favorites",
  "dismissed_payment_notices",
  "exchange_quotes",
  "quote_cache_state",
  "news_editions",
];
const path = resolve(".wrangler/backups/imports-before.json");
try {
  if (db.prepare("PRAGMA foreign_key_check").all().length)
    throw Error("Hay referencias inválidas en la base local.");
  const previous = process.argv.includes("--before")
    ? null
    : JSON.parse(await readFile(path, "utf8"));
  const results = {};
  for (const table of tables) {
    const columns =
      previous?.[table].columns ??
      db
        .prepare('PRAGMA table_info("' + table + '")')
        .all()
        .map((c) => c.name);
    const rows = db
      .prepare(
        "SELECT " +
          columns.map((c) => '"' + c + '"').join(",") +
          ' FROM "' +
          table +
          '" ORDER BY rowid',
      )
      .all();
    results[table] = {
      columns,
      count: rows.length,
      sha256: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
    };
  }
  if (!previous) {
    await mkdir(".wrangler/backups", { recursive: true });
    await backup(
      db,
      resolve(
        ".wrangler/backups/imports-" + new Date().toISOString().replace(/[:.]/g, "-") + ".sqlite",
      ),
    );
    await writeFile(path, JSON.stringify(results, null, 2));
    console.log("Copia consistente y huellas de diez tablas previas guardadas.");
  } else {
    if (JSON.stringify(previous) !== JSON.stringify(results))
      throw Error("Cambió un registro anterior; revisar antes de continuar.");
    console.log(
      "Diez tablas anteriores conservan filas e importes; se toleran sólo columnas nuevas.",
    );
  }
} finally {
  db.close();
}
