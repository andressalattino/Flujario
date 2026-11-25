import { createRequestHandler, RouterContextProvider } from "react-router";
import { cloudflareContext } from "../app/context";
import { syncNews, publishWeeklyNews } from "../app/services/news-sync.server";
import { createDb, extendPaymentOccurrences } from "../app/db/repository.server";
import { refreshQuoteCache } from "../app/services/quotes.server";
import type { Env } from "../app/env";
import { newsSourcesForEnvironment } from "../app/data/news-sources";
import { syncMarketCatalog } from "../app/services/market-catalog.server";
const handler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);
export default {
  async fetch(request, env, ctx) {
    const context = new RouterContextProvider();
    context.set(cloudflareContext, { env, ctx });
    // Clerk espera context.cloudflare; la app usa además el contexto tipado de React Router.
    Object.assign(context, {
      cloudflare: {
        env: { ...env, VITE_CLERK_PUBLISHABLE_KEY: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY },
        ctx,
      },
    });
    const response = await handler(request, context);
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (
      response.headers.get("Content-Type")?.includes("text/html") ||
      new URL(request.url).pathname.startsWith("/app")
    )
      response.headers.set("Cache-Control", "private, no-store");
    return response;
  },
  async scheduled(event, env, ctx) {
    if (event.cron === "0 14 * * *") {
      ctx.waitUntil(
        syncMarketCatalog(createDb(env.DB), new Date(event.scheduledTime)).then((result) =>
          console.info("market_catalog_sync", result),
        ),
      );
      return;
    }
    if (event.cron === "0 */3 * * *") {
      ctx.waitUntil(
        refreshQuoteCache(createDb(env.DB)).then((result) =>
          console.info("quotes_refresh", result),
        ),
      );
      return;
    }
    const db = createDb(env.DB);
    const now = new Date(event.scheduledTime);
    const sources = newsSourcesForEnvironment(import.meta.env.DEV);
    if (event.cron === "*/30 * * * *")
      ctx.waitUntil(
        syncNews(db, now, fetch, sources).then(async (result) => {
          console.info("news_sync", result);
          // En local también recupera el corte del lunes si el servidor estaba cerrado.
          // La publicación existente es inmutable; nunca se arma una semana móvil.
          if (import.meta.env.DEV) await publishWeeklyNews(db, now, sources);
        }),
      );
    else if (event.cron === "0 13 * * MON")
      ctx.waitUntil(
        syncNews(db, now, fetch, sources)
          .then(() => publishWeeklyNews(db, now, sources))
          .then((result) => console.info("news_weekly", result)),
      );
    else if (event.cron === "0 13 * * *") ctx.waitUntil(extendPaymentOccurrences(db));
  },
} satisfies ExportedHandler<Env>;
