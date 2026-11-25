// Guarda sólo huellas de tablas financieras; la copia SQLite queda en .wrangler/backups.
import { DatabaseSync, backup } from "node:sqlite";
import { readdir, mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
const folder = resolve(".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
const files = (await readdir(folder)).filter(
  (name) => name.endsWith(".sqlite") && name !== "metadata.sqlite",
);
if (files.length !== 1) throw new Error("Se esperaba una sola base local de Flujario.");
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
const fingerprints = {};
try {
  for (const table of tables) {
    const rows = db.prepare("SELECT * FROM " + table + " ORDER BY rowid").all();
    fingerprints[table] = {
      count: rows.length,
      sha256: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
    };
  }
  const report = resolve(".wrangler/backups/news-before.json");
  if (process.argv.includes("--before")) {
    await mkdir(resolve(".wrangler/backups"), { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await backup(db, resolve(".wrangler/backups/news-" + stamp + ".sqlite"));
    await writeFile(report, JSON.stringify(fingerprints, null, 2));
    console.log(
      "Copia local consistente y huellas previas guardadas. No se imprimieron registros.",
    );
  } else {
    const before = JSON.parse(await readFile(report, "utf8"));
    if (JSON.stringify(before) !== JSON.stringify(fingerprints))
      throw new Error("Cambió una tabla previa; revisar la base antes de continuar.");
    console.log("Las 10 tablas previas conservan exactamente sus filas e importes.");
  }
} finally {
  db.close();
}
