import { z } from "zod";
import type { Currency } from "./currencies";
import { isISODate, today } from "./dates";
import { currencySchema } from "./field-schemas";

const assistantOperations = [
  "balance",
  "summary",
  "categories",
  "least-category",
  "highest-period",
  "lowest-period",
  "income-evolution",
  "compare",
  "merchants",
  "card",
  "pending",
  "installments",
  "recurring",
  "distribution",
  "unsupported",
] as const;
export const analysisPlanSchema = z
  .object({
    operation: z.enum(assistantOperations),
    period: z.enum(["this-month", "previous-month", "this-year", "last-year", "all", "custom"]),
    grouping: z.enum(["day", "month", "year"]),
    metric: z.enum(["expense", "income", "net"]),
    from: z.string().refine(isISODate).nullable(),
    to: z.string().refine(isISODate).nullable(),
    term: z.string().trim().max(80).nullable(),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (p.term && p.operation !== "merchants")
      ctx.addIssue({
        code: "custom",
        message: "El filtro de comercio sólo se admite en gastos por descripción.",
      });
    if (p.period === "custom" && (!p.from || !p.to || p.from > p.to))
      ctx.addIssue({ code: "custom", message: "El período no es válido." });
  });
export type AnalysisPlan = z.infer<typeof analysisPlanSchema>;
export const suggestedQuestions = [
  {
    id: "most",
    question: "¿En qué gasté más este mes?",
    operation: "categories",
    period: "this-month",
  },
  {
    id: "least",
    question: "¿En qué gasté menos?",
    operation: "least-category",
    period: "this-month",
  },
  {
    id: "highest",
    question: "¿Cuál fue mi mes de mayor gasto?",
    operation: "highest-period",
    period: "all",
  },
  {
    id: "income",
    question: "¿Cómo evolucionaron mis ingresos?",
    operation: "income-evolution",
    period: "this-year",
  },
  {
    id: "compare",
    question: "¿Cuánto gasté respecto del mes anterior?",
    operation: "compare",
    period: "this-month",
  },
] as const;
// Coincidencia exacta de las consultas sugeridas, tolerando tildes,
// mayúsculas y puntuación. No interpreta variantes de lenguaje natural.
function normalizeAssistantQuestion(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
export function matchStatisticQuestion(question: string) {
  return suggestedQuestions.find(
    (preset) =>
      normalizeAssistantQuestion(preset.question) === normalizeAssistantQuestion(question),
  );
}
export function isAssistantHelpQuestion(question: string) {
  return [
    "ayuda",
    "que preguntas te puedo hacer",
    "que puedo preguntar",
    "que te puedo preguntar",
    "en que me podes ayudar",
    "que podes hacer",
  ].some((help) => normalizeAssistantQuestion(help) === normalizeAssistantQuestion(question));
}
// Un error conocido y definitivo no tiene un resultado pendiente por recuperar.
// Los fallos de transporte y las respuestas ambiguas conservan la clave existente.
export function shouldKeepAssistantRequest(code?: string) {
  return code === undefined || code === "busy" || code === "unavailable";
}
export const assistantRequestSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("statistic"),
      preset: z.enum(["most", "least", "highest", "income", "compare"]),
      currency: currencySchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("question"),
      requestKey: z.uuid(),
      question: z.string().trim().min(3).max(800),
      history: z.array(z.string().trim().min(1).max(400)).max(2).default([]),
      currency: currencySchema,
    })
    .strict(),
]);
export type AssistantRequest = z.infer<typeof assistantRequestSchema>;
export function presetPlan(id: string): AnalysisPlan {
  const preset = suggestedQuestions.find((p) => p.id === id);
  if (!preset) throw new Error("Consulta estadística no válida.");
  return {
    operation: preset.operation,
    period: preset.period,
    grouping: "month",
    metric: preset.operation === "income-evolution" ? "income" : "expense",
    from: null,
    to: null,
    term: null,
  };
}
export function dateShift(date: string, months: number) {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const first = new Date(Date.UTC(y, m - 1 + months, 1, 12));
  const end = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0, 12),
  ).getUTCDate();
  first.setUTCDate(Math.min(d, end));
  return first.toISOString().slice(0, 10);
}
export function allowsFutureDates(operation: AnalysisPlan["operation"]) {
  return operation === "pending" || operation === "installments" || operation === "recurring";
}

export function analysisPeriod(plan: AnalysisPlan, asOf = today()) {
  const month = asOf.slice(0, 7),
    year = asOf.slice(0, 4);
  const previous = dateShift(month + "-01", -1);
  const previousEnd = new Date(new Date(month + "-01T12:00:00Z").getTime() - 86400000)
    .toISOString()
    .slice(0, 10);
  const range = {
    "this-month": { from: month + "-01", to: asOf },
    "previous-month": { from: previous, to: previousEnd },
    "this-year": { from: year + "-01-01", to: asOf },
    "last-year": { from: `${Number(year) - 1}-01-01`, to: `${Number(year) - 1}-12-31` },
    all: { from: "1900-01-01", to: asOf },
    custom: { from: plan.from!, to: plan.to! },
  }[plan.period];
  if (!isISODate(range.from) || !isISODate(range.to) || range.from > range.to)
    throw new Error("Elegí un período válido.");
  if (range.to > asOf && !allowsFutureDates(plan.operation))
    throw new Error("No hay movimientos realizados en una fecha futura.");
  return range;
}
export function comparisonPeriod(plan: AnalysisPlan, range: { from: string; to: string }) {
  if (plan.period === "this-month" || plan.period === "previous-month")
    return { from: dateShift(range.from, -1), to: dateShift(range.to, -1) };
  if (plan.period === "this-year" || plan.period === "last-year")
    return { from: dateShift(range.from, -12), to: dateShift(range.to, -12) };
  const end = new Date(range.from + "T12:00:00Z").getTime() - 86400000;
  const length =
    new Date(range.to + "T12:00:00Z").getTime() - new Date(range.from + "T12:00:00Z").getTime();
  return {
    from: new Date(end - length).toISOString().slice(0, 10),
    to: new Date(end).toISOString().slice(0, 10),
  };
}
export function percentChange(current: number, previous: number): string | null {
  if (!Number.isSafeInteger(current) || !Number.isSafeInteger(previous))
    throw new Error("Importe inválido.");
  if (previous === 0) return null;
  const delta = BigInt(current) - BigInt(previous),
    denominator = BigInt(Math.abs(previous));
  const scaled = ((delta < 0n ? -delta : delta) * 10000n + denominator / 2n) / denominator;
  return `${delta < 0n ? "−" : delta > 0n ? "+" : ""}${scaled / 100n},${String(scaled % 100n).padStart(2, "0")} %`;
}
export function expenseShare(amount: number, total: number) {
  if (!total) return "—";
  if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(total) || total < 0)
    throw new Error("Importe inválido.");
  const value = (BigInt(Math.abs(amount)) * 10000n + BigInt(total) / 2n) / BigInt(total);
  return `${amount < 0 ? "−" : ""}${value / 100n},${String(value % 100n).padStart(2, "0")} %`;
}
export type FinancialReport = {
  title: string;
  text: string;
  currency: Currency;
  from: string;
  to: string;
  metrics: { label: string; amountMinor: number | null; detail?: string }[];
  rows: { label: string; amountMinor: number | null; detail?: string }[];
  chart: "bar" | "line" | "none";
  notes: string[];
};
export type AssistantUsage = {
  limit: number;
  used: number;
  remaining: number;
  resetsAt: string;
  globalResetsAt: string;
  available: boolean;
  reason: "ready" | "user-limit" | "global-limit" | "unconfigured";
};
export type AssistantAnswer = {
  ok: true;
  report: FinancialReport;
  usage: AssistantUsage;
  source: "statistics" | "ai";
};
export const assistantLimitMessage =
  "Alcanzaste tu límite de consultas con IA por hoy. Podés seguir utilizando las consultas estadísticas disponibles.";
