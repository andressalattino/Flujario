import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import { loader } from "../app/routes/preview";
import { cloudflareContext } from "../app/context";
import { createDb, performOperation } from "../app/db/repository.server";
import { refreshQuoteCache } from "../app/services/quotes.server";
import { productExample } from "../app/data/product-example";
import { testD1 } from "./helpers/d1";
let store: ReturnType<typeof testD1>;
const now = new Date("2026-11-20T15:00:00Z");
function feed(url: unknown, date = "2026-11-20T12:00:00Z") {
  const dollar = String(url).endsWith("/dolares");
  return Response.json(
    (dollar
      ? [
          ["USD", "oficial"],
          ["USD", "bolsa"],
          ["USD", "blue"],
        ]
      : [
          ["EUR", "oficial"],
          ["BRL", "oficial"],
          ["CLP", "oficial"],
          ["UYU", "oficial"],
        ]
    ).map(([moneda, casa]) => ({
      moneda,
      casa,
      compra: "100",
      venta: "110",
      fechaActualizacion: date,
    })),
  );
}
function args(section = "resumen") {
  const context = new RouterContextProvider();
  context.set(cloudflareContext, { env: { DB: store.binding }, ctx: {} as ExecutionContext });
  return {
    params: { section },
    request: new Request(`http://localhost/vista-previa/${section}`),
    context,
  };
}
beforeEach(() => {
  store = testD1();
  vi.stubEnv("DEV", true);
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => {
  store.sqlite.close();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
it("Resumen usa referencias actuales y previas de D1 sin exponer finanzas privadas", async () => {
  const db = createDb(store.binding);
  await performOperation(db, "persona-privada", { intent: "setup", ars: 7654321, usd: 9876 });
  await refreshQuoteCache(db, new Date("2026-11-19T15:00:00Z"), async (url) =>
    feed(url, "2026-11-19T12:00:00Z"),
  );
  const fetcher = vi.fn(async (url: unknown) => feed(url));
  vi.stubGlobal("fetch", fetcher);
  const result = await loader(args() as never);
  expect(result.snapshot.quotes).toHaveLength(7);
  expect(result.snapshot.quotes.every((q) => q.sourceAsOf === "2026-11-20T12:00:00.000Z")).toBe(
    true,
  );
  expect(result.snapshot.previousQuotes).toHaveLength(7);
  expect(result.snapshot.accounts).toEqual(productExample.accounts);
  expect(result.snapshot.entries).toEqual(productExample.entries);
  expect(
    store.sqlite
      .prepare(
        "SELECT opening_cents FROM accounts WHERE user_id='persona-privada' AND currency='ARS'",
      )
      .get(),
  ).toEqual({ opening_cents: 7654321 });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("Resumen y Cotizaciones comparten el caché de tres horas", async () => {
  const fetcher = vi.fn(async (url: unknown) => feed(url));
  vi.stubGlobal("fetch", fetcher);
  await loader(args() as never);
  const result = await loader(args("cotizaciones") as never);
  expect(result.snapshot.quotes).toHaveLength(7);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("si falla la fuente se conserva la copia fechada sin afirmar que es de hoy", async () => {
  vi.stubGlobal("fetch", async (url: unknown) => feed(url));
  await loader(args() as never);
  vi.setSystemTime(new Date("2026-11-21T15:00:00Z"));
  vi.stubGlobal("fetch", async () => new Response("unavailable", { status: 503 }));
  const result = await loader(args() as never);
  expect(result.snapshot.quoteState.status).toBe("error");
  expect(result.snapshot.quotes.every((q) => q.sourceAsOf.startsWith("2026-11-20"))).toBe(true);
});
it("si no hay copia y falla DolarApi no rellena con la captura antigua de la portada", async () => {
  vi.stubGlobal("fetch", async () => new Response("unavailable", { status: 503 }));
  const result = await loader(args("cotizaciones") as never);
  expect(result.snapshot.quotes).toEqual([]);
  expect(result.snapshot.quoteState.status).toBe("error");
});
it("la vista previa sigue cerrada en producción antes de consultar proveedores o la base", async () => {
  vi.stubEnv("DEV", false);
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await expect(loader({ params: { section: "resumen" } } as never)).rejects.toMatchObject({
    status: 404,
  });
  expect(fetcher).not.toHaveBeenCalled();
});
