import { and, eq, sql, type SQL } from "drizzle-orm";
import type { createDb } from "./repository.server";
import {
  newsArticles,
  savedNews,
  favoriteNewsSources,
  newsSyncState,
  weeklyNewsEditions,
} from "./schema";
import {
  newsSources,
  sourceIsEnabled,
  type NewsSource,
  type NewsSourceId,
} from "../data/news-sources";
import {
  newsQuerySchema,
  todayNewsWindow,
  selectOverviewNews,
  type NewsArticle,
  type NewsPage,
  type NewsQuery,
  type NewsSourceState,
  type NewsOverview,
} from "../domain/news";

export type NewsDb = ReturnType<typeof createDb>;
const inSources = (sources: readonly NewsSource[]): SQL =>
  sources.length
    ? sql`a.source IN (${sql.join(
        sources.map((source) => sql`${source.id}`),
        sql`,`,
      )})`
    : sql`0`;
async function newsStates(
  db: NewsDb,
  userId: string | null,
  sources = newsSources,
): Promise<NewsSourceState[]> {
  const [states, favorites] = await db.batch([
    db.select().from(newsSyncState),
    db
      .select()
      .from(favoriteNewsSources)
      .where(userId ? eq(favoriteNewsSources.userId, userId) : sql`0`),
  ]);
  return sources.map((source) => {
    const state = states.find((row) => row.source === source.id);
    const approved = sourceIsEnabled(source);
    return {
      id: source.id,
      name: source.name,
      sectionUrl: source.sectionUrl,
      publication: approved ? source.publication : "pending",
      lastAttemptAt: approved ? (state?.lastAttemptAt ?? null) : null,
      lastSuccessAt: approved ? (state?.lastSuccessAt ?? null) : null,
      status: approved ? ((state?.status as NewsSourceState["status"]) ?? "idle") : "pending",
      error: approved ? (state?.error ?? null) : null,
      favorite: favorites.some((row) => row.source === source.id),
    };
  });
}
const fields = sql.raw(
  `a.id,a.source,a.source_name AS sourceName,a.title,a.description,a.url,a.image_url AS imageUrl,a.category,a.language,a.published_at AS publishedAt,a.fetched_at AS fetchedAt`,
);
export async function readNewsPage(
  db: NewsDb,
  userId: string | null,
  q: NewsQuery,
  now = new Date(),
  sources = newsSources,
): Promise<NewsPage> {
  const active = sources
    .filter(sourceIsEnabled)
    .filter((source) => q.source === "all" || source.id === q.source);
  const window = todayNewsWindow(now);
  const weekly =
    q.period === "weekly" && q.saved === "no"
      ? (
          await db.all<{ period: string; publishedAt: string }>(
            sql`SELECT period,published_at AS publishedAt FROM weekly_news_editions WHERE published_at <= ${window.end} ORDER BY period DESC LIMIT 1`,
          )
        )[0]
      : undefined;
  const conditions = [
    inSources(active),
    sql`a.published_at <= ${window.end}`,
    sql`a.published_at >= ${new Date(now.getTime() - 15 * 86400000).toISOString()}`,
  ];
  if (q.saved === "yes")
    conditions.push(
      sql`EXISTS (SELECT 1 FROM saved_news s WHERE s.user_id = ${userId} AND s.article_id = a.id)`,
    );
  else if (q.period === "weekly")
    conditions.push(
      weekly
        ? sql`EXISTS (SELECT 1 FROM weekly_news_articles w WHERE w.period = ${weekly.period} AND w.article_id = a.id)`
        : sql`0`,
    );
  else conditions.push(sql`a.published_at >= ${window.start}`);
  if (q.category !== "all") conditions.push(sql`a.category = ${q.category}`);
  if (q.search)
    conditions.push(sql`a.title LIKE ${`%${q.search.replace(/[!%_]/g, "!$&")}%`} ESCAPE '!'`);
  const where = sql.join(conditions, sql` AND `);
  const limit = q.source === "all" ? 5 : q.limit;
  const page = q.source === "all" ? 1 : q.page;
  const offset = (page - 1) * limit;
  const [raw, totals] = await db.batch([
    db
      .select({
        id: sql<string>`id`,
        source: sql<NewsSourceId>`source`,
        sourceName: sql<string>`sourceName`,
        title: sql<string>`title`,
        description: sql<string | null>`description`,
        url: sql<string>`url`,
        imageUrl: sql<string | null>`imageUrl`,
        category: sql<NewsArticle["category"]>`category`,
        language: sql<string>`language`,
        publishedAt: sql<string>`publishedAt`,
        fetchedAt: sql<string>`fetchedAt`,
        saved: sql<number>`saved`,
        position: sql<number>`position`,
      })
      .from(
        sql`(SELECT ${fields},CASE WHEN EXISTS (SELECT 1 FROM saved_news s WHERE s.user_id = ${userId} AND s.article_id = a.id) THEN 1 ELSE 0 END AS saved,ROW_NUMBER() OVER (PARTITION BY a.source ORDER BY a.published_at DESC,a.id ASC) AS position FROM news_articles a WHERE ${where}) ranked`,
      )
      .where(sql`position > ${offset} AND position <= ${offset + limit}`)
      .orderBy(sql`source`, sql`position`),
    db
      .select({ source: sql<NewsSourceId>`a.source`, total: sql<number>`count(*)` })
      .from(sql`news_articles a`)
      .where(where)
      .groupBy(sql`a.source`),
  ]);
  return {
    query: q,
    asOf: now.toISOString(),
    sources: await newsStates(db, userId, sources),
    weeklyPeriod: weekly?.period ?? null,
    weeklyPublishedAt: weekly?.publishedAt ?? null,
    groups: sources
      .filter((source) => q.source === "all" || source.id === q.source)
      .map((source) => ({
        source: source.id,
        total: Number(totals.find((row) => row.source === source.id)?.total ?? 0),
        articles: raw
          .filter((row) => row.source === source.id)
          .map(({ position: _position, saved, ...row }) => ({
            ...row,
            saved: Boolean(saved),
            description: source.descriptionAllowed ? row.description : null,
            imageUrl: source.imageAllowed ? row.imageUrl : null,
          })),
      })),
  };
}
export async function readNewsOverview(
  db: NewsDb,
  userId: string | null,
  now = new Date(),
  sources = newsSources,
): Promise<NewsOverview> {
  const daily = await readNewsPage(
    db,
    userId,
    newsQuerySchema.parse({ period: "daily" }),
    now,
    sources,
  );
  const weekly = await readNewsPage(
    db,
    userId,
    newsQuerySchema.parse({ period: "weekly" }),
    now,
    sources,
  );
  const order = sources.map((source) => source.id);
  const favoriteSources = daily.sources
    .filter((source) => source.favorite)
    .map((source) => source.id);
  return {
    asOf: now.toISOString(),
    sources: daily.sources,
    daily: selectOverviewNews(
      daily.groups.flatMap((group) => group.articles),
      order,
      favoriteSources,
    ),
    weekly: selectOverviewNews(
      weekly.groups.flatMap((group) => group.articles),
      order,
      favoriteSources,
    ),
    weeklyPeriod: weekly.weeklyPeriod,
    weeklyPublishedAt: weekly.weeklyPublishedAt,
  };
}
export async function setSourceFavorite(
  db: NewsDb,
  userId: string,
  sourceId: NewsSourceId,
  saved: boolean,
  now = new Date(),
) {
  if (saved)
    await db
      .insert(favoriteNewsSources)
      .values({ userId, source: sourceId, createdAt: now.toISOString() })
      .onConflictDoNothing();
  else
    await db
      .delete(favoriteNewsSources)
      .where(and(eq(favoriteNewsSources.userId, userId), eq(favoriteNewsSources.source, sourceId)));
}
export async function setArticleSaved(
  db: NewsDb,
  userId: string,
  articleId: string,
  saved: boolean,
  now = new Date(),
  sources = newsSources,
) {
  if (!saved) {
    await db
      .delete(savedNews)
      .where(and(eq(savedNews.userId, userId), eq(savedNews.articleId, articleId)));
    return true;
  }
  const active = sources.filter(sourceIsEnabled);
  // INSERT SELECT comprueba disponibilidad y fecha en la misma escritura que guarda.
  const rows = await db.all(
    sql`INSERT INTO saved_news(user_id,article_id,saved_at) SELECT ${userId},a.id,${now.toISOString()} FROM news_articles a WHERE a.id = ${articleId} AND ${inSources(active)} AND a.published_at <= ${now.toISOString()} AND a.published_at >= ${new Date(now.getTime() - 15 * 86400000).toISOString()} ON CONFLICT(user_id,article_id) DO UPDATE SET saved_at = saved_news.saved_at RETURNING article_id`,
  );
  return rows.length > 0;
}
export async function cleanupNews(db: NewsDb, now = new Date()) {
  const cutoff = new Date(now.getTime() - 15 * 86400000).toISOString();
  // Las FK eliminan también los guardados y la pertenencia semanal de la noticia.
  await db.batch([
    db.delete(newsArticles).where(sql`${newsArticles.publishedAt} < ${cutoff}`),
    db.delete(weeklyNewsEditions).where(sql`${weeklyNewsEditions.toAt} < ${cutoff}`),
  ]);
}
