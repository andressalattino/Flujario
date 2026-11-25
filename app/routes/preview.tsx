import { Dashboard } from "~/components/dashboard";
import { FloatingChatbot } from "~/components/assistant/floating-chatbot";
import { productExample } from "~/data/product-example";
import { validateSection } from "~/lib/sections";
import { newsQueryFromUrl } from "~/domain/news";
import { cloudflareContext } from "~/context";
import { createDb } from "~/db/repository.server";
import { readNewsOverview, readNewsPage } from "~/db/news.server";
import { newsSourcesForEnvironment } from "~/data/news-sources";
import { marketPreview } from "~/data/market-preview";
import { readMarkets } from "~/db/markets.server";
import { getQuoteSnapshot } from "~/db/quotes.server";
import { refreshQuoteCache } from "~/services/quotes.server";
import { calculateStatistics, statisticsFilters } from "~/domain/statistics";
import { statisticsExample } from "~/data/statistics-example";
import type { Route } from "./+types/preview";
export async function loader({ params, request, context }: Route.LoaderArgs) {
  if (!import.meta.env.DEV) throw new Response("Not found", { status: 404 });
  const section = validateSection(params.section);
  const search = new URL(request.url).searchParams;
  if (section === "estadisticas") {
    const { query, error } = statisticsFilters(
      search,
      productExample.asOf,
      productExample.accounts.map((account) => account.currency),
    );
    return {
      snapshot: productExample,
      newsExample: false,
      statistics: {
        query,
        error,
        report: error
          ? null
          : calculateStatistics(query, statisticsExample, { history: [], breakdowns: [] }),
      },
    };
  }
  let markets = marketPreview(productExample.favorites, search.get("indice"));
  if (section === "mercados" || section === "resumen") {
    const publicCatalog = await readMarkets(createDb(context.get(cloudflareContext).env.DB), null);
    markets = {
      ...publicCatalog,
      selectedIndex: markets.selectedIndex,
      favorites: markets.favorites,
    };
  }
  const exampleSnapshot = { ...productExample, markets };
  // Sólo referencias públicas compartidas: la vista previa nunca lee cuentas reales.
  // La portada mantiene su captura fija; esta ruta DEV muestra la copia vigente.
  if (section === "resumen" || section === "cotizaciones") {
    const db = createDb(context.get(cloudflareContext).env.DB);
    await refreshQuoteCache(db);
    Object.assign(exampleSnapshot, await getQuoteSnapshot(db));
  }
  if (search.get("noticias") === "ejemplo") {
    const { exampleNews } = await import("~/data/news-example");
    const example = exampleNews(newsQueryFromUrl(search));
    return {
      snapshot: { ...exampleSnapshot, news: example.overview, newsPage: example.page },
      newsExample: true,
    };
  }
  if (section === "noticias" || section === "resumen") {
    const db = createDb(context.get(cloudflareContext).env.DB);
    const sources = newsSourcesForEnvironment(true);
    const now = new Date();
    // null lee únicamente el catálogo compartido, nunca preferencias de un usuario.
    const news = await readNewsOverview(db, null, now, sources);
    const newsPage =
      section === "noticias"
        ? await readNewsPage(db, null, newsQueryFromUrl(search), now, sources)
        : undefined;
    return {
      snapshot: { ...exampleSnapshot, news, newsPage },
      newsExample: false,
    };
  }
  return { snapshot: exampleSnapshot, newsExample: false };
}
export const meta = () => [
  { title: "Vista previa local · Flujario" },
  { name: "robots", content: "noindex" },
];
export default function Preview({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <Dashboard
        snapshot={loaderData.snapshot}
        preview
        newsExample={loaderData.newsExample}
        statistics={loaderData.statistics}
      />
      <FloatingChatbot
        key="preview"
        currencies={loaderData.snapshot.accounts.map((a) => a.currency)}
        previewSnapshot={loaderData.snapshot}
      />
    </>
  );
}
