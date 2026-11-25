import { z } from "zod";
import { createDb } from "../db/repository.server";
import { editions } from "../db/schema";
import { today } from "../domain/dates";
import type { Env } from "../env";
const secureUrl = z
  .url()
  .refine((value) => new URL(value).protocol === "https:", "La fuente debe usar HTTPS.");
const feedSchema = z.object({
  articles: z
    .array(
      z.object({
        id: z.string().max(150),
        title: z.string().min(5).max(200),
        summary: z.string().max(800),
        source: z.string().min(1).max(120),
        url: secureUrl,
        publishedAt: z.iso.datetime(),
      }),
    )
    .min(1)
    .max(30),
});
export function editionPeriod(cadence: "daily" | "weekly", now: Date): string {
  const date = today(now);
  if (cadence === "daily") return date;
  const monday = new Date(`${date}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
}
export async function refreshNews(env: Env, cadence: "daily" | "weekly", now = new Date()) {
  if (!env.NEWS_FEED_URL) return { status: "not_configured" as const, cadence };
  const url = new URL(env.NEWS_FEED_URL);
  if (url.protocol !== "https:") throw new Error("NEWS_FEED_URL debe usar HTTPS.");
  url.searchParams.set("cadence", cadence);
  url.searchParams.set("period", editionPeriod(cadence, now));
  const response = await fetch(url, {
    headers: env.NEWS_FEED_TOKEN ? { Authorization: `Bearer ${env.NEWS_FEED_TOKEN}` } : {},
    signal: AbortSignal.timeout(15000),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`Proveedor editorial respondió ${response.status}`);
  const raw = await response.text();
  if (raw.length > 100_000) throw new Error("La edición supera el tamaño permitido.");
  const feed = feedSchema.parse(JSON.parse(raw));
  if (feed.articles.some((article) => new Date(article.publishedAt) > now))
    throw new Error("La fuente incluyó una noticia con fecha futura.");
  const period = editionPeriod(cadence, now);
  // Se publica únicamente una edición completa y validada; conserva la anterior ante fallos.
  await createDb(env.DB)
    .insert(editions)
    .values({
      id: `${cadence}:${period}`,
      cadence,
      period,
      refreshedAt: now.toISOString(),
      articlesJson: JSON.stringify(feed.articles),
    })
    .onConflictDoUpdate({
      target: [editions.cadence, editions.period],
      set: { refreshedAt: now.toISOString(), articlesJson: JSON.stringify(feed.articles) },
    });
  return { status: "updated" as const, cadence, period };
}
