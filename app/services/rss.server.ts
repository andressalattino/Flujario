import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { NewsSource } from "../data/news-sources";
import { isISODate } from "../domain/dates";
import type { NewsArticle, NewsCategory } from "../domain/news";

export type FeedArticle = Omit<NewsArticle, "id" | "saved"> & { externalId: string | null };
const array = (value: unknown): unknown[] =>
  value == null ? [] : Array.isArray(value) ? value : [value];
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};
const text = (value: unknown): string =>
  typeof value === "string"
    ? value
    : typeof value === "number"
      ? String(value)
      : value && typeof value === "object" && "#text" in value
        ? text(value["#text"])
        : "";
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
export function plainFeedText(value: string, limit: number) {
  let result = value.slice(0, 16000);
  for (let i = 0; i < 2; i++)
    result = result.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, code: string) => {
      const fixed: Record<string, string> = {
        amp: "&",
        lt: "<",
        gt: ">",
        quot: '"',
        apos: "'",
        nbsp: " ",
      };
      if (!code.startsWith("#")) return fixed[code.toLowerCase()] ?? "";
      const point = parseInt(
        code.slice(code[1]?.toLowerCase() === "x" ? 2 : 1),
        code[1]?.toLowerCase() === "x" ? 16 : 10,
      );
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point)
        : "";
    });
  return result
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}
export function canonicalNewsUrl(raw: string, source: NewsSource) {
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      !source.articleHosts.includes(url.hostname) ||
      url.username ||
      url.password ||
      url.port
    )
      return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()])
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.href.length <= 2048 ? url.href : null;
  } catch {
    return null;
  }
}
export function feedPublishedAt(raw: string, now: Date) {
  const value = raw.trim();
  if (!/(?:Z|[+-]\d\d:\d\d|GMT|UTC|[+-]\d{4}|[ECMP][SD]T)\s*$/i.test(value)) return null;
  const iso = /^(\d{4}-\d{2}-\d{2})T/.exec(value);
  if (iso && !isISODate(iso[1]!)) return null;
  const rfc = /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\b/i.exec(
    value,
  );
  if (rfc) {
    const month =
      ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(
        rfc[2]!.toLowerCase(),
      ) + 1;
    if (!isISODate(`${rfc[3]}-${String(month).padStart(2, "0")}-${rfc[1]!.padStart(2, "0")}`))
      return null;
  }
  if (!iso && !rfc) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp > now.getTime() || timestamp < Date.UTC(1990, 0, 1))
    return null;
  return new Date(timestamp).toISOString();
}
function economicCategory(
  source: NewsSource,
  url: string,
  categories: string[],
  fallback: boolean,
): NewsCategory | null {
  const topics = categories.map(normalize);
  const topicMap: Record<string, NewsCategory> = {
    economia: "economia",
    economy: "economia",
    economics: "economia",
    finanzas: "finanzas",
    finance: "finanzas",
    mercados: "mercados",
    markets: "mercados",
    dolar: "dolar",
    inversiones: "inversiones",
    investing: "inversiones",
  };
  const explicit = topics.map((topic) => topicMap[topic]).find(Boolean);
  if (explicit) return explicit;
  const path = normalize(new URL(url).pathname);
  if (source.id === "infobae") return path.startsWith("/economia/") ? "economia" : null;
  if (source.id === "iprofesional") {
    const section = path.split("/")[1];
    return section === "finanzas"
      ? "finanzas"
      : ["economia", "negocios", "comex", "impuestos", "energia"].includes(section ?? "")
        ? "economia"
        : null;
  }
  // El alternativo de Bloomberg es general: sin metadatos económicos no se acepta.
  if (fallback) return null;
  return "economia";
}
export function validateFeedXml(xml: string) {
  if (xml.length > 2097152) throw new Error("XML no permitido.");
  if (XMLValidator.validate(xml) !== true) throw new Error("XML inválido.");
  // CDATA es texto literal, no marcado XML. Un <!DOCTYPE html> dentro de una
  // descripción CDATA no declara un DTD ni puede resolver entidades externas.
  // Recorre los bloques en orden: un CDATA escrito dentro de un comentario o
  // una instrucción no puede ocultar una declaración real que aparezca después.
  const blocks =
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!\s*(DOCTYPE|ENTITY)\b/gi;
  for (const block of xml.matchAll(blocks)) if (block[1]) throw new Error("XML no permitido.");
}
export function parseNewsFeed(
  xml: string,
  source: NewsSource,
  now: Date,
  fallback = false,
): FeedArticle[] {
  validateFeedXml(xml);
  const parsed = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    processEntities: true,
    htmlEntities: false,
    trimValues: true,
  }).parse(xml) as Record<string, unknown>;
  const rss = record(record(parsed.rss).channel);
  const atom = record(parsed.feed);
  const rdf = record(parsed.RDF);
  const root = parsed.rss ? rss : parsed.feed ? atom : parsed.RDF ? rdf : null;
  if (!root) throw new Error("La respuesta no es RSS ni Atom.");
  const entries = array(root.item ?? root.entry);
  if (entries.length > 500) throw new Error("El feed supera las 500 entradas permitidas.");
  const language = plainFeedText(
    text(root.language) || text(root["@lang"]) || (source.id === "bloomberg" ? "en" : "es"),
    30,
  );
  const result: FeedArticle[] = [];
  const seen = new Set<string>();
  for (const raw of entries) {
    const item = record(raw);
    const links = array(item.link);
    const link = links.find(
      (value) =>
        typeof value === "string" ||
        !record(value)["@rel"] ||
        record(value)["@rel"] === "alternate",
    );
    const url = canonicalNewsUrl(text(record(link)["@href"]) || text(link), source);
    const publishedAt = feedPublishedAt(
      text(item.pubDate ?? item.published ?? item.date ?? item.updated),
      now,
    );
    const title = plainFeedText(text(item.title), 300);
    if (!url || !publishedAt || title.length < 5 || seen.has(url)) continue;
    const category = economicCategory(
      source,
      url,
      array(item.category).map((value) => text(record(value)["@term"]) || text(value)),
      fallback,
    );
    if (!category) continue;
    seen.add(url);
    let imageUrl: string | null = null;
    if (source.imageAllowed) {
      for (const value of [
        ...array(item.thumbnail),
        ...array(item.enclosure),
        ...array(item.content),
      ]) {
        const node = record(value);
        const rawUrl = text(node["@url"]);
        if (
          !rawUrl ||
          (node["@type"] && !text(node["@type"]).startsWith("image/")) ||
          (node["@medium"] && node["@medium"] !== "image")
        )
          continue;
        const candidate = canonicalNewsUrl(rawUrl, {
          ...source,
          articleHosts: source.imageHosts ?? source.articleHosts,
        });
        if (candidate) {
          imageUrl = candidate;
          break;
        }
      }
    }
    result.push({
      source: source.id,
      sourceName: source.name,
      externalId: plainFeedText(text(item.guid ?? item.id), 500) || null,
      title,
      description: source.descriptionAllowed
        ? plainFeedText(text(item.description ?? item.summary), 280) || null
        : null,
      url,
      imageUrl,
      category,
      language,
      publishedAt,
      fetchedAt: now.toISOString(),
    });
  }
  return result.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}
