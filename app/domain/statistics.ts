import type { Currency } from "./currencies";
import { isCurrency } from "./currencies";
import { isISODate } from "./dates";
import { sumMinor } from "./money";
import { statementAnalysis, type AnalysisLine, type StatementState } from "./statements";

export const statisticsGroups = ["month", "quarter", "year"] as const;
export type StatisticsGroup = (typeof statisticsGroups)[number];
export type StatisticsQuery = {
  currency: Currency;
  from: string;
  to: string;
  group: StatisticsGroup;
};

export function statisticsFilters(params: URLSearchParams, asOf: string, currencies: Currency[]) {
  const requestedCurrency = params.get("moneda");
  const currency =
    isCurrency(requestedCurrency) && currencies.includes(requestedCurrency)
      ? requestedCurrency
      : (currencies[0] ?? "ARS");
  const requestedGroup = params.get("agrupar");
  const group = statisticsGroups.find((option) => option === requestedGroup) ?? "month";
  const firstMonth = new Date(`${asOf.slice(0, 7)}-01T12:00:00Z`);
  firstMonth.setUTCMonth(firstMonth.getUTCMonth() - 11);
  const defaultFrom = firstMonth.toISOString().slice(0, 10);
  const from = params.get("desde") ?? defaultFrom;
  const to = params.get("hasta") ?? asOf;
  if (!isISODate(from) || !isISODate(to) || from > to || to > asOf) {
    return {
      query: { currency, from: defaultFrom, to: asOf, group },
      error: "Elegí un rango de fechas válido que termine hoy o antes.",
    };
  }
  return { query: { currency, from, to, group }, error: null };
}

const monthFormat = new Intl.DateTimeFormat("es-AR", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function periodLabel(period: string, group: StatisticsGroup) {
  if (group === "month") return monthFormat.format(new Date(`${period}-01T12:00:00Z`));
  if (group === "quarter") {
    const [year, quarter] = period.split(" · T");
    return `T${quarter} ${year}`;
  }
  return period;
}

function selectExtreme(
  rows: { label: string; amountMinor: number }[],
  direction: "highest" | "lowest",
) {
  let best: { label: string; amountMinor: number; ties: number } | null = null;
  for (const row of rows) {
    if (best?.amountMinor === row.amountMinor) {
      best.ties++;
    } else if (
      !best ||
      (direction === "highest"
        ? row.amountMinor > best.amountMinor
        : row.amountMinor < best.amountMinor)
    ) {
      best = { ...row, ties: 0 };
    }
  }
  return best;
}

export function calculateStatistics(
  query: StatisticsQuery,
  ledger: AnalysisLine[],
  statements: Pick<StatementState, "history" | "breakdowns">,
) {
  const { currency, from, to, group } = query;
  const data = statementAnalysis(
    ledger,
    statements.history,
    statements.breakdowns,
    currency,
    from,
    to,
    group,
  );
  const periods = data.periods.map((period) => ({
    ...period,
    label: periodLabel(period.period, group),
    net: sumMinor([period.income, -period.expense]),
  }));
  const categoriesWithExpense = data.categories
    .filter((category) => category.amountMinor > 0)
    .map(({ category, amountMinor }) => ({ label: category, amountMinor }));
  const resultByPeriod = periods.map(({ label, net }) => ({ label, amountMinor: net }));
  return {
    ...data,
    periods,
    mostSpentCategory: selectExtreme(categoriesWithExpense, "highest"),
    leastSpentCategory: selectExtreme(categoriesWithExpense, "lowest"),
    mostSpentPeriod: selectExtreme(
      periods
        .filter((p) => p.expense > 0)
        .map(({ label, expense }) => ({ label, amountMinor: expense })),
      "highest",
    ),
    bestPeriod: selectExtreme(resultByPeriod, "highest"),
    worstPeriod: selectExtreme(resultByPeriod, "lowest"),
  };
}

export type StatisticsReport = ReturnType<typeof calculateStatistics>;
export type StatisticsPageData = {
  query: StatisticsQuery;
  report: StatisticsReport | null;
  error: string | null;
};
