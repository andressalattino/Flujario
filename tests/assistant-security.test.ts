import { vi, it, expect, afterEach } from "vitest";
import { RouterContextProvider } from "react-router";
import { getAuth } from "@clerk/react-router/server";
import { cloudflareContext } from "../app/context";
import { action, loader } from "../app/routes/assistant-data";
import {
  assistantRequestSchema,
  presetPlan,
  suggestedQuestions,
  matchStatisticQuestion,
  shouldKeepAssistantRequest,
  type AssistantAnswer,
} from "../app/domain/assistant";
import { testD1 } from "./helpers/d1";
import { createDb, performOperation } from "../app/db/repository.server";
import type { Env } from "../app/env";
vi.mock("@clerk/react-router/server", () => ({ getAuth: vi.fn() }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
function args(
  binding = {} as D1Database,
  body?: unknown,
  origin = "http://localhost",
  extraEnv: Partial<Env> = {},
) {
  vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_example");
  const context = new RouterContextProvider();
  context.set(cloudflareContext, {
    env: { DB: binding, CLERK_SECRET_KEY: "sk_test_example", ...extraEnv },
    ctx: {} as ExecutionContext,
  });
  return {
    context,
    params: {},
    pattern: "/app/asistente/datos",
    request: body
      ? new Request("http://localhost/app/asistente/datos", {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      : new Request("http://localhost/app/asistente/datos"),
  };
}
it("cada lectura y envío requiere sesión antes de acceder a datos o IA", async () => {
  vi.mocked(getAuth).mockResolvedValue({ userId: null } as never);
  await expect(loader(args() as never)).rejects.toMatchObject({ status: 302 });
  await expect(
    action(args(undefined, { kind: "statistic", preset: "most", currency: "ARS" }) as never),
  ).rejects.toMatchObject({ status: 302 });
});
it("exige el mismo origen y rechaza userId, SQL, archivos e historiales excesivos", async () => {
  vi.mocked(getAuth).mockResolvedValue({ userId: "ana" } as never);
  await expect(
    action(
      args(
        undefined,
        { kind: "statistic", preset: "most", currency: "ARS" },
        "https://evil.test",
      ) as never,
    ),
  ).rejects.toMatchObject({ status: 403 });
  for (const bad of [
    { kind: "statistic", preset: "most", currency: "ARS", userId: "bea" },
    {
      kind: "question",
      question: "x".repeat(801),
      requestKey: crypto.randomUUID(),
      currency: "ARS",
    },
    {
      kind: "question",
      question: "Mis gastos",
      requestKey: crypto.randomUUID(),
      currency: "ARS",
      history: Array(3).fill("antes"),
    },
    {
      kind: "question",
      question: "Mis gastos",
      requestKey: crypto.randomUUID(),
      currency: "ARS",
      sql: "SELECT * FROM entries",
    },
    { kind: "statistic", preset: "most", currency: "ARS", document: "original" },
  ])
    expect(assistantRequestSchema.safeParse(bad).success).toBe(false);
});
it("el endpoint calcula sólo el dueño de Clerk y la lectura no modifica saldos ni movimientos", async () => {
  const store = testD1();
  try {
    const db = createDb(store.binding);
    await performOperation(db, "ana", { intent: "setup", ars: 10000, usd: 0 });
    await performOperation(db, "ana", {
      intent: "entry",
      requestKey: crypto.randomUUID(),
      kind: "expense",
      currency: "ARS",
      amount: 123,
      description: "Compra privada",
      category: "Otros",
      date: "2026-11-01",
    });
    const before = store.sqlite.prepare("SELECT * FROM entries").all();
    vi.mocked(getAuth).mockResolvedValue({ userId: "bea" } as never);
    const reply = await action(
      args(store.binding, { kind: "statistic", preset: "most", currency: "ARS" }) as never,
    );
    expect(reply.status).toBe(200);
    expect(reply.headers.get("Cache-Control")).toBe("private, no-store");
    const result = (await reply.json()) as AssistantAnswer;
    expect(result).toMatchObject({ ok: true, source: "statistics" });
    expect(result.report.metrics[1]?.amountMinor).toBe(0);
    const counter = await loader(args(store.binding) as never);
    expect(counter.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await counter.json()).toHaveProperty("usage");
    expect(store.sqlite.prepare("SELECT * FROM entries").all()).toEqual(before);
    expect(store.sqlite.prepare("SELECT count(*) AS n FROM ai_requests").get()?.n).toBe(0);
    expect(presetPlan("most").operation).toBe("categories");
  } finally {
    store.sqlite.close();
  }
});
it("devuelve JSON privado con estado HTTP real en errores de validación y de cupo", async () => {
  const store = testD1();
  try {
    vi.mocked(getAuth).mockResolvedValue({ userId: "ana" } as never);
    const invalid = await action(args(store.binding, { kind: "sql" }) as never);
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await invalid.json()).toMatchObject({ ok: false, code: "invalid" });
    const run = vi.fn();
    const limited = await action(
      args(
        store.binding,
        {
          kind: "question",
          question: "Mis gastos de octubre",
          requestKey: crypto.randomUUID(),
          currency: "ARS",
        },
        "http://localhost",
        {
          AI: { run },
          AI_ENABLED: "true",
          AI_ALLOW_LOCAL: "true",
          AI_DAILY_QUESTION_LIMIT: "0",
        },
      ) as never,
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await limited.json()).toMatchObject({ ok: false, code: "user-limit" });
    expect(run).not.toHaveBeenCalled();
  } finally {
    store.sqlite.close();
  }
});
it("reconoce las estadísticas escritas sin IA ni reservas aun con cupo cero", async () => {
  const store = testD1();
  try {
    vi.mocked(getAuth).mockResolvedValue({ userId: "ana" } as never);
    const run = vi.fn();
    for (const preset of suggestedQuestions) {
      const question = preset.question
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toUpperCase()
        .replace(/[¿?]/g, "");
      expect(matchStatisticQuestion(question)?.id).toBe(preset.id);
      const response = await action(
        args(
          store.binding,
          {
            kind: "question",
            question,
            requestKey: crypto.randomUUID(),
            currency: "ARS",
          },
          "http://localhost",
          {
            AI: { run },
            AI_ENABLED: "false",
            AI_DAILY_QUESTION_LIMIT: "0",
          },
        ) as never,
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        ok: true,
        source: "statistics",
        usage: { available: false },
      });
    }
    expect(matchStatisticQuestion("¿En qué gasté más el año pasado?")).toBeUndefined();
    expect(run).not.toHaveBeenCalled();
    expect(store.sqlite.prepare("SELECT count(*) AS n FROM ai_requests").get()?.n).toBe(0);
  } finally {
    store.sqlite.close();
  }
});
it("sin IA conectada no hay intento que recuperar ni consumo que renovar", async () => {
  const store = testD1();
  try {
    vi.mocked(getAuth).mockResolvedValue({ userId: "ana" } as never);
    const run = vi.fn();
    const response = await action(
      args(
        store.binding,
        {
          kind: "question",
          question: "Analizá mis gastos de octubre",
          requestKey: crypto.randomUUID(),
          currency: "ARS",
        },
        "http://localhost",
        { AI: { run }, AI_ENABLED: "false" },
      ) as never,
    );
    const result = (await response.json()) as {
      code: string;
      usage: { used: number; reason: string };
    };
    expect(response.status).toBe(503);
    expect(result).toMatchObject({
      code: "unconfigured",
      usage: { used: 0, reason: "unconfigured" },
    });
    expect(shouldKeepAssistantRequest(result.code)).toBe(false);
    expect(run).not.toHaveBeenCalled();
    expect(store.sqlite.prepare("SELECT count(*) AS n FROM ai_requests").get()?.n).toBe(0);
  } finally {
    store.sqlite.close();
  }
});
