// Base efímera: prueba el SQL real en workerd sin tocar la base del usuario.
import assert from "node:assert/strict";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
const out = resolve(".wrangler/qa-statements/worker.mjs");
await mkdir(resolve(".wrangler/qa-statements"), { recursive: true });
await build({
  stdin: {
    resolveDir: resolve("."),
    contents: `
import {createDb,performOperation,getSnapshot} from './app/db/repository.server.ts';
import {mutateStatements,readStatementState,StatementError} from './app/db/statements.server.ts';
export default {async fetch(request,env){const db=createDb(env.DB),path=new URL(request.url).pathname;
if(path==='/setup'){for(const user of ['ana','bea'])await performOperation(db,user,{intent:'setup',ars:100000,usd:5000,arsOpeningDate:'2026-11-01',usdOpeningDate:'2026-11-01'});return Response.json({ok:true});}
const user=new URL(request.url).searchParams.get('user')||'ana';
if(path==='/read')return Response.json({finance:await getSnapshot(db,user),state:await readStatementState(db,user,'ARS','2026-01-01','2026-12-31')});
try{return Response.json(await mutateStatements(db,user,await request.json()));}catch(e){return Response.json({error:e instanceof StatementError?e.message:'atomic failure'},{status:e instanceof StatementError?e.status:500});}
}};`,
  },
  outfile: out,
  bundle: true,
  platform: "browser",
  format: "esm",
  logLevel: "silent",
});
const runtime = new Miniflare(
  convertV4MiniflareOptions({
    name: "qa-imports-flujario",
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
  for (const file of (await readdir("drizzle")).filter((n) => n.endsWith(".sql")).sort())
    await db.batch(
      (await readFile(resolve("drizzle", file), "utf8"))
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => db.prepare(s)),
    );
  const read = async (user = "ana") =>
    (await runtime.dispatchFetch(`https://qa.local/read?user=${user}`)).json();
  const mutate = async (value, user = "ana") => {
    const r = await runtime.dispatchFetch(`https://qa.local/write?user=${user}`, {
      method: "POST",
      body: JSON.stringify(value),
    });
    return { status: r.status, body: await r.json() };
  };
  await runtime.dispatchFetch("https://qa.local/setup");
  const row = (key, amountMinor, date = "2026-11-15") => ({
    key,
    sourceRef: "QA ficticio",
    date,
    description: "Pago ficticio " + key,
    currency: "ARS",
    amountMinor,
    kind: "expense",
    category: "Otros",
    duplicateAcknowledged: false,
  });
  const bank = (rows) => ({
    intent: "import",
    institution: "galicia",
    format: "csv",
    requestKey: crypto.randomUUID(),
    currency: "ARS",
    reviewed: true,
    rows,
  });
  const input = bank([row("hist", 2000, "2026-10-31"), row("payment", 10000)]);
  const attempts = await Promise.all(Array.from({ length: 10 }, () => mutate(input)));
  assert(attempts.every((r) => r.status === 200));
  let current = await read();
  assert.equal(current.finance.entries.length, 1);
  assert.equal(current.state.history.length, 1);
  assert.equal(current.state.batches.length, 1);
  const id = current.finance.entries[0].id;
  const card = (sum = 10000) => ({
    intent: "breakdown",
    institution: "galicia",
    format: "pdf-ocr",
    requestKey: crypto.randomUUID(),
    currency: "ARS",
    reviewed: true,
    target: { kind: "entry", id },
    rows: [
      { ...row("ropa", 3000), kind: "part", category: "Ropa" },
      { ...row("comida", 4000), kind: "part", category: "Alimentación" },
      { ...row("tax", sum - 7000), kind: "part", category: "Impuestos" },
    ],
  });
  const old = card(12000);
  assert.equal((await mutate(old)).body.ready, false);
  assert.equal((await mutate(card())).body.ready, true);
  await mutate(old);
  current = await read();
  assert.equal(current.state.breakdowns[0].totalMinor, 10000);
  assert.equal(current.finance.entries.length, 1);
  assert.equal((await mutate(card(), "bea")).status, 404);
  assert.deepEqual((await read("bea")).state, { history: [], batches: [], breakdowns: [] });
  const race = await Promise.all([
    mutate(bank([row("same1", 700)])),
    mutate(bank([row("same2", 700)])),
  ]);
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
  const before = (await db.prepare("SELECT COUNT(*) n FROM statement_imports").first()).n;
  await db
    .prepare(
      "CREATE TRIGGER qa_reject BEFORE INSERT ON statement_rows WHEN NEW.source_key='fail' BEGIN SELECT RAISE(ABORT,'qa'); END",
    )
    .run();
  assert.equal((await mutate(bank([row("good", 333), row("fail", 444)]))).status, 500);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM statement_imports").first()).n, before);
  assert.equal(
    (await db.prepare("SELECT COUNT(*) n FROM entries WHERE amount_cents IN (333,444)").first()).n,
    0,
  );
  console.log(
    "D1/workerd: 10 reintentos, carrera entre lotes, rollback completo, aislamiento y revisiones de tarjeta verificados.",
  );
} finally {
  await runtime.dispose();
}
