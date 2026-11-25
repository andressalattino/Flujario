// Consulta sólo los endpoints públicos ya aprobados; no usa la base ni datos personales.
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { build } from "esbuild";
const result = await build({
  stdin: {
    resolveDir: process.cwd(),
    contents: `import {parseQuoteFeed} from './app/services/quotes.server.ts'; export default {async fetch(){ const results=[];for(const [feed,url] of [['dollars','https://dolarapi.com/v1/dolares'],['currencies','https://dolarapi.com/v1/cotizaciones']])try{const r=await fetch(url,{signal:AbortSignal.timeout(8000),redirect:'manual',headers:{Accept:'application/json'}});const raw=await r.text();let count=null,error=null;try{count=parseQuoteFeed(raw,feed,new Date()).length;}catch(e){error=e.message;}results.push({feed,status:r.status,contentType:r.headers.get('Content-Type'),count,error});}catch(e){results.push({feed,error:e.message});}return Response.json(results);}};`,
  },
  write: false,
  bundle: true,
  platform: "browser",
  format: "esm",
  logLevel: "silent",
});
const runtime = new Miniflare(
  convertV4MiniflareOptions({
    name: "qa-quotes-network",
    modules: true,
    compatibilityDate: "2026-11-13",
    compatibilityFlags: ["nodejs_compat"],
    script: result.outputFiles[0].text,
  }),
);
try {
  console.log(JSON.stringify(await (await runtime.dispatchFetch("http://qa.local/")).json()));
} finally {
  await runtime.dispose();
}
