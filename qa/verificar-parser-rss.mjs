// Diagnóstico técnico de los RSS oficiales. No publica ni almacena artículos o imágenes.
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const out = resolve(".wrangler/qa-news/parser.mjs");
await mkdir(resolve(".wrangler/qa-news"), { recursive: true });
await build({
  stdin: {
    resolveDir: resolve("."),
    contents:
      'export { parseNewsFeed } from "./app/services/rss.server.ts"; export { newsSources } from "./app/data/news-sources.ts";',
  },
  outfile: out,
  bundle: true,
  platform: "node",
  format: "esm",
  logLevel: "silent",
});
const { parseNewsFeed, newsSources } = await import(pathToFileURL(out).href);
const results = [];
for (const source of newsSources.filter((source) => source.id !== "mdz")) {
  const result = {
    source: source.id,
    checkedAt: new Date().toISOString(),
    http: null,
    accepted: 0,
    latestPublishedAt: null,
    error: null,
  };
  try {
    const response = await fetch(source.feedUrls[0], {
      redirect: "error",
      signal: AbortSignal.timeout(12000),
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml",
        "User-Agent": "Flujario-Feed-Check/1.0",
      },
    });
    result.http = response.status;
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("HTTP " + response.status);
    }
    const reader = response.body.getReader(),
      decoder = new TextDecoder();
    let bytes = 0,
      xml = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 2097152) throw new Error("Size limit");
        xml += decoder.decode(value, { stream: true });
      }
      xml += decoder.decode();
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    const articles = parseNewsFeed(xml, source, new Date());
    result.accepted = articles.length;
    result.latestPublishedAt = articles[0]?.publishedAt ?? null;
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Error de consulta";
  }
  results.push(result);
  console.log(JSON.stringify(result));
}
await writeFile(
  "qa/rss-parser-verificacion.json",
  JSON.stringify(
    { purpose: "Validación técnica sin publicación ni guardado de artículos", results },
    null,
    2,
  ),
);
