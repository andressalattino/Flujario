import { it, expect } from "vitest";
import { testD1 } from "./helpers/d1";
import { createDb, getSnapshot, performOperation } from "../app/db/repository.server";
import { summarize } from "../app/domain/finance";
import { today } from "../app/domain/dates";

it("no expone ni interpreta noticias del adaptador anterior fuera del control de fuentes", async () => {
  const store = testD1();
  try {
    store.sqlite
      .prepare("INSERT INTO news_editions VALUES(?,?,?,?,?)")
      .run("legacy", "daily", "2026-11-17", "2026-11-17T13:00:00Z", "historial sin revisar");
    expect((await getSnapshot(createDb(store.binding), "ana")).editions).toEqual({
      daily: null,
      weekly: null,
    });
    expect(store.sqlite.prepare("SELECT count(*) AS n FROM news_editions").get()?.n).toBe(1);
  } finally {
    store.sqlite.close();
  }
});

it("una captura no mezcla el saldo anterior con el estado posterior a un pago", async () => {
  let target = "";
  let injected = false;
  const store = testD1({
    afterRead(sqlite, query) {
      if (
        !target ||
        injected ||
        !/from\s+["`]entries["`]/i.test(query) ||
        !query.includes("order by")
      )
        return;
      injected = true;
      // Emula otro cliente justo después de leer los movimientos. En un batch
      // esa escritura externa espera al COMMIT; con lecturas sueltas se intercala.
      sqlite
        .prepare(
          "INSERT INTO entries (id,user_id,kind,account_id,target_account_id,amount_cents,currency,description,category,date,occurrence_id,request_key,payload_hash,created_at) VALUES ('concurrent','ana','expense','ana:ARS',NULL,18000,'ARS','Servicio','Servicios',?,?,'concurrent-key','hash','now')",
        )
        .run(today(), target);
    },
  });
  try {
    const db = createDb(store.binding);
    await performOperation(db, "ana", { intent: "setup", ars: 100000, usd: 0 });
    await performOperation(db, "ana", {
      intent: "payment",
      title: "Servicio",
      amount: 18000,
      keepAmount: "no",
      currency: "ARS",
      frequency: "once",
      dueDate: today(),
      requestKey: crypto.randomUUID(),
    });
    target = (await getSnapshot(db, "ana")).payments[0]!.id;
    const captured = await getSnapshot(db, "ana");
    expect(injected).toBe(true);
    expect(captured.payments[0]!.paid).toBe(
      captured.entries.some((entry) => entry.occurrenceId === target),
    );
    expect(summarize(captured, "ARS")).toMatchObject({ balance: 100000, pending: 18000 });
    const next = await getSnapshot(db, "ana");
    expect(next.payments[0]!.paid).toBe(true);
    expect(summarize(next, "ARS")).toMatchObject({ balance: 82000, pending: 0 });
  } finally {
    store.sqlite.close();
  }
});
