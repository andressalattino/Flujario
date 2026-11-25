import { productExample } from "./product-example";
import type { AnalysisLine } from "~/domain/statements";

// Estos importes se muestran únicamente en la vista previa identificada como ficticia.
const previousMonths = [
  { month: "2026-07", income: 89000000, expense: 68200000, food: 15400000 },
  { month: "2026-08", income: 92000000, expense: 96900000, food: 17500000 },
  { month: "2026-09", income: 104000000, expense: 70100000, food: 16600000 },
  { month: "2026-10", income: 111000000, expense: 79200000, food: 18800000 },
];

export const statisticsExample: AnalysisLine[] = [
  ...productExample.entries.flatMap((entry) => {
    const { id, date, currency, amountMinor, category, kind } = entry;
    return kind === "income" || kind === "expense"
      ? [{ id, date, currency, amountMinor, category, kind }]
      : [];
  }),
  ...previousMonths.flatMap<AnalysisLine>(({ month, income, expense, food }) => [
    {
      id: `${month}-salary`,
      date: `${month}-05`,
      currency: "ARS",
      kind: "income",
      amountMinor: income,
      category: "Trabajo",
    },
    {
      id: `${month}-expenses`,
      date: `${month}-12`,
      currency: "ARS",
      kind: "expense",
      amountMinor: expense - food,
      category: "Hogar",
    },
    {
      id: `${month}-food`,
      date: `${month}-15`,
      currency: "ARS",
      kind: "expense",
      amountMinor: food,
      category: "Alimentación",
    },
  ]),
  {
    id: "saving-usd",
    date: "2026-10-14",
    currency: "USD",
    kind: "income",
    amountMinor: 25000,
    category: "Trabajo",
  },
  {
    id: "service-usd",
    date: "2026-11-10",
    currency: "USD",
    kind: "expense",
    amountMinor: 3800,
    category: "Servicios",
  },
];
