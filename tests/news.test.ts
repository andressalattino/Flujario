import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { testD1 } from "./helpers/d1";
import { editionPeriod, refreshNews } from "../app/services/news.server";
import type { Env } from "../app/env";
let store: ReturnType<typeof testD1>;
beforeEach(() => {
  store = testD1();
});
afterEach(() => {
  store.sqlite.close();
  vi.unstubAllGlobals();
});
it("no inventa noticias si falta proveedor", async () =>
  expect(await refreshNews({ DB: store.binding }, "daily")).toMatchObject({
    status: "not_configured",
  }));
it("calcula el lunes de la edición en Argentina", () => {
  expect(editionPeriod("weekly", new Date("2026-11-16T01:00:00Z"))).toBe("2026-11-09");
  expect(editionPeriod("weekly", new Date("2026-11-16T13:00:00Z"))).toBe("2026-11-16");
});
it("conserva la última edición si falla la nueva", async () => {
  const env: Env = { DB: store.binding, NEWS_FEED_URL: "https://example.com/editorial" };
  const article = {
    id: "1",
    title: "Artículo de prueba",
    summary: "Contexto de prueba",
    source: "Fuente de prueba",
    url: "https://example.com/1",
    publishedAt: "2026-11-13T12:00:00Z",
  };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ articles: [article] })));
  await refreshNews(env, "daily", new Date("2026-11-13T13:00:00Z"));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Error", { status: 502 })));
  await expect(refreshNews(env, "daily", new Date("2026-11-14T13:00:00Z"))).rejects.toThrow();
  expect(store.sqlite.prepare("SELECT count(*) AS count FROM news_editions").get()?.count).toBe(1);
});
