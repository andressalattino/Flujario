import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { RouterContextProvider } from "react-router";
import { testD1 } from "./helpers/d1";
import { createDb } from "../app/db/repository.server";
import { readNewsPage, setArticleSaved, setSourceFavorite } from "../app/db/news.server";
import { newsQuerySchema } from "../app/domain/news";
import { newsSources, newsSourcesForEnvironment, sourceIsEnabled } from "../app/data/news-sources";
import { syncNews } from "../app/services/news-sync.server";
import { cloudflareContext } from "../app/context";
import { loader as previewLoader } from "../app/routes/preview";
import { localCatalogPlugin, localNewsPlugin } from "../tools/local-schedules-plugin";
import { productExample } from "../app/data/product-example";

let store: ReturnType<typeof testD1>;
const now = new Date("2026-11-18T18:00:00Z");
beforeEach(() => {
  store = testD1();
});
afterEach(() => {
  store.sqlite.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const local = newsSourcesForEnvironment(true);
const xml = `<rss><channel><item><title>Noticia económica ficticia de prueba local</title><link>https://www.iprofesional.com/economia/prueba-local</link><pubDate>Wed, 18 Nov 2026 15:00:00 GMT</pubDate><description>Texto que no debe copiarse</description><enclosure url="https://resizer.iproimg.com/foto.jpg" type="image/jpeg" /></item></channel></rss>`;
async function seed() {
  const db = createDb(store.binding);
  await syncNews(
    db,
    now,
    async () => new Response(xml, { headers: { "Content-Type": "application/xml" } }),
    [local[0]!],
  );
  return db;
}
it("habilita cinco lectores locales sin declarar permisos de republicación ni mutar el catálogo", () => {
  expect(local.filter(sourceIsEnabled).map((s) => s.id)).toEqual([
    "iprofesional",
    "eleconomista",
    "pagina12",
    "infobae",
    "bloomberg",
  ]);
  expect(local.find((s) => s.id === "mdz")?.publication).toBe("pending");
  expect(local.every((s) => !s.descriptionAllowed && s.permissionReference === null)).toBe(true);
  expect(newsSourcesForEnvironment(false)).toBe(newsSources);
  expect(newsSources.every((s) => !sourceIsEnabled(s))).toBe(true);
  expect(local.filter((s) => s.imageAllowed).map((s) => s.id)).toEqual([
    "iprofesional",
    "pagina12",
    "infobae",
  ]);
  expect(newsSources.every((s) => !s.imageAllowed)).toBe(true);
});
it("el lector guarda la URL de imagen permitida sin copiar la bajada ni descargar la foto", async () => {
  await seed();
  expect(store.sqlite.prepare("SELECT description,image_url FROM news_articles").get()).toEqual({
    description: null,
    image_url: "https://resizer.iproimg.com/foto.jpg",
  });
});
it("la vista sin dueño no devuelve guardados ni preferencias de otra cuenta", async () => {
  const db = await seed();
  const page = await readNewsPage(db, "ana", newsQuerySchema.parse({}), now, local);
  await setArticleSaved(db, "ana", page.groups[0]!.articles[0]!.id, true, now, local);
  await setSourceFavorite(db, "ana", "iprofesional", true, now);
  const anonymous = await readNewsPage(db, null, newsQuerySchema.parse({}), now, local);
  expect(anonymous.groups[0]?.articles[0]?.saved).toBe(false);
  expect(anonymous.sources.every((s) => !s.favorite)).toBe(true);
  const saved = await readNewsPage(db, null, newsQuerySchema.parse({ saved: "yes" }), now, local);
  expect(saved.groups.every((g) => g.total === 0)).toBe(true);
});
it("el caché local no se publica con la configuración de producción", async () => {
  const db = await seed();
  const page = await readNewsPage(
    db,
    "ana",
    newsQuerySchema.parse({}),
    now,
    newsSourcesForEnvironment(false),
  );
  expect(page.groups.every((g) => g.total === 0)).toBe(true);
});
function previewArgs() {
  const context = new RouterContextProvider();
  context.set(cloudflareContext, { env: { DB: store.binding }, ctx: {} as ExecutionContext });
  return {
    params: { section: "noticias" },
    request: new Request("http://localhost/vista-previa/noticias"),
    context,
  };
}
it("la vista previa carga el caché real sin consultar RSS ni leer movimientos privados", async () => {
  await seed();
  vi.stubEnv("DEV", true);
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const result = await previewLoader(previewArgs() as never);
  expect(result.newsExample).toBe(false);
  expect(result.snapshot.newsPage?.groups[0]?.total).toBe(1);
  expect(result.snapshot.accounts).toEqual(productExample.accounts);
  expect(result.snapshot.entries).toEqual(productExample.entries);
  expect(fetcher).not.toHaveBeenCalled();
});
it("producción rechaza la vista previa antes de acceder a la base", async () => {
  vi.stubEnv("DEV", false);
  await expect(
    previewLoader({ params: {}, request: new Request("http://localhost/vista-previa") } as never),
  ).rejects.toMatchObject({ status: 404 });
});
it("el reloj local ejecuta el scheduled al iniciar y cada 30 minutos; se detiene al cerrar", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(async () => Response.json({ success: true, result: { outcome: "ok" } }));
  vi.stubGlobal("fetch", fetcher);
  const httpServer = Object.assign(new EventEmitter(), { address: () => ({ port: 5173 }) });
  const plugin = localNewsPlugin();
  (plugin.configureServer as (server: unknown) => void)({
    httpServer,
    config: { logger: { info: vi.fn(), warn: vi.fn() } },
  });
  httpServer.emit("listening");
  await vi.advanceTimersByTimeAsync(1500);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]).toMatchObject([
    expect.stringContaining("127.0.0.1:5173/cdn-cgi/local/"),
    { method: "POST", body: JSON.stringify({ cron: "*/30 * * * *" }) },
  ]);
  await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  httpServer.emit("close");
  await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it.each([
  {
    name: "noticias",
    plugin: localNewsPlugin,
    cron: "*/30 * * * *",
    startAfter: 1500,
    retryAfter: 60000,
  },
  {
    name: "catálogo",
    plugin: localCatalogPlugin,
    cron: "0 14 * * *",
    startAfter: 2500,
    retryAfter: 86400000,
  },
])(
  "un fallo de $name conserva su intervalo de reintento",
  async ({ plugin, cron, startAfter, retryAfter }) => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () =>
      Response.json({ success: true, result: { outcome: "exception" } }),
    );
    vi.stubGlobal("fetch", fetcher);
    const httpServer = Object.assign(new EventEmitter(), { address: () => ({ port: 5173 }) });
    const info = vi.fn(),
      warn = vi.fn();
    (plugin().configureServer as (server: unknown) => void)({
      httpServer,
      config: { logger: { info, warn } },
    });
    httpServer.emit("listening");
    await vi.advanceTimersByTimeAsync(startAfter);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]).toMatchObject([
      expect.stringContaining("127.0.0.1:5173/cdn-cgi/local/"),
      { method: "POST", body: JSON.stringify({ cron }) },
    ]);
    expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(retryAfter - 1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    httpServer.emit("close");
  },
);
