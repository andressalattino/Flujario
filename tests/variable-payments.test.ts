import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { testD1 } from "./helpers/d1";
import {
  createDb,
  getSnapshot,
  performOperation,
  extendPaymentOccurrences,
} from "../app/db/repository.server";
import { summarize, type Payment } from "../app/domain/finance";
import type { Operation } from "../app/domain/validation";

let store: ReturnType<typeof testD1>;
let db: ReturnType<typeof createDb>;
type Create = Extract<Operation, { intent: "payment" }>;
type Change = Extract<Operation, { intent: "edit-payment" }>;
const snapshot = () => getSnapshot(db, "ana");
const occurrence = async (month: string) =>
  (await snapshot()).payments.find((p) => p.dueDate.startsWith(month))!;
async function create(overrides: Partial<Create> = {}) {
  await performOperation(db, "ana", {
    intent: "payment",
    requestKey: crypto.randomUUID(),
    title: "Electricidad",
    currency: "ARS",
    amount: 15000,
    keepAmount: "no",
    frequency: "monthly",
    dueDate: "2026-11-20",
    ...overrides,
  });
}
const edit = (
  p: Payment,
  amount: number | null,
  futureAmount: Change["futureAmount"] = "unchanged",
): Change => ({
  intent: "edit-payment",
  currency: "ARS" as const,
  occurrenceId: p.id,
  amount,
  futureAmount,
  requestKey: crypto.randomUUID(),
});
const pay = (
  p: Payment,
  amount: number,
  futureAmount: Change["futureAmount"] = "unchanged",
): Extract<Operation, { intent: "pay" }> => ({
  intent: "pay",
  currency: "ARS" as const,
  occurrenceId: p.id,
  amount,
  futureAmount,
  date: "2026-11-17",
  requestKey: crypto.randomUUID(),
});
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-17T15:00:00Z"));
  store = testD1();
  db = createDb(store.binding);
  await performOperation(db, "ana", { intent: "setup", ars: 100000, usd: 5000 });
  await performOperation(db, "bea", { intent: "setup", ars: 0, usd: 0 });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  store.sqlite.close();
});

it("el monto inicial es propio del primer mes y los siguientes quedan pendientes sin importe", async () => {
  await create();
  expect(await occurrence("2026-11")).toMatchObject({
    amountMinor: 15000,
    amountSource: "manual",
    paid: false,
  });
  expect(await occurrence("2026-12")).toMatchObject({
    amountMinor: null,
    amountSource: "inherited",
    paid: false,
  });
  await performOperation(db, "ana", pay(await occurrence("2026-12"), 18999));
  expect(await occurrence("2026-12")).toMatchObject({ amountMinor: 18999, paid: true });
  expect(await occurrence("2027-01")).toMatchObject({ amountMinor: null, paid: false });
  expect(summarize(await snapshot(), "ARS").balance).toBe(81001);
  expect(summarize(await snapshot(), "USD").balance).toBe(5000);
});
it("puede comenzar sin ningún monto y seguir apareciendo hasta registrar un pago", async () => {
  await create({ amount: null });
  expect(summarize(await snapshot(), "ARS")).toMatchObject({
    balance: 100000,
    unknownCount: 1,
    projected: null,
  });
  await performOperation(db, "ana", pay(await occurrence("2026-11"), 1));
  expect(summarize(await snapshot(), "ARS")).toMatchObject({ balance: 99999, unknownCount: 0 });
});
it("pagar usa el importe real ingresado, aunque difiera de la sugerencia", async () => {
  await create({ keepAmount: "yes" });
  await performOperation(db, "ana", pay(await occurrence("2026-11"), 18101));
  expect((await snapshot()).entries[0]).toMatchObject({
    amountMinor: 18101,
    kind: "expense",
    currency: "ARS",
  });
  expect(await occurrence("2026-11")).toMatchObject({ amountMinor: 18101, paid: true });
  expect(await occurrence("2026-12")).toMatchObject({ amountMinor: 15000, paid: false });
});
it("editar sólo un mes no cambia los demás ni modifica el saldo", async () => {
  await create({ keepAmount: "yes" });
  await performOperation(db, "ana", edit(await occurrence("2026-12"), 17400));
  expect(await occurrence("2026-12")).toMatchObject({ amountMinor: 17400, amountSource: "manual" });
  expect(await occurrence("2027-01")).toMatchObject({
    amountMinor: 15000,
    amountSource: "inherited",
  });
  expect((await snapshot()).entries).toHaveLength(0);
  expect(summarize(await snapshot(), "ARS").balance).toBe(100000);
});
it("propaga sólo a futuros heredados pendientes y conserva ajustes manuales, vacíos y pagados", async () => {
  await create({ keepAmount: "yes" });
  await performOperation(db, "ana", edit(await occurrence("2027-01"), 27000));
  await performOperation(db, "ana", edit(await occurrence("2027-02"), null));
  await performOperation(db, "ana", pay(await occurrence("2027-03"), 29000));
  await performOperation(db, "ana", edit(await occurrence("2026-12"), 22000, "use"));
  expect((await occurrence("2026-11")).amountMinor).toBe(15000);
  expect((await occurrence("2027-01")).amountMinor).toBe(27000);
  expect((await occurrence("2027-02")).amountMinor).toBeNull();
  expect(await occurrence("2027-03")).toMatchObject({ amountMinor: 29000, paid: true });
  expect(await occurrence("2027-04")).toMatchObject({
    amountMinor: 22000,
    amountSource: "inherited",
  });
  expect(summarize(await snapshot(), "ARS").balance).toBe(71000);
});
it("dejar de mantener un importe conserva el mes actual y sus ajustes futuros", async () => {
  await create({ keepAmount: "yes" });
  await performOperation(db, "ana", edit(await occurrence("2027-01"), 25000));
  await performOperation(db, "ana", edit(await occurrence("2026-11"), 17000, "clear"));
  expect((await occurrence("2026-11")).amountMinor).toBe(17000);
  expect((await occurrence("2026-12")).amountMinor).toBeNull();
  expect((await occurrence("2027-01")).amountMinor).toBe(25000);
  vi.setSystemTime(new Date("2028-02-01T15:00:00Z"));
  await extendPaymentOccurrences(db, "ana");
  expect((await occurrence("2028-07")).amountMinor).toBeNull();
});
it("se puede mantener el importe real al pagar para próximos vencimientos", async () => {
  await create();
  await performOperation(db, "ana", pay(await occurrence("2026-11"), 19200, "use"));
  expect((await occurrence("2026-12")).amountMinor).toBe(19200);
  vi.setSystemTime(new Date("2028-02-01T15:00:00Z"));
  await extendPaymentOccurrences(db, "ana");
  expect((await occurrence("2028-07")).amountMinor).toBe(19200);
});
it("no edita pagos registrados ni deja que otro usuario edite el pendiente", async () => {
  await create();
  const current = await occurrence("2026-11");
  await expect(performOperation(db, "bea", edit(current, 999, "use"))).rejects.toMatchObject({
    status: 404,
  });
  await performOperation(db, "ana", pay(current, 10000));
  await expect(performOperation(db, "ana", edit(current, 999, "use"))).rejects.toMatchObject({
    status: 409,
  });
  expect((await occurrence("2026-12")).amountMinor).toBeNull();
  expect(summarize(await snapshot(), "ARS").balance).toBe(90000);
});
it("el último guardado gana, pero reenviar una edición anterior no la vuelve a ejecutar", async () => {
  await create();
  const current = await occurrence("2026-11");
  const first = edit(current, 19000, "use");
  await performOperation(db, "ana", first);
  await performOperation(db, "ana", edit(current, 23000, "use"));
  await performOperation(db, "ana", first);
  expect((await occurrence("2026-11")).amountMinor).toBe(23000);
  expect((await occurrence("2026-12")).amountMinor).toBe(23000);
  await expect(performOperation(db, "ana", { ...first, amount: 24000 })).rejects.toMatchObject({
    status: 409,
  });
});
it("dos pagos simultáneos con claves distintas producen un solo gasto", async () => {
  await create();
  const current = await occurrence("2026-11");
  const results = await Promise.allSettled([
    performOperation(db, "ana", pay(current, 15000)),
    performOperation(db, "ana", pay(current, 16000)),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { status: 409 } });
  expect((await snapshot()).entries).toHaveLength(1);
});
it("dos reintentos simultáneos del mismo pago se confirman una sola vez", async () => {
  await create();
  const operation = pay(await occurrence("2026-11"), 15000, "use");
  await Promise.all([
    performOperation(db, "ana", operation),
    performOperation(db, "ana", operation),
  ]);
  expect((await snapshot()).entries).toHaveLength(1);
  expect(
    store.sqlite.prepare("SELECT count(*) AS total FROM payment_mutations").get(),
  ).toMatchObject({ total: 1 });
});
it("los comprobantes SQL también rechazan cruces de dueño y moneda", async () => {
  await create();
  const current = await occurrence("2026-11");
  const insert = store.sqlite.prepare("INSERT INTO payment_mutations VALUES (?,?,?,?,?,?,?)");
  expect(() => insert.run("bad-owner", "bea", current.id, "ARS", "key", "hash", "now")).toThrow();
  expect(() =>
    insert.run("bad-currency", "ana", current.id, "USD", "key", "hash", "now"),
  ).toThrow();
});
it("si falla el gasto, revierte también el comprobante y el cambio a meses futuros", async () => {
  await create();
  const operation = pay(await occurrence("2026-11"), 18000, "use");
  store.sqlite.exec(
    "CREATE TRIGGER fail_payment BEFORE INSERT ON entries BEGIN SELECT RAISE(ABORT, 'fallo de prueba'); END",
  );
  await expect(performOperation(db, "ana", operation)).rejects.toThrow();
  expect((await occurrence("2026-12")).amountMinor).toBeNull();
  expect(
    store.sqlite.prepare("SELECT count(*) AS total FROM payment_mutations").get(),
  ).toMatchObject({ total: 0 });
  store.sqlite.exec("DROP TRIGGER fail_payment");
  await performOperation(db, "ana", operation);
  expect((await occurrence("2026-12")).amountMinor).toBe(18000);
});

function pauseNextBatch() {
  let resume!: () => void;
  let reached!: () => void;
  const atBatch = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const released = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const original = store.binding.batch.bind(store.binding);
  let first = true;
  vi.spyOn(store.binding, "batch").mockImplementation(async (statements) => {
    if (first) {
      first = false;
      reached();
      await released;
    }
    return original(statements);
  });
  return { atBatch, resume };
}
it("rechaza una edición si otra pestaña pagó después de la lectura inicial", async () => {
  await create();
  const current = await occurrence("2026-11");
  const gate = pauseNextBatch();
  const editing = performOperation(db, "ana", edit(current, 999, "use"));
  const rejected = expect(editing).rejects.toMatchObject({ status: 409 });
  await gate.atBatch;
  await performOperation(db, "ana", pay(current, 18000));
  gate.resume();
  await rejected;
  expect((await occurrence("2026-11")).amountMinor).toBe(18000);
  expect((await occurrence("2026-12")).amountMinor).toBeNull();
  expect(summarize(await snapshot(), "ARS").balance).toBe(82000);
});
it("al completar meses, lee la sugerencia vigente aunque haya cambiado durante la generación", async () => {
  await create({ keepAmount: "yes" });
  vi.setSystemTime(new Date("2028-02-01T15:00:00Z"));
  const gate = pauseNextBatch();
  const extending = extendPaymentOccurrences(db, "ana");
  await gate.atBatch;
  await performOperation(db, "ana", edit(await occurrence("2026-11"), 22000, "use"));
  gate.resume();
  await extending;
  expect((await occurrence("2028-07")).amountMinor).toBe(22000);
});
