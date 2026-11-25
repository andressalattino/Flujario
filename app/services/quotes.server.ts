import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { createDb } from "../db/repository.server";
import { payloadHash } from "../db/repository.server";
import { exchangeQuotes, quoteCacheState } from "../db/schema";
import { quoteDefinitions, quoteSeries, type ExchangeQuote } from "../domain/quotes";
import { canonicalRate, rateFraction } from "../domain/decimal";
import { parseExactJSON } from "../lib/exact-json";
type Db = ReturnType<typeof createDb>;
export const QUOTE_INTERVAL_MS = 3 * 60 * 60 * 1000;
const feeds = {
  dollars: "https://dolarapi.com/v1/dolares",
  currencies: "https://dolarapi.com/v1/cotizaciones",
} as const;
const quoteRow = z.object({
  moneda: z.string(),
  casa: z.string(),
  compra: z.string(),
  venta: z.string(),
  fechaActualizacion: z.iso.datetime({ offset: true }),
});
async function limitedText(response: Response) {
  if (!response.body) throw new Error("Respuesta vacía.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "",
    bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 65536) {
        await reader.cancel();
        throw new Error("Respuesta demasiado grande.");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
export function parseQuoteFeed(
  raw: string,
  feed: keyof typeof feeds,
  now: Date,
): Omit<ExchangeQuote, "id">[] {
  const rows = z.array(z.unknown()).min(1).max(30).parse(parseExactJSON(raw));
  const result: Omit<ExchangeQuote, "id">[] = [];
  for (const series of quoteSeries) {
    const definition = quoteDefinitions[series];
    if (definition.feed !== feed) continue;
    const candidates = rows.filter(
      (row) =>
        typeof row === "object" &&
        row !== null &&
        "moneda" in row &&
        "casa" in row &&
        row.moneda === definition.currency &&
        row.casa === definition.house,
    );
    if (candidates.length !== 1) continue;
    const parsed = quoteRow.safeParse(candidates[0]);
    if (!parsed.success) continue;
    try {
      const sourceAsOf = new Date(parsed.data.fechaActualizacion).toISOString();
      if (sourceAsOf > now.toISOString()) continue;
      const buyRate = canonicalRate(parsed.data.compra),
        sellRate = canonicalRate(parsed.data.venta);
      const buy = rateFraction(buyRate),
        sell = rateFraction(sellRate);
      if (buy.numerator * sell.denominator > sell.numerator * buy.denominator) continue;
      result.push({
        series,
        currency: definition.currency,
        buyRate,
        sellRate,
        sourceAsOf,
        fetchedAt: now.toISOString(),
      });
    } catch {
      /* Un precio inválido no reemplaza la referencia anterior de esa serie. */
    }
  }
  return result;
}
export async function refreshQuoteCache(db: Db, now = new Date(), fetcher: typeof fetch = fetch) {
  const started = now.toISOString();
  const nextAttemptAt = new Date(now.getTime() + QUOTE_INTERVAL_MS).toISOString();
  // Claim atómico global: varias personas/pestañas no multiplican las consultas.
  const claimed = await db
    .insert(quoteCacheState)
    .values({ id: "dolarapi", lastAttemptAt: started, nextAttemptAt, status: "refreshing" })
    .onConflictDoUpdate({
      target: quoteCacheState.id,
      set: { lastAttemptAt: started, nextAttemptAt, status: "refreshing" },
      setWhere: sql`${quoteCacheState.nextAttemptAt} <= ${started}`,
    })
    .returning({ id: quoteCacheState.id });
  if (!claimed.length) return { status: "cached" as const };
  const results = await Promise.allSettled(
    Object.entries(feeds).map(async ([feed, url]) => {
      const response = await fetcher(url, {
        signal: AbortSignal.timeout(8000),
        // workerd no implementa "error". "manual" + !ok rechaza 3xx sin seguirlos.
        redirect: "manual",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("La fuente no respondió correctamente.");
      const raw = await limitedText(response);
      return parseQuoteFeed(
        raw,
        feed as keyof typeof feeds,
        new Date(Math.max(now.getTime(), Date.now())),
      );
    }),
  );
  const valid = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  const rows = await Promise.all(
    valid.map(async (quote) => ({
      ...quote,
      id: await payloadHash({
        series: quote.series,
        buyRate: quote.buyRate,
        sellRate: quote.sellRate,
        sourceAsOf: quote.sourceAsOf,
      }),
    })),
  );
  const status =
    rows.length === quoteSeries.length
      ? ("ok" as const)
      : rows.length
        ? ("partial" as const)
        : ("error" as const);
  const completed = db
    .update(quoteCacheState)
    .set({ status })
    .where(and(eq(quoteCacheState.id, "dolarapi"), eq(quoteCacheState.lastAttemptAt, started)));
  if (rows.length)
    await db.batch([db.insert(exchangeQuotes).values(rows).onConflictDoNothing(), completed]);
  else await completed;
  return { status };
}
