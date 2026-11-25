import { AuthPage } from "~/components/auth-page";
import { authConfigured } from "~/lib/auth.server";
import type { Route } from "./+types/sign-in";
export const meta = () => [{ title: "Iniciar sesión · Flujario" }];
export const loader = (args: Route.LoaderArgs) => ({ enabled: authConfigured(args) });
export default function SignInPage({ loaderData }: Route.ComponentProps) {
  return <AuthPage enabled={loaderData.enabled} />;
}
