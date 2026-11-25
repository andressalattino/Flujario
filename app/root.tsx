import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  Link,
  isRouteErrorResponse,
} from "react-router";
import { ClerkProvider } from "@clerk/react-router";
import { clerkMiddleware, rootAuthLoader } from "@clerk/react-router/server";
import { esES } from "@clerk/localizations";
import { authConfigured } from "~/lib/auth.server";
import { Brand } from "~/components/brand";
import { ThemeProvider, ThemePicker, themeScript } from "~/components/theme";
import type { Route } from "./+types/root";
import "./app.css";
import "./themes.css";
import "./overview.css";
import "./news.css";
import "./markets.css";

export const middleware: Route.MiddlewareFunction[] = [
  async (args, next) => {
    if (!authConfigured(args)) return next();
    return clerkMiddleware({
      authorizedParties: [new URL(args.request.url).origin],
      signInUrl: "/iniciar-sesion",
      signUpUrl: "/crear-cuenta",
      signInFallbackRedirectUrl: "/app",
      signUpFallbackRedirectUrl: "/app",
    })(args, next);
  },
];
export const loader = (args: Route.LoaderArgs) =>
  authConfigured(args)
    ? rootAuthLoader(args, () => ({ authEnabled: true as const }))
    : { authEnabled: false as const };
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <meta name="theme-color" content="#f5f5f5" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <Meta />
        <Links />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
export default function App({ loaderData }: Route.ComponentProps) {
  if (!loaderData.authEnabled) return <Outlet />;
  return (
    <ClerkProvider
      loaderData={loaderData}
      localization={esES}
      appearance={{
        variables: {
          colorPrimary: "var(--primary)",
          colorPrimaryForeground: "var(--primary-foreground)",
          colorBackground: "var(--surface)",
          colorForeground: "var(--foreground)",
          colorMutedForeground: "var(--muted-foreground)",
          colorInput: "var(--surface)",
          colorInputForeground: "var(--foreground)",
          colorBorder: "var(--border)",
        },
      }}
      signInUrl="/iniciar-sesion"
      signUpUrl="/crear-cuenta"
      signInFallbackRedirectUrl="/app"
      signUpFallbackRedirectUrl="/app"
    >
      <Outlet />
    </ClerkProvider>
  );
}
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const status = isRouteErrorResponse(error) ? error.status : 500;
  return (
    <main className="error-page">
      <Brand />
      <ThemePicker />
      <p className="eyebrow">
        {status === 404 ? "PÁGINA NO ENCONTRADA" : "NO PUDIMOS ABRIR ESTA PÁGINA"}
      </p>
      <h1>
        {status === 404
          ? "Este camino no existe."
          : status === 503
            ? "El acceso todavía no está habilitado."
            : "Hagamos una pausa."}
      </h1>
      <p>
        {status === 503
          ? "La portada está disponible. El panel necesita que se complete la configuración inicial."
          : "Volvé al inicio para continuar. Si estabas guardando una operación, revisá tus movimientos antes de volver a enviarla."}
      </p>
      <Link className="text-link" to="/">
        Volver al inicio ↗
      </Link>
    </main>
  );
}
