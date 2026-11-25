import type { Env } from "~/env";
import { today } from "~/domain/dates";

export const AI_MODEL = "@cf/ibm-granite/granite-4.0-h-micro";
// Tarifas verificadas el 24/11/2026: Neurons por millón de tokens.
export const AI_INPUT_RATE = 1542;
export const AI_OUTPUT_RATE = 10158;
export function assistantConfig(env: Env) {
  const integer = (value: string | undefined, fallback: number, max: number) => {
    const raw = value ?? String(fallback);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > max)
      throw new Error("Configuración de IA inválida.");
    return Number(raw);
  };
  if (env.AI_MODEL && env.AI_MODEL !== AI_MODEL)
    throw new Error("Modelo no autorizado: revisar disponibilidad y tarifa antes de cambiarlo.");
  return {
    model: AI_MODEL,
    dailyLimit: integer(env.AI_DAILY_QUESTION_LIMIT, 5, 1000),
    budgetMicros: integer(env.AI_GLOBAL_DAILY_NEURON_BUDGET, 8000, 1000000) * 1000000,
    maxOutputTokens: integer(env.AI_MAX_OUTPUT_TOKENS, 400, 2000),
  };
}
export type AssistantConfig = ReturnType<typeof assistantConfig>;
export function usageDays(now: Date) {
  const ar = today(now),
    utc = now.toISOString().slice(0, 10);
  const nextUTC = new Date(utc + "T00:00:00Z").getTime() + 86400000;
  return {
    ar,
    utc,
    resetsAt: new Date(new Date(ar + "T03:00:00Z").getTime() + 86400000).toISOString(),
    globalResetsAt: new Date(nextUTC).toISOString(),
    spillDay:
      nextUTC - now.getTime() <= 120000 ? new Date(nextUTC).toISOString().slice(0, 10) : null,
  };
}
export function reserveNeurons(
  messages: { role: string; content: string }[],
  schema: unknown,
  maxOutputTokens: number,
) {
  // Cota deliberadamente alta: un token por byte UTF-8, más plantilla/esquema,
  // máximo de salida y margen x2. No se usa una tarifa plana por pregunta.
  const inputTokens =
    new TextEncoder().encode(JSON.stringify({ messages, schema })).byteLength + 512;
  return (inputTokens * AI_INPUT_RATE + maxOutputTokens * AI_OUTPUT_RATE) * 2;
}
export function tokenNeurons(input: number, output: number) {
  return input * AI_INPUT_RATE + output * AI_OUTPUT_RATE;
}
