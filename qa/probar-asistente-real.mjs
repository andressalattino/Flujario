// Prueba manual opt-in: una inferencia real, D1 efímera y movimientos ficticios.
// No lee .env/.dev.vars, no usa la D1 personal ni despliega la aplicación.
import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { getPlatformProxy } from "wrangler";

if (!process.argv.includes("--confirmar-consumo")) {
  console.error("Esta prueba consume Workers AI. Ejecutar manualmente con --confirmar-consumo.");
  process.exit(1);
}
const fullIncome = process.argv.includes("--historial-ingresos");
const directory = resolve(".wrangler/qa-ai-live");
await mkdir(directory, { recursive: true });
const configPath = resolve(directory, "wrangler.json");
await writeFile(
  configPath,
  JSON.stringify({
    name: "flujario-ai-live-check",
    compatibility_date: "2026-11-13",
    compatibility_flags: ["nodejs_compat"],
    ai: { binding: "AI", remote: true },
    d1_databases: [
      {
        binding: "DB",
        database_name: "qa-ai-temporal",
        database_id: "00000000-0000-0000-0000-000000000000",
      },
    ],
  }),
);
const modulePath = resolve(directory, "service.mjs");
await build({
  stdin: {
    resolveDir: resolve("."),
    contents: `
export {answerAssistant} from './app/services/assistant.server.ts';
export {createDb,performOperation} from './app/db/repository.server.ts';
export {today} from './app/domain/dates.ts';
export {AI_MODEL} from './app/services/assistant-config.server.ts';`,
  },
  outfile: modulePath,
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  define: { "import.meta.env.DEV": "false" },
  logLevel: "silent",
});
const { answerAssistant, createDb, performOperation, today, AI_MODEL } = await import(
  pathToFileURL(modulePath).href
);
let platform;
let calls = 0;
let providerFailure;
let interpretation;
try {
  console.log("Conectando AI remota con D1 temporal, sin archivos de secretos...");
  platform = await getPlatformProxy({
    configPath,
    envFiles: [],
    persist: false,
    remoteBindings: true,
  });
  const binding = platform.env.DB;
  // persist:false y configuración aislada: no comparte las cuentas locales.
  const existing = await binding
    .prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='entries'")
    .first();
  assert.equal(existing.n, 0);
  for (const file of (await readdir("drizzle")).filter((name) => name.endsWith(".sql")).sort()) {
    const chunks = (await readFile(resolve("drizzle", file), "utf8"))
      .split("--> statement-breakpoint")
      .map((sql) => sql.trim())
      .filter(Boolean);
    await binding.batch(chunks.map((sql) => binding.prepare(sql)));
  }
  const db = createDb(binding);
  const owner = "qa-live-owner";
  await performOperation(db, owner, { intent: "setup", ars: 1000000, usd: 0 });
  for (const [kind, amount, category] of [
    ["income", 900000, "Otros"],
    ["expense", 125000, "Alimentación"],
    ["expense", 300000, "Hogar"],
  ]) {
    await performOperation(db, owner, {
      intent: "entry",
      kind,
      amount,
      category,
      currency: "ARS",
      description: "Movimiento ficticio para QA",
      date: "2026-10-15",
      requestKey: crypto.randomUUID(),
    });
  }
  await performOperation(db, "qa-other-owner", { intent: "setup", ars: 0, usd: 0 });
  await performOperation(db, "qa-other-owner", {
    intent: "entry",
    kind: "expense",
    amount: 99990000,
    category: "Otros",
    currency: "ARS",
    description: "Otro dueño ficticio",
    date: "2026-10-15",
    requestKey: crypto.randomUUID(),
  });
  const before = JSON.stringify(
    (await binding.prepare("SELECT * FROM entries ORDER BY id").all()).results,
  );
  const settings = {
    DB: binding,
    AI_ENABLED: "true",
    AI_ALLOW_LOCAL: "true",
    AI_MODEL,
    AI_DAILY_QUESTION_LIMIT: "5",
    AI_GLOBAL_DAILY_NEURON_BUDGET: "8000",
    AI_MAX_OUTPUT_TOKENS: "400",
    AI: {
      async run(model, input) {
        assert.equal(model, AI_MODEL);
        assert.equal(calls, 0, "Esta ejecución sólo permite una inferencia.");
        const prompt = JSON.stringify(input);
        for (const privateValue of [
          owner,
          "Movimiento ficticio para QA",
          "Otro dueño ficticio",
          "99990000",
        ])
          assert(!prompt.includes(privateValue), "No enviar registros ni dueños al proveedor.");
        calls++;
        console.log("Enviando una pregunta genérica al modelo aprobado (máximo 400 tokens)...");
        try {
          return await platform.env.AI.run(model, input);
        } catch (error) {
          providerFailure = { name: error?.name, code: error?.code, status: error?.status };
          // Mensaje del proveedor sólo para diagnóstico local; sin prompt ni credenciales.
          const message = String(error?.message ?? "");
          providerFailure.message = message
            .replace(/Bearer\s+\S+/gi, "Bearer [oculto]")
            .replace(/(?:token|secret|authorization)[=:]\s*[^\s,;]+/gi, "credencial=[oculta]")
            .slice(0, 1000);
          throw error;
        }
      },
    },
  };
  const request = {
    kind: "question",
    requestKey: crypto.randomUUID(),
    question: fullIncome
      ? "analiza mis ingresos completos"
      : "Mostrame el total de ingresos y egresos de octubre de 2026.",
    history: [],
    currency: "ARS",
  };
  const now = new Date();
  const response = await answerAssistant(settings, owner, request, { now, enabled: true });
  const receipt = await binding
    .prepare(
      "SELECT status,model,reserved_micros,observed_micros,usage_source,plan_json FROM ai_requests WHERE user_id=? AND request_key=?",
    )
    .bind(owner, request.requestKey)
    .first();
  interpretation = JSON.parse(receipt.plan_json);
  console.log("Plan validado del modelo:", JSON.stringify(interpretation));
  assert.equal(response.source, "ai");
  assert.equal(response.report.from, fullIncome ? "1900-01-01" : "2026-10-01");
  assert.equal(response.report.to, fullIncome ? today(now) : "2026-10-31");
  assert.equal(
    response.report.metrics.find((metric) => metric.label === "Ingresos")?.amountMinor,
    900000,
  );
  assert.equal(
    response.report.metrics.find((metric) => metric.label === "Egresos")?.amountMinor,
    425000,
  );
  assert.equal(response.usage.used, 1);
  const replay = await answerAssistant(settings, owner, request, { now, enabled: true });
  assert.deepEqual(replay.report, response.report);
  assert.equal(calls, 1);
  const free = await answerAssistant(
    settings,
    owner,
    { kind: "statistic", preset: "most", currency: "ARS" },
    { now, enabled: true },
  );
  assert.equal(free.source, "statistics");
  assert.equal(calls, 1);
  assert.equal(
    JSON.stringify((await binding.prepare("SELECT * FROM entries ORDER BY id").all()).results),
    before,
  );
  assert.equal((await binding.prepare("PRAGMA foreign_key_check").all()).results.length, 0);
  assert.equal(receipt.status, "complete");
  const report = {
    checkedAt: new Date().toISOString(),
    model: AI_MODEL,
    remoteCalls: calls,
    validInterpretation: JSON.parse(receipt.plan_json),
    currency: "ARS",
    fictitiousAmountsMinor: { income: 900000, expense: 425000 },
    reservedNeuronMicros: receipt.reserved_micros,
    observedNeuronMicros: receipt.observed_micros,
    usageSource: receipt.usage_source,
    replayWithoutSecondCall: true,
    fictitiousEntriesUnchanged: true,
    persistentPersonalDatabaseUsed: false,
  };
  if (!fullIncome)
    await writeFile(
      resolve("qa/asistente-ia-real-verificacion.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        calls,
        error: error?.message,
        code: error?.code,
        providerFailure,
        interpretation,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await platform?.dispose();
}
