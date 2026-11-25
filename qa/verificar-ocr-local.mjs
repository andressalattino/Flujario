// Sólo imagen sintética. No mide precisión con resúmenes bancarios reales.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { createCanvas } from "@napi-rs/canvas";
import { createWorker } from "tesseract.js";
import { build } from "esbuild";
const out = resolve(".wrangler/qa-statements/ocr-domain.mjs");
await mkdir(resolve(".wrangler/qa-statements"), { recursive: true });
await build({
  entryPoints: ["app/domain/statement-reading.ts"],
  outfile: out,
  bundle: true,
  platform: "node",
  format: "esm",
  logLevel: "silent",
});
const { ocrTableRows, guessMapping, mapStatementGrid, validateDraft } = await import(
  new URL("file:///" + out.replaceAll("\\", "/"))
);
const canvas = createCanvas(1600, 500),
  ctx = canvas.getContext("2d");
ctx.fillStyle = "white";
ctx.fillRect(0, 0, 1600, 500);
ctx.fillStyle = "black";
ctx.font = "32px Arial";
for (const [i, row] of [
  ["Fecha", "Descripcion", "Importe"],
  ["15/11/2026", "Supermercado", "1.234,56"],
  ["16/11/2026", "Transporte", "100,00"],
].entries())
  for (const [j, s] of row.entries()) ctx.fillText(s, [60, 500, 1100][j], 80 + i * 90);
const worker = await createWorker("spa", 1, {
  langPath: resolve("public/vendor/ocr/lang"),
  gzip: true,
  cacheMethod: "none",
});
try {
  const { data } = await worker.recognize(
    canvas.toBuffer("image/png"),
    {},
    { text: true, blocks: true },
  );
  const grid = {
    name: "OCR sintético",
    rows: ocrTableRows(
      data.blocks.flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words))),
    ),
  };
  const mapping = { ...guessMapping(grid), convention: "expense" };
  const rows = mapStatementGrid(grid, mapping, "ARS", false);
  assert.deepEqual(
    rows.map((r) => validateDraft(r, false, "2026-11-20").value?.amountMinor),
    [123456, 10000],
  );
  console.log(
    "Motor OCR y modelo español locales: fechas, columnas y centavos exactos en imagen sintética. Navegador y bancos reales pendientes de revisión visual.",
  );
} finally {
  await worker.terminate();
}
