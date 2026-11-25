import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { testD1 } from "./helpers/d1";
import {
  createDb,
  getSnapshot,
  performOperation,
  extendPaymentOccurrences,
} from "../app/db/repository.server";
import { summarize } from "../app/domain/finance";
import { visiblePaymentNotices, paymentsInMonth } from "../app/domain/payments";
let store: ReturnType<typeof testD1>;
let db: ReturnType<typeof createDb>;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-14T15:00:00Z"));
  store = testD1();
  db = createDb(store.binding);
  await performOperation(db, "ana", { intent: "setup", ars: 100000, usd: 0 });
  await performOperation(db, "bea", { intent: "setup", ars: 100000, usd: 0 });
  await performOperation(db, "ana", {
    intent: "payment",
    keepAmount: "yes",
    requestKey: crypto.randomUUID(),
    title: "Servicio mensual",
    amount: 10000,
    currency: "ARS",
    dueDate: "2026-09-20",
    frequency: "monthly",
  });
});
afterEach(() => {
  store.sqlite.close();
  vi.useRealTimers();
});
it("silenciar persiste sin pagar nada ni cambiar saldos o proyecciones", async () => {
  const before = await getSnapshot(db, "ana");
  await performOperation(db, "ana", {
    intent: "dismiss-payment-notices",
    fingerprint: before.paymentNoticeFingerprint!,
  });
  const after = await getSnapshot(db, "ana");
  expect(after.paymentNoticeFingerprint).toBeNull();
  expect(after.dismissedPaymentIds).toHaveLength(2);
  expect(after.entries).toHaveLength(0);
  expect(after.payments.filter((p) => p.paid)).toHaveLength(0);
  expect(summarize(after, "ARS")).toEqual(summarize(before, "ARS"));
});
it("el siguiente vencimiento vuelve a avisar cuando su mes cierra", async () => {
  const before = await getSnapshot(db, "ana");
  await performOperation(db, "ana", {
    intent: "dismiss-payment-notices",
    fingerprint: before.paymentNoticeFingerprint!,
  });
  vi.setSystemTime(new Date("2026-12-01T15:00:00Z"));
  const after = await getSnapshot(db, "ana");
  expect(
    visiblePaymentNotices(after.payments, after.asOf, after.dismissedPaymentIds).map(
      (p) => p.dueDate,
    ),
  ).toEqual(["2026-11-20"]);
});
it("la preferencia no se cruza entre usuarios", async () => {
  const before = await getSnapshot(db, "ana");
  await performOperation(db, "bea", {
    intent: "dismiss-payment-notices",
    fingerprint: before.paymentNoticeFingerprint!,
  });
  expect((await getSnapshot(db, "ana")).paymentNoticeFingerprint).toBe(
    before.paymentNoticeFingerprint,
  );
  expect((await getSnapshot(db, "bea")).dismissedPaymentIds).toEqual([]);
  expect(() =>
    store.sqlite
      .prepare("INSERT INTO dismissed_payment_notices VALUES (?,?,?,?,?)")
      .run("bad", "bea", before.payments[0]!.id, "ARS", "now"),
  ).toThrow();
});
it("si la lista cambia, no silencia vencimientos que el usuario no vio", async () => {
  const before = await getSnapshot(db, "ana");
  await performOperation(db, "ana", {
    intent: "payment",
    keepAmount: "yes",
    requestKey: crypto.randomUUID(),
    title: "Otro pendiente",
    amount: 100,
    currency: "ARS",
    dueDate: "2026-10-01",
    frequency: "once",
  });
  await expect(
    performOperation(db, "ana", {
      intent: "dismiss-payment-notices",
      fingerprint: before.paymentNoticeFingerprint!,
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect((await getSnapshot(db, "ana")).dismissedPaymentIds).toHaveLength(0);
});
it("pagar un mes no paga el siguiente ni crea gastos duplicados", async () => {
  const before = await getSnapshot(db, "ana");
  const november = paymentsInMonth(before.payments, "2026-11", "ARS")[0]!;
  const operation = {
    intent: "pay" as const,
    currency: "ARS" as const,
    amount: 10000,
    futureAmount: "unchanged" as const,
    occurrenceId: november.id,
    date: "2026-11-14",
    requestKey: crypto.randomUUID(),
  };
  await performOperation(db, "ana", operation);
  await performOperation(db, "ana", operation);
  const after = await getSnapshot(db, "ana");
  expect(paymentsInMonth(after.payments, "2026-11", "ARS", "paid")).toHaveLength(1);
  expect(paymentsInMonth(after.payments, "2026-12", "ARS", "pending")).toHaveLength(1);
  expect(after.entries).toHaveLength(1);
  expect(summarize(after, "ARS").balance).toBe(90000);
});
it("recupera meses futuros tras una pausa larga sin duplicar ni tocar otras cuentas", async () => {
  await performOperation(db, "bea", {
    intent: "payment",
    keepAmount: "yes",
    requestKey: crypto.randomUUID(),
    title: "Otro usuario",
    amount: 1000,
    currency: "ARS",
    dueDate: "2026-11-20",
    frequency: "monthly",
  });
  vi.setSystemTime(new Date("2028-02-10T15:00:00Z"));
  await extendPaymentOccurrences(db, "ana");
  const first = await getSnapshot(db, "ana");
  expect(paymentsInMonth(first.payments, "2028-07", "ARS")).toHaveLength(1);
  expect(paymentsInMonth((await getSnapshot(db, "bea")).payments, "2028-07", "ARS")).toHaveLength(
    0,
  );
  await extendPaymentOccurrences(db, "ana");
  const again = await getSnapshot(db, "ana");
  expect(again.payments).toHaveLength(first.payments.length);
  expect(again.entries).toHaveLength(0);
});
