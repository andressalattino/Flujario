import { data } from "react-router";
import { z } from "zod";
import { requireUser, requireSameOrigin } from "~/lib/auth.server";
import { readBoundedForm } from "~/lib/form.server";
import { cloudflareContext } from "~/context";
import { createDb } from "~/db/repository.server";
import { readNewsPage, setArticleSaved, setSourceFavorite } from "~/db/news.server";
import { newsQuerySchema } from "~/domain/news";
import { yesNoSchema } from "~/domain/field-schemas";
import { newsSourceIds, newsSourcesForEnvironment } from "~/data/news-sources";
import type { Route } from "./+types/news-data";
export const headers = () => ({ "Cache-Control": "private, no-store" });
export async function loader(args: Route.LoaderArgs) {
  const userId = await requireUser(args);
  const query = newsQuerySchema.safeParse(
    Object.fromEntries(new URL(args.request.url).searchParams),
  );
  if (!query.success) return data({ error: "Revisá los filtros de noticias." }, { status: 400 });
  try {
    return await readNewsPage(
      createDb(args.context.get(cloudflareContext).env.DB),
      userId,
      query.data,
      new Date(),
      newsSourcesForEnvironment(import.meta.env.DEV),
    );
  } catch {
    return data({ error: "No pudimos cargar las noticias. Volvé a intentar." }, { status: 503 });
  }
}
const mutation = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("favorite-source"),
    source: z.enum(newsSourceIds),
    saved: yesNoSchema,
  }),
  z.object({
    intent: z.literal("save-article"),
    articleId: z.string().regex(/^[a-f0-9]{64}$/),
    saved: yesNoSchema,
  }),
]);
export async function action(args: Route.ActionArgs) {
  const userId = await requireUser(args);
  requireSameOrigin(args.request);
  const parsed = mutation.safeParse(await readBoundedForm(args.request));
  if (!parsed.success) return data({ ok: false, error: "Revisá la selección." }, { status: 400 });
  const db = createDb(args.context.get(cloudflareContext).env.DB);
  try {
    if (parsed.data.intent === "favorite-source")
      await setSourceFavorite(db, userId, parsed.data.source, parsed.data.saved === "yes");
    else if (
      !(await setArticleSaved(
        db,
        userId,
        parsed.data.articleId,
        parsed.data.saved === "yes",
        new Date(),
        newsSourcesForEnvironment(import.meta.env.DEV),
      ))
    )
      return data({ ok: false, error: "Esta noticia ya no está disponible." }, { status: 404 });
    return { ok: true, error: null };
  } catch {
    return data(
      { ok: false, error: "No pudimos guardar el cambio. Volvé a intentar." },
      { status: 503 },
    );
  }
}
