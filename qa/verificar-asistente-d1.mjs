// D1/workerd temporal, datos sintéticos y modelo de prueba explícito. Sin inferencias remotas.
import assert from "node:assert/strict";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
const out = resolve(".wrangler/qa-assistant/worker.mjs");
await mkdir(resolve(".wrangler/qa-assistant"), { recursive: true });
await build({
  stdin: {
    resolveDir: resolve("."),
    contents: `
import {createDb,performOperation} from './app/db/repository.server.ts';
import {answerAssistant} from './app/services/assistant.server.ts';
import {presetPlan} from './app/domain/assistant.ts';
let calls=0;
export default {async fetch(request,env){
 const db=createDb(env.DB),path=new URL(request.url).pathname;
 if(path==='/init'){await performOperation(db,'qa-ana',{intent:'setup',ars:10000,usd:500});await performOperation(db,'qa-ana',{intent:'entry',kind:'expense',currency:'ARS',amount:4000,description:'Compra sintética',category:'Otros',date:'2026-11-15',requestKey:crypto.randomUUID()});return Response.json({ok:true});}
 if(path==='/read'){return Response.json({calls,requests:(await env.DB.prepare('SELECT count(*) AS n FROM ai_requests').first()).n,finances:(await env.DB.prepare('SELECT count(*) AS n FROM entries').first()).n,global:(await env.DB.prepare('SELECT coalesce(sum(reserved_micros),0) AS n FROM ai_global_usage').first()).n});}
 const {user,input,now,budget}=await request.json();
 const settings={...env,AI_ENABLED:'true',AI_GLOBAL_DAILY_NEURON_BUDGET:String(budget??8000),AI:{async run(){calls++;return {response:JSON.stringify(presetPlan('most')),usage:{prompt_tokens:100,completion_tokens:80}};}}};
 try{return Response.json(await answerAssistant(settings,user,input,{now:new Date(now),enabled:true}));}catch(e){return Response.json({code:e.code,error:e.message},{status:e.status??500});}
}};`,
  },
  outfile: out,
  bundle: true,
  platform: "browser",
  format: "esm",
  define: { "import.meta.env.DEV": "false" },
  logLevel: "silent",
});
const runtime = new Miniflare(
  convertV4MiniflareOptions({
    name: "qa-assistant-flujario",
    compatibilityDate: "2026-11-13",
    compatibilityFlags: ["nodejs_compat"],
    modules: true,
    script: await readFile(out, "utf8"),
    d1Databases: ["DB"],
    d1Persist: false,
  }),
);
try {
  const db = await runtime.getD1Database("DB");
  for (const name of (await readdir("drizzle")).filter((n) => n.endsWith(".sql")).sort()) {
    const chunks = (await readFile(resolve("drizzle", name), "utf8"))
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    await db.batch(chunks.map((s) => db.prepare(s)));
  }
  await runtime.dispatchFetch("https://qa.local/init");
  const read = async () => (await runtime.dispatchFetch("https://qa.local/read")).json();
  const ask = async (user, input, now = "2026-11-24T15:00:00Z", budget = 8000) => {
    const r = await runtime.dispatchFetch("https://qa.local/ask", {
      method: "POST",
      body: JSON.stringify({ user, input, now, budget }),
    });
    return { status: r.status, body: await r.json() };
  };
  const question = () => ({
    kind: "question",
    requestKey: crypto.randomUUID(),
    question: "Analizá mis gastos",
    history: [],
    currency: "ARS",
  });
  const original = question();
  const first = await ask("qa-ana", original);
  assert.equal(first.status, 200);
  assert.equal(first.body.report.metrics[1].amountMinor, 4000);
  const reservation = await db
    .prepare("SELECT reserved_micros FROM ai_requests WHERE user_id=? AND request_key=?")
    .bind("qa-ana", original.requestKey)
    .first();
  console.log(
    `Reserva conservadora para la pregunta de prueba, con salida máxima de 400 tokens: ${reservation.reserved_micros / 1000000} Neurons.`,
  );
  assert.equal((await ask("qa-ana", original)).status, 200);
  assert.equal((await read()).calls, 1);
  assert.equal((await ask("qa-ana", { ...original, question: "Otro texto" })).status, 409);
  for (let i = 1; i < 5; i++)
    assert.equal(
      (
        await ask(
          "qa-ana",
          question(),
          new Date(Date.UTC(2026, 10, 24, 15, 0, i * 6)).toISOString(),
        )
      ).status,
      200,
    );
  assert.equal((await ask("qa-ana", question(), "2026-11-24T15:01:00Z")).body.code, "user-limit");
  const countBefore = (await read()).calls;
  const free = await ask("qa-ana", { kind: "statistic", preset: "most", currency: "ARS" });
  assert.equal(free.status, 200);
  assert.equal(free.body.usage.used, 5);
  assert.equal((await read()).calls, countBefore);
  assert.equal(
    (await ask("qa-bea", { kind: "statistic", preset: "most", currency: "ARS" })).body.report
      .metrics[1].amountMinor,
    0,
  );
  // Otra fecha UTC aísla el presupuesto de esta prueba de las preguntas anteriores.
  const results = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      ask("qa-budget-" + i, question(), "2026-11-25T15:00:00Z", 30),
    ),
  );
  const used = await db
    .prepare("SELECT reserved_micros FROM ai_global_usage WHERE day_utc='2026-11-25'")
    .first();
  assert(used.reserved_micros <= 30000000);
  assert(results.some((r) => r.status === 200));
  assert(results.some((r) => r.body.code === "global-limit"));
  assert.equal((await read()).finances, 1);
  assert.equal((await db.prepare("PRAGMA foreign_key_check").all()).results.length, 0);
  console.log(
    "D1 real aislada: cuotas individuales/globales, veinte reservas concurrentes, reintentos, estadísticas sin IA, privacidad y movimientos sin cambios verificados.",
  );
} finally {
  await runtime.dispose();
}
