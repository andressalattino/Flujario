// Ejecuta refreshQuoteCache real en workerd; red ficticia y D1 efímera, sin originales ni claves.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
const result = await build({
  stdin: {
    resolveDir: process.cwd(),
    contents: `import {createDb} from './app/db/repository.server.ts';import {refreshQuoteCache} from './app/services/quotes.server.ts';import {getQuoteSnapshot} from './app/db/quotes.server.ts';export default {async fetch(request,env){const db=createDb(env.DB);const result=await refreshQuoteCache(db);return Response.json({result,...await getQuoteSnapshot(db)});}};`,
  },
  write: false,
  bundle: true,
  platform: "browser",
  format: "esm",
  logLevel: "silent",
});
let requests = 0,
  redirect = false;
const runtime = new Miniflare(
  convertV4MiniflareOptions({
    name: "qa-quote-runtime",
    modules: true,
    script: result.outputFiles[0].text,
    compatibilityDate: "2026-11-13",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: ["DB"],
    d1Persist: false,
    outboundService: async (request) => {
      requests++;
      assert.match(request.url, /^https:\/\/dolarapi.com\/v1\/(dolares|cotizaciones)$/);
      if (redirect)
        return new Response("redirect", {
          status: 302,
          headers: { Location: "https://otro.test" },
        });
      const definitions = request.url.endsWith("/dolares")
        ? [
            ["USD", "oficial"],
            ["USD", "bolsa"],
            ["USD", "blue"],
          ]
        : [
            ["EUR", "oficial"],
            ["BRL", "oficial"],
            ["CLP", "oficial"],
            ["UYU", "oficial"],
          ];
      return new Response(
        "[" +
          definitions
            .map(
              ([moneda, casa]) =>
                `{"moneda":"${moneda}","casa":"${casa}","compra":1490.125,"venta":1500.12345678,"fechaActualizacion":"2026-11-20T12:00:00Z"}`,
            )
            .join(",") +
          "]",
        { headers: { "Content-Type": "application/json" } },
      );
    },
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
  const read = async () => (await runtime.dispatchFetch("http://qa.local/")).json();
  const first = await read();
  assert.equal(first.result.status, "ok");
  assert.equal(first.quotes.length, 7);
  assert.equal(requests, 2);
  assert(first.quotes.every((q) => q.sellRate === "1500.12345678"));
  assert.equal((await read()).result.status, "cached");
  assert.equal(requests, 2);
  redirect = true;
  await db.prepare("UPDATE quote_cache_state SET next_attempt_at='2000-01-01T00:00:00Z'").run();
  const failed = await read();
  assert.equal(failed.result.status, "error");
  assert.deepEqual(failed.quotes, first.quotes);
  assert.equal(requests, 4);
  console.log(
    "workerd/D1: fetch real compatible con el runtime, siete tasas exactas, caché compartido y redirecciones rechazadas sin perder datos.",
  );
} finally {
  await runtime.dispose();
}
