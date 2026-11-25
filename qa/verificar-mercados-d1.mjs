// Prueba aislada en workerd/D1, sin claves, consultas bursátiles ni datos personales.
import assert from "node:assert/strict";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
const out = resolve(".wrangler/qa-markets/worker.mjs");
await mkdir(resolve(".wrangler/qa-markets"), { recursive: true });
await build({
  stdin: {
    resolveDir: resolve("."),
    contents: `
import { createDb, performOperation, getSnapshot } from './app/db/repository.server.ts';
import { mutateMarkets, readMarkets, MarketError } from './app/db/markets.server.ts';
export default { async fetch(request,env) {
 const db=createDb(env.DB), command=new URL(request.url).pathname;
 if(command==='/initialize') {
  await performOperation(db,'qa-ana',{intent:'setup',ars:12345,usd:678});
  return Response.json({ok:true});
 }
 if(command==='/read') {
  const data=await readMarkets(db,new URL(request.url).searchParams.get('user'));
  const finance=await getSnapshot(db,'qa-ana');
  return Response.json({...data,accounts:finance.accounts,entries:finance.entries});
 }
 const {user,...mutation}=await request.json();
 try { await mutateMarkets(db,user,mutation); return Response.json({ok:true}); }
 catch(error) { if(error instanceof MarketError) return Response.json({error:error.message},{status:error.status}); throw error; }
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
    name: "qa-markets-flujario",
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
    const statements = (await readFile(resolve("drizzle", name), "utf8"))
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    await db.batch(statements.map((s) => db.prepare(s)));
  }
  const read = async (user = "qa-ana") =>
    (await runtime.dispatchFetch("https://qa.local/read?user=" + user)).json();
  const mutate = async (mutation, user = "qa-ana") => {
    const response = await runtime.dispatchFetch("https://qa.local/mutate", {
      method: "POST",
      body: JSON.stringify({ user, ...mutation }),
    });
    return { status: response.status, body: await response.json() };
  };
  await runtime.dispatchFetch("https://qa.local/initialize");
  const before = await read();
  assert.equal(before.companies.length, 167);
  assert.equal(before.members.filter((m) => m.indexId === "sp100").length, 101);
  assert.equal(before.members.filter((m) => m.indexId === "ndx").length, 101);
  const attempts = await Promise.all(
    before.companies
      .slice(0, 20)
      .map((c) => mutate({ intent: "favorite", symbol: c.symbol, saved: "yes" })),
  );
  assert.equal(attempts.filter((r) => r.status === 200).length, 5);
  assert.equal(attempts.filter((r) => r.status === 409).length, 15);
  assert.ok(
    attempts
      .filter((r) => r.status === 409)
      .every((r) => r.body.error === "Solo podés guardar 5 acciones. Quitá una para agregar otra"),
  );
  const saved = (await read()).favorites;
  const repeats = await Promise.all(
    Array.from({ length: 10 }, () =>
      mutate({ intent: "favorite", symbol: saved[0], saved: "yes" }),
    ),
  );
  assert.ok(repeats.every((r) => r.status === 200));
  await mutate({ intent: "market-index", indexId: "ndx" });
  await mutate({ intent: "favorite", symbol: saved[0], saved: "no" }, "qa-bea");
  await mutate({ intent: "favorite", symbol: "MELI", saved: "yes" }, "qa-bea");
  const after = await read(),
    other = await read("qa-bea");
  assert.equal(after.selectedIndex, "ndx");
  assert.deepEqual(after.favorites, saved);
  assert.deepEqual(after.accounts, before.accounts);
  assert.deepEqual(after.entries, before.entries);
  assert.deepEqual(other.favorites, ["MELI"]);
  assert.equal(other.selectedIndex, "sp100");
  await mutate({ intent: "favorite", symbol: saved[0], saved: "no" });
  assert.equal((await read()).favorites.length, 4);
  console.log(
    "Mercados: migraciones, 101+101 instrumentos, 20 escrituras simultáneas (máximo 5), reintentos, privacidad, preferencias y saldos pasaron en workerd/D1 temporal.",
  );
} finally {
  await runtime.dispose();
}
