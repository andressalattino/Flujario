import { index, route, type RouteConfig } from "@react-router/dev/routes";
export default [
  index("routes/home.tsx"),
  route("vista-previa/:section?", "routes/preview.tsx"),
  route("app/cotizaciones/datos", "routes/quote-data.ts"),
  route("app/noticias/datos", "routes/news-data.ts"),
  route("app/mercados/datos", "routes/market-data.ts"),
  route("app/importaciones/datos", "routes/statement-data.ts"),
  route("app/asistente/datos", "routes/assistant-data.ts"),
  route("app/:section?", "routes/workspace.tsx"),
  route("iniciar-sesion/*", "routes/sign-in.tsx"),
  route("crear-cuenta/*", "routes/sign-up.tsx"),
] satisfies RouteConfig;
