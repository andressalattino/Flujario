import { expect, it, afterEach, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import { cloudflareContext } from "../app/context";
import { requireUser, requireSameOrigin } from "../app/lib/auth.server";
import { readBoundedForm } from "../app/lib/form.server";
import { operationSchema } from "../app/domain/validation";
import { getAuth } from "@clerk/react-router/server";
import { loader as quoteLoader } from "../app/routes/quote-data";
import { loader as newsLoader, action as newsAction } from "../app/routes/news-data";
import { loader as marketLoader, action as marketAction } from "../app/routes/market-data";
import { testD1 } from "./helpers/d1";
vi.mock("@clerk/react-router/server", () => ({ getAuth: vi.fn() }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
function args(configured = true) {
  vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", configured ? "pk_test_example" : "");
  const context = new RouterContextProvider();
  context.set(cloudflareContext, {
    env: { DB: {} as D1Database, CLERK_SECRET_KEY: configured ? "sk_test_example" : "" },
    ctx: {} as ExecutionContext,
  });
  return {
    context,
    request: new Request("http://localhost/app"),
    url: new URL("http://localhost/app"),
    params: {},
    pattern: "/app",
  };
}
it("no abre datos privados si Clerk no está configurado", async () => {
  await expect(requireUser(args(false))).rejects.toMatchObject({ status: 503 });
  expect(getAuth).not.toHaveBeenCalled();
});
it("requiere sesión del servidor y no confía en el navegador", async () => {
  vi.mocked(getAuth).mockResolvedValue({ userId: null } as never);
  await expect(requireUser(args())).rejects.toMatchObject({ status: 302 });
});
it("utiliza el identificador verificado por Clerk", async () => {
  vi.mocked(getAuth).mockResolvedValue({ userId: "verified-user" } as never);
  expect(await requireUser(args())).toBe("verified-user");
});
it("la ruta de referencias para el formulario comprueba sesión antes de usar la base o el proveedor", async () => {
  vi.mocked(getAuth).mockResolvedValue({ userId: null } as never);
  const fetch = vi.spyOn(globalThis, "fetch");
  await expect(quoteLoader(args() as never)).rejects.toMatchObject({ status: 302 });
  expect(fetch).not.toHaveBeenCalled();
  fetch.mockRestore();
});
it("rechaza envíos desde otro origen", () => {
  expect(() =>
    requireSameOrigin(
      new Request("https://flujario.test/app", { headers: { Origin: "https://evil.test" } }),
    ),
  ).toThrow();
  expect(() => requireSameOrigin(new Request("https://flujario.test/app"))).toThrow();
  expect(() =>
    requireSameOrigin(
      new Request("https://flujario.test/app", { headers: { Origin: "https://flujario.test" } }),
    ),
  ).not.toThrow();
});
it("cada loader y action de noticias verifica sesión antes de consultar o escribir", async () => {
  vi.mocked(getAuth).mockResolvedValue({ userId: null } as never);
  await expect(newsLoader(args() as never)).rejects.toMatchObject({ status: 302 });
  await expect(newsAction(args() as never)).rejects.toMatchObject({ status: 302 });
});
it("cada loader y action de Mercados exige sesión antes de acceder a D1", async () => {
  vi.mocked(getAuth).mockResolvedValue({ userId: null } as never);
  await expect(marketLoader(args() as never)).rejects.toMatchObject({ status: 302 });
  await expect(marketAction(args() as never)).rejects.toMatchObject({ status: 302 });
});
it("Mercados ignora el dueño enviado por formulario y rechaza escrituras de otro origen", async () => {
  const store = testD1();
  try {
    const input = args();
    input.context.set(cloudflareContext, {
      env: { DB: store.binding, CLERK_SECRET_KEY: "sk_test_example" },
      ctx: {} as ExecutionContext,
    });
    vi.mocked(getAuth).mockResolvedValue({ userId: "verified-user" } as never);
    const request = (values: Record<string, string>, origin = "http://localhost") =>
      new Request("http://localhost/app/mercados/datos", {
        method: "POST",
        headers: { Origin: origin },
        body: new URLSearchParams(values),
      });
    input.request = request({ intent: "favorite", symbol: "AAPL", saved: "yes", userId: "otro" });
    expect(await marketAction(input as never)).toMatchObject({ ok: true });
    input.request = request({ intent: "market-index", indexId: "ndx", userId: "otro" });
    expect(await marketAction(input as never)).toMatchObject({ ok: true });
    expect(store.sqlite.prepare("SELECT user_id FROM stock_favorites").all()).toEqual([
      { user_id: "verified-user" },
    ]);
    expect(
      store.sqlite.prepare("SELECT user_id,index_id FROM user_market_preferences").all(),
    ).toEqual([{ user_id: "verified-user", index_id: "ndx" }]);
    expect(await marketLoader(input as never)).toMatchObject({
      selectedIndex: "ndx",
      favorites: ["AAPL"],
    });
    input.request = request(
      { intent: "favorite", symbol: "AAPL", saved: "no" },
      "https://evil.example",
    );
    await expect(marketAction(input as never)).rejects.toMatchObject({ status: 403 });
  } finally {
    store.sqlite.close();
  }
});
it("la preferencia de diario pertenece al usuario verificado, no al userId del formulario", async () => {
  const store = testD1();
  try {
    const input = args();
    input.context.set(cloudflareContext, {
      env: { DB: store.binding, CLERK_SECRET_KEY: "sk_test_example" },
      ctx: {} as ExecutionContext,
    });
    vi.mocked(getAuth).mockResolvedValue({ userId: "verified-user" } as never);
    input.request = new Request("http://localhost/app/noticias/datos", {
      method: "POST",
      headers: { Origin: "http://localhost" },
      body: new URLSearchParams({
        intent: "favorite-source",
        source: "iprofesional",
        saved: "yes",
        userId: "otro",
      }),
    });
    expect(await newsAction(input as never)).toMatchObject({ ok: true });
    expect(store.sqlite.prepare("SELECT user_id FROM favorite_news_sources").all()).toEqual([
      { user_id: "verified-user" },
    ]);
    input.request = new Request("http://localhost/app/noticias/datos", {
      method: "POST",
      headers: { Origin: "https://evil.example" },
      body: new URLSearchParams({ intent: "favorite-source", source: "iprofesional", saved: "no" }),
    });
    await expect(newsAction(input as never)).rejects.toMatchObject({ status: 403 });
  } finally {
    store.sqlite.close();
  }
});
it("limita el cuerpo incluso si no trae Content-Length", async () => {
  await expect(
    readBoundedForm(
      new Request("https://flujario.test/app", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "x=" + "a".repeat(16001),
      }),
    ),
  ).rejects.toMatchObject({ status: 413 });
});
it("conserva la decodificación del formulario recibido en varios fragmentos", async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode("titulo=caf%C3"));
      controller.enqueue(encoder.encode("%A9+con+leche&currency=ARS"));
      controller.close();
    },
  });
  const init = {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    duplex: "half" as const,
  };
  await expect(readBoundedForm(new Request("https://flujario.test/app", init))).resolves.toEqual({
    titulo: "café con leche",
    currency: "ARS",
  });
});
it("valida importes y descarta un userId enviado por el cliente", () => {
  const parsed = operationSchema.parse({
    intent: "entry",
    kind: "expense",
    currency: "ARS",
    amount: "0,01",
    description: "Compra",
    category: "Otros",
    date: "2026-11-13",
    requestKey: crypto.randomUUID(),
    userId: "other-user",
  });
  expect(parsed).not.toHaveProperty("userId");
  expect(operationSchema.safeParse({ ...parsed, amount: "0,001" }).success).toBe(false);
});
