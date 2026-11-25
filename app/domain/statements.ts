import { z } from "zod";
import { institutionIds } from "../data/statement-institutions";
import { isISODate } from "./dates";
import { MAX_MINOR, assertMinor, sumMinor, type Currency } from "./money";
import { categorySchema, currencySchema } from "./field-schemas";

export const MAX_CONFIRM_ROWS = 500;
export const MAX_STATEMENT_ROWS = 2000;
export const MAX_STATEMENT_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_PAGES = 30;
export const statementFormats = ["csv", "xlsx", "xls", "pdf-text", "pdf-ocr"] as const;
export type StatementFormat = (typeof statementFormats)[number];
const isoDate = z.string().refine(isISODate, "Revisá la fecha.");
const minor = z
  .number()
  .int()
  .min(-MAX_MINOR)
  .max(MAX_MINOR)
  .refine((n) => n !== 0, "El importe no puede ser cero.");
export const statementRowSchema = z.object({
  key: z.string().regex(/^[a-zA-Z0-9_.:-]{1,80}$/),
  sourceRef: z.string().max(80).default(""),
  date: isoDate,
  description: z.string().trim().min(2).max(120),
  currency: currencySchema,
  amountMinor: minor,
  kind: z.enum(["income", "expense", "internal", "part"]),
  category: categorySchema,
  duplicateAcknowledged: z.boolean().default(false),
});
export type StatementRowInput = z.infer<typeof statementRowSchema>;
export const statementTargetSchema = z.object({
  kind: z.enum(["entry", "history"]),
  id: z.string().min(1).max(300),
});
export type StatementTarget = z.infer<typeof statementTargetSchema>;
const importBase = {
  requestKey: z.uuid(),
  institution: z.enum(institutionIds),
  format: z.enum(statementFormats),
  currency: currencySchema,
  reviewed: z.literal(true, { error: "Revisá los movimientos antes de confirmar." }),
  rows: z.array(statementRowSchema).min(1).max(MAX_CONFIRM_ROWS),
};
export const statementMutationSchema = z
  .discriminatedUnion("intent", [
    z.object({ intent: z.literal("opening-date"), currency: currencySchema, date: isoDate }),
    z.object({ intent: z.literal("import"), ...importBase }),
    z.object({ intent: z.literal("breakdown"), ...importBase, target: statementTargetSchema }),
  ])
  .superRefine((value, ctx) => {
    if (value.intent === "opening-date") return;
    const keys = new Set<string>();
    value.rows.forEach((row, index) => {
      const error = keys.has(row.key)
        ? "Hay identificadores de fila repetidos."
        : row.currency !== value.currency
          ? "Confirmá una moneda por lote."
          : value.intent === "breakdown" && row.kind !== "part"
            ? "El detalle de tarjeta no crea movimientos."
            : value.intent === "import" && (row.kind === "part" || row.amountMinor <= 0)
              ? "Revisá el sentido y el importe del movimiento."
              : null;
      if (error) ctx.addIssue({ code: "custom", message: error, path: ["rows", index] });
      keys.add(row.key);
    });
  });
export type StatementMutation = z.infer<typeof statementMutationSchema>;
export type ImportMutation = Exclude<StatementMutation, { intent: "opening-date" }>;
export interface StoredStatementRow extends StatementRowInput {
  id: string;
  importId: string;
  scope: "ledger" | "history" | "internal" | "part";
  entryId: string | null;
}
export interface StatementBatch {
  id: string;
  institution: string;
  format: string;
  currency: Currency;
  mode: "bank" | "card";
  createdAt: string;
  count: number;
}
export interface ExpenseBreakdown {
  target: StatementTarget;
  importId: string;
  currency: Currency;
  parentMinor: number;
  totalMinor: number;
  ready: boolean;
  parts: StatementRowInput[];
}
export interface StatementState {
  history: StoredStatementRow[];
  batches: StatementBatch[];
  breakdowns: ExpenseBreakdown[];
}
export const emptyStatementState = (): StatementState => ({
  history: [],
  batches: [],
  breakdowns: [],
});

type ComparableRow = Pick<StatementRowInput, "date" | "currency" | "amountMinor" | "kind">;
export function statementMatchKey(row: ComparableRow) {
  return [row.date, row.currency, row.amountMinor, row.kind].join("|");
}
export function duplicateStatementKeys(rows: StatementRowInput[], previous: ComparableRow[]) {
  const previousKeys = new Set(
    previous.filter((r) => r.kind === "income" || r.kind === "expense").map(statementMatchKey),
  );
  const counts = new Map<string, number>();
  rows.forEach((r) =>
    counts.set(statementMatchKey(r), (counts.get(statementMatchKey(r)) ?? 0) + 1),
  );
  return new Set(
    rows
      .filter(
        (r) =>
          (r.kind === "income" || r.kind === "expense") &&
          (previousKeys.has(statementMatchKey(r)) || counts.get(statementMatchKey(r))! > 1),
      )
      .map((r) => r.key),
  );
}
export function breakdownTotal(
  parts: Pick<StatementRowInput, "amountMinor" | "currency">[],
  currency: Currency,
) {
  if (parts.some((p) => p.currency !== currency))
    throw new Error("El desglose debe conservar la moneda del pago.");
  return sumMinor(parts.map((p) => p.amountMinor));
}
export interface AnalysisLine {
  id: string;
  date: string;
  currency: Currency;
  kind: "income" | "expense";
  amountMinor: number;
  category: string;
}
// Sustituye el padre por sus partes sólo para clasificar; nunca añade nuevos egresos.
export function statementAnalysis(
  ledger: AnalysisLine[],
  history: StoredStatementRow[],
  breakdowns: ExpenseBreakdown[],
  currency: Currency,
  from: string,
  to: string,
  grouping: "day" | "month" | "quarter" | "year",
) {
  const lines = [
    ...ledger,
    ...history
      .filter((r) => r.scope === "history" && (r.kind === "income" || r.kind === "expense"))
      .map((r) => ({ ...r, kind: r.kind as "income" | "expense", id: "history:" + r.id })),
  ].filter((r) => r.currency === currency && r.date >= from && r.date <= to);
  const groups = new Map<string, { income: number[]; expense: number[] }>();
  const categoryAmounts = new Map<string, number[]>();
  const incomes: number[] = [],
    expenses: number[] = [];
  for (const line of lines) {
    assertMinor(line.amountMinor);
    const period =
      grouping === "day"
        ? line.date
        : grouping === "year"
          ? line.date.slice(0, 4)
          : grouping === "quarter"
            ? line.date.slice(0, 4) + " · T" + Math.ceil(Number(line.date.slice(5, 7)) / 3)
            : line.date.slice(0, 7);
    const group = groups.get(period) ?? { income: [], expense: [] };
    group[line.kind].push(line.amountMinor);
    groups.set(period, group);
    if (line.kind === "income") {
      incomes.push(line.amountMinor);
      continue;
    }
    expenses.push(line.amountMinor);
    const targetId = line.id.startsWith("history:") ? line.id.slice(8) : line.id;
    const targetKind = line.id.startsWith("history:") ? "history" : "entry";
    const breakdown = breakdowns.find(
      (b) =>
        b.target.id === targetId &&
        b.target.kind === targetKind &&
        b.currency === currency &&
        b.ready &&
        b.parentMinor === line.amountMinor,
    );
    const parts =
      breakdown && breakdownTotal(breakdown.parts, currency) === line.amountMinor
        ? breakdown.parts
        : [{ category: line.category, amountMinor: line.amountMinor }];
    for (const p of parts)
      categoryAmounts.set(p.category, [...(categoryAmounts.get(p.category) ?? []), p.amountMinor]);
  }
  const income = sumMinor(incomes),
    expense = sumMinor(expenses);
  return {
    income,
    expense,
    net: sumMinor([income, -expense]),
    count: lines.length,
    categories: [...categoryAmounts]
      .map(([category, values]) => ({ category, amountMinor: sumMinor(values) }))
      .sort((a, b) => b.amountMinor - a.amountMinor),
    periods: [...groups]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, values]) => ({
        period,
        income: sumMinor(values.income),
        expense: sumMinor(values.expense),
      })),
  };
}
