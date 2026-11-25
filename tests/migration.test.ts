import { expect, it } from "vitest";
import { testD1 } from "./helpers/d1";

it("migra una base anterior con gastos y avisos sin perder IDs, importes ni relaciones", () => {
  let before: Record<string, Record<string, unknown>[]> = {};
  const store = testD1({
    beforeMigration(sqlite, name) {
      if (!name.startsWith("0002_")) return;
      sqlite.exec(`
      INSERT INTO accounts VALUES ('ars','ana','Pesos','ARS',100000);
      INSERT INTO accounts VALUES ('usd','bea','Dólares','USD',5000);
      INSERT INTO payment_rules VALUES ('r','ana','Electricidad',15000,'ARS','2026-09-30','monthly','key','hash');
      INSERT INTO payment_occurrences VALUES ('sep','r','ana','2026-09-30',15000,'ARS');
      INSERT INTO payment_occurrences VALUES ('oct','r','ana','2026-10-30',15000,'ARS');
      INSERT INTO entries VALUES ('paid','ana','expense','ars',NULL,15000,'ARS','Electricidad','Servicios','2026-09-30','sep','pay-key','pay-hash','2026-09-30T15:00:00Z');
      INSERT INTO dismissed_payment_notices VALUES ('notice','ana','oct','ARS','2026-11-01T15:00:00Z');
      INSERT INTO favorites VALUES ('favorite','bea','MELI');
    `);
      for (const table of [
        "accounts",
        "entries",
        "dismissed_payment_notices",
        "favorites",
        "payment_rules",
      ])
        before[table] = sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
    },
  });
  try {
    for (const [table, rows] of Object.entries(before)) {
      const columns =
        Object.keys(rows[0] ?? {})
          .map((column) => `"${column}"`)
          .join(",") || "*";
      const expected =
        table === "payment_rules"
          ? rows.map((row) => ({
              ...row,
              amount_cents: row.frequency === "once" ? row.amount_cents : null,
            }))
          : rows;
      expect(store.sqlite.prepare(`SELECT ${columns} FROM ${table} ORDER BY id`).all()).toEqual(
        expected,
      );
    }
    expect(
      store.sqlite
        .prepare("SELECT id, amount_cents, amount_source FROM payment_occurrences ORDER BY id")
        .all(),
    ).toEqual([
      { id: "oct", amount_cents: 15000, amount_source: "inherited" },
      { id: "sep", amount_cents: 15000, amount_source: "manual" },
    ]);
    expect(store.sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(store.sqlite.prepare("PRAGMA foreign_keys").get()).toMatchObject({ foreign_keys: 1 });
    store.sqlite.exec("UPDATE payment_occurrences SET amount_cents = NULL WHERE id = 'oct'");
    expect(() =>
      store.sqlite.exec("UPDATE payment_occurrences SET amount_cents = 1.5 WHERE id = 'oct'"),
    ).toThrow();
    expect(() =>
      store.sqlite.exec("UPDATE payment_occurrences SET amount_cents = 0 WHERE id = 'oct'"),
    ).toThrow();
    expect(() =>
      store.sqlite.exec("UPDATE payment_occurrences SET user_id = 'bea' WHERE id = 'oct'"),
    ).toThrow();
  } finally {
    store.sqlite.close();
  }
});

it("quita sólo montos futuros heredados y conserva el mes actual, ajustes propios, pagos y avisos", () => {
  const store = testD1({
    beforeMigration(sqlite, name) {
      if (!name.startsWith("0003_")) return;
      sqlite.exec(`
      INSERT INTO accounts VALUES ('ars','ana','Pesos','ARS',500000);
      INSERT INTO accounts VALUES ('usd','ana','Dólares','USD',2500);
      INSERT INTO payment_rules VALUES ('r','ana','Servicio',15000,'ARS','2026-10-20','monthly','r-key','hash');
      INSERT INTO payment_rules VALUES ('one','ana','Único',20000,'ARS','2027-03-20','once','one-key','hash');
      INSERT INTO payment_occurrences VALUES ('oct','r','ana','2026-10-20',14500,'manual','ARS');
      INSERT INTO payment_occurrences VALUES ('nov','r','ana','2026-11-20',15000,'inherited','ARS');
      INSERT INTO payment_occurrences VALUES ('dec','r','ana','2026-12-20',15000,'inherited','ARS');
      INSERT INTO payment_occurrences VALUES ('jan','r','ana','2027-01-20',17000,'manual','ARS');
      INSERT INTO payment_occurrences VALUES ('feb','r','ana','2027-02-20',15000,'inherited','ARS');
      INSERT INTO payment_occurrences VALUES ('single','one','ana','2027-03-20',20000,'manual','ARS');
      INSERT INTO entries VALUES ('paid','ana','expense','ars',NULL,16000,'ARS','Servicio','Servicios','2026-11-17','feb','pay-key','pay-hash','2026-11-17T15:00:00Z');
      INSERT INTO dismissed_payment_notices VALUES ('notice','ana','oct','ARS','2026-11-01T15:00:00Z');
      INSERT INTO payment_mutations VALUES ('receipt','ana','feb','ARS','receipt-key','receipt-hash','2026-11-17T15:00:00Z');
    `);
    },
  });
  try {
    const values = store.sqlite
      .prepare("SELECT id,amount_cents FROM payment_occurrences ORDER BY id")
      .all();
    expect(values).toEqual([
      { id: "dec", amount_cents: null },
      { id: "feb", amount_cents: 15000 },
      { id: "jan", amount_cents: 17000 },
      { id: "nov", amount_cents: 15000 },
      { id: "oct", amount_cents: 14500 },
      { id: "single", amount_cents: 20000 },
    ]);
    expect(
      store.sqlite.prepare("SELECT amount_cents FROM payment_rules WHERE id='r'").get(),
    ).toMatchObject({ amount_cents: null });
    expect(
      store.sqlite.prepare("SELECT amount_cents FROM payment_rules WHERE id='one'").get(),
    ).toMatchObject({ amount_cents: 20000 });
    expect(
      store.sqlite.prepare("SELECT amount_cents,payload_hash FROM entries WHERE id='paid'").get(),
    ).toMatchObject({ amount_cents: 16000, payload_hash: "pay-hash" });
    expect(store.sqlite.prepare("SELECT count(*) AS n FROM payment_mutations").get()).toMatchObject(
      { n: 1 },
    );
    expect(
      store.sqlite.prepare("SELECT count(*) AS n FROM dismissed_payment_notices").get(),
    ).toMatchObject({ n: 1 });
    expect(store.sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    store.sqlite.close();
  }
});
