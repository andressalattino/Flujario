import { expect, it } from "vitest";
import { createFinancialReport, type FinancialContext } from "../app/domain/assistant-analysis";
import {
  analysisPeriod,
  comparisonPeriod,
  percentChange,
  expenseShare,
  presetPlan,
  analysisPlanSchema,
} from "../app/domain/assistant";
import { emptyStatementState, type StoredStatementRow } from "../app/domain/statements";
const line = (
  id: string,
  amountMinor: number,
  kind: "income" | "expense" = "expense",
  date = "2026-11-15",
) => ({
  id,
  amountMinor,
  kind,
  date,
  currency: "ARS" as const,
  category: "Otros",
  description: id,
  occurrenceId: null,
});
const base = (): FinancialContext => ({
  ledger: [],
  statements: emptyStatementState(),
  payments: [],
});
it("mantiene centavos exactos, separa monedas y no presenta resultado como saldo de cuenta", () => {
  const context = base();
  context.ledger = [
    line("a", 101),
    line("b", 202),
    line("c", 1000, "income"),
    { ...line("usd", 99999), currency: "USD" },
  ];
  const report = createFinancialReport(context, presetPlan("most"), "ARS", "2026-11-24");
  expect(report.metrics.map((m) => m.amountMinor)).toEqual([1000, 303, 697]);
  expect(report.rows).toEqual([{ label: "Otros", amountMinor: 303, detail: "100,00 %" }]);
  expect(report.notes.join()).toContain("no es el saldo");
});
it("clasifica el pago por el desglose vigente sin sumar padre y partes, incluyendo reintegros", () => {
  const context = base();
  context.ledger = [line("tarjeta", 10000)];
  const parts = [
    { ...line("ropa", 11000), kind: "part", category: "Ropa" },
    { ...line("reintegro", -1000), kind: "part", category: "Otros" },
  ].map((r, i) => ({
    ...r,
    key: String(i),
    sourceRef: "prueba",
    duplicateAcknowledged: false,
    scope: "part",
    importId: "card",
    entryId: null,
  })) as StoredStatementRow[];
  context.statements.breakdowns = [
    {
      target: { kind: "entry", id: "tarjeta" },
      importId: "card",
      currency: "ARS",
      parentMinor: 10000,
      totalMinor: 10000,
      ready: true,
      parts,
    },
  ];
  const report = createFinancialReport(context, presetPlan("most"), "ARS", "2026-11-24");
  expect(report.metrics[1]?.amountMinor).toBe(10000);
  expect(report.rows.map((r) => r.amountMinor)).toEqual([11000, -1000]);
  expect(report.rows[1]?.detail).toBe("−10,00 %");
  const card = createFinancialReport(
    context,
    { ...presetPlan("most"), operation: "card" },
    "ARS",
    "2026-11-24",
  );
  expect(card.metrics.map((m) => m.amountMinor)).toEqual([11000, 1000, 10000]);
  expect(card.rows).toHaveLength(2);
  context.statements.breakdowns[0]!.ready = false;
  expect(createFinancialReport(context, presetPlan("most"), "ARS", "2026-11-24").rows).toEqual([
    { label: "Otros", amountMinor: 10000, detail: "100,00 %" },
  ]);
});
it("mantiene pendientes sin importe como desconocidos y no suma obligaciones como gastos", () => {
  const context = base();
  context.payments = [
    {
      id: "luz",
      title: "Luz",
      amountMinor: null,
      dueDate: "2026-11-25",
      frequency: "monthly",
      paid: false,
    },
    {
      id: "internet",
      title: "Internet",
      amountMinor: 2000,
      dueDate: "2026-11-26",
      frequency: "monthly",
      paid: false,
    },
  ];
  const plan = {
    ...presetPlan("most"),
    operation: "pending" as const,
    period: "custom" as const,
    from: "2026-11-01",
    to: "2026-11-30",
  };
  const report = createFinancialReport(context, plan, "ARS", "2026-11-24");
  expect(report.metrics[0]?.amountMinor).toBe(2000);
  expect(report.metrics[0]?.detail).toContain("incompleto");
  expect(report.rows[0]?.amountMinor).toBeNull();
  expect(
    createFinancialReport(context, presetPlan("most"), "ARS", "2026-11-24").metrics[1]?.amountMinor,
  ).toBe(0);
});
it("un filtro de comercio cambia el total y nunca se interpreta como SQL", () => {
  const context = base();
  context.ledger = [line("Café", 200), line("Otro", 300)];
  const report = createFinancialReport(
    context,
    { ...presetPlan("most"), operation: "merchants", term: "Café" },
    "ARS",
    "2026-11-24",
  );
  expect(report.metrics[0]?.amountMinor).toBe(200);
  expect(report.rows).toHaveLength(1);
  expect(
    analysisPlanSchema.safeParse({ ...presetPlan("most"), sql: "DELETE FROM entries" }).success,
  ).toBe(false);
});
it("ajusta meses y bisiestos y hace explícitas las dos ventanas de comparación", () => {
  const plan = presetPlan("compare"),
    range = analysisPeriod(plan, "2024-03-31");
  expect(comparisonPeriod(plan, range)).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  expect(comparisonPeriod(plan, analysisPeriod(plan, "2025-03-31"))).toEqual({
    from: "2025-02-01",
    to: "2025-02-28",
  });
  expect(analysisPeriod({ ...plan, period: "previous-month" }, "2026-01-02")).toEqual({
    from: "2025-12-01",
    to: "2025-12-31",
  });
  expect(
    analysisPlanSchema.safeParse({
      ...plan,
      period: "custom",
      from: "2025-02-29",
      to: "2025-03-01",
    }).success,
  ).toBe(false);
  expect(percentChange(100, 0)).toBeNull();
  expect(percentChange(3, 2)).toBe("+50,00 %");
  expect(percentChange(1, 3)).toBe("−66,67 %");
  expect(expenseShare(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)).toBe("100,00 %");
});
it("no inventa meses de gasto cero ni un calendario de cuotas que no se guarda", () => {
  const context = base();
  context.ledger = [
    line("ingreso", 5000, "income", "2026-10-01"),
    line("gasto", 1000, "expense", "2026-11-01"),
  ];
  const report = createFinancialReport(
    context,
    { ...presetPlan("highest"), operation: "lowest-period" },
    "ARS",
    "2026-11-24",
  );
  expect(report.rows).toEqual([{ label: "2026-11", amountMinor: 1000 }]);
  const installments = createFinancialReport(
    context,
    { ...presetPlan("most"), operation: "installments" },
    "ARS",
    "2026-11-24",
  );
  expect(installments.metrics).toEqual([]);
  expect(installments.text).toContain("no incluyen un calendario");
});
