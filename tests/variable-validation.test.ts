import { expect, it } from "vitest";
import { operationSchema } from "../app/domain/validation";
import { moneyInput, parseMoney, MAX_MINOR } from "../app/domain/money";

const payment = {
  intent: "payment",
  title: "Electricidad",
  amount: "32.000,50",
  currency: "ARS",
  dueDate: "2026-11-23",
  frequency: "monthly",
  requestKey: crypto.randomUUID(),
};
it("el importe del mes no se mantiene por defecto y puede quedar sin definir", () => {
  expect(operationSchema.parse(payment)).toMatchObject({ amount: 3200050, keepAmount: "no" });
  expect(operationSchema.parse({ ...payment, amount: "" })).toMatchObject({
    amount: null,
    keepAmount: "no",
  });
  expect(operationSchema.safeParse({ ...payment, amount: "", keepAmount: "yes" }).success).toBe(
    false,
  );
});
it.each(["0", "-1", "NaN", "1.5", "1,005"])("no admite un importe inválido %s", (amount) => {
  expect(operationSchema.safeParse({ ...payment, amount }).success).toBe(false);
});
it("pagar exige un importe positivo aunque el vencimiento no lo tuviera", () => {
  const pay = {
    intent: "pay",
    currency: "ARS" as const,
    occurrenceId: "p",
    date: "2026-11-13",
    requestKey: crypto.randomUUID(),
  };
  expect(operationSchema.safeParse(pay).success).toBe(false);
  expect(operationSchema.safeParse({ ...pay, amount: "" }).success).toBe(false);
  expect(operationSchema.parse({ ...pay, amount: "18.100,01" })).toMatchObject({
    amount: 1810001,
    futureAmount: "unchanged",
  });
});
it("un formulario conserva exactamente los centavos al precargar un importe", () => {
  expect(moneyInput(null)).toBe("");
  for (const cents of [1, 101, 3200050, MAX_MINOR])
    expect(parseMoney(moneyInput(cents))).toBe(cents);
});
