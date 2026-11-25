import { mkdir, copyFile, readdir, cp } from "node:fs/promises";
import { resolve } from "node:path";
const out = resolve("public/vendor/ocr");
await mkdir(`${out}/core`, { recursive: true });
await mkdir(`${out}/lang`, { recursive: true });
await copyFile("node_modules/tesseract.js/dist/worker.min.js", `${out}/worker.min.js`);
for (const file of await readdir("node_modules/tesseract.js-core")) {
  if (/^tesseract-core-(?:(?:simd|relaxedsimd)-)?lstm\.wasm(?:\.js)?$/.test(file))
    await copyFile(`node_modules/tesseract.js-core/${file}`, `${out}/core/${file}`);
}
await copyFile(
  "node_modules/@tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz",
  `${out}/lang/spa.traineddata.gz`,
);
for (const pkg of ["tesseract.js", "tesseract.js-core", "@tesseract.js-data/spa"]) {
  const files = await readdir(`node_modules/${pkg}`);
  for (const file of files.filter((f) => /^licen[cs]e/i.test(f)))
    await copyFile(
      `node_modules/${pkg}/${file}`,
      `${out}/${pkg.replaceAll("/", "-").replace("@", "")}-${file}`,
    );
}
console.log("OCR local preparado: worker, núcleo WASM y modelo español; sin documentos.");
const pdfOut = resolve("public/vendor/pdf");
await mkdir(pdfOut, { recursive: true });
for (const dir of ["cmaps", "standard_fonts", "wasm"])
  await cp(`node_modules/pdfjs-dist/${dir}`, `${pdfOut}/${dir}`, { recursive: true });
await copyFile("node_modules/pdfjs-dist/LICENSE", `${pdfOut}/LICENSE`);
