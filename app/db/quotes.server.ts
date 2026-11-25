import { and, desc, eq, sql } from "drizzle-orm";
import type { createDb } from "./repository.server";
import { exchangeQuotes, quoteCacheState } from "./schema";
import { emptyQuoteState, quoteSeries, type QuoteSeries, type QuoteState } from "../domain/quotes";
type Db = ReturnType<typeof createDb>;
export function latestQuoteQuery(db: Db) {
  return db
    .select()
    .from(exchangeQuotes)
    .where(
      sql`NOT EXISTS (
    SELECT 1 FROM exchange_quotes newer WHERE newer.series = ${exchangeQuotes.series}
    AND (newer.source_as_of > ${exchangeQuotes.sourceAsOf}
      OR (newer.source_as_of = ${exchangeQuotes.sourceAsOf} AND newer.fetched_at > ${exchangeQuotes.fetchedAt})
      OR (newer.source_as_of = ${exchangeQuotes.sourceAsOf} AND newer.fetched_at = ${exchangeQuotes.fetchedAt} AND newer.id > ${exchangeQuotes.id}))
  )`,
    )
    .orderBy(exchangeQuotes.series);
}
export const quoteStateQuery = (db: Db) =>
  db.select().from(quoteCacheState).where(eq(quoteCacheState.id, "dolarapi"));

// AR usa UTC−3 para estas referencias. El corte es el comienzo de la fecha
// argentina de la última fuente, no el de su descarga ni un supuesto cierre.
export function previousQuoteQuery(db: Db, series: QuoteSeries) {
  return db
    .select()
    .from(exchangeQuotes)
    .where(
      and(
        eq(exchangeQuotes.series, series),
        sql`${exchangeQuotes.sourceAsOf} < (
    SELECT strftime('%Y-%m-%dT03:00:00.000Z', datetime(latest.source_as_of, '-3 hours'))
    FROM exchange_quotes latest WHERE latest.series = ${series}
    ORDER BY latest.source_as_of DESC, latest.fetched_at DESC, latest.id DESC LIMIT 1
  )`,
      ),
    )
    .orderBy(
      desc(exchangeQuotes.sourceAsOf),
      desc(exchangeQuotes.fetchedAt),
      desc(exchangeQuotes.id),
    )
    .limit(1);
}
export function readQuoteState(row?: typeof quoteCacheState.$inferSelect): QuoteState {
  return row
    ? { status: row.status, lastAttemptAt: row.lastAttemptAt, nextAttemptAt: row.nextAttemptAt }
    : { ...emptyQuoteState };
}
export async function getQuoteSnapshot(db: Db) {
  const [quotes, state, ...previous] = await db.batch([
    latestQuoteQuery(db),
    quoteStateQuery(db),
    ...quoteSeries.map((series) => previousQuoteQuery(db, series)),
  ]);
  return { quotes, quoteState: readQuoteState(state[0]), previousQuotes: previous.flat() };
}
