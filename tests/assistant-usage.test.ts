import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { testD1 } from "./helpers/d1";
import { createDb, payloadHash, performOperation } from "../app/db/repository.server";
import {
  reserveAIRequest,
  findAIRequest,
  settleAIRequest,
  readAssistantUsage,
  checkAssistantRate,
} from "../app/db/assistant.server";
import {
  assistantConfig,
  usageDays,
  reserveNeurons,
} from "../app/services/assistant-config.server";
import { answerAssistant, assistantMessages } from "../app/services/assistant.server";
import { presetPlan, type AssistantRequest } from "../app/domain/assistant";
import type { Env } from "../app/env";
let store: ReturnType<typeof testD1>, db: ReturnType<typeof createDb>;
const now = new Date("2026-11-24T15:00:00.000Z");
beforeEach(() => {
  store = testD1();
  db = createDb(store.binding);
});
afterEach(() => store.sqlite.close());
const env = (): Env => ({ DB: store.binding, AI_ENABLED: "true" });
const question = (
  text = "Analizá los egresos de noviembre",
): Extract<AssistantRequest, { kind: "question" }> => ({
  kind: "question",
  requestKey: crypto.randomUUID(),
  question: text,
  history: [],
  currency: "ARS",
});
const output = () => ({
  response: JSON.stringify(presetPlan("most")),
  usage: { prompt_tokens: 100, completion_tokens: 80 },
});
it("acota un mes en curso generado por la IA y recupera planes guardados con el mismo corte", async () => {
  const request = question("analiza mis ingresos completos");
  const plan = {
    ...presetPlan("income"),
    period: "custom" as const,
    from: "2026-11-01",
    to: "2026-11-30",
  };
  const run = vi.fn().mockResolvedValue({ response: plan });
  const settings = { ...env(), AI: { run } };
  await performOperation(db, "ana", { intent: "setup", ars: 0, usd: 0 });
  await performOperation(db, "ana", {
    intent: "entry",
    kind: "income",
    currency: "ARS",
    amount: 12500,
    description: "Ingreso de prueba",
    category: "Otros",
    date: "2026-11-17",
    requestKey: crypto.randomUUID(),
  });
  const response = await answerAssistant(settings, "ana", request, { now, enabled: true });
  expect(response.source).toBe("ai");
  expect(response.report).toMatchObject({ from: "2026-11-01", to: "2026-11-24" });
  expect(response.report.metrics).toContainEqual({ label: "Ingresos", amountMinor: 12500 });

  // Un plan anterior al arreglo puede seguir guardado con el último día del mes.
  const oldRequest = question();
  await reserveAIRequest(
    db,
    "ana",
    oldRequest.requestKey,
    await payloadHash(oldRequest),
    assistantConfig(settings),
    1000000,
    new Date(now.getTime() + 6000),
  );
  const saved = (await findAIRequest(db, "ana", oldRequest.requestKey))!;
  await settleAIRequest(db, "ana", oldRequest.requestKey, saved, { plan });
  const replay = await answerAssistant(settings, "ana", oldRequest, {
    now: new Date("2026-11-27T15:00:00Z"),
    enabled: true,
  });
  expect(replay.report).toEqual(response.report);
  expect(run).toHaveBeenCalledTimes(1);
});
it("conserva fechas futuras para vencimientos y explica si un informe de movimientos está todo en el futuro", async () => {
  const plan = {
    ...presetPlan("most"),
    period: "custom" as const,
    from: "2026-12-01",
    to: "2026-12-31",
  };
  const run = vi
    .fn()
    .mockResolvedValueOnce({ response: plan })
    .mockResolvedValueOnce({
      response: { ...plan, operation: "pending" },
    });
  const settings = { ...env(), AI: { run } };
  await expect(
    answerAssistant(settings, "ana", question(), { now, enabled: true }),
  ).rejects.toMatchObject({
    code: "invalid-output",
    status: 422,
    message: "No hay movimientos realizados en una fecha futura.",
  });
  const forecast = await answerAssistant(
    settings,
    "bea",
    question("Mis vencimientos de diciembre"),
    {
      now,
      enabled: true,
    },
  );
  expect(forecast.report).toMatchObject({ from: "2026-12-01", to: "2026-12-31" });
});
it("reserva como máximo cinco preguntas, cuenta reintentos una sola vez y separa dueños", async () => {
  const cfg = assistantConfig(env());
  for (let i = 0; i < 5; i++) {
    const stamp = new Date(now.getTime() + i * 6000),
      key = crypto.randomUUID();
    expect(await reserveAIRequest(db, "ana", key, "hash", cfg, 1000000, stamp)).toBeTruthy();
    const record = (await findAIRequest(db, "ana", key))!;
    await settleAIRequest(db, "ana", key, record, { plan: presetPlan("most") });
    expect(await reserveAIRequest(db, "ana", key, "hash", cfg, 1000000, stamp)).toBeNull();
  }
  await expect(
    reserveAIRequest(
      db,
      "ana",
      crypto.randomUUID(),
      "hash",
      cfg,
      1000000,
      new Date(now.getTime() + 40000),
    ),
  ).rejects.toMatchObject({ code: "user-limit" });
  expect((await readAssistantUsage(db, "ana", cfg, true, now)).used).toBe(5);
  expect((await readAssistantUsage(db, "bea", cfg, true, now)).used).toBe(0);
});
it("el límite global se comprueba dentro de la escritura ante veinte solicitudes concurrentes", async () => {
  const cfg = { ...assistantConfig(env()), budgetMicros: 3000000 };
  const results = await Promise.allSettled(
    Array.from({ length: 20 }, (_, i) =>
      reserveAIRequest(db, "u" + i, crypto.randomUUID(), "hash", cfg, 1000000, now),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
  expect(
    store.sqlite.prepare("SELECT sum(reserved_micros) AS used FROM ai_global_usage").get()?.used,
  ).toBe(3000000);
  expect(
    store.sqlite.prepare("SELECT sum(questions) AS used FROM ai_daily_usage").get()?.used,
  ).toBe(3);
});
it("una reserva cercana a medianoche cubre también el siguiente día UTC y el día argentino sigue independiente", async () => {
  const stamp = new Date("2026-11-24T23:59:30.000Z"),
    cfg = assistantConfig(env());
  await reserveAIRequest(db, "ana", crypto.randomUUID(), "hash", cfg, 1500000, stamp);
  expect(
    store.sqlite
      .prepare("SELECT day_utc,reserved_micros FROM ai_global_usage ORDER BY day_utc")
      .all(),
  ).toEqual([
    { day_utc: "2026-11-24", reserved_micros: 1500000 },
    { day_utc: "2026-11-25", reserved_micros: 1500000 },
  ]);
  expect(usageDays(new Date("2026-11-25T02:59:59Z"))).toMatchObject({
    ar: "2026-11-24",
    utc: "2026-11-25",
    resetsAt: "2026-11-25T03:00:00.000Z",
  });
  expect(
    await readAssistantUsage(db, "ana", cfg, true, new Date("2026-11-25T03:00:00Z")),
  ).toMatchObject({ used: 0, remaining: 5 });
});
it("la estimación crece con entrada y salida, y jamás libera la reserva por una respuesta corta", async () => {
  const short = reserveNeurons([{ role: "user", content: "Hola" }], {}, 400),
    long = reserveNeurons([{ role: "user", content: "Consulta ".repeat(50) }], {}, 400);
  expect(long).toBeGreaterThan(short);
  expect(reserveNeurons([{ role: "user", content: "Hola" }], {}, 800)).toBeGreaterThan(short);
  const cfg = assistantConfig(env()),
    key = crypto.randomUUID();
  await reserveAIRequest(db, "ana", key, "hash", cfg, short, now);
  const record = (await findAIRequest(db, "ana", key))!;
  await settleAIRequest(db, "ana", key, record, {
    plan: presetPlan("most"),
    observedMicros: 10,
    usageSource: "tokens",
  });
  expect(
    store.sqlite.prepare("SELECT reserved_micros FROM ai_global_usage").get()?.reserved_micros,
  ).toBe(short);
  await settleAIRequest(db, "ana", key, record, {
    plan: presetPlan("most"),
    observedMicros: short * 3,
  });
  expect(
    store.sqlite.prepare("SELECT reserved_micros FROM ai_global_usage").get()?.reserved_micros,
  ).toBe(short);
});
it("la consulta completa usa el modelo una sola vez, valida el plan y devuelve cálculos de los registros propios", async () => {
  await performOperation(db, "ana", { intent: "setup", ars: 0, usd: 0 });
  await performOperation(db, "ana", {
    intent: "entry",
    requestKey: crypto.randomUUID(),
    kind: "expense",
    currency: "ARS",
    amount: 12345,
    date: "2026-11-15",
    description: "Comercio privado",
    category: "Otros",
  });
  const run = vi.fn().mockResolvedValue(output()),
    settings = { ...env(), AI: { run } },
    input = question();
  const first = await answerAssistant(settings, "ana", input, { now, enabled: true });
  const repeat = await answerAssistant(settings, "ana", input, { now, enabled: true });
  expect(first.report.metrics[1]?.amountMinor).toBe(12345);
  expect(repeat.report.metrics).toEqual(first.report.metrics);
  expect(run).toHaveBeenCalledTimes(1);
  const later = await answerAssistant(settings, "ana", input, {
    now: new Date("2026-12-01T15:00:00Z"),
    enabled: true,
  });
  expect(later.report.from).toBe("2026-11-01");
  expect(run).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(run.mock.calls)).not.toContain("Comercio privado");
  expect(JSON.stringify(run.mock.calls)).not.toContain("12345");
  expect(JSON.stringify(run.mock.calls)).not.toContain('"userId"');
  await expect(
    answerAssistant(settings, "ana", { ...input, question: "Otro texto" }, { now, enabled: true }),
  ).rejects.toMatchObject({ code: "replay" });
  const other = await answerAssistant(
    settings,
    "bea",
    { kind: "statistic", preset: "most", currency: "ARS" },
    { now, enabled: true },
  );
  expect(other.report.metrics[1]?.amountMinor).toBe(0);
});
it("las estadísticas funcionan sin binding y con cupos agotados, sin consumir preguntas", async () => {
  const result = await answerAssistant(
    env(),
    "ana",
    { kind: "statistic", preset: "most", currency: "ARS" },
    { now, enabled: false },
  );
  expect(result.source).toBe("statistics");
  expect(result.usage.used).toBe(0);
  expect(result.usage.reason).toBe("unconfigured");
  expect(store.sqlite.prepare("SELECT count(*) AS n FROM ai_requests").get()?.n).toBe(0);
  const typed = await answerAssistant(env(), "ana", question("¿En qué gasté más este mes?"), {
    now,
    enabled: false,
  });
  expect(typed.source).toBe("statistics");
  expect(typed.usage.used).toBe(0);
});
it("un fallo del proveedor y una salida maliciosa no se reintentan ni ejecutan SQL", async () => {
  const run = vi.fn().mockResolvedValue({
      response: JSON.stringify({ ...presetPlan("most"), sql: "DROP TABLE accounts" }),
      usage: { neurons: 0.5 },
    }),
    settings = { ...env(), AI: { run } },
    input = question();
  await expect(
    answerAssistant(settings, "ana", input, { now, enabled: true }),
  ).rejects.toMatchObject({ code: "invalid-output" });
  await expect(
    answerAssistant(settings, "ana", input, { now, enabled: true }),
  ).rejects.toMatchObject({ code: "provider" });
  expect(run).toHaveBeenCalledTimes(1);
  expect((await readAssistantUsage(db, "ana", assistantConfig(env()), true, now)).used).toBe(1);
  expect(
    store.sqlite.prepare("SELECT observed_micros, usage_source FROM ai_requests").get(),
  ).toEqual({
    observed_micros: 500000,
    usage_source: "provider",
  });
  expect(store.sqlite.prepare("SELECT count(*) AS n FROM accounts").get()?.n).toBe(0);
  const denied = await answerAssistant(settings, "ana", question("Recomendame dónde invertir"), {
    now,
    enabled: true,
  });
  expect(denied.report.title).toContain("analizar tus registros");
  expect(run).toHaveBeenCalledTimes(1);
});
it("limita spam y la pregunta/historial se acotan antes de invocar el modelo", async () => {
  await Promise.all(Array.from({ length: 20 }, () => checkAssistantRate(db, "ana", now)));
  await expect(checkAssistantRate(db, "ana", now)).rejects.toMatchObject({ code: "rate" });
  expect(assistantMessages(question(), "2026-11-24")).toHaveLength(2);
});
it("registra neuronas reales si el proveedor las informa y amplía la reserva conservadora si hace falta", async () => {
  const run = vi
      .fn()
      .mockResolvedValue({ response: JSON.stringify(presetPlan("most")), usage: { neurons: 100 } }),
    input = question();
  const settings = { ...env(), AI: { run } };
  await answerAssistant(settings, "ana", input, { now, enabled: true });
  expect(
    store.sqlite.prepare("SELECT observed_micros,usage_source FROM ai_requests").get(),
  ).toEqual({ observed_micros: 100000000, usage_source: "provider" });
  const held = store.sqlite
    .prepare("SELECT reserved_micros FROM ai_global_usage")
    .get()?.reserved_micros;
  expect(held).toBe(100000000);
  await answerAssistant(settings, "ana", input, { now, enabled: true });
  expect(
    store.sqlite.prepare("SELECT reserved_micros FROM ai_global_usage").get()?.reserved_micros,
  ).toBe(held);
  expect(run).toHaveBeenCalledTimes(1);
});
