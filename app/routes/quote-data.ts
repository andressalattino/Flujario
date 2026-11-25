import { requireUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/context";
import { createDb } from "~/db/repository.server";
import { getQuoteSnapshot } from "~/db/quotes.server";
import { refreshQuoteCache } from "~/services/quotes.server";
import type { Route } from "./+types/quote-data";
export const headers = () => ({ "Cache-Control": "private, no-store" });
export async function loader(args: Route.LoaderArgs) {
  await requireUser(args);
  const db = createDb(args.context.get(cloudflareContext).env.DB);
  await refreshQuoteCache(db);
  return getQuoteSnapshot(db);
}
