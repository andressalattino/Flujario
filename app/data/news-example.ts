// Sólo se usa por solicitud explícita en la vista previa DEV; no es un feed ni una licencia.
import { newsSources } from "./news-sources";
import {
  emptyNewsOverview,
  selectOverviewNews,
  type NewsArticle,
  type NewsQuery,
  type NewsPage,
} from "../domain/news";
export function exampleNews(query: NewsQuery, now = new Date()) {
  const base = emptyNewsOverview(now);
  base.sources = base.sources.map((source, index) =>
    source.id === "mdz"
      ? source
      : {
          ...source,
          publication: "approved",
          status: "ok",
          lastAttemptAt: now.toISOString(),
          lastSuccessAt: now.toISOString(),
          favorite: index === 1,
        },
  );
  const monday = new Date(`${now.toISOString().slice(0, 10)}T13:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  if (monday > now) monday.setUTCDate(monday.getUTCDate() - 7);
  base.weeklyPeriod = monday.toISOString().slice(0, 10);
  base.weeklyPublishedAt = monday.toISOString();
  const topics = [
    "Cómo leer los indicadores de la economía",
    "Qué mirar antes de organizar un ahorro",
    "Las tasas y su relación con el crédito",
    "Una mirada a las cuentas de cada mes",
    "Conceptos para entender el mercado",
    "El presupuesto en distintos momentos",
    "Preguntas para comparar alternativas",
  ];
  const articles: NewsArticle[] = newsSources
    .filter((source) => source.id !== "mdz")
    .flatMap((source, index) =>
      topics.map(
        (title, i) =>
          ({
            id: `${index + 1}${i + 1}`.padEnd(64, "0"),
            source: source.id,
            sourceName: source.name,
            title: `Ejemplo ficticio: ${title.toLowerCase()}`,
            description: null,
            imageUrl: null,
            url: "https://example.com/",
            category: i % 2 ? "finanzas" : "economia",
            language: "es",
            publishedAt: new Date(now.getTime() - (i + 1) * 60000).toISOString(),
            fetchedAt: now.toISOString(),
            saved: i === 1,
          }) as NewsArticle,
      ),
    );
  base.daily = selectOverviewNews(
    articles,
    newsSources.map((source) => source.id),
    ["eleconomista"],
  );
  const weekly = articles.map((article) => ({
    ...article,
    publishedAt: new Date(monday.getTime() - 86400000).toISOString(),
  }));
  base.weekly = selectOverviewNews(
    weekly,
    newsSources.map((source) => source.id),
    ["eleconomista"],
  );
  const data = (query.period === "weekly" && query.saved === "no" ? weekly : articles).filter(
    (article) =>
      (query.source === "all" || article.source === query.source) &&
      (query.category === "all" || article.category === query.category) &&
      (query.saved === "no" || article.saved) &&
      article.title.toLowerCase().includes(query.search.toLowerCase()),
  );
  const limit = query.source === "all" ? 5 : query.limit;
  const offset = query.source === "all" ? 0 : (query.page - 1) * limit;
  const page: NewsPage = {
    query,
    asOf: base.asOf,
    sources: base.sources,
    weeklyPeriod: base.weeklyPeriod,
    weeklyPublishedAt: base.weeklyPublishedAt,
    groups: newsSources
      .filter((source) => query.source === "all" || query.source === source.id)
      .map((source) => ({
        source: source.id,
        total: data.filter((article) => article.source === source.id).length,
        articles: data
          .filter((article) => article.source === source.id)
          .slice(offset, offset + limit),
      })),
  };
  return { overview: base, page };
}
