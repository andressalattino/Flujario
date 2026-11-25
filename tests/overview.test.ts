import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { it, expect } from "vitest";
import { quoteChange } from "../app/domain/quote-change";
import type { ExchangeQuote } from "../app/domain/quotes";
import { testD1 } from "./helpers/d1";
import { createDb } from "../app/db/repository.server";
import { getQuoteSnapshot } from "../app/db/quotes.server";
import { BalanceFocus } from "../app/components/workspace/balance-focus";
import { PendingOverview, RecentOverview } from "../app/components/workspace/overview-lists";
import { marketSelection } from "../app/components/workspace/market-brief";
import { ArticleCarousel, NewsCarousel } from "../app/components/workspace/news-carousel";
import { exampleNews } from "../app/data/news-example";
import { newsQueryFromUrl, newsQuerySchema } from "../app/domain/news";
import { productExample } from "../app/data/product-example";
import { summarize } from "../app/domain/finance";
import { formatMoney } from "../app/domain/money";

const quote = (sellRate: string, sourceAsOf = "2026-11-17T15:00:00.000Z"): ExchangeQuote => ({
  id: sourceAsOf,
  series: "usd-oficial",
  currency: "USD",
  buyRate: sellRate,
  sellRate,
  sourceAsOf,
  fetchedAt: sourceAsOf,
});
// Tasas y artículos ficticios exclusivos de pruebas, sin publicación ni consultas a fuentes.
it.each([
  ["110", "100", "up", "10,00 %"],
  ["90", "100", "down", "10,00 %"],
  ["100", "100", "unchanged", "0,00 %"],
  ["1.00005", "1", "up", "0,01 %"],
  ["99.995", "100", "down", "0,01 %"],
  ["100.00000001", "100", "up", "< 0,01 %"],
])("compara %s con %s usando decimales exactos", (current, previous, direction, percent) => {
  expect(quoteChange(quote(current), quote(previous, "2026-11-16T15:00:00.000Z"))).toMatchObject({
    direction,
    percent,
    comparedDate: "2026-11-16",
  });
});
it("no inventa comparación ni mezcla series o fechas argentinas del mismo día", () => {
  expect(quoteChange(quote("100"))).toBeNull();
  expect(
    quoteChange(quote("100"), { ...quote("90", "2026-11-16T15:00:00.000Z"), series: "usd-blue" }),
  ).toBeNull();
  expect(
    quoteChange(quote("100", "2026-11-17T02:00:00.000Z"), quote("90", "2026-11-16T23:00:00.000Z")),
  ).toBeNull();
  expect(
    quoteChange(quote("100", "2026-11-17T02:00:00.000Z"), quote("90", "2026-11-16T02:00:00.000Z"))
      ?.comparedDate,
  ).toBe("2026-11-15");
});
it("lee la última referencia de una fecha argentina anterior y conserva la captura actual", async () => {
  const store = testD1();
  try {
    const insert = store.sqlite.prepare("INSERT INTO exchange_quotes VALUES(?,?,?,?,?,?,?)");
    const add = (id: string, stamp: string) =>
      insert.run(id, "usd-oficial", "USD", "100", "100", stamp, stamp);
    add("a", "2026-11-15T23:00:00.000Z");
    add("b", "2026-11-16T02:59:00.000Z");
    add("c", "2026-11-16T03:00:00.000Z");
    add("d", "2026-11-17T02:30:00.000Z");
    const db = createDb(store.binding);
    const snapshot = await getQuoteSnapshot(db);
    expect(snapshot.quotes.map((row) => row.id)).toEqual(["d"]);
    expect(snapshot.previousQuotes.map((row) => row.id)).toEqual(["b"]);
    add("e", "2026-11-17T03:00:00.000Z");
    const next = await getQuoteSnapshot(db);
    expect(next.previousQuotes.map((row) => row.id)).toEqual(["d"]);
    expect(snapshot.previousQuotes.map((row) => row.id)).toEqual(["b"]);
  } finally {
    store.sqlite.close();
  }
});
it("sin un día previo almacenado devuelve historia vacía", async () => {
  const store = testD1();
  try {
    store.sqlite.exec(
      "INSERT INTO exchange_quotes VALUES('a','usd-oficial','USD','100','100','2026-11-17T12:00:00.000Z','2026-11-17T12:00:00.000Z')",
    );
    expect((await getQuoteSnapshot(createDb(store.binding))).previousQuotes).toEqual([]);
  } finally {
    store.sqlite.close();
  }
});
it("Ambos mantiene cada saldo real separado y cambiar la vista no convierte dinero", () => {
  const render = (view: "ars" | "usd" | "both") =>
    renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(BalanceFocus, {
          snapshot: productExample,
          view,
          onView: () => {},
          base: "/app",
        }),
      ),
    );
  const both = render("both"),
    ars = formatMoney(summarize(productExample, "ARS").balance, "ARS"),
    usd = formatMoney(summarize(productExample, "USD").balance, "USD");
  expect(both).toContain(ars);
  expect(both).toContain(usd);
  expect(render("ars")).not.toContain("Dólares estadounidenses");
  expect(render("usd")).not.toContain("Pesos argentinos");
  expect(both).toContain("Cada moneda se mantiene separada");
});
it("las listas del resumen incluyen otras monedas y un cambio muestra los dos importes reales", () => {
  const snapshot = {
    ...productExample,
    payments: [
      {
        ...productExample.payments.find((p) => p.dueDate.startsWith("2026-11"))!,
        id: "euros",
        title: "Servicio en euros",
        currency: "EUR" as const,
        paid: false,
      },
    ],
    entries: productExample.entries.slice(0, 1),
  };
  const pending = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(PendingOverview, { snapshot, base: "/app", open: () => {} }),
    ),
  );
  expect(pending).toContain("Servicio en euros");
  expect(pending).toContain("EUR");
  const recent = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(RecentOverview, { snapshot, base: "/app", open: () => {} }),
    ),
  );
  expect(recent).toContain("ARS");
  expect(recent).toContain("USD");
  expect(recent).toContain("Cambio de moneda");
});
it("el radar toma hasta cinco favoritas sin duplicados y el inicio no afirma un ranking", () => {
  expect(marketSelection([])).toHaveLength(5);
  expect(
    marketSelection(["KO", "AAPL", "KO"])
      .slice(0, 2)
      .map(({ symbol, name }) => ({ symbol, name })),
  ).toEqual([
    { symbol: "AAPL", name: "Apple" },
    { symbol: "KO", name: "Coca-Cola" },
  ]);
  expect(marketSelection(["AAPL", "MSFT", "NVDA", "MELI", "KO", "NU"])).toHaveLength(5);
});
it("el carrusel entrega un artículo por vez, limita la edición a cinco y comienza pausado", () => {
  const edition = {
    period: "2026-11-17",
    refreshedAt: "2026-11-17T14:00:00.000Z",
    articles: Array.from({ length: 6 }, (_, i) => ({
      id: String(i),
      source: "iprofesional" as const,
      sourceName: "Fuente de prueba",
      title: `Artículo de prueba ${i + 1}`,
      description: "Texto ficticio de prueba",
      imageUrl: null,
      category: "economia" as const,
      language: "es",
      saved: false,
      url: "https://example.com",
      publishedAt: "2026-11-17T02:00:00.000Z",
      fetchedAt: "2026-11-17T14:00:00.000Z",
    })),
  };
  const html = renderToStaticMarkup(
    createElement(ArticleCarousel, { edition, asOf: "2026-11-17", cadence: "daily" }),
  );
  expect(html).toContain("1 / 5");
  expect(html).toContain("Artículo de prueba 1");
  expect(html).not.toContain("Artículo de prueba 2");
  expect(html).toContain("Reproducir noticias");
  expect(html).toMatch(/16(?: de)? nov(?: de)? 2026/);
});
it.each(["daily", "weekly"] as const)(
  "Resumen conserva la foto y el enlace original de la noticia %s",
  (cadence) => {
    const { overview } = exampleNews(newsQuerySchema.parse({}), new Date("2026-11-19T18:00:00Z"));
    const article = overview[cadence][0]!;
    article.imageUrl = `https://example.com/photo-${cadence}.jpg`;
    article.url = `https://example.com/article-${cadence}`;
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(NewsCarousel, {
          snapshot: { ...productExample, news: overview },
          base: "/app",
          cadence,
          onCadence: () => {},
        }),
      ),
    );
    expect(html).toContain(`src="${article.imageUrl}"`);
    expect(html).toContain(`href="${article.url}"`);
    expect(html).toContain('referrerPolicy="no-referrer"');
    expect(html).toContain(article.sourceName);
  },
);
it("los enlaces antiguos con tema ya no aplican un filtro oculto ni rompen la búsqueda", () => {
  for (const category of ["dolar", "economia", "tema-antiguo"]) {
    expect(
      newsQueryFromUrl(
        new URLSearchParams({
          categoria: category,
          diario: "pagina12",
          buscar: "inflación",
          edicion: "semanal",
        }),
      ),
    ).toMatchObject({ category: "all", source: "pagina12", search: "inflación", period: "weekly" });
  }
});
