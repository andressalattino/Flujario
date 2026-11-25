import { z } from "zod";
import {
  newsSourceIds,
  newsSources,
  sourceIsEnabled,
  type NewsSourceId,
} from "../data/news-sources";
import { today } from "./dates";
import { yesNoSchema } from "./field-schemas";

export const newsCategories = [
  "economia",
  "finanzas",
  "mercados",
  "dolar",
  "inversiones",
  "internacional",
] as const;
export type NewsCategory = (typeof newsCategories)[number];
export const newsCategoryNames: Record<NewsCategory, string> = {
  economia: "Economía",
  finanzas: "Finanzas",
  mercados: "Mercados",
  dolar: "Dólar",
  inversiones: "Inversiones",
  internacional: "Internacional",
};
export interface NewsArticle {
  id: string;
  source: NewsSourceId;
  sourceName: string;
  title: string;
  description: string | null;
  url: string;
  imageUrl: string | null;
  category: NewsCategory;
  language: string;
  publishedAt: string;
  fetchedAt: string;
  saved: boolean;
}
export interface NewsSourceState {
  id: NewsSourceId;
  name: string;
  sectionUrl: string;
  publication: "pending" | "approved" | "local-reader";
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  status: "pending" | "idle" | "refreshing" | "ok" | "error";
  error: string | null;
  favorite: boolean;
}
export const newsQuerySchema = z.object({
  period: z.enum(["daily", "weekly"]).default("daily"),
  source: z.enum(["all", ...newsSourceIds]).default("all"),
  category: z.enum(["all", ...newsCategories]).default("all"),
  search: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).max(500).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(5),
  saved: yesNoSchema.default("no"),
});
export type NewsQuery = z.infer<typeof newsQuerySchema>;
export interface NewsPage {
  query: NewsQuery;
  asOf: string;
  sources: NewsSourceState[];
  groups: { source: NewsSourceId; articles: NewsArticle[]; total: number }[];
  weeklyPeriod: string | null;
  weeklyPublishedAt: string | null;
}
export interface NewsOverview {
  asOf: string;
  sources: NewsSourceState[];
  daily: NewsArticle[];
  weekly: NewsArticle[];
  weeklyPeriod: string | null;
  weeklyPublishedAt: string | null;
}
export function todayNewsWindow(now: Date) {
  return {
    start: `${today(now)}T03:00:00.000Z`,
    end: now.toISOString(),
  };
}
export function newsQueryFromUrl(params: URLSearchParams) {
  return newsQuerySchema.parse({
    period: params.get("edicion") === "semanal" ? "weekly" : "daily",
    source: params.get("diario") ?? "all",
    // Se quitó el filtro visible por tema. Los enlaces viejos no deben ocultar noticias.
    category: "all",
    search: params.get("buscar") ?? "",
    page: params.get("pagina") ?? 1,
    limit: params.get("todas") === "si" ? 20 : 5,
    saved: params.get("guardadas") === "si" ? "yes" : "no",
  });
}
export function emptyNewsOverview(now = new Date()): NewsOverview {
  return {
    asOf: now.toISOString(),
    daily: [],
    weekly: [],
    weeklyPeriod: null,
    weeklyPublishedAt: null,
    sources: newsSources.map((source) => ({
      id: source.id,
      name: source.name,
      sectionUrl: source.sectionUrl,
      publication: sourceIsEnabled(source) ? source.publication : "pending",
      lastAttemptAt: null,
      lastSuccessAt: null,
      status: sourceIsEnabled(source) ? "idle" : "pending",
      error: null,
      favorite: false,
    })),
  };
}
export function selectOverviewNews(
  articles: NewsArticle[],
  sourceOrder: readonly NewsSourceId[],
  favoriteSources: readonly NewsSourceId[] = [],
) {
  const ordered = [...articles].sort(
    (a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id),
  );
  const selected: NewsArticle[] = [];
  const preferred = [
    ...sourceOrder.filter((source) => favoriteSources.includes(source)),
    ...sourceOrder.filter((source) => !favoriteSources.includes(source)),
  ];
  for (const source of preferred) {
    if (selected.length === 5) break;
    if (selected.some((article) => article.source === source)) continue;
    const candidate = ordered.find(
      (article) => article.source === source && !selected.some((item) => item.id === article.id),
    );
    if (candidate) selected.push(candidate);
  }
  return selected;
}
