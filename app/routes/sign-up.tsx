import { AuthPage } from "~/components/auth-page";
import { authConfigured } from "~/lib/auth.server";
import type { Route } from "./+types/sign-up";
export const meta = () => [{ title: "Crear cuenta · Flujario" }];
export const loader = (args: Route.LoaderArgs) => ({ enabled: authConfigured(args) });
export default function SignUpPage({ loaderData }: Route.ComponentProps) {
  return <AuthPage enabled={loaderData.enabled} signup />;
}
