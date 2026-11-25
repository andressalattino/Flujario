// Inspecciona sólo los metadatos XML de los feeds acordados; no descarga fotos ni HTML.
import { build } from "esbuild";
import { XMLParser } from "fast-xml-parser";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const out = resolve(".wrangler/qa-news/images-parser.mjs");
await mkdir(resolve(".wrangler/qa-news"), { recursive: true });
await build({
  stdin: {
    resolveDir: resolve("."),
    contents:
      'export { parseNewsFeed, validateFeedXml } from "./app/services/rss.server.ts"; export { newsSources } from "./app/data/news-sources.ts";',
  },
  outfile: out,
  bundle: true,
  platform: "node",
  format: "esm",
  logLevel: "silent",
});
const { parseNewsFeed, validateFeedXml, newsSources } = await import(pathToFileURL(out).href);
const results = [];
for (const source of newsSources.filter((s) => s.id !== "mdz")) {
  const result = {
    source: source.id,
    checkedAt: new Date().toISOString(),
    http: null,
    accepted: 0,
    withImage: 0,
    imageHosts: {},
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
    let xml = "",
      size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2097152) throw new Error("Size limit");
        xml += decoder.decode(value, { stream: true });
      }
      xml += decoder.decode();
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    validateFeedXml(xml);
    const tree = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@",
      removeNSPrefix: true,
      parseTagValue: false,
      processEntities: false,
    }).parse(xml);
    const hosts = new Set();
    function inspect(node) {
      if (!node || typeof node !== "object") return;
      if (typeof node["@url"] === "string") {
        try {
          const u = new URL(node["@url"]);
          if (u.protocol === "https:" && !u.username && !u.password && !u.port)
            hosts.add(u.hostname);
        } catch {}
      }
      for (const value of Object.values(node)) if (typeof value === "object") inspect(value);
    }
    inspect(tree);
    const articles = parseNewsFeed(
      xml,
      { ...source, imageAllowed: true, imageHosts: [...hosts] },
      new Date(),
    );
    result.accepted = articles.length;
    for (const article of articles)
      if (article.imageUrl) {
        result.withImage++;
        const host = new URL(article.imageUrl).hostname;
        result.imageHosts[host] = (result.imageHosts[host] ?? 0) + 1;
      }
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Error de verificación";
  }
  results.push(result);
  console.log(JSON.stringify(result));
}
await writeFile(
  "qa/rss-imagenes-verificacion.json",
  JSON.stringify(
    {
      purpose: "Metadatos de imágenes de noticias económicas; sin descargar fotos ni artículos",
      results,
    },
    null,
    2,
  ) + "\n",
);
