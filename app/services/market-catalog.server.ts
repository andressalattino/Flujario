import type { createDb } from "~/db/repository.server";
import {
  catalogDue,
  parseWikiCatalog,
  wikipediaCatalogs,
  wikiRevisionId,
  type WikiCatalog,
} from "~/domain/market-catalog";
import { today } from "~/domain/dates";
import { isISODate } from "~/domain/dates";
import type { StockIndex, StockIndexId } from "~/domain/markets";

export async function fetchWikiCatalog(id: StockIndexId, now: Date, request = fetch) {
  const response = await request(
    `https://en.wikipedia.org/w/rest.php/v1/page/${wikipediaCatalogs[id].page}`,
    {
      headers: {
        "User-Agent": "Flujario-Catalog/1.0 (Wikipedia index catalog; local prototype)",
        Accept: "application/json",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(12000),
    },
  );
  if (!response.ok || !response.headers.get("Content-Type")?.includes("application/json")) {
    await response.body?.cancel();
    throw Error("La fuente no devolvió JSON disponible.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw Error("Respuesta sin contenido.");
  let text = "",
    bytes = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 256 * 1024) throw Error("Respuesta de catálogo excesiva.");
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  return parseWikiCatalog(JSON.parse(text), id, now);
}
export async function applyWikiCatalog(
  db: ReturnType<typeof createDb>,
  old: StockIndex,
  catalog: WikiCatalog,
  date: string,
) {
  if (!isISODate(date) || date < old.verifiedAt)
    throw Error("No se permite retroceder la fecha de revisión.");
  const prior = await db.$client
    .prepare("SELECT company_id FROM stock_index_members WHERE index_id=?")
    .bind(old.id)
    .all<{ company_id: string }>();
  const previous = new Set(prior.results.map((r) => r.company_id)),
    next = new Set(catalog.companies.map((c) => c.symbol));
  const changes =
    [...previous].filter((id) => !next.has(id)).length +
    [...next].filter((id) => !previous.has(id)).length;
  const revision = wikiRevisionId(old.sourceUrl);
  if (
    changes > 20 ||
    (revision && catalog.revisionId < revision) ||
    (!revision && changes && catalog.revisionDate < old.verifiedAt)
  )
    throw Error("Cambios inesperados o revisión anterior: se conserva la lista existente.");
  // Todas las escrituras verifican la misma versión. El batch es transaccional:
  // otra descarga que termine después no puede pisar una actualización ganadora.
  const guard = "EXISTS(SELECT 1 FROM stock_indices WHERE id=? AND verified_at=? AND source_url=?)";
  const expected = [old.id, old.verifiedAt, old.sourceUrl];
  const statements: D1PreparedStatement[] = [];
  for (let start = 0; start < catalog.companies.length; start += 20) {
    const chunk = catalog.companies.slice(start, start + 20);
    statements.push(
      db.$client
        .prepare(
          `INSERT OR IGNORE INTO stock_companies(id,symbol,name) SELECT column1,column1,column2 FROM (VALUES ${chunk.map(() => "(?,?)").join(",")}) WHERE ${guard}`,
        )
        .bind(...chunk.flatMap((c) => [c.symbol, c.name]), ...expected),
    );
  }
  statements.push(
    db.$client
      .prepare(`DELETE FROM stock_index_members WHERE index_id=? AND ${guard}`)
      .bind(old.id, ...expected),
  );
  for (let start = 0; start < catalog.companies.length; start += 25) {
    const chunk = catalog.companies.slice(start, start + 25);
    statements.push(
      db.$client
        .prepare(
          `INSERT INTO stock_index_members(index_id,company_id) SELECT ?,column1 FROM (VALUES ${chunk.map(() => "(?)").join(",")}) WHERE ${guard}`,
        )
        .bind(old.id, ...chunk.map((c) => c.symbol), ...expected),
    );
  }
  statements.push(
    db.$client
      .prepare(
        `UPDATE stock_indices SET verified_at=?,composition_date=?,source_url=? WHERE id=? AND ${guard} RETURNING id`,
      )
      .bind(date, catalog.revisionDate, catalog.sourceUrl, old.id, ...expected),
  );
  const result = await db.$client.batch(statements);
  return result.at(-1)!.results.length ? "updated" : "superseded";
}
export async function syncMarketCatalog(
  db: ReturnType<typeof createDb>,
  now = new Date(),
  request = fetch,
) {
  const date = today(now);
  const indices = await db.$client
    .prepare(
      "SELECT id,name,description,verified_at AS verifiedAt,composition_date AS compositionDate,source_url AS sourceUrl FROM stock_indices",
    )
    .all<StockIndex>();
  const result: Record<string, string> = {};
  for (const index of indices.results) {
    try {
      result[index.id] = catalogDue(index, date)
        ? await applyWikiCatalog(db, index, await fetchWikiCatalog(index.id, now, request), date)
        : "cached";
    } catch {
      result[index.id] = "error-kept-previous";
    }
  }
  return result;
}
