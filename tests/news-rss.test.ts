import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { testD1 } from "./helpers/d1";
import { createDb } from "../app/db/repository.server";
import { newsSources, type NewsSource } from "../app/data/news-sources";
import { syncNews, publishWeeklyNews } from "../app/services/news-sync.server";
import {
  cleanupNews,
  readNewsOverview,
  readNewsPage,
  setArticleSaved,
  setSourceFavorite,
} from "../app/db/news.server";
import { newsQuerySchema, todayNewsWindow } from "../app/domain/news";
const now = new Date("2026-11-18T18:00:00Z");
const approved: NewsSource[] = newsSources.map((source) => ({
  ...source,
  publication: "approved",
  permissionReference: "Permiso ficticio para pruebas",
}));
let store: ReturnType<typeof testD1>;
beforeEach(() => {
  store = testD1();
});
afterEach(() => {
  store.sqlite.close();
});
const feed = (source: NewsSource, count = 7, stamp = "Wed, 18 Nov 2026 15:00:00 GMT") =>
  `<rss><channel>${Array.from({ length: count }, (_, i) => `<item><title>Noticia económica ficticia ${i}</title><link>https://${source.articleHosts[0]}/economia/prueba-${i}</link><pubDate>${stamp}</pubDate></item>`).join("")}</channel></rss>`;
const fetchFeed = (source: NewsSource, count = 7, stamp?: string) =>
  vi.fn(
    async () =>
      new Response(feed(source, count, stamp), { headers: { "Content-Type": "application/xml" } }),
  ) as typeof fetch;
const q = (values = {}) => newsQuerySchema.parse(values);
it("las fuentes pendientes no se consultan ni publican", async () => {
  const fetcher = vi.fn();
  expect(
    (await syncNews(createDb(store.binding), now, fetcher, newsSources)).every(
      (row) => row.status === "pending",
    ),
  ).toBe(true);
  expect(fetcher).not.toHaveBeenCalled();
});
it("guarda sin duplicar, limita cinco por medio y pagina el resto", async () => {
  const db = createDb(store.binding),
    source = approved[0]!;
  await syncNews(db, now, fetchFeed(source), [source]);
  const page = await readNewsPage(db, "uno", q(), now, [source]);
  expect(page.groups[0]?.total).toBe(7);
  expect(page.groups[0]?.articles).toHaveLength(5);
  const second = await readNewsPage(db, "uno", q({ source: source.id, page: 2, limit: 5 }), now, [
    source,
  ]);
  expect(second.groups[0]?.articles).toHaveLength(2);
  const fetcher = fetchFeed(source);
  await syncNews(db, new Date(now.getTime() + 1000), fetcher, [source]);
  expect(fetcher).not.toHaveBeenCalled();
  await syncNews(db, new Date(now.getTime() + 1800000), fetchFeed(source), [source]);
  expect(store.sqlite.prepare("SELECT count(*) AS n FROM news_articles").get()?.n).toBe(7);
  expect(
    store.sqlite.prepare("SELECT fetched_at FROM news_articles LIMIT 1").get()?.fetched_at,
  ).toBe(now.toISOString());
});
it("los errores de un diario no bloquean al resto y conservan lo anterior", async () => {
  const db = createDb(store.binding),
    one = approved[0]!,
    two = approved[1]!;
  await syncNews(db, now, fetchFeed(one), [one]);
  const fetcher = vi.fn(async (url: RequestInfo | URL) =>
    String(url).includes("iprofesional")
      ? new Response("blocked", { status: 403 })
      : new Response(feed(two, 2), { headers: { "Content-Type": "text/xml" } }),
  );
  const result = await syncNews(db, new Date(now.getTime() + 1800000), fetcher, [one, two]);
  expect(result.map((row) => row.status)).toEqual(["error", "ok"]);
  expect(
    (await readNewsPage(db, "uno", q(), now, [one, two])).groups.map((row) => row.total),
  ).toEqual([7, 2]);
});
it("no intenta una alternativa de Bloomberg después de una restricción 403", async () => {
  const fetcher = vi.fn(async () => new Response("blocked", { status: 403 }));
  await syncNews(createDb(store.binding), now, fetcher, [approved[4]!]);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("tiene una única consulta por fuente ante ejecuciones simultáneas", async () => {
  const source = approved[0]!,
    db = createDb(store.binding),
    fetcher = fetchFeed(source);
  await Promise.all([syncNews(db, now, fetcher, [source]), syncNews(db, now, fetcher, [source])]);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("buscar, categoría y fuente no amplían resultados; escapa comodines", async () => {
  const db = createDb(store.binding),
    source = approved[0]!;
  await syncNews(db, now, fetchFeed(source), [source]);
  expect(
    (await readNewsPage(db, "uno", q({ search: "ficticia 3" }), now, [source])).groups[0]?.total,
  ).toBe(1);
  expect((await readNewsPage(db, "uno", q({ search: "%" }), now, [source])).groups[0]?.total).toBe(
    0,
  );
  expect(
    (await readNewsPage(db, "uno", q({ category: "dolar" }), now, [source])).groups[0]?.total,
  ).toBe(0);
  expect(newsQuerySchema.safeParse({ page: "-1" }).success).toBe(false);
  expect(newsQuerySchema.safeParse({ limit: "9999" }).success).toBe(false);
  expect(newsQuerySchema.safeParse({ source: "evil" }).success).toBe(false);
});
it("separa guardados privados y diarios favoritos; un guardado no altera Resumen", async () => {
  const db = createDb(store.binding),
    source = approved[0]!;
  await syncNews(db, now, fetchFeed(source), [source]);
  const initial = await readNewsOverview(db, "uno", now, [source]);
  const id = (await readNewsPage(db, "uno", q({ source: source.id, limit: 20 }), now, [source]))
    .groups[0]!.articles[6]!.id;
  await setArticleSaved(db, "uno", id, true, now, [source]);
  await setArticleSaved(db, "uno", id, true, now, [source]);
  expect((await readNewsPage(db, "uno", q({ saved: "yes" }), now, [source])).groups[0]?.total).toBe(
    1,
  );
  expect((await readNewsPage(db, "dos", q({ saved: "yes" }), now, [source])).groups[0]?.total).toBe(
    0,
  );
  await setArticleSaved(db, "dos", id, false, now, [source]);
  expect((await readNewsOverview(db, "uno", now, [source])).daily.map((a) => a.id)).toEqual(
    initial.daily.map((a) => a.id),
  );
  await setSourceFavorite(db, "uno", source.id, true, now);
  expect((await readNewsOverview(db, "uno", now, [source])).sources[0]?.favorite).toBe(true);
  expect((await readNewsOverview(db, "dos", now, [source])).sources[0]?.favorite).toBe(false);
});
it("limpia a los 15 días también los guardados y respeta el límite exacto", async () => {
  const db = createDb(store.binding),
    source = approved[0]!;
  await syncNews(db, now, fetchFeed(source, 1), [source]);
  const id = (await readNewsPage(db, "uno", q(), now, [source])).groups[0]!.articles[0]!.id;
  await setArticleSaved(db, "uno", id, true, now, [source]);
  const published = new Date("2026-11-18T15:00:00Z");
  await cleanupNews(db, new Date(published.getTime() + 15 * 86400000));
  expect(store.sqlite.prepare("SELECT count(*) AS n FROM news_articles").get()?.n).toBe(1);
  await cleanupNews(db, new Date(published.getTime() + 15 * 86400000 + 1));
  expect(store.sqlite.prepare("SELECT count(*) AS n FROM saved_news").get()?.n).toBe(0);
});
it("publica una semana fija el lunes a las 10 y no la reescribe durante la semana", async () => {
  const db = createDb(store.binding),
    source = approved[0]!,
    monday = new Date("2026-11-16T13:00:00Z");
  await syncNews(db, monday, fetchFeed(source, 2, "Sun, 15 Nov 2026 15:00:00 GMT"), [source]);
  await publishWeeklyNews(db, monday, [source]);
  const first = await readNewsPage(db, "uno", q({ period: "weekly" }), monday, [source]);
  expect(first.groups[0]?.total).toBe(2);
  expect(first.weeklyPeriod).toBe("2026-11-16");
  store.sqlite
    .prepare(
      "DELETE FROM weekly_news_articles WHERE article_id=(SELECT min(id) FROM news_articles)",
    )
    .run();
  await publishWeeklyNews(db, now, [source]);
  expect(
    (await readNewsPage(db, "uno", q({ period: "weekly" }), now, [source])).groups[0]?.total,
  ).toBe(1);
});
it("Hoy usa medianoche argentina, y los diarios favoritos van primero sin duplicar", async () => {
  expect(todayNewsWindow(new Date("2026-12-01T02:59:59Z")).start).toBe("2026-11-30T03:00:00.000Z");
  const db = createDb(store.binding),
    sources = approved.slice(0, 2);
  for (const source of sources) await syncNews(db, now, fetchFeed(source, 1), [source]);
  await setSourceFavorite(db, "uno", "eleconomista", true, now);
  const result = await readNewsOverview(db, "uno", now, sources);
  expect(result.daily.map((row) => row.source)).toEqual(["eleconomista", "iprofesional"]);
});
it("revocar permiso oculta datos guardados y rechaza nuevos guardados", async () => {
  const db = createDb(store.binding),
    source = approved[0]!;
  await syncNews(db, now, fetchFeed(source, 1), [source]);
  const id = (await readNewsPage(db, "uno", q(), now, [source])).groups[0]!.articles[0]!.id;
  expect((await readNewsPage(db, "uno", q(), now, [newsSources[0]!])).groups[0]?.total).toBe(0);
  expect(await setArticleSaved(db, "uno", id, true, now, [newsSources[0]!])).toBe(false);
});
it("no sigue redirecciones arbitrarias ni acepta HTML como RSS", async () => {
  const db = createDb(store.binding),
    source = approved[0]!;
  const redirect = vi.fn(
    async () =>
      new Response(null, { status: 302, headers: { Location: "https://evil.example/rss" } }),
  );
  expect((await syncNews(db, now, redirect, [source]))[0]?.status).toBe("error");
  expect(redirect).toHaveBeenCalledTimes(1);
  const html = vi.fn(
    async () => new Response("<html>error</html>", { headers: { "Content-Type": "text/html" } }),
  );
  expect((await syncNews(db, new Date(now.getTime() + 1800000), html, [source]))[0]?.status).toBe(
    "error",
  );
});
it("el fallback de Bloomberg permite sólo la redirección oficial y filtra economía", async () => {
  const source = approved[4]!;
  const fetcher = vi.fn(async (url: RequestInfo | URL) =>
    String(url).includes("economics")
      ? new Response(null, { status: 502 })
      : String(url).startsWith("https://feeds.")
        ? new Response(null, {
            status: 302,
            headers: { Location: "https://www.bloomberg.com/feeds/news.rss" },
          })
        : new Response(
            feed(source, 1).replace("<pubDate>", "<category>Economics</category><pubDate>"),
            { headers: { "Content-Type": "application/xml" } },
          ),
  );
  const result = await syncNews(createDb(store.binding), now, fetcher, [source]);
  expect(result[0]?.status).toBe("ok");
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it("un worker antiguo no pisa los metadatos que guardó una ejecución posterior", async () => {
  const db = createDb(store.binding),
    source = approved[0]!;
  let release!: (value: Response) => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const slow = vi.fn(() => {
    entered();
    return new Promise<Response>((resolve) => {
      release = resolve;
    });
  });
  const previous = syncNews(db, now, slow, [source]);
  await started;
  const newer = vi.fn(
    async () =>
      new Response(
        feed(source, 1).replace("Noticia económica ficticia 0", "Metadatos nuevos y confirmados"),
        { headers: { "Content-Type": "application/xml" } },
      ),
  );
  await syncNews(db, new Date(now.getTime() + 31 * 60000), newer, [source]);
  release(new Response(feed(source, 1), { headers: { "Content-Type": "application/xml" } }));
  await previous;
  expect(store.sqlite.prepare("SELECT title FROM news_articles").get()?.title).toBe(
    "Metadatos nuevos y confirmados",
  );
});
