// D1 efímera. --live consulta sólo las dos API públicas aprobadas.
import assert from "node:assert/strict";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
const live = process.argv.includes("--live");
const out = resolve(".wrangler/qa-catalog/worker.mjs");
await mkdir(resolve(".wrangler/qa-catalog"), { recursive: true });
await build({
  stdin: {
    resolveDir: resolve("."),
    contents: `
import {createDb,performOperation,getSnapshot} from './app/db/repository.server.ts';
import {readMarkets,mutateMarkets} from './app/db/markets.server.ts';
import {syncMarketCatalog,fetchWikiCatalog,applyWikiCatalog} from './app/services/market-catalog.server.ts';
import sp from './tests/fixtures/wiki-sp100.json';
import ndx from './tests/fixtures/wiki-ndx.json';
export default { async fetch(request,env){
 const db=createDb(env.DB), url=new URL(request.url);
 if(url.pathname==='/init'){await performOperation(db,'qa-ana',{intent:'setup',ars:12345,usd:678});await mutateMarkets(db,'qa-ana',{intent:'favorite',symbol:'AAPL',saved:'yes'});return Response.json({ok:true});}
 if(url.pathname==='/read'){const {accounts,entries}=await getSnapshot(db,'qa-ana');return Response.json({accounts,entries,market:await readMarkets(db,'qa-ana')});}
 const source = ${live ? "fetch" : '(async (url)=>Response.json(String(url).includes("S%26P_100")?sp:ndx))'};
 if(url.pathname==='/probe'){
  try {const old=(await readMarkets(db,null)).indices.find(i=>i.id==='sp100');const data=await fetchWikiCatalog('sp100',new Date('2026-11-24T14:00:00Z'),source);return Response.json({stage:'apply',result:await applyWikiCatalog(db,old,data,'2026-11-24')});}
  catch(e){return Response.json({error:String(e),cause:String(e.cause)});}
 }
 return Response.json(await syncMarketCatalog(db,new Date(url.searchParams.get('day')??'2026-11-24T14:00:00Z'),source));
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
    name: "qa-catalog-flujario",
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
  for (const name of (await readdir("drizzle")).filter((n) => n.endsWith(".sql")).sort())
    await db.batch(
      (await readFile(resolve("drizzle", name), "utf8"))
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => db.prepare(s)),
    );
  const get = async (path) => (await runtime.dispatchFetch("https://qa.local" + path)).json();
  await get("/init");
  const before = await get("/read");
  const sync = await get("/sync");
  if (Object.values(sync).includes("error-kept-previous")) console.log(await get("/probe"));
  assert.deepEqual(sync, { sp100: "updated", ndx: "updated" });
  const after = await get("/read");
  assert.deepEqual(after.accounts, before.accounts);
  assert.deepEqual(after.entries, before.entries);
  assert.deepEqual(after.market.favorites, before.market.favorites);
  for (const index of after.market.indices) {
    assert(index.sourceUrl.startsWith("https://en.wikipedia.org/w/index.php?oldid="));
    assert.equal(after.market.members.filter((m) => m.indexId === index.id).length, 101);
  }
  assert.deepEqual(await get("/sync?day=2026-12-08T14:00:00Z"), { sp100: "cached", ndx: "cached" });
  assert.deepEqual(await get("/sync?day=2026-12-09T14:00:00Z"), {
    sp100: "updated",
    ndx: "updated",
  });
  assert.equal((await db.prepare("PRAGMA foreign_key_check").all()).results.length, 0);
  console.log(
    JSON.stringify({
      mode: live ? "API Wikipedia real + D1 temporal" : "fuente de prueba + D1 temporal",
      sync,
      indices: after.market.indices.map((i) => ({
        id: i.id,
        checked: i.verifiedAt,
        revision: i.sourceUrl,
      })),
      financialDataUnchanged: true,
    }),
  );
} finally {
  await runtime.dispose();
}
