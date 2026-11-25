import { readBoundedBody } from "./request-body.server";

export async function readBoundedJson(request: Request, maxBytes = 512 * 1024): Promise<unknown> {
  if (
    request.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase() !== "application/json"
  )
    throw new Response(
      "Este endpoint recibe sólo movimientos confirmados en JSON, nunca archivos.",
      { status: 415 },
    );
  const tooLarge = "El lote es demasiado grande.";
  if (Number(request.headers.get("Content-Length") || 0) > maxBytes)
    throw new Response(tooLarge, { status: 413 });
  const bytes = await readBoundedBody(request, maxBytes, tooLarge);
  if (!bytes) throw new Response("Falta el lote.", { status: 400 });
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Response("No pudimos leer el lote de movimientos.", { status: 400 });
  }
}
