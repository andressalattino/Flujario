import { ocrTableRows, type Grid } from "~/domain/statement-reading";
import {
  readSantanderStatement,
  type PdfTextLine,
  type SantanderBatch,
} from "~/domain/statement-santander";
import {
  MAX_STATEMENT_BYTES,
  MAX_PDF_PAGES,
  MAX_STATEMENT_ROWS,
  type StatementFormat,
} from "~/domain/statements";

type ReadResult = {
  grids: Grid[];
  format: StatementFormat;
  notice: string;
  santander?: SantanderBatch[];
};
type Options = {
  signal: AbortSignal;
  progress: (message: string) => void;
  password?: string;
  ocr?: boolean;
  encoding?: string;
  accountStatement?: boolean;
};
function check(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("Lectura cancelada.", "AbortError");
}
function gridsChecked(grids: Grid[]) {
  for (const g of grids)
    if (
      g.rows.length > MAX_STATEMENT_ROWS + 40 ||
      g.rows.some((r) => r.length > 200) ||
      g.rows.flat().some((s) => s.length > 20000)
    )
      throw new Error(
        "El archivo supera 2.000 filas de revisión, 200 columnas o el tamaño de celda permitido. Exportá un período más corto.",
      );
  if (!grids.some((g) => g.rows.length))
    throw new Error("No encontramos filas. Probá otro formato o la lectura OCR.");
  return grids;
}
// Evita descomprimir hojas con expansión desmedida antes de pasarlas a SheetJS.
function checkZip(bytes: ArrayBuffer) {
  const view = new DataView(bytes);
  let total = 0;
  for (let i = 0; i + 46 <= view.byteLength; i++)
    if (view.getUint32(i, true) === 0x02014b50) {
      total += view.getUint32(i + 24, true);
      if (total > 80 * 1024 * 1024)
        throw new Error(
          "El Excel expandido es demasiado grande. Exportá a CSV o acortá el período.",
        );
      i +=
        45 +
        view.getUint16(i + 28, true) +
        view.getUint16(i + 30, true) +
        view.getUint16(i + 32, true);
    }
}
export async function readStatementFile(file: File, options: Options): Promise<ReadResult> {
  if (!file.size || file.size > MAX_STATEMENT_BYTES)
    throw new Error("Elegí un archivo de hasta 10 MB.");
  check(options.signal);
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv") {
    const { default: Papa } = await import("papaparse");
    const rows = await new Promise<string[][]>((resolve, reject) => {
      const collected: string[][] = [];
      let parser: import("papaparse").Parser | undefined;
      const cancel = () => {
        parser?.abort();
        reject(new DOMException("Lectura cancelada.", "AbortError"));
      };
      options.signal.addEventListener("abort", cancel, { once: true });
      Papa.parse<string[]>(file, {
        worker: true,
        dynamicTyping: false,
        skipEmptyLines: "greedy",
        encoding: options.encoding ?? "UTF-8",
        step: (result, handle) => {
          parser = handle;
          if (options.signal.aborted) {
            cancel();
            return;
          }
          if (result.errors.some((e) => e.code === "MissingQuotes")) {
            reject(new Error("El CSV tiene comillas sin cerrar."));
            handle.abort();
            return;
          }
          if (
            collected.length >= MAX_STATEMENT_ROWS + 40 ||
            result.data.length > 200 ||
            result.data.some((s) => s.length > 20000)
          ) {
            reject(
              new Error(
                "El CSV supera el límite de filas, columnas o longitud de celda. Exportá un período más corto.",
              ),
            );
            handle.abort();
            return;
          }
          collected.push(result.data);
        },
        complete: () => {
          options.signal.removeEventListener("abort", cancel);
          resolve(collected);
        },
        error: () => {
          options.signal.removeEventListener("abort", cancel);
          reject(new Error("No pudimos leer el CSV."));
        },
      });
    });
    check(options.signal);
    return {
      grids: gridsChecked([{ name: "CSV", rows }]),
      format: "csv",
      notice:
        "Elegí las columnas y comprobá el separador decimal. Los importes positivos no siempre son ingresos: verificá el sentido del archivo.",
    };
  }
  const bytes = await file.arrayBuffer();
  check(options.signal);
  if (ext === "xlsx" || ext === "xls") {
    checkZip(bytes);
    const XLSX = await import("xlsx");
    const book = XLSX.read(bytes, {
      type: "array",
      cellDates: false,
      cellNF: true,
      cellFormula: true,
    });
    const grids = book.SheetNames.map((name) => {
      const sheet = book.Sheets[name]!;
      const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
      if (range.e.r > MAX_STATEMENT_ROWS + 40 || range.e.c > 199)
        throw new Error(
          "La hoja supera el límite de filas o columnas. Exportá un período más corto.",
        );
      const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
        header: 1,
        raw: false,
        defval: "",
        dateNF: "dd/mm/yyyy",
      });
      for (let r = range.s.r; r <= range.e.r; r++)
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cell = sheet[XLSX.utils.encode_cell({ r, c })];
          if (!cell) continue;
          if (cell.f && rows[r - range.s.r]) {
            rows[r - range.s.r]![c - range.s.c] = "Fórmula: revisar manualmente";
            continue;
          }
          if (cell.t === "n" && cell.z && XLSX.SSF.is_date(cell.z)) {
            const date = XLSX.SSF.parse_date_code(cell.v, {
              date1904: !!book.Workbook?.WBProps?.date1904,
            });
            if (date && rows[r - range.s.r])
              rows[r - range.s.r]![c - range.s.c] =
                `${String(date.d).padStart(2, "0")}/${String(date.m).padStart(2, "0")}/${date.y}`;
          }
        }
      return { name, rows };
    });
    check(options.signal);
    return {
      grids: gridsChecked(grids),
      format: ext,
      notice:
        "Elegí una hoja y revisá sus columnas. No se ejecutan fórmulas ni macros. Se leen valores guardados; las fórmulas identificadas requieren revisión manual.",
    };
  }
  if (ext !== "pdf") throw new Error("Usá PDF, CSV, XLSX o XLS.");
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
    throw new Error("El contenido no corresponde a un PDF.");
  // La distribución compatible incluye APIs recientes ausentes en algunos navegadores.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { default: workerUrl } = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({
    data: bytes,
    password: options.password,
    useSystemFonts: true,
    cMapUrl: "/vendor/pdf/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/vendor/pdf/standard_fonts/",
    wasmUrl: "/vendor/pdf/wasm/",
  });
  let worker: Awaited<ReturnType<(typeof import("tesseract.js"))["createWorker"]>> | undefined;
  const cancel = () => {
    void task.destroy();
    void worker?.terminate();
  };
  options.signal.addEventListener("abort", cancel, { once: true });
  try {
    const doc = await task.promise;
    if (doc.numPages > MAX_PDF_PAGES)
      throw new Error("El PDF supera 30 páginas. Exportá un período más corto.");
    const rows: string[][] = [];
    const textPages: PdfTextLine[][] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      check(options.signal);
      options.progress(`Leyendo página ${n} de ${doc.numPages}…`);
      const page = await doc.getPage(n);
      if (options.ocr) {
        if (!worker) {
          const { createWorker } = await import("tesseract.js");
          worker = await createWorker("spa", 1, {
            workerPath: "/vendor/ocr/worker.min.js",
            corePath: "/vendor/ocr/core",
            langPath: "/vendor/ocr/lang",
            workerBlobURL: false,
            cacheMethod: "none",
            gzip: true,
          });
          check(options.signal);
          await worker.setParameters({ preserve_interword_spaces: "1" });
        }
        const viewport = page.getViewport({ scale: 2 });
        if (viewport.width * viewport.height > 16000000)
          throw new Error("La página es demasiado grande para OCR local.");
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        try {
          await page.render({ canvas, viewport }).promise;
          const result = await worker.recognize(canvas, {}, { text: true, blocks: true });
          const words =
            result.data.blocks?.flatMap((b) =>
              b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)),
            ) ?? [];
          rows.push(
            ...(words.length
              ? ocrTableRows(words)
              : result.data.text
                  .split(/\r?\n/)
                  .filter((s) => s.trim())
                  .map((s) => s.trim().split(/\s{2,}|\t/))),
          );
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
      } else {
        const content = await page.getTextContent();
        const lines: PdfTextLine[] = [];
        for (const item of content.items)
          if ("str" in item && item.str.trim()) {
            const y = item.transform[5];
            let line = lines.find((l) => Math.abs(l.y - y) < 3);
            if (!line) {
              line = { y, items: [] };
              lines.push(line);
            }
            line.items.push({ x: item.transform[4], width: item.width, text: item.str });
          }
        lines.sort((a, b) => b.y - a.y);
        if (options.accountStatement) textPages.push(lines);
        for (const l of lines) {
          const cells: string[] = [];
          let lastEnd = -Infinity;
          for (const i of l.items.sort((a, b) => a.x - b.x)) {
            if (i.x - lastEnd < 12 && cells.length) cells[cells.length - 1] += " " + i.text;
            else cells.push(i.text);
            lastEnd = i.x + i.width;
          }
          rows.push(cells);
        }
      }
      page.cleanup();
    }
    check(options.signal);
    const santander = options.accountStatement ? readSantanderStatement(textPages) : undefined;
    if (santander) {
      return {
        grids: [],
        format: "pdf-text",
        notice: santander.length
          ? "Resumen de Santander leído."
          : "El resumen de Santander no tiene movimientos.",
        santander,
      };
    }
    return {
      grids: gridsChecked([{ name: "PDF", rows }]),
      format: options.ocr ? "pdf-ocr" : "pdf-text",
      notice:
        "Lectura asistida: las columnas pueden desplazarse entre páginas. Revisá también las filas que no se reconocieron. Si el diseño no se puede mapear, exportá CSV o Excel desde tu banco.",
    };
  } catch (e) {
    if (e instanceof Error && e.name === "PasswordException")
      throw new Error("PDF protegido: ingresá su contraseña local y volvé a leerlo.");
    throw e;
  } finally {
    options.signal.removeEventListener("abort", cancel);
    await worker?.terminate();
    await task.destroy();
  }
}
