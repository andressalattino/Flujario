import { beforeEach, afterEach, it, expect } from "vitest";
import { testD1 } from "./helpers/d1";
import { createDb, getSnapshot, performOperation } from "../app/db/repository.server";
import { summarize, entryDisplay, entryAffectsCurrency } from "../app/domain/finance";
import { operationSchema, type Operation } from "../app/domain/validation";
import { convertMinor } from "../app/domain/exchange";
import { parseRate } from "../app/domain/decimal";
import { today } from "../app/domain/dates";

let store: ReturnType<typeof testD1>;
let db: ReturnType<typeof createDb>;
const exchange = (
  overrides: Partial<Extract<Operation, { intent: "exchange" }>> = {},
): Extract<Operation, { intent: "exchange" }> => ({
  intent: "exchange",
  currency: "ARS",
  targetCurrency: "USD",
  amount: 15000000,
  targetAmount: 10000,
  rate: "1500",
  quoteId: "",
  date: today(),
  requestKey: crypto.randomUUID(),
  ...overrides,
});
beforeEach(async () => {
  store = testD1();
  db = createDb(store.binding);
  await performOperation(db, "ana", { intent: "setup", ars: 20000000, usd: 2000 });
  await performOperation(db, "bea", { intent: "setup", ars: 0, usd: 0 });
});
afterEach(() => store.sqlite.close());
it("registra ambas monedas sin inflar ingresos o gastos y conserva el cambio al actualizar referencias", async () => {
  await performOperation(db, "ana", exchange());
  const snapshot = await getSnapshot(db, "ana");
  expect(summarize(snapshot, "ARS")).toMatchObject({ balance: 5000000, income: 0, expenses: 0 });
  expect(summarize(snapshot, "USD")).toMatchObject({ balance: 12000, income: 0, expenses: 0 });
  expect(snapshot.entries).toHaveLength(1);
  expect(snapshot.entries[0]).toMatchObject({ kind: "exchange", exchangeRate: "1500" });
  expect((await getSnapshot(db, "bea")).entries).toHaveLength(0);
  const entry = snapshot.entries[0]!;
  expect(entryDisplay(entry, "ARS")).toMatchObject({
    sign: "− ",
    amountMinor: 15000000,
    currency: "ARS",
  });
  expect(entryDisplay(entry, "USD")).toMatchObject({
    sign: "+ ",
    amountMinor: 10000,
    currency: "USD",
  });
  expect(entryAffectsCurrency(entry, "EUR")).toBe(false);
});
it("un reintento simultáneo produce un solo cambio y rechaza reutilizar la clave con otro contenido", async () => {
  const operation = exchange();
  await Promise.all([
    performOperation(db, "ana", operation),
    performOperation(db, "ana", operation),
  ]);
  await expect(
    performOperation(db, "ana", { ...operation, targetAmount: 9999 }),
  ).rejects.toMatchObject({ status: 409 });
  expect((await getSnapshot(db, "ana")).entries).toHaveLength(1);
});
it("la venta de dólares resta USD y suma los pesos realmente recibidos", async () => {
  await performOperation(
    db,
    "ana",
    exchange({
      currency: "USD",
      targetCurrency: "ARS",
      amount: 1000,
      targetAmount: 1530000,
      rate: "1530",
    }),
  );
  const snapshot = await getSnapshot(db, "ana");
  expect(summarize(snapshot, "USD").balance).toBe(1000);
  expect(summarize(snapshot, "ARS").balance).toBe(21530000);
});
it("guarda los dos importes confirmados aunque el recibido difiera de la sugerencia", async () => {
  await performOperation(db, "ana", exchange({ targetAmount: 9998 }));
  expect(summarize(await getSnapshot(db, "ana"), "USD").balance).toBe(11998);
});
it("agregar moneda es independiente del ingreso, admite reintento y conserva su saldo inicial", async () => {
  const operation: Operation = { intent: "add-currency", currency: "CLP", opening: 100000 };
  await Promise.all([
    performOperation(db, "ana", operation),
    performOperation(db, "ana", operation),
  ]);
  const snapshot = await getSnapshot(db, "ana");
  expect(snapshot.accounts.filter((a) => a.currency === "CLP")).toHaveLength(1);
  expect(summarize(snapshot, "CLP")).toMatchObject({ balance: 100000, income: 0 });
  expect(summarize(snapshot, "ARS").balance).toBe(20000000);
  await expect(performOperation(db, "ana", { ...operation, opening: 999 })).rejects.toMatchObject({
    status: 409,
  });
});
it("puede cambiar entre dos monedas agregadas y conserva la unidad mínima de CLP", async () => {
  await performOperation(db, "ana", { intent: "add-currency", currency: "CLP", opening: 50000 });
  await performOperation(db, "ana", { intent: "add-currency", currency: "UYU", opening: 0 });
  await performOperation(
    db,
    "ana",
    exchange({
      currency: "CLP",
      targetCurrency: "UYU",
      amount: 15000,
      targetAmount: 60000,
      rate: "25",
    }),
  );
  const snapshot = await getSnapshot(db, "ana");
  expect(summarize(snapshot, "CLP").balance).toBe(35000);
  expect(summarize(snapshot, "UYU").balance).toBe(60000);
});
it("rechaza una moneda no agregada, referencias ajenas al par y fechas futuras", async () => {
  await expect(performOperation(db, "ana", exchange({ targetCurrency: "EUR" }))).rejects.toThrow();
  await expect(performOperation(db, "ana", exchange({ quoteId: "inexistente" }))).rejects.toThrow();
  await expect(performOperation(db, "ana", exchange({ date: "2099-01-01" }))).rejects.toThrow();
  expect((await getSnapshot(db, "ana")).entries).toHaveLength(0);
});
it("el servidor deriva las cuentas del dueño y las FK bloquean cruces incluso mediante SQL", async () => {
  const parsed = operationSchema.parse({
    ...exchange(),
    amount: "150.000,00",
    targetAmount: "100",
    rate: "1.500",
    accountId: "bea:ARS",
    targetAccountId: "bea:USD",
    userId: "bea",
  });
  expect(parsed).not.toHaveProperty("accountId");
  await performOperation(db, "ana", parsed);
  const entry = (await getSnapshot(db, "ana")).entries[0]!;
  expect(entry).toMatchObject({ accountId: "ana:ARS", targetAccountId: "ana:USD" });
  expect(() =>
    store.sqlite.prepare("UPDATE entries SET target_account_id='bea:USD' WHERE id=?").run(entry.id),
  ).toThrow();
  expect(() =>
    store.sqlite.prepare("UPDATE entries SET target_currency='ARS' WHERE id=?").run(entry.id),
  ).toThrow();
  expect(() =>
    store.sqlite.prepare("UPDATE entries SET target_amount_minor=NULL WHERE id=?").run(entry.id),
  ).toThrow();
  expect(() =>
    store.sqlite.prepare("UPDATE entries SET target_amount_minor=1.5 WHERE id=?").run(entry.id),
  ).toThrow();
  expect(() =>
    store.sqlite.prepare("UPDATE entries SET exchange_rate='0' WHERE id=?").run(entry.id),
  ).toThrow();
});
it("si el registro falla no modifica ninguno de los saldos", async () => {
  store.sqlite.exec(
    "CREATE TRIGGER fail_exchange BEFORE INSERT ON entries BEGIN SELECT RAISE(ABORT,'fallo de prueba'); END",
  );
  await expect(performOperation(db, "ana", exchange())).rejects.toThrow();
  const snapshot = await getSnapshot(db, "ana");
  expect(summarize(snapshot, "ARS").balance).toBe(20000000);
  expect(summarize(snapshot, "USD").balance).toBe(2000);
});
it.each([
  [100, "USD", "ARS", "1.005", 101],
  [10000, "ARS", "USD", "3", 3333],
  [100, "USD", "ARS", "1500.12345678", 150012],
  [10000, "ARS", "CLP", "1.5", 67],
  [100000, "CLP", "USD", "1000", 10000],
  [10000, "USD", "CLP", "0.001", 100000],
] as const)(
  "calcula %s %s → %s sin float y redondea mitad hacia arriba",
  (amount, from, to, rate, expected) => expect(convertMinor(amount, from, to, rate)).toBe(expected),
);
it("valida monedas, unidades mínimas y cotizaciones sin cambiar las reglas de ARS/USD", () => {
  expect(
    operationSchema.parse({ intent: "add-currency", currency: "CLP", opening: "15.000" }),
  ).toMatchObject({ opening: 15000 });
  expect(
    operationSchema.safeParse({ intent: "add-currency", currency: "CLP", opening: "15.000,50" })
      .success,
  ).toBe(false);
  expect(
    operationSchema.safeParse({ intent: "add-currency", currency: "XYZ", opening: "0" }).success,
  ).toBe(false);
  for (const rate of ["0", "-1", "1,000000001", "1e3", "NaN"])
    expect(() => parseRate(rate)).toThrow();
  expect(() => convertMinor(1, "USD", "ARS", "0.001")).toThrow();
  expect(() => convertMinor(1000000000000, "USD", "ARS", "999999999999")).toThrow();
});
