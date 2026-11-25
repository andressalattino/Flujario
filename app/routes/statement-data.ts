import { data } from "react-router";
import { requireUser, requireSameOrigin } from "~/lib/auth.server";
import { readBoundedJson } from "~/lib/json.server";
import { cloudflareContext } from "~/context";
import { createDb } from "~/db/repository.server";
import { mutateStatements, readStatementState, StatementError } from "~/db/statements.server";
import { statementMutationSchema } from "~/domain/statements";
import { isCurrency } from "~/domain/currencies";
import { today } from "~/domain/dates";
import type { Route } from "./+types/statement-data";
export const headers = () => ({ "Cache-Control": "private, no-store" });
export async function loader(args: Route.LoaderArgs) {
  const userId = await requireUser(args);
  const params = new URL(args.request.url).searchParams,
    currency = params.get("moneda") ?? "ARS";
  if (!isCurrency(currency)) throw new Response("Moneda no admitida.", { status: 400 });
  try {
    return await readStatementState(
      createDb(args.context.get(cloudflareContext).env.DB),
      userId,
      currency,
      params.get("desde") ?? "1900-01-01",
      params.get("hasta") ?? today(),
    );
  } catch (error) {
    if (error instanceof StatementError)
      throw new Response(error.message, { status: error.status });
    throw error;
  }
}
export async function action(args: Route.ActionArgs) {
  const userId = await requireUser(args);
  requireSameOrigin(args.request);
  const parsed = statementMutationSchema.safeParse(await readBoundedJson(args.request));
  if (!parsed.success)
    return data(
      {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Revisá los movimientos.",
        duplicateKeys: [],
      },
      { status: 400 },
    );
  try {
    return await mutateStatements(
      createDb(args.context.get(cloudflareContext).env.DB),
      userId,
      parsed.data,
    );
  } catch (error) {
    if (error instanceof StatementError)
      return data(
        { ok: false, error: error.message, duplicateKeys: error.duplicateKeys },
        { status: error.status },
      );
    console.error("statement_operation_failed", { intent: parsed.data.intent });
    return data(
      {
        ok: false,
        error:
          "No pudimos confirmar el guardado. Actualizá el historial antes de volver a intentar.",
        duplicateKeys: [],
      },
      { status: 503 },
    );
  }
}
