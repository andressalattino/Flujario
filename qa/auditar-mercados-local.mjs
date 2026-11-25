// Sólo lectura: no muestra identificadores de dueños ni sus símbolos preferidos.
import { DatabaseSync } from "node:sqlite";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const folder = resolve(".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
const files = (await readdir(folder)).filter(
  (n) => n.endsWith(".sqlite") && n !== "metadata.sqlite",
);
assert.equal(files.length, 1);
const db = new DatabaseSync(resolve(folder, files[0]), { readOnly: true });
try {
  const groups = db
    .prepare(
      "SELECT index_id,count(*) AS n FROM stock_index_members GROUP BY index_id ORDER BY index_id",
    )
    .all();
  assert.deepEqual(
    groups.map((r) => ({ ...r })),
    [
      { index_id: "ndx", n: 101 },
      { index_id: "sp100", n: 101 },
    ],
  );
  assert.equal(
    db.prepare("SELECT count(*) AS n FROM stock_companies WHERE verified_at IS NOT NULL").get().n,
    167,
  );
  assert.equal(
    db
      .prepare(
        "SELECT count(*) AS n FROM favorites f WHERE NOT EXISTS (SELECT 1 FROM stock_favorites s WHERE s.user_id=f.user_id AND s.company_id=f.symbol)",
      )
      .get().n,
    0,
  );
  assert.equal(
    db
      .prepare(
        "SELECT count(*) AS n FROM (SELECT user_id FROM stock_favorites GROUP BY user_id HAVING count(*)>5)",
      )
      .get().n,
    0,
  );
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  console.log(
    "D1 local: 101 instrumentos por índice, 167 verificados, favoritas anteriores conservadas, máximo 5 y claves foráneas válidas.",
  );
} finally {
  db.close();
}
