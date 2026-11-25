import { and, eq, inArray, sql } from "drizzle-orm";
import { newsSources, sourceIsEnabled, type NewsSource } from "../data/news-sources";
import { newsArticles, newsSyncState, weeklyNewsArticles, weeklyNewsEditions } from "../db/schema";
import { cleanupNews, type NewsDb } from "../db/news.server";
import { today } from "../domain/dates";
import { parseNewsFeed } from "./rss.server";

export const NEWS_INTERVAL_MS = 30 * 60 * 1000;
export const NEWS_LEASE_MS = 2 * 60 * 1000;
async function limitedXml(response: Response, signal: AbortSignal) {
  if (!response.body) throw new Error("Respuesta vacía.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2097152) throw new Error("El RSS supera el límite de tamaño.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const declared =
    /encoding\s*=\s*["']([^"']+)/i.exec(new TextDecoder().decode(joined.slice(0, 200)))?.[1] ??
    "utf-8";
  if (!["utf-8", "utf8", "iso-8859-1", "windows-1252"].includes(declared.toLowerCase()))
    throw new Error("Codificación XML no admitida.");
  return new TextDecoder(declared, { fatal: true }).decode(joined);
}
async function requestFeed(url: string, fetcher: typeof fetch) {
  const signal = AbortSignal.timeout(12000);
  let target = url;
  for (let step = 0; step <= 2; step++) {
    const response = await fetcher(target, {
      signal,
      redirect: "manual",
      headers: {
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
        "User-Agent": "Flujario-RSS/1.0",
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("Location");
      await response.body?.cancel();
      // Única redirección observada y validada; no se visitan destinos arbitrarios.
      if (
        target === "https://feeds.bloomberg.com/news.rss" &&
        location &&
        new URL(location, target).href === "https://www.bloomberg.com/feeds/news.rss"
      ) {
        target = "https://www.bloomberg.com/feeds/news.rss";
        continue;
      }
      throw new Error("Redirección RSS no autorizada.");
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`RSS respondió HTTP ${response.status}.`);
    }
    const type = response.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase();
    if (
      !type ||
      !["application/rss+xml", "application/atom+xml", "application/xml", "text/xml"].includes(type)
    ) {
      await response.body?.cancel();
      throw new Error("La respuesta no tiene tipo XML.");
    }
    return limitedXml(response, signal);
  }
  throw new Error("Demasiadas redirecciones RSS.");
}
async function articleHash(source: string, url: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${source}\n${url}`));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function syncSource(db: NewsDb, source: NewsSource, now: Date, fetcher: typeof fetch) {
  if (!sourceIsEnabled(source)) return { source: source.id, status: "pending" as const };
  const started = now.toISOString();
  const token = crypto.randomUUID();
  const claimed = await db
    .insert(newsSyncState)
    .values({
      source: source.id,
      leaseToken: token,
      leaseUntil: new Date(now.getTime() + NEWS_LEASE_MS).toISOString(),
      lastAttemptAt: started,
      nextAttemptAt: new Date(now.getTime() + NEWS_INTERVAL_MS).toISOString(),
      status: "refreshing",
      error: null,
    })
    .onConflictDoUpdate({
      target: newsSyncState.source,
      set: {
        leaseToken: token,
        leaseUntil: new Date(now.getTime() + NEWS_LEASE_MS).toISOString(),
        lastAttemptAt: started,
        nextAttemptAt: new Date(now.getTime() + NEWS_INTERVAL_MS).toISOString(),
        status: "refreshing",
        error: null,
      },
      setWhere: sql`${newsSyncState.nextAttemptAt} <= ${started} AND (${newsSyncState.leaseUntil} IS NULL OR ${newsSyncState.leaseUntil} <= ${started})`,
    })
    .returning({ source: newsSyncState.source });
  if (!claimed.length) return { source: source.id, status: "cached" as const };
  try {
    let rows: ReturnType<typeof parseNewsFeed> | undefined;
    for (let index = 0; index < source.feedUrls.length; index++) {
      try {
        rows = parseNewsFeed(
          await requestFeed(source.feedUrls[index]!, fetcher),
          source,
          now,
          index > 0,
        );
        break;
      } catch (error) {
        // Un 401/403 es una restricción: se detiene, sin probar otra vía para eludirla.
        if (error instanceof Error && /HTTP (401|403)/.test(error.message)) throw error;
        if (index === source.feedUrls.length - 1) throw error;
      }
    }
    if (!rows) throw new Error("No hay RSS configurado.");
    const cutoff = new Date(now.getTime() - 15 * 86400000).toISOString();
    const values = await Promise.all(
      rows
        .filter((item) => item.publishedAt >= cutoff)
        .map(async (row) => ({
          ...row,
          id: await articleHash(row.source, row.url),
          createdAt: started,
        })),
    );
    // json_each usa un parámetro, evitando exceder el límite de variables SQL por noticia.
    const incoming = JSON.stringify(values);
    const insert = db
      .insert(newsArticles)
      .select(
        db
          .select({
            id: sql<string>`json_extract(j.value,'$.id')`,
            source: sql<string>`json_extract(j.value,'$.source')`,
            sourceName: sql<string>`json_extract(j.value,'$.sourceName')`,
            externalId: sql<string | null>`json_extract(j.value,'$.externalId')`,
            title: sql<string>`json_extract(j.value,'$.title')`,
            description: sql<string | null>`json_extract(j.value,'$.description')`,
            url: sql<string>`json_extract(j.value,'$.url')`,
            imageUrl: sql<string | null>`json_extract(j.value,'$.imageUrl')`,
            category: sql<string>`json_extract(j.value,'$.category')`,
            language: sql<string>`json_extract(j.value,'$.language')`,
            publishedAt: sql<string>`json_extract(j.value,'$.publishedAt')`,
            fetchedAt: sql<string>`json_extract(j.value,'$.fetchedAt')`,
            createdAt: sql<string>`json_extract(j.value,'$.createdAt')`,
          })
          .from(sql`json_each(${incoming}) j`)
          .where(
            sql`EXISTS (SELECT 1 FROM news_sync_state s WHERE s.source = ${source.id} AND s.lease_token = ${token})`,
          )
          .getSQL(),
      )
      .onConflictDoUpdate({
        target: newsArticles.url,
        set: {
          title: sql`excluded.title`,
          description: sql`excluded.description`,
          imageUrl: sql`excluded.image_url`,
          category: sql`excluded.category`,
          language: sql`excluded.language`,
          publishedAt: sql`excluded.published_at`,
          fetchedAt: sql`excluded.fetched_at`,
          externalId: sql`excluded.external_id`,
        },
        setWhere: sql`${newsArticles.title} != excluded.title OR ${newsArticles.description} IS NOT excluded.description OR ${newsArticles.imageUrl} IS NOT excluded.image_url OR ${newsArticles.category} != excluded.category OR ${newsArticles.publishedAt} != excluded.published_at OR ${newsArticles.language} != excluded.language OR ${newsArticles.externalId} IS NOT excluded.external_id`,
      });
    const complete = db
      .update(newsSyncState)
      .set({ status: "ok", lastSuccessAt: started, leaseUntil: null, error: null })
      .where(and(eq(newsSyncState.source, source.id), eq(newsSyncState.leaseToken, token)));
    await db.batch([insert, complete]);
    return { source: source.id, status: "ok" as const, accepted: rows.length };
  } catch (error) {
    const message =
      error instanceof Error &&
      /^(RSS respondió HTTP \d{3}\.|XML |La respuesta|Redirección|El RSS|Codificación|No hay)/.test(
        error.message,
      )
        ? error.message
        : "No se pudo actualizar esta fuente.";
    await db
      .update(newsSyncState)
      .set({ status: "error", leaseUntil: null, error: message })
      .where(and(eq(newsSyncState.source, source.id), eq(newsSyncState.leaseToken, token)));
    return { source: source.id, status: "error" as const };
  }
}
export async function syncNews(
  db: NewsDb,
  now = new Date(),
  fetcher: typeof fetch = fetch,
  sources = newsSources,
) {
  const results = await Promise.allSettled(
    sources.map((source) => syncSource(db, source, now, fetcher)),
  );
  await cleanupNews(db, now);
  return results.map((result, index) =>
    result.status === "fulfilled"
      ? result.value
      : { source: sources[index]!.id, status: "error" as const },
  );
}
export async function publishWeeklyNews(db: NewsDb, now = new Date(), sources = newsSources) {
  const localDate = today(now);
  const monday = new Date(`${localDate}T13:00:00.000Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  if (monday > now) monday.setUTCDate(monday.getUTCDate() - 7);
  const period = monday.toISOString().slice(0, 10);
  const from = new Date(monday.getTime() - 7 * 86400000).toISOString();
  const to = monday.toISOString();
  const ids = sources.filter(sourceIsEnabled).map((source) => source.id);
  if (!ids.length) return { status: "pending" as const, period };
  const range = and(
    inArray(newsArticles.source, ids),
    sql`${newsArticles.publishedAt} >= ${from} AND ${newsArticles.publishedAt} < ${to}`,
  );
  const available = await db
    .select({ id: newsArticles.id })
    .from(newsArticles)
    .where(range)
    .limit(1);
  if (!available.length) return { status: "empty" as const, period };
  const token = crypto.randomUUID();
  await db.batch([
    db
      .insert(weeklyNewsEditions)
      .values({
        period,
        publicationToken: token,
        publishedAt: now.toISOString(),
        fromAt: from,
        toAt: to,
      })
      .onConflictDoNothing(),
    db
      .insert(weeklyNewsArticles)
      .select(
        db
          .select({ period: sql`${period}`, articleId: newsArticles.id })
          .from(newsArticles)
          .where(
            and(
              range,
              sql`EXISTS (SELECT 1 FROM weekly_news_editions e WHERE e.period = ${period} AND e.publication_token = ${token})`,
            ),
          )
          .getSQL(),
      )
      .onConflictDoNothing(),
  ]);
  return { status: "published" as const, period };
}
