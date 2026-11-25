// Compara exportaciones privadas sin imprimir importes, identidades ni descripciones.
// Sólo lee archivos y usa SQLite en memoria; no modifica la base D1.
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) throw new Error("Indicá las exportaciones anterior y posterior.");
async function load(path) {
  const db = new DatabaseSync(":memory:");
  // Sólo para importar el dump en cualquier orden. La migración real mantiene FK activas.
  db.exec("PRAGMA foreign_keys=OFF");
  db.exec(await readFile(path, "utf8"));
  if (db.prepare("PRAGMA foreign_key_check").all().length)
    throw new Error("La exportación contiene relaciones inválidas.");
  return db;
}
const before = await load(beforePath);
const after = await load(afterPath);
try {
  const exists = (db, table) =>
    !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
  const beforeRules = new Map(
    before
      .prepare("SELECT * FROM payment_rules")
      .all()
      .map((row) => [row.id, row]),
  );
  const paid = new Set(
    before
      .prepare("SELECT occurrence_id FROM entries WHERE occurrence_id IS NOT NULL")
      .all()
      .map((row) => row.occurrence_id),
  );
  const policyNeeded =
    !exists(before, "d1_migrations") ||
    !before.prepare("SELECT 1 FROM d1_migrations WHERE name='0003_currency_exchanges.sql'").get();
  let checked = 0;
  for (const table of [
    "accounts",
    "entries",
    "payment_rules",
    "payment_occurrences",
    "dismissed_payment_notices",
    "payment_mutations",
    "favorites",
    "news_editions",
  ]) {
    if (!exists(before, table)) continue;
    for (const row of before.prepare(`SELECT * FROM ${table}`).all()) {
      const expected = { ...row };
      if (policyNeeded && table === "payment_rules" && row.frequency !== "once")
        expected.amount_cents = null;
      if (policyNeeded && table === "payment_occurrences") {
        const rule = beforeRules.get(row.rule_id);
        const origin =
          row.amount_source ?? (rule.anchor_date === row.due_date ? "manual" : "inherited");
        if (
          origin === "inherited" &&
          row.due_date >= "2026-12-01" &&
          rule.frequency !== "once" &&
          !paid.has(row.id)
        )
          expected.amount_cents = null;
      }
      const actual = after.prepare(`SELECT * FROM ${table} WHERE id=?`).get(row.id);
      if (!actual) throw new Error(`Falta un registro anterior de ${table}.`);
      for (const [key, value] of Object.entries(expected))
        if (actual[key] !== value)
          throw new Error(`Cambió un campo no autorizado en ${table}.${key}.`);
      if (
        table === "entries" &&
        row.kind === "transfer" &&
        (actual.target_currency !== row.currency || actual.target_amount_minor !== row.amount_cents)
      )
        throw new Error("No se conservó una transferencia anterior.");
      checked++;
    }
  }
  console.log(
    `Verificación privada aprobada: ${checked} registros anteriores conservados; sólo se aplicó la política acordada de importes futuros.`,
  );
} finally {
  before.close();
  after.close();
}
