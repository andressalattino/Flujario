import { data } from "react-router";
import { requireUser, requireSameOrigin } from "~/lib/auth.server";
import { readBoundedForm } from "~/lib/form.server";
import { cloudflareContext } from "~/context";
import { createDb } from "~/db/repository.server";
import { readMarkets, mutateMarkets, MarketError } from "~/db/markets.server";
import { marketMutationSchema } from "~/domain/markets";
import type { Route } from "./+types/market-data";
export const headers = () => ({ "Cache-Control": "private, no-store" });
export async function loader(args: Route.LoaderArgs) {
  const userId = await requireUser(args);
  return readMarkets(createDb(args.context.get(cloudflareContext).env.DB), userId);
}
export async function action(args: Route.ActionArgs) {
  const userId = await requireUser(args);
  requireSameOrigin(args.request);
  const parsed = marketMutationSchema.safeParse(await readBoundedForm(args.request));
  if (!parsed.success)
    return data(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Revisá la selección." },
      { status: 400 },
    );
  try {
    await mutateMarkets(createDb(args.context.get(cloudflareContext).env.DB), userId, parsed.data);
    return { ok: true, error: null };
  } catch (error) {
    if (error instanceof MarketError)
      return data({ ok: false, error: error.message }, { status: error.status });
    console.error("market_mutation_failed", { intent: parsed.data.intent });
    return data(
      { ok: false, error: "No pudimos guardar el cambio. Actualizá la vista y volvé a intentar." },
      { status: 503 },
    );
  }
}
