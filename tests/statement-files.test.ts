import { it, expect, vi, afterEach } from "vitest";
import * as XLSX from "xlsx";
import { readStatementFile } from "../app/services/statement-files.client";
import { guessMapping, mapStatementGrid, validateDraft } from "../app/domain/statement-reading";
const opts = () => ({ signal: new AbortController().signal, progress: () => {} });
vi.mock("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url", () => ({
  default: new URL("../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url)
    .href,
}));
function syntheticPDF(pages = 1) {
  const text =
    "BT /F1 12 Tf 1 0 0 1 50 740 Tm (Fecha) Tj 1 0 0 1 210 740 Tm (Descripcion) Tj 1 0 0 1 450 740 Tm (Importe) Tj 1 0 0 1 50 700 Tm (15/11/2026) Tj 1 0 0 1 210 700 Tm (Compra) Tj 1 0 0 1 450 700 Tm (1.234,56) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Count ${pages} /Kids [${Array.from({ length: pages }, () => "3 0 R").join(" ")}] >>`,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new File([pdf], "sintetico.pdf");
}
it("extrae un PDF digital con PDF.js y reconstruye sus columnas", async () => {
  const result = await readStatementFile(syntheticPDF(), opts());
  expect(result.format).toBe("pdf-text");
  const grid = result.grids[0]!,
    mapping = { ...guessMapping(grid), convention: "expense" as const };
  expect(
    validateDraft(mapStatementGrid(grid, mapping, "ARS", false)[0]!, false, "2026-11-20").value,
  ).toMatchObject({ date: "2026-11-15", amountMinor: 123456 });
});
it("rechaza un PDF de más de 30 páginas antes de procesarlo", async () => {
  await expect(readStatementFile(syntheticPDF(31), opts())).rejects.toThrow("30 páginas");
  await expect(readStatementFile(new File(["abc"], "falso.pdf"), opts())).rejects.toThrow(
    "no corresponde",
  );
});
afterEach(() => vi.unstubAllGlobals());
function fileReaderForTest() {
  // Adaptación de FileReader para Node: se usa el parser real, sin reemplazar Papa Parse.
  vi.stubGlobal(
    "FileReader",
    class {
      onload?: (event: { target: { result: string } }) => void;
      onerror?: () => void;
      readAsText(file: Blob, encoding = "UTF-8") {
        void file
          .arrayBuffer()
          .then((b) => this.onload?.({ target: { result: new TextDecoder(encoding).decode(b) } }))
          .catch(() => this.onerror?.());
      }
    },
  );
}
it("lee CSV con separador argentino, conserva texto y detecta comillas rotas", async () => {
  fileReaderForTest();
  const result = await readStatementFile(
    new File(
      ['Fecha;Descripción;Importe\r\n15/11/2026;"Compra; local";-1.234,56\r\n'],
      "prueba.csv",
    ),
    opts(),
  );
  const grid = result.grids[0]!;
  expect(grid.rows[1]?.[1]).toBe("Compra; local");
  const row = mapStatementGrid(grid, guessMapping(grid), "ARS", false)[0]!;
  expect(validateDraft(row, false, "2026-11-20").value).toMatchObject({
    amountMinor: 123456,
    kind: "expense",
  });
  await expect(
    readStatementFile(
      new File(['Fecha;Descripción;Importe\n15/11/2026;"Compra;10'], "rota.csv"),
      opts(),
    ),
  ).rejects.toThrow("comillas");
});
it("un CSV extenso falla sin conservar un lote parcial", async () => {
  fileReaderForTest();
  const file = new File(
    ["Fecha;Descripción;Importe\n" + "15/11/2026;Compra;10\n".repeat(2100)],
    "grande.csv",
  );
  await expect(readStatementFile(file, opts())).rejects.toThrow("límite");
});
function workbookFile(type: "xlsx" | "xls", date1904 = false) {
  const book = XLSX.utils.book_new();
  book.Workbook = { WBProps: { date1904 } };
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Fecha", "Descripción", "Importe"],
    ["15/11/2026", "Compra", 1234.56],
    ["16/11/2026", "Fórmula", 99],
  ]);
  sheet.C2!.z = "#,##0.00";
  sheet.C3!.f = "1+98";
  XLSX.utils.book_append_sheet(book, sheet, "Cuenta");
  const buffer = XLSX.write(book, { type: "buffer", bookType: type === "xls" ? "biff8" : "xlsx" });
  return new File([buffer], `ejemplo.${type}`);
}
it.each(["xlsx", "xls"] as const)("lee Excel %s real sin ejecutar fórmulas", async (type) => {
  const result = await readStatementFile(workbookFile(type), opts());
  expect(result.format).toBe(type);
  const grid = result.grids[0]!;
  const mapping = { ...guessMapping(grid), locale: "en" as const, convention: "expense" as const };
  const rows = mapStatementGrid(grid, mapping, "ARS", false);
  expect(validateDraft(rows[0]!, false, "2026-11-20").value?.amountMinor).toBe(123456);
  if (type === "xlsx") {
    expect(rows[1]?.issue).toBeTruthy();
    expect(grid.rows[2]?.[2]).toContain("Fórmula");
  } else expect(validateDraft(rows[1]!, false, "2026-11-20").value?.amountMinor).toBe(9900);
});
it.each([false, true])("respeta fechas de Excel con sistema 1904=%s", async (date1904) => {
  const book = XLSX.utils.book_new();
  book.Workbook = { WBProps: { date1904 } };
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Fecha", "Descripción", "Importe"],
    [date1904 ? 1 : 1463, "Compra", 100],
  ]);
  sheet.A2!.z = "dd/mm/yyyy";
  XLSX.utils.book_append_sheet(book, sheet, "Cuenta");
  const file = new File([XLSX.write(book, { type: "buffer", bookType: "xlsx" })], "fecha.xlsx");
  expect((await readStatementFile(file, opts())).grids[0]?.rows[1]?.[0]).toBe("02/01/1904");
});
it("no recorta silenciosamente una hoja demasiado extensa", async () => {
  const book = XLSX.utils.book_new(),
    sheet = XLSX.utils.aoa_to_sheet([["Fecha"]]);
  sheet["!ref"] = "A1:A3000";
  XLSX.utils.book_append_sheet(book, sheet, "Grande");
  await expect(
    readStatementFile(
      new File([XLSX.write(book, { type: "buffer", bookType: "xlsx" })], "grande.xlsx"),
      opts(),
    ),
  ).rejects.toThrow("límite");
});
it("rechaza archivos vacíos, extensiones ajenas y lecturas canceladas", async () => {
  await expect(readStatementFile(new File([], "x.csv"), opts())).rejects.toThrow("10 MB");
  await expect(readStatementFile(new File(["abc"], "x.exe"), opts())).rejects.toThrow("PDF, CSV");
  const controller = new AbortController();
  controller.abort();
  await expect(
    readStatementFile(workbookFile("xlsx"), { ...opts(), signal: controller.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
});
