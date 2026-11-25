import { getAuth } from "@clerk/react-router/server";
import { redirect, type LoaderFunctionArgs, type ActionFunctionArgs } from "react-router";
import { cloudflareContext } from "../context";
type ServerArgs = LoaderFunctionArgs | ActionFunctionArgs;
export function authConfigured(args: Pick<ServerArgs, "context">): boolean {
  const env = args.context.get(cloudflareContext).env;
  return Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY && env.CLERK_SECRET_KEY);
}
export async function requireUser(args: ServerArgs): Promise<string> {
  if (!authConfigured(args))
    throw new Response("Falta configurar Clerk. Revisá el README del proyecto.", { status: 503 });
  const { userId } = await getAuth(args);
  if (!userId) throw redirect("/iniciar-sesion");
  return userId;
}
export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(request.url).origin)
    throw new Response("Origen no permitido.", { status: 403 });
}
