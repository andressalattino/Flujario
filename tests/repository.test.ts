import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { testD1 } from "./helpers/d1";
import { createDb, getSnapshot, performOperation } from "../app/db/repository.server";
import { summarize } from "../app/domain/finance";
import { today } from "../app/domain/dates";
import { operationSchema, type Operation } from "../app/domain/validation";
let store: ReturnType<typeof testD1>;
let db: ReturnType<typeof createDb>;
beforeEach(async () => {
  store = testD1();
  db = createDb(store.binding);
  await performOperation(db, "ana", { intent: "setup", ars: 100000, usd: 5000 });
  await performOperation(db, "bea", { intent: "setup", ars: 50000, usd: 0 });
});
afterEach(() => store.sqlite.close());
const entry = (): Extract<Operation, { intent: "entry" }> => ({
  intent: "entry",
  requestKey: crypto.randomUUID(),
  kind: "expense",
  currency: "ARS",
  amount: 15000,
  description: "Compra de prueba",
  category: "Otros",
  date: today(),
});
const expenseEdit = (entryId: string, amount = "240,50") =>
  operationSchema.parse({
    intent: "edit-expense",
    requestKey: crypto.randomUUID(),
    entryId,
    currency: "ARS",
    amount,
    description: "Suscripción corregida",
    category: "Suscripciones",
    date: "2026-11-02",
  }) as Extract<Operation, { intent: "edit-expense" }>;

it("edita un solo gasto, recalcula su saldo y conserva el historial ante reintentos", async () => {
  await performOperation(db, "ana", { ...entry(), date: "2026-11-01" });
  const original = (await getSnapshot(db, "ana")).entries[0]!;
  const firstEdit = expenseEdit(original.id);
  await Promise.all([
    performOperation(db, "ana", firstEdit),
    performOperation(db, "ana", firstEdit),
  ]);
  const secondEdit = expenseEdit(original.id, "250,50");
  await performOperation(db, "ana", secondEdit);
  await performOperation(db, "ana", firstEdit);

  const snapshot = await getSnapshot(db, "ana");
  expect(snapshot.entries).toHaveLength(1);
  expect(snapshot.entries[0]).toMatchObject({
    id: original.id,
    amountMinor: 25050,
    date: "2026-11-02",
    description: "Suscripción corregida",
    category: "Suscripciones",
    imported: false,
  });
  expect(summarize(snapshot, "ARS").balance).toBe(74950);
  expect(summarize(snapshot, "USD").balance).toBe(5000);
  expect(
    store.sqlite
      .prepare(
        `SELECT previous_amount_cents, amount_cents, previous_category, previous_date, date
    FROM expense_edits WHERE entry_id=? ORDER BY previous_amount_cents`,
      )
      .all(original.id),
  ).toEqual([
    {
      previous_amount_cents: 15000,
      amount_cents: 24050,
      previous_category: "Otros",
      previous_date: "2026-11-01",
      date: "2026-11-02",
    },
    {
      previous_amount_cents: 24050,
      amount_cents: 25050,
      previous_category: "Suscripciones",
      previous_date: "2026-11-02",
      date: "2026-11-02",
    },
  ]);
  await expect(performOperation(db, "ana", { ...firstEdit, amount: 1 })).rejects.toMatchObject({
    status: 409,
  });
});

it("rechaza edición ajena, cambios de moneda, fechas inválidas para el saldo e ingresos", async () => {
  await performOperation(db, "ana", { ...entry(), date: "2026-11-02" });
  const expense = (await getSnapshot(db, "ana")).entries[0]!;
  const edit = expenseEdit(expense.id);
  await expect(performOperation(db, "bea", edit)).rejects.toMatchObject({ status: 404 });
  await expect(performOperation(db, "ana", { ...edit, currency: "USD" })).rejects.toMatchObject({
    status: 404,
  });
  await expect(performOperation(db, "ana", { ...edit, date: "2200-01-01" })).rejects.toThrow(
    "futura",
  );
  store.sqlite
    .prepare("UPDATE accounts SET opening_date='2026-11-02' WHERE id=?")
    .run(expense.accountId);
  await expect(performOperation(db, "ana", { ...edit, date: "2026-11-01" })).rejects.toThrow(
    "saldo inicial",
  );
  await performOperation(db, "ana", { ...entry(), kind: "income" });
  const income = (await getSnapshot(db, "ana")).entries.find(
    (movement) => movement.kind === "income",
  )!;
  await expect(performOperation(db, "ana", expenseEdit(income.id))).rejects.toMatchObject({
    status: 404,
  });
  expect(store.sqlite.prepare("SELECT count(*) n FROM expense_edits").get()).toEqual({ n: 0 });
});

it("revierte el historial si falla la actualización del gasto", async () => {
  await performOperation(db, "ana", entry());
  const original = (await getSnapshot(db, "ana")).entries[0]!;
  store.sqlite.exec(
    "CREATE TRIGGER qa_stop_expense_edit BEFORE UPDATE ON entries BEGIN SELECT RAISE(ABORT, 'qa'); END;",
  );
  await expect(performOperation(db, "ana", expenseEdit(original.id))).rejects.toThrow();
  expect((await getSnapshot(db, "ana")).entries[0]).toEqual(original);
  expect(store.sqlite.prepare("SELECT count(*) n FROM expense_edits").get()).toEqual({ n: 0 });
});

describe("Persistencia financiera y aislamiento de usuarios", () => {
  it("guarda un movimiento y no lo expone a otra persona", async () => {
    await performOperation(db, "ana", entry());
    expect((await getSnapshot(db, "ana")).entries).toHaveLength(1);
    expect((await getSnapshot(db, "bea")).entries).toHaveLength(0);
  });
  it("un reintento idéntico no duplica un gasto", async () => {
    const operation = entry();
    await performOperation(db, "ana", operation);
    await performOperation(db, "ana", operation);
    expect(summarize(await getSnapshot(db, "ana"), "ARS")).toMatchObject({
      balance: 85000,
      expenses: 15000,
    });
  });
  it("rechaza reutilizar una clave con otro importe", async () => {
    const operation = entry();
    await performOperation(db, "ana", operation);
    await expect(
      performOperation(db, "ana", { ...operation, amount: 99999 }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("dos envíos simultáneos con la misma clave producen un solo gasto", async () => {
    const operation = entry();
    await Promise.all([
      performOperation(db, "ana", operation),
      performOperation(db, "ana", operation),
    ]);
    expect((await getSnapshot(db, "ana")).entries).toHaveLength(1);
  });
  it("una misma clave de envío se puede usar en dos usuarios sin cruzar registros", async () => {
    const operation = entry();
    await performOperation(db, "ana", operation);
    await performOperation(db, "bea", operation);
    const ana = await getSnapshot(db, "ana");
    const bea = await getSnapshot(db, "bea");
    expect(ana.entries).toHaveLength(1);
    expect(bea.entries).toHaveLength(1);
    expect(ana.entries[0]!.id).not.toBe(bea.entries[0]!.id);
  });
  it("una obligación no se descuenta y al pagar se genera exactamente un gasto", async () => {
    await performOperation(db, "ana", {
      intent: "payment",
      keepAmount: "yes",
      requestKey: crypto.randomUUID(),
      title: "Impuesto",
      amount: 20000,
      currency: "ARS",
      frequency: "once",
      dueDate: today(),
    });
    const before = await getSnapshot(db, "ana");
    expect(before.payments[0]?.paid).toBe(false);
    expect(summarize(before, "ARS").balance).toBe(100000);
    const payment: Operation = {
      intent: "pay",
      currency: "ARS" as const,
      amount: 20000,
      futureAmount: "unchanged",
      requestKey: crypto.randomUUID(),
      occurrenceId: before.payments[0]!.id,
      date: today(),
    };
    await performOperation(db, "ana", payment);
    await performOperation(db, "ana", payment);
    const after = await getSnapshot(db, "ana");
    expect(after.payments[0]?.paid).toBe(true);
    expect(after.entries).toHaveLength(1);
    expect(summarize(after, "ARS")).toMatchObject({ balance: 80000, expenses: 20000, pending: 0 });
    await expect(performOperation(db, "ana", expenseEdit(after.entries[0]!.id))).rejects.toThrow(
      "pago registrado",
    );
    await expect(
      performOperation(db, "ana", { ...payment, requestKey: crypto.randomUUID() }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("impide pagar un vencimiento de otra persona", async () => {
    await performOperation(db, "ana", {
      intent: "payment",
      keepAmount: "yes",
      requestKey: crypto.randomUUID(),
      title: "Privado",
      amount: 200,
      currency: "ARS",
      frequency: "once",
      dueDate: today(),
    });
    const snapshot = await getSnapshot(db, "ana");
    await expect(
      performOperation(db, "bea", {
        intent: "pay",
        currency: "ARS" as const,
        amount: 20000,
        futureAmount: "unchanged",
        requestKey: crypto.randomUUID(),
        occurrenceId: snapshot.payments[0]!.id,
        date: today(),
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("los favoritos también pertenecen al usuario", async () => {
    await performOperation(db, "ana", { intent: "favorite", symbol: "MELI", saved: "yes" });
    await performOperation(db, "ana", { intent: "favorite", symbol: "MELI", saved: "yes" });
    await performOperation(db, "bea", { intent: "favorite", symbol: "MELI", saved: "no" });
    expect((await getSnapshot(db, "ana")).favorites).toEqual(["MELI"]);
    expect((await getSnapshot(db, "bea")).favorites).toEqual([]);
  });
  it("no permite volver a cargar el saldo inicial", async () =>
    await expect(
      performOperation(db, "ana", { intent: "setup", ars: 999999, usd: 0 }),
    ).rejects.toMatchObject({ status: 409 }));
  it("permite negativos sin alterar la otra moneda", async () => {
    await performOperation(db, "ana", { ...entry(), amount: 150000 });
    const snapshot = await getSnapshot(db, "ana");
    expect(summarize(snapshot, "ARS").balance).toBe(-50000);
    expect(summarize(snapshot, "USD").balance).toBe(5000);
  });
  it("genera vencimientos mensuales anclados, sin duplicar al reintentar", async () => {
    const operation: Operation = {
      intent: "payment",
      keepAmount: "yes",
      requestKey: crypto.randomUUID(),
      title: "Servicio",
      amount: 2500,
      currency: "USD",
      frequency: "monthly",
      dueDate: "2026-01-31",
    };
    await performOperation(db, "ana", operation);
    await performOperation(db, "ana", operation);
    const payments = (await getSnapshot(db, "ana")).payments;
    expect(payments.map((p) => p.dueDate)).toContain("2026-02-28");
    expect(payments.map((p) => p.dueDate)).toContain("2026-03-31");
    expect(new Set(payments.map((p) => p.id)).size).toBe(payments.length);
  });
  it("las claves compuestas SQL bloquean cruce de dueño y moneda", () => {
    const insert = store.sqlite.prepare(
      "INSERT INTO entries (id,user_id,kind,account_id,amount_cents,currency,description,category,date,request_key,payload_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    );
    expect(() =>
      insert.run(
        "bad",
        "bea",
        "expense",
        "ana:ARS",
        1,
        "ARS",
        "Cruce",
        "Otros",
        today(),
        "bad",
        "hash",
        "now",
      ),
    ).toThrow();
    expect(() =>
      insert.run(
        "bad",
        "ana",
        "expense",
        "ana:ARS",
        1,
        "USD",
        "Cruce",
        "Otros",
        today(),
        "bad",
        "hash",
        "now",
      ),
    ).toThrow();
    expect(() =>
      insert.run(
        "bad",
        "ana",
        "expense",
        "ana:ARS",
        1.5,
        "ARS",
        "Decimal",
        "Otros",
        today(),
        "bad",
        "hash",
        "now",
      ),
    ).toThrow();
  });
  it("un batch que falla revierte todas sus escrituras", async () => {
    await expect(
      store.binding.batch([
        store.binding.prepare("INSERT INTO favorites VALUES ('f','ana','AAPL')"),
        store.binding.prepare("INSERT INTO accounts VALUES ('bad','ana','Duplicada','ARS',0)"),
      ]),
    ).rejects.toThrow();
    expect((await getSnapshot(db, "ana")).favorites).toEqual([]);
  });
});
