import { it, expect } from "vitest";
import { testD1 } from "./helpers/d1";
import { createDb, performOperation, getSnapshot } from "../app/db/repository.server";
import { mutateStatements, readStatisticsPage } from "../app/db/statements.server";
import { readFinancialContext } from "../app/db/assistant.server";
import { createFinancialReport } from "../app/domain/assistant-analysis";
import { presetPlan, type AnalysisPlan } from "../app/domain/assistant";
it("los consumos se consultan por su fecha aunque el pago padre sea de otro mes, sin descontarlos dos veces", async () => {
  const store = testD1();
  try {
    const db = createDb(store.binding);
    await performOperation(db, "ana", {
      intent: "setup",
      ars: 100000,
      usd: 0,
      arsOpeningDate: "2026-11-01",
      usdOpeningDate: "2026-11-01",
    });
    await performOperation(db, "ana", {
      intent: "entry",
      requestKey: crypto.randomUUID(),
      kind: "expense",
      currency: "ARS",
      amount: 10000,
      description: "Pago de tarjeta",
      category: "Otros",
      date: "2026-11-15",
    });
    const parent = (await getSnapshot(db, "ana")).entries[0]!;
    await mutateStatements(db, "ana", {
      intent: "breakdown",
      requestKey: crypto.randomUUID(),
      institution: "galicia",
      format: "csv",
      currency: "ARS",
      reviewed: true,
      target: { kind: "entry", id: parent.id },
      rows: [
        {
          key: "compra",
          sourceRef: "1",
          date: "2026-10-20",
          description: "Consumo del mes anterior",
          currency: "ARS",
          amountMinor: 11000,
          kind: "part",
          category: "Ropa",
          duplicateAcknowledged: false,
        },
        {
          key: "credito",
          sourceRef: "2",
          date: "2026-10-21",
          description: "Crédito de tarjeta",
          currency: "ARS",
          amountMinor: -1000,
          kind: "part",
          category: "Ropa",
          duplicateAcknowledged: false,
        },
      ],
    });
    await mutateStatements(db, "ana", {
      intent: "import",
      requestKey: crypto.randomUUID(),
      institution: "galicia",
      format: "csv",
      currency: "ARS",
      reviewed: true,
      rows: [
        {
          key: "historico",
          sourceRef: "1",
          date: "2026-10-01",
          description: "Gasto anterior al saldo inicial",
          currency: "ARS",
          amountMinor: 2000,
          kind: "expense",
          category: "Otros",
          duplicateAcknowledged: false,
        },
      ],
    });
    const cardPlan: AnalysisPlan = {
      ...presetPlan("most"),
      operation: "card",
      period: "custom",
      from: "2026-10-01",
      to: "2026-10-31",
    };
    const card = createFinancialReport(
      await readFinancialContext(db, "ana", "ARS", cardPlan, "2026-11-24"),
      cardPlan,
      "ARS",
      "2026-11-24",
    );
    expect(card.metrics.map((m) => m.amountMinor)).toEqual([11000, 1000, 10000]);
    const plan = presetPlan("most");
    const report = createFinancialReport(
      await readFinancialContext(db, "ana", "ARS", plan, "2026-11-24"),
      plan,
      "ARS",
      "2026-11-24",
    );
    expect(report.metrics[1]?.amountMinor).toBe(10000);
    expect(report.rows).toEqual([{ label: "Ropa", amountMinor: 10000, detail: "100,00 %" }]);
    const balancePlan: AnalysisPlan = { ...plan, operation: "balance" };
    const balance = createFinancialReport(
      await readFinancialContext(db, "ana", "ARS", balancePlan, "2026-11-24"),
      balancePlan,
      "ARS",
      "2026-11-24",
    );
    expect(balance.metrics[0]?.amountMinor).toBe(90000);
    const earlier: AnalysisPlan = {
      ...balancePlan,
      period: "custom",
      from: "2026-10-01",
      to: "2026-10-31",
    };
    const historical = createFinancialReport(
      await readFinancialContext(db, "ana", "ARS", earlier, "2026-11-24"),
      earlier,
      "ARS",
      "2026-11-24",
    );
    expect(historical.metrics[0]?.amountMinor).toBeNull();
    expect(historical.text).toContain("saldo inicial");
    expect((await getSnapshot(db, "ana")).entries).toHaveLength(1);
    const filters = {
      query: { currency: "ARS", from: "2026-10-01", to: "2026-11-24", group: "month" },
      error: null,
    } as const;
    const statistics = await readStatisticsPage(db, "ana", filters);
    expect(statistics.report).toMatchObject({
      count: 2,
      expense: 12000,
      net: -12000,
      categories: [
        { category: "Ropa", amountMinor: 10000 },
        { category: "Otros", amountMinor: 2000 },
      ],
    });
    expect(statistics.report?.periods.map((period) => period.expense)).toEqual([2000, 10000]);
    expect((await readStatisticsPage(db, "bea", filters)).report?.count).toBe(0);
    const usdFilters = { ...filters, query: { ...filters.query, currency: "USD" } } as const;
    expect((await readStatisticsPage(db, "ana", usdFilters)).report?.count).toBe(0);
  } finally {
    store.sqlite.close();
  }
});
it("los gastos recurrentes usan el importe y fecha reales aunque el vencimiento haya sido del mes anterior", async () => {
  const store = testD1();
  try {
    const db = createDb(store.binding);
    await performOperation(db, "ana", { intent: "setup", ars: 100000, usd: 0 });
    await performOperation(db, "ana", {
      intent: "payment",
      currency: "ARS",
      amount: 8000,
      keepAmount: "yes",
      title: "Internet",
      dueDate: "2026-10-20",
      frequency: "monthly",
      requestKey: crypto.randomUUID(),
    });
    const occurrence = (await getSnapshot(db, "ana")).payments.find(
      (p) => p.dueDate === "2026-10-20",
    )!;
    await performOperation(db, "ana", {
      intent: "pay",
      occurrenceId: occurrence.id,
      currency: "ARS",
      amount: 10000,
      futureAmount: "unchanged",
      date: "2026-11-15",
      requestKey: crypto.randomUUID(),
    });
    const plan: AnalysisPlan = { ...presetPlan("most"), operation: "recurring" };
    const context = await readFinancialContext(db, "ana", "ARS", plan, "2026-11-24");
    expect(context.payments.find((p) => p.id === occurrence.id)?.amountMinor).toBe(10000);
    const report = createFinancialReport(context, plan, "ARS", "2026-11-24");
    expect(report.metrics[0]?.amountMinor).toBe(10000);
    expect(report.rows.find((r) => r.detail === "2026-11-15 · Pagado")?.amountMinor).toBe(10000);
  } finally {
    store.sqlite.close();
  }
});
