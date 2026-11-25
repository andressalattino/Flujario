import { statementAnalysis, type StatementState, type AnalysisLine } from "./statements";
import { sumMinor } from "./money";
import {
  analysisPeriod,
  comparisonPeriod,
  expenseShare,
  percentChange,
  type AnalysisPlan,
  type FinancialReport,
} from "./assistant";
import type { Currency } from "./currencies";
export type AssistantLedgerLine = AnalysisLine & {
  description: string;
  occurrenceId: string | null;
};
export type AssistantPayment = {
  id: string;
  title: string;
  amountMinor: number | null;
  dueDate: string;
  frequency: string;
  paid: boolean;
};
export type FinancialContext = {
  ledger: AssistantLedgerLine[];
  statements: StatementState;
  payments: AssistantPayment[];
  balance?: { amountMinor: number | null; reason?: string };
};
export function createFinancialReport(
  context: FinancialContext,
  plan: AnalysisPlan,
  currency: Currency,
  asOf: string,
): FinancialReport {
  const range = analysisPeriod(plan, asOf);
  const analyze = (r = range) =>
    statementAnalysis(
      context.ledger,
      context.statements.history,
      context.statements.breakdowns,
      currency,
      r.from,
      r.to,
      plan.grouping,
    );
  const data = analyze();
  const report: FinancialReport = {
    title: "Balance del período",
    text: "Ingresos y egresos registrados, sin transferencias propias ni cambios de moneda.",
    currency,
    ...range,
    metrics: [
      { label: "Ingresos", amountMinor: data.income },
      { label: "Egresos", amountMinor: data.expense },
      { label: "Resultado del período", amountMinor: data.net },
    ],
    rows: [],
    chart: "bar",
    notes: [
      "Cada moneda se analiza por separado. El resultado del período no es el saldo de tu cuenta.",
    ],
  };
  const rows = data.categories.map((r) => ({
    label: r.category,
    amountMinor: r.amountMinor,
    detail: expenseShare(r.amountMinor, data.expense),
  }));
  switch (plan.operation) {
    case "balance": {
      report.title = "Saldo de tu cuenta";
      report.metrics = [
        { label: `Saldo al ${range.to}`, amountMinor: context.balance?.amountMinor ?? null },
      ];
      report.text =
        context.balance?.reason ??
        "Saldo inicial más los movimientos realizados hasta esa fecha. Los históricos importados y las obligaciones pendientes no se vuelven a descontar.";
      report.chart = "none";
      report.notes = ["Saldo de esta moneda, sin convertir ni sumar otras monedas."];
      break;
    }
    case "categories":
    case "least-category":
    case "distribution": {
      report.title =
        plan.operation === "least-category"
          ? "Categorías de menor gasto"
          : plan.operation === "distribution"
            ? "Distribución de gastos"
            : "Categorías de mayor gasto";
      report.rows = plan.operation === "least-category" ? [...rows].reverse() : rows;
      report.text =
        "Categorías con egresos registrados en este período. Las categorías sin movimientos no se presentan como gastos de cero.";
      break;
    }
    case "highest-period":
    case "lowest-period": {
      report.title =
        plan.operation === "highest-period" ? "Períodos de mayor gasto" : "Períodos de menor gasto";
      report.rows = data.periods
        .filter((p) => p.expense > 0)
        .map((p) => ({ label: p.period, amountMinor: p.expense }))
        .sort((a, b) =>
          plan.operation === "highest-period"
            ? b.amountMinor - a.amountMinor
            : a.amountMinor - b.amountMinor,
        );
      report.text =
        "Se comparan períodos con egresos registrados. Un período sin registros no permite afirmar que no hubo gastos.";
      break;
    }
    case "income-evolution": {
      report.title = "Evolución de tus ingresos";
      report.chart = "line";
      report.rows = data.periods
        .filter((p) => p.income > 0)
        .map((p) => ({ label: p.period, amountMinor: p.income }));
      report.text =
        "Ingresos registrados a lo largo del período. Los huecos de información no se completan con valores inventados.";
      break;
    }
    case "compare": {
      const previous = comparisonPeriod(plan, range),
        prior = analyze(previous);
      const current =
        plan.metric === "income" ? data.income : plan.metric === "net" ? data.net : data.expense;
      const old =
        plan.metric === "income" ? prior.income : plan.metric === "net" ? prior.net : prior.expense;
      const label =
        plan.metric === "income" ? "Ingresos" : plan.metric === "net" ? "Resultado" : "Egresos";
      report.title = `Comparación de ${label.toLowerCase()}`;
      report.rows = [
        { label: `${previous.from} al ${previous.to}`, amountMinor: old },
        { label: `${range.from} al ${range.to}`, amountMinor: current },
      ];
      report.metrics = [
        {
          label: "Diferencia",
          amountMinor: sumMinor([current, -old]),
          detail: percentChange(current, old) ?? "Sin porcentaje: la base anterior es cero.",
        },
      ];
      report.text =
        "Las fechas de ambos períodos están visibles. El mes o año actual se compara hasta el mismo día del período anterior, ajustado al último día existente.";
      if (!prior.count || !data.count)
        report.notes.push(
          "Uno de los períodos no tiene movimientos registrados. Los ceros expresan ausencia de registros, no una verificación de tu actividad completa.",
        );
      break;
    }
    case "merchants": {
      report.title = "Gastos por descripción registrada";
      const amounts = new Map<string, number[]>();
      const history = context.statements.history.filter((r) => r.scope === "history");
      for (const line of [...context.ledger, ...history])
        if (
          line.kind === "expense" &&
          line.currency === currency &&
          line.date >= range.from &&
          line.date <= range.to &&
          (!plan.term ||
            line.description
              .toLocaleLowerCase("es-AR")
              .includes(plan.term.toLocaleLowerCase("es-AR")))
        ) {
          const label = line.description.trim() || "Sin descripción";
          amounts.set(label, [...(amounts.get(label) ?? []), line.amountMinor]);
        }
      report.rows = [...amounts]
        .map(([label, a]) => ({ label, amountMinor: sumMinor(a) }))
        .sort((a, b) => b.amountMinor - a.amountMinor);
      report.metrics = [
        {
          label: "Gasto de las descripciones seleccionadas",
          amountMinor: sumMinor(report.rows.map((r) => r.amountMinor!)),
        },
      ];
      report.text =
        "Las descripciones no son un identificador bancario de comercio: nombres distintos permanecen separados. Los pagos de tarjeta aparecen como un único egreso, sin volver a sumar sus consumos.";
      break;
    }
    case "card": {
      report.title = "Consumos de tarjeta importados";
      const parts = context.statements.breakdowns
        .flatMap((b) => b.parts)
        .filter(
          (r) =>
            r.currency === currency &&
            r.date >= range.from &&
            r.date <= range.to &&
            r.kind === "part",
        );
      const income = sumMinor(parts.filter((r) => r.amountMinor < 0).map((r) => -r.amountMinor)),
        expense = sumMinor(parts.filter((r) => r.amountMinor > 0).map((r) => r.amountMinor));
      report.metrics = [
        { label: "Consumos del detalle", amountMinor: expense },
        { label: "Créditos del detalle", amountMinor: income },
        { label: "Neto del detalle", amountMinor: sumMinor([expense, -income]) },
      ];
      report.rows = parts.map((r) => ({
        label: r.description,
        amountMinor: r.amountMinor,
        detail: r.date,
      }));
      report.chart = "none";
      report.text =
        "Detalle de las revisiones activas de tarjetas. Es un análisis separado: no vuelve a descontar el pago del resumen.";
      if (context.statements.breakdowns.some((b) => !b.ready))
        report.notes.push(
          "Hay desgloses pendientes de conciliación. Estos consumos no reemplazan categorías del pago hasta coincidir exactamente.",
        );
      break;
    }
    case "pending":
    case "recurring": {
      const payments = context.payments.filter(
        (p) =>
          p.dueDate >= range.from &&
          p.dueDate <= range.to &&
          (plan.operation !== "recurring" || p.frequency !== "once"),
      );
      const pending = payments.filter((p) => !p.paid),
        known = pending.flatMap((p) => (p.amountMinor === null ? [] : [p.amountMinor])),
        unknown = pending.filter((p) => p.amountMinor === null).length;
      report.title =
        plan.operation === "recurring"
          ? "Pagos recurrentes registrados"
          : "Vencimientos pendientes";
      report.metrics = [
        {
          label: "Pendiente con importe conocido",
          amountMinor: sumMinor(known),
          detail: unknown
            ? `${unknown} vencimiento${unknown === 1 ? "" : "s"} sin importe definido. El total está incompleto.`
            : "Sólo obligaciones pendientes; no se descuentan del saldo real.",
        },
      ];
      report.rows = (plan.operation === "recurring" ? payments : pending).map((p) => ({
        label: p.title,
        amountMinor: p.amountMinor,
        detail: `${p.dueDate} · ${p.paid ? "Pagado" : "Pendiente"}`,
      }));
      if (plan.operation === "recurring") {
        const periodic = new Map(
          context.payments.filter((p) => p.frequency !== "once").map((p) => [p.id, p]),
        );
        const paid = context.ledger.filter(
          (e) =>
            e.kind === "expense" &&
            e.currency === currency &&
            e.date >= range.from &&
            e.date <= range.to &&
            e.occurrenceId &&
            periodic.has(e.occurrenceId),
        );
        report.metrics.unshift({
          label: "Gastos recurrentes pagados",
          amountMinor: sumMinor(paid.map((e) => e.amountMinor)),
        });
        report.rows = [
          ...paid.map((e) => ({
            label: periodic.get(e.occurrenceId!)!.title,
            amountMinor: e.amountMinor,
            detail: `${e.date} · Pagado`,
          })),
          ...pending.map((p) => ({
            label: p.title,
            amountMinor: p.amountMinor,
            detail: `${p.dueDate} · Pendiente`,
          })),
        ];
        report.notes.push(
          "Los gastos realizados usan la fecha y el importe real del pago. Los pendientes usan el vencimiento y no descuentan el saldo.",
        );
      }
      report.chart = "none";
      report.text =
        "Se utilizan los vencimientos guardados. No se infieren servicios ni periodicidad a partir del nombre de un comercio.";
      break;
    }
    case "installments": {
      report.title = "Cuotas pendientes";
      report.metrics = [];
      report.chart = "none";
      report.text =
        "Los datos actuales no incluyen un calendario estructurado de cuotas de tarjeta. No puedo calcular cuotas futuras a partir de una descripción. Podés consultar los vencimientos que sí registraste en Pagos.";
      break;
    }
    case "unsupported": {
      report.title = "Puedo ayudarte a analizar tus registros";
      report.metrics = [];
      report.chart = "none";
      report.text =
        "Puedo informar ingresos, gastos, categorías, períodos y vencimientos. No brindo recomendaciones financieras, de inversión ni de administración del dinero. Reformulá la consulta indicando qué datos querés comparar.";
      break;
    }
    default:
      report.rows = data.periods.map((p) => ({
        label: p.period,
        amountMinor:
          plan.metric === "income"
            ? p.income
            : plan.metric === "net"
              ? sumMinor([p.income, -p.expense])
              : p.expense,
      }));
  }
  if (
    !data.count &&
    !["balance", "pending", "recurring", "installments", "unsupported", "card"].includes(
      plan.operation,
    )
  )
    report.notes.push("No hay movimientos registrados en este período para esta moneda.");
  if (report.rows.length > 60) {
    report.notes.push(
      `Se muestran las primeras 60 filas de ${report.rows.length}. Acotá el período para ver más detalle.`,
    );
    report.rows = report.rows.slice(0, 60);
  }
  return report;
}
