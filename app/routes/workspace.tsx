import { data } from "react-router";
import { useAuth } from "@clerk/react-router";
import { FloatingChatbot } from "~/components/assistant/floating-chatbot";
import { Dashboard } from "~/components/dashboard";
import { requireSameOrigin, requireUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/context";
import {
  createDb,
  getSnapshot,
  performOperation,
  OperationError,
  extendPaymentOccurrences,
} from "~/db/repository.server";
import { operationSchema } from "~/domain/validation";
import { validateSection } from "~/lib/sections";
import { FORM_TOO_LARGE, MAX_FORM_BYTES, readBoundedForm } from "~/lib/form.server";
import { refreshQuoteCache } from "~/services/quotes.server";
import { readNewsOverview, readNewsPage } from "~/db/news.server";
import { newsQueryFromUrl } from "~/domain/news";
import { newsSourcesForEnvironment } from "~/data/news-sources";
import { readMarkets } from "~/db/markets.server";
import { readStatisticsPage } from "~/db/statements.server";
import { statisticsFilters } from "~/domain/statistics";
import type { Route } from "./+types/workspace";
export const meta = () => [
  { title: "Tu espacio · Flujario" },
  { name: "robots", content: "noindex" },
];
export const headers = () => ({ "Cache-Control": "private, no-store" });
export async function loader(args: Route.LoaderArgs) {
  const userId = await requireUser(args);
  const section = validateSection(args.params.section);
  const db = createDb(args.context.get(cloudflareContext).env.DB);
  // Recupera vencimientos faltantes si la tarea programada no corrió mientras la app estuvo cerrada.
  await extendPaymentOccurrences(db, userId);
  if (section === "cotizaciones") await refreshQuoteCache(db);
  const snapshot = await getSnapshot(db, userId);
  if (section === "mercados" || section === "resumen") {
    snapshot.markets = await readMarkets(db, userId);
    snapshot.favorites = snapshot.markets.favorites;
  }
  const sources = newsSourcesForEnvironment(import.meta.env.DEV);
  if (section === "resumen" || section === "noticias")
    snapshot.news = await readNewsOverview(db, userId, new Date(), sources);
  if (section === "noticias") {
    let query;
    try {
      query = newsQueryFromUrl(new URL(args.request.url).searchParams);
    } catch {
      throw new Response("Filtros de noticias inválidos.", { status: 400 });
    }
    snapshot.newsPage = await readNewsPage(db, userId, query, new Date(), sources);
  }
  const statistics =
    section === "estadisticas" && snapshot.accounts.length
      ? await readStatisticsPage(
          db,
          userId,
          statisticsFilters(
            new URL(args.request.url).searchParams,
            snapshot.asOf,
            snapshot.accounts.map((account) => account.currency),
          ),
        )
      : null;
  return { snapshot, assistantOwner: userId, statistics };
}
export async function action(args: Route.ActionArgs) {
  const userId = await requireUser(args);
  validateSection(args.params.section);
  requireSameOrigin(args.request);
  if (Number(args.request.headers.get("Content-Length") || 0) > MAX_FORM_BYTES)
    throw new Response(FORM_TOO_LARGE, { status: 413 });
  const parsed = operationSchema.safeParse(await readBoundedForm(args.request));
  if (!parsed.success)
    return data(
      { ok: false, error: parsed.error.issues[0]?.message || "Revisá los campos." },
      { status: 400 },
    );
  const db = createDb(args.context.get(cloudflareContext).env.DB);
  try {
    await performOperation(db, userId, parsed.data);
    return {
      ok: true,
      error: null,
      message:
        parsed.data.intent === "dismiss-payment-notices"
          ? "No volveremos a mostrar esos vencimientos en el aviso. Siguen pendientes en Pagos."
          : parsed.data.intent === "exchange"
            ? "Cambio registrado. Tus dos saldos están actualizados."
            : parsed.data.intent === "add-currency"
              ? "Moneda agregada. Su saldo se mantiene por separado."
              : null,
      nextCurrency: parsed.data.intent === "add-currency" ? parsed.data.currency : null,
    };
  } catch (error) {
    if (error instanceof OperationError)
      return data(
        { ok: false, error: error.message, refresh: error.status === 409 },
        { status: error.status },
      );
    console.error("operation_failed", { kind: parsed.data.intent });
    return data(
      {
        ok: false,
        error:
          "No pudimos confirmar el guardado. Revisá tus movimientos antes de volver a intentarlo.",
      },
      { status: 500 },
    );
  }
}
export default function Workspace({ loaderData }: Route.ComponentProps) {
  const { userId } = useAuth();
  return (
    <>
      <Dashboard snapshot={loaderData.snapshot} statistics={loaderData.statistics} />
      {userId === loaderData.assistantOwner && (
        <FloatingChatbot
          key={loaderData.assistantOwner}
          currencies={loaderData.snapshot.accounts.map((a) => a.currency)}
        />
      )}
    </>
  );
}
