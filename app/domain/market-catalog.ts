import { isISODate } from "./dates";
import type { StockIndex, StockIndexId } from "./markets";
import { z } from "zod";

export const wikipediaCatalogs = {
  sp100: { title: "S&P 100", page: "S%26P_100" },
  ndx: { title: "List of NASDAQ-100 companies", page: "List_of_NASDAQ-100_companies" },
} as const;
export const wikiRevisionId = (url: string) => {
  const match = /^https:\/\/en\.wikipedia\.org\/w\/index\.php\?oldid=(\d+)$/.exec(url);
  const id = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};
export function catalogDue(index: StockIndex, date: string) {
  if (!isISODate(date) || !isISODate(index.verifiedAt)) throw Error("Fecha de catálogo inválida.");
  return (
    !wikiRevisionId(index.sourceUrl) ||
    Date.parse(date + "T12:00:00Z") - Date.parse(index.verifiedAt + "T12:00:00Z") >= 15 * 86400000
  );
}
export interface WikiCatalog {
  revisionId: number;
  revisionDate: string;
  sourceUrl: string;
  companies: { symbol: string; name: string }[];
}
const strip = (text: string) =>
  text.replace(/<!--[\s\S]*?-->/g, "").replace(/<ref\b[^>]*\/>|<ref\b[^>]*>[\s\S]*?<\/ref>/gi, "");
function textCell(text: string) {
  return text
    .replace(/\[\[([^\[\]]+)\]\]/g, (_, link: string) => link.split("|").at(-1)!)
    .replace(/'{2,}/g, "")
    .replace(
      /&(amp|quot|apos|nbsp);/g,
      (_, entity: string) => ({ amp: "&", quot: '"', apos: "'", nbsp: " " })[entity]!,
    )
    .trim();
}
export function parseWikiCatalog(raw: unknown, id: StockIndexId, now = new Date()): WikiCatalog {
  if (!raw || typeof raw !== "object") throw Error("Respuesta de catálogo inválida.");
  const decoded = z.object({
    title: z.string(),
    content_model: z.literal("wikitext"),
    source: z.string().max(200000),
    latest: z.object({
      id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      timestamp: z.string(),
    }),
    license: z.object({ url: z.literal("https://creativecommons.org/licenses/by-sa/4.0/deed.en") }),
  });
  const value = decoded.parse(raw);
  const revision = value.latest;
  if (
    value.title !== wikipediaCatalogs[id].title ||
    value.content_model !== "wikitext" ||
    typeof value.source !== "string" ||
    value.source.length > 200000 ||
    !Number.isSafeInteger(revision?.id) ||
    revision.id <= 0 ||
    typeof revision.timestamp !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(revision.timestamp) ||
    !isISODate(revision.timestamp.slice(0, 10)) ||
    !Number.isFinite(Date.parse(revision.timestamp)) ||
    Date.parse(revision.timestamp) > now.getTime() + 300000 ||
    value.license?.url !== "https://creativecommons.org/licenses/by-sa/4.0/deed.en"
  )
    throw Error("No se pudo validar fuente, revisión o licencia del catálogo.");
  const tables = [
    ...strip(value.source).matchAll(/\{\|[^\n]*\bid=["']constituents["'][\s\S]*?\|\}/g),
  ];
  if (tables.length !== 1) throw Error("No hay una tabla inequívoca de integrantes.");
  const rows = tables[0]![0]
    .replace(/\n?\|\}$/, "")
    .split(/\n\|-[^\n]*(?:\n|$)/)
    .slice(1);
  const header = rows.shift()?.trim() ?? "";
  if (
    !(id === "sp100" ? /^!\s*Symbol\s*\n!\s*Name\b/ : /^!\s*Ticker\s*!!\s*Company\b/).test(header)
  )
    throw Error("Cambió el formato de la tabla de integrantes.");
  const companies = rows
    .filter((row) => row.trim())
    .map((row) => {
      if (!row.trim().startsWith("|")) throw Error("Fila de catálogo inválida.");
      // El separador de celdas es || o una línea |; los enlaces se limpian antes.
      const cells = textCell(row)
        .replace(/^\|\s*/, "")
        .split(/\s*\|\|\s*|\n\|[ \t]*/);
      const symbol = cells[0]?.trim(),
        name = cells[1]?.trim();
      if (
        !symbol ||
        !/^[A-Z][A-Z0-9.]{0,14}$/.test(symbol) ||
        !name ||
        name.length > 160 ||
        /[<>\[\]{}|\x00-\x1f]/.test(name)
      )
        throw Error("Símbolo o nombre no admitido.");
      return { symbol, name };
    });
  if (
    companies.length < 90 ||
    companies.length > 110 ||
    new Set(companies.map((c) => c.symbol)).size !== companies.length
  )
    throw Error("El catálogo está incompleto, duplicado o fuera del rango esperado.");
  return {
    companies,
    revisionId: revision.id,
    revisionDate: revision.timestamp.slice(0, 10),
    sourceUrl: `https://en.wikipedia.org/w/index.php?oldid=${revision.id}`,
  };
}
