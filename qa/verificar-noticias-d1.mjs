// Prueba aislada: workerd/D1 temporal, artículos ficticios y ninguna consulta externa.
import assert from "node:assert/strict";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
const out = resolve(".wrangler/qa-news/worker.mjs");
await mkdir(resolve(".wrangler/qa-news"), { recursive: true });
await build({
  stdin: {
    resolveDir: resolve("."),
    contents: `
import { createDb } from './app/db/repository.server.ts';
import { syncNews, publishWeeklyNews } from './app/services/news-sync.server.ts';
import { readNewsPage, readNewsOverview, setArticleSaved, setSourceFavorite, cleanupNews } from './app/db/news.server.ts';
import { newsSources } from './app/data/news-sources.ts';
import { newsQuerySchema } from './app/domain/news.ts';
const source={...newsSources[0],publication:'approved',permissionReference:'AUTORIZACIÓN FICTICIA SÓLO PARA ESTA PRUEBA'};
export default { async fetch(request,env) {
 const db=createDb(env.DB),now=new Date('2026-11-18T18:00:00Z');
 const command=new URL(request.url).pathname;
 if(command==='/seed') {
  let calls=0;
  const xml='<rss><channel>'+Array.from({length:100},(_,i)=>'<item><title>Noticia ficticia para prueba '+i+'</title><link>https://www.iprofesional.com/economia/qa-'+i+'</link><pubDate>Wed, 18 Nov 2026 15:00:00 GMT</pubDate></item>').join('')+'</channel></rss>';
  const feed=async()=>{calls++;return new Response(xml,{headers:{'Content-Type':'application/xml'}})};
  const sync=await syncNews(db,now,feed,[source]); await syncNews(db,now,feed,[source]);
  const page=await readNewsPage(db,'uno',newsQuerySchema.parse({}),now,[source]);
  await setArticleSaved(db,'uno',page.groups[0].articles[0].id,true,now,[source]);
  await setSourceFavorite(db,'uno',source.id,true,now);
  const other=await readNewsPage(db,'dos',newsQuerySchema.parse({saved:'yes'}),now,[source]);
  const overview=await readNewsOverview(db,'uno',now,[source]);
  return Response.json({calls,sync,total:page.groups[0].total,shown:page.groups[0].articles.length,otherSaved:other.groups[0].total,preferred:overview.sources[0].favorite});
 }
 if(command==='/weekly') {
  const first=await publishWeeklyNews(db,new Date('2026-11-16T13:00:00Z'),[source]);
  const second=await publishWeeklyNews(db,now,[source]);
  const page=await readNewsPage(db,'uno',newsQuerySchema.parse({period:'weekly'}),now,[source]);
  return Response.json({first,second,total:page.groups[0].total,period:page.weeklyPeriod});
 }
 if(command==='/cleanup') {await cleanupNews(db,new Date('2026-12-04T18:00:00Z'));return Response.json({ok:true})}
 return new Response('Not found',{status:404});
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
    name: "qa-news-flujario",
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
  for (const name of (await readdir("drizzle")).filter((name) => name.endsWith(".sql")).sort()) {
    const statements = (await readFile(resolve("drizzle", name), "utf8"))
      .split("--> statement-breakpoint")
      .map((value) => value.trim())
      .filter(Boolean);
    await db.batch(statements.map((statement) => db.prepare(statement)));
  }
  const first = await (await runtime.dispatchFetch("https://qa.local/seed")).json();
  assert.equal(first.total, 100);
  assert.equal(first.shown, 5);
  assert.equal(first.calls, 1);
  assert.equal(first.otherSaved, 0);
  assert.equal(first.preferred, true);
  assert.equal(first.sync[0].status, "ok");
  await db.prepare("UPDATE news_articles SET published_at='2026-11-15T15:00:00.000Z'").run();
  const weekly = await (await runtime.dispatchFetch("https://qa.local/weekly")).json();
  assert.equal(weekly.total, 100);
  assert.equal(weekly.period, "2026-11-16");
  await runtime.dispatchFetch("https://qa.local/cleanup");
  assert.equal((await db.prepare("SELECT count(*) AS n FROM news_articles").first()).n, 0);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM saved_news").first()).n, 0);
  console.log(
    "Noticias: RSS/JSON bulk, filtros, favoritos privados, semana fija y limpieza pasaron en workerd/D1 temporal.",
  );
} finally {
  await runtime.dispose();
}
