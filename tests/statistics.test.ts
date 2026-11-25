import { expect, it } from "vitest";
import {
  calculateStatistics,
  statisticsFilters,
  type StatisticsQuery,
} from "../app/domain/statistics";
import type { AnalysisLine } from "../app/domain/statements";

it("calcula 12 meses calendario incluso al cruzar de año y rechaza fechas inválidas o futuras", () => {
  const asOf = "2024-02-29";
  const read = (url: string) => statisticsFilters(new URLSearchParams(url), asOf, ["ARS", "USD"]);
  expect(read("")).toEqual({
    query: { currency: "ARS", from: "2023-03-01", to: asOf, group: "month" },
    error: null,
  });
  expect(read("moneda=USD&desde=2024-02-29&hasta=2024-02-29&agrupar=quarter")).toMatchObject({
    query: { currency: "USD", from: asOf, to: asOf, group: "quarter" },
    error: null,
  });
  expect(read("moneda=BRL").query.currency).toBe("ARS");
  for (const params of [
    "desde=2024-02-30",
    "hasta=2024-03-01",
    "desde=2024-02-29&hasta=2024-02-28",
  ]) {
    expect(read(params).error).toBeTruthy();
  }
});

it("elige mayor y menor gasto y resultado por cada agrupación sin inventar períodos vacíos", () => {
  const query: StatisticsQuery = {
    currency: "ARS",
    from: "2024-01-01",
    to: "2024-05-08",
    group: "month",
  };
  const ledger: AnalysisLine[] = [
    {
      id: "1",
      date: "2024-01-30",
      currency: "ARS",
      kind: "income",
      amountMinor: 12001,
      category: "Trabajo",
    },
    {
      id: "2",
      date: "2024-01-31",
      currency: "ARS",
      kind: "expense",
      amountMinor: 1100,
      category: "Vivienda",
    },
    {
      id: "3",
      date: "2024-02-29",
      currency: "ARS",
      kind: "expense",
      amountMinor: 13500,
      category: "Vivienda",
    },
    {
      id: "4",
      date: "2024-05-08",
      currency: "ARS",
      kind: "expense",
      amountMinor: 400,
      category: "Servicios",
    },
    {
      id: "5",
      date: "2024-05-09",
      currency: "ARS",
      kind: "expense",
      amountMinor: 90000,
      category: "Vivienda",
    },
    {
      id: "6",
      date: "2024-05-08",
      currency: "USD",
      kind: "expense",
      amountMinor: 90000,
      category: "Vivienda",
    },
  ];
  const statements = { history: [], breakdowns: [] };
  const monthly = calculateStatistics(query, ledger, statements);
  expect(monthly.periods.map(({ period, net }) => [period, net])).toEqual([
    ["2024-01", 10901],
    ["2024-02", -13500],
    ["2024-05", -400],
  ]);
  expect(monthly).toMatchObject({
    count: 4,
    income: 12001,
    expense: 15000,
    net: -2999,
    mostSpentCategory: { label: "Vivienda", amountMinor: 14600 },
    leastSpentCategory: { label: "Servicios", amountMinor: 400 },
    mostSpentPeriod: { amountMinor: 13500 },
    bestPeriod: { amountMinor: 10901 },
    worstPeriod: { amountMinor: -13500 },
  });
  const quarterly = calculateStatistics({ ...query, group: "quarter" }, ledger, statements);
  expect(quarterly.worstPeriod).toMatchObject({ label: "T1 2024", amountMinor: -2599 });
  const yearly = calculateStatistics({ ...query, group: "year" }, ledger, statements);
  expect(yearly.periods).toHaveLength(1);
  expect(yearly.bestPeriod).toEqual({ label: "2024", amountMinor: -2999, ties: 0 });
  expect(yearly.worstPeriod).toEqual(yearly.bestPeriod);
});

it("muestra los empates y no adjudica un menor gasto a una categoría sin egresos", () => {
  const query: StatisticsQuery = {
    currency: "ARS",
    from: "2024-01-01",
    to: "2024-03-31",
    group: "month",
  };
  const ledger: AnalysisLine[] = [
    {
      id: "1",
      date: "2024-01-01",
      currency: "ARS",
      kind: "income",
      amountMinor: 1,
      category: "Trabajo",
    },
    {
      id: "2",
      date: "2024-03-01",
      currency: "ARS",
      kind: "income",
      amountMinor: 1,
      category: "Trabajo",
    },
  ];
  const report = calculateStatistics(query, ledger, { history: [], breakdowns: [] });
  expect(report.bestPeriod).toMatchObject({ amountMinor: 1, ties: 1 });
  expect(report.worstPeriod).toMatchObject({ amountMinor: 1, ties: 1 });
  expect(report.mostSpentCategory).toBeNull();
  expect(report.leastSpentCategory).toBeNull();
  expect(report.mostSpentPeriod).toBeNull();
});
