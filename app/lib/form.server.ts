import { readBoundedBody } from "./request-body.server";

export const MAX_FORM_BYTES = 16000;
export const FORM_TOO_LARGE = "Formulario demasiado grande.";

export async function readBoundedForm(request: Request): Promise<Record<string, string>> {
  if (!request.headers.get("Content-Type")?.startsWith("application/x-www-form-urlencoded"))
    throw new Response("Formato de formulario no admitido.", { status: 415 });
  const bytes = await readBoundedBody(request, MAX_FORM_BYTES, FORM_TOO_LARGE);
  return bytes ? Object.fromEntries(new URLSearchParams(new TextDecoder().decode(bytes))) : {};
}
