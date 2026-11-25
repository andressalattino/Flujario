import { requireUser, requireSameOrigin } from "~/lib/auth.server";
import { readBoundedJson } from "~/lib/json.server";
import { cloudflareContext } from "~/context";
import { createDb } from "~/db/repository.server";
import { AssistantError, readAssistantUsage } from "~/db/assistant.server";
import { assistantRequestSchema } from "~/domain/assistant";
import { assistantConfig } from "~/services/assistant-config.server";
import { answerAssistant, inferenceEnabled } from "~/services/assistant.server";
import type { Route } from "./+types/assistant-data";
export const headers = () => ({ "Cache-Control": "private, no-store" });
// Es una resource route consumida con fetch: el encabezado debe viajar en la
// Response, no depender sólo de headers() del documento de React Router.
function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: headers() });
}
export async function loader(args: Route.LoaderArgs) {
  const userId = await requireUser(args),
    env = args.context.get(cloudflareContext).env;
  return json({
    usage: await readAssistantUsage(
      createDb(env.DB),
      userId,
      assistantConfig(env),
      inferenceEnabled(env),
    ),
  });
}
export async function action(args: Route.ActionArgs) {
  const userId = await requireUser(args);
  requireSameOrigin(args.request);
  const parsed = assistantRequestSchema.safeParse(await readBoundedJson(args.request, 8192));
  if (!parsed.success)
    return json(
      { ok: false, error: "Revisá la pregunta, su longitud y la moneda.", code: "invalid" },
      400,
    );
  const env = args.context.get(cloudflareContext).env;
  try {
    return json(await answerAssistant(env, userId, parsed.data));
  } catch (error) {
    if (error instanceof AssistantError) {
      const usage = await readAssistantUsage(
        createDb(env.DB),
        userId,
        assistantConfig(env),
        inferenceEnabled(env),
      );
      if (error.code === "global-limit") {
        usage.available = false;
        usage.reason = "global-limit";
      }
      return json({ ok: false, error: error.message, code: error.code, usage }, error.status);
    }
    // No se registran preguntas, movimientos, respuestas ni errores del proveedor.
    return json(
      {
        ok: false,
        error: "No pudimos completar el análisis. Intentá más tarde o acotá el período.",
        code: "unavailable",
      },
      503,
    );
  }
}
