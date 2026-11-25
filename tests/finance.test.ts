import { it, expect } from "vitest";
import { accountBalance, summarize, type Snapshot, type Entry } from "../app/domain/finance";
const base: Snapshot = {
  accounts: [
    { id: "a", name: "ARS", currency: "ARS", openingMinor: 10000 },
    { id: "b", name: "Banco", currency: "ARS", openingMinor: 0 },
    { id: "u", name: "USD", currency: "USD", openingMinor: 100 },
  ],
  entries: [],
  payments: [],
  favorites: [],
  editions: { daily: null, weekly: null },
  asOf: "2026-11-13",
  dismissedPaymentIds: [],
  paymentNoticeFingerprint: null,
  quotes: [],
  quoteState: { status: "never", lastAttemptAt: null, nextAttemptAt: null },
};
it("una transferencia conserva el total y no es un gasto", () => {
  const transfer: Entry = {
    id: "t",
    kind: "transfer",
    accountId: "a",
    targetAccountId: "b",
    amountMinor: 5000,
    currency: "ARS",
    description: "Transferencia",
    category: "Otros",
    date: "2026-11-13",
  };
  expect(accountBalance(base.accounts[0]!, [transfer])).toBe(5000);
  expect(accountBalance(base.accounts[1]!, [transfer])).toBe(5000);
  expect(summarize({ ...base, entries: [transfer] }, "ARS")).toMatchObject({
    balance: 10000,
    expenses: 0,
  });
});
it("las obligaciones sólo afectan la proyección; no mezcla monedas", () => {
  const state: Snapshot = {
    ...base,
    payments: [
      {
        id: "p",
        title: "Impuesto",
        amountMinor: 3000,
        amountSource: "manual",
        currency: "ARS",
        dueDate: "2026-11-20",
        frequency: "monthly",
        paid: false,
      },
    ],
  };
  expect(summarize(state, "ARS")).toMatchObject({ balance: 10000, pending: 3000, projected: 7000 });
  expect(summarize(state, "USD").balance).toBe(100);
});
it("un pendiente sin importe impide presentar una proyección completa y no cambia el saldo", () => {
  const payment = {
    id: "unknown",
    title: "Luz",
    amountMinor: null,
    amountSource: "inherited" as const,
    currency: "ARS" as const,
    dueDate: "2026-11-20",
    frequency: "monthly" as const,
    paid: false,
  };
  const snapshot = { ...base, payments: [payment, { ...payment, id: "known", amountMinor: 3500 }] };
  expect(summarize(snapshot, "ARS")).toMatchObject({
    balance: 10000,
    pending: 3500,
    unknownCount: 1,
    projected: null,
  });
  expect(summarize(snapshot, "USD")).toMatchObject({ unknownCount: 0, projected: 100 });
});
it("excluye ingresos futuros del saldo real", () => {
  const entry: Entry = {
    id: "future",
    kind: "income",
    accountId: "a",
    targetAccountId: null,
    amountMinor: 10000,
    currency: "ARS",
    description: "Futuro",
    category: "Trabajo",
    date: "2026-11-14",
  };
  expect(summarize({ ...base, entries: [entry] }, "ARS").balance).toBe(10000);
});
