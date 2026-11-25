import { vi, it, expect, afterEach } from "vitest";
import { RouterContextProvider } from "react-router";
import { getAuth } from "@clerk/react-router/server";
import { cloudflareContext } from "../app/context";
import { loader, action } from "../app/routes/statement-data";
import { readBoundedJson } from "../app/lib/json.server";
import { createDb, performOperation } from "../app/db/repository.server";
import { testD1 } from "./helpers/d1";
vi.mock("@clerk/react-router/server", () => ({ getAuth: vi.fn() }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
function args(binding = {} as D1Database, body?: unknown, origin = "http://localhost") {
  vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_example");
  const context = new RouterContextProvider();
  context.set(cloudflareContext, {
    env: { DB: binding, CLERK_SECRET_KEY: "sk_test_example" },
    ctx: {} as ExecutionContext,
  });
  return {
    context,
    request: body
      ? new Request("http://localhost/app/importaciones/datos", {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      : new Request("http://localhost/app/importaciones/datos"),
    params: {},
    pattern: "/app/importaciones/datos",
  };
}
it("cada lectura y escritura exige sesión antes de acceder a D1", async () => {
  vi.mocked(getAuth).mockResolvedValue({ userId: null } as never);
  await expect(loader(args() as never)).rejects.toMatchObject({ status: 302 });
  await expect(action(args() as never)).rejects.toMatchObject({ status: 302 });
});
it("la action verifica origen y asigna las filas sólo al dueño de Clerk", async () => {
  const store = testD1();
  try {
    const db = createDb(store.binding);
    await performOperation(db, "ana", {
      intent: "setup",
      ars: 0,
      usd: 0,
      arsOpeningDate: "2026-11-01",
      usdOpeningDate: "2026-11-01",
    });
    vi.mocked(getAuth).mockResolvedValue({ userId: "ana" } as never);
    const input = {
      intent: "import",
      requestKey: crypto.randomUUID(),
      institution: "nacion",
      format: "csv",
      currency: "ARS",
      reviewed: true,
      userId: "bea",
      originalFile: "no guardar",
      rows: [
        {
          key: "r1",
          date: "2026-11-15",
          description: "Compra de prueba",
          amountMinor: 100,
          currency: "ARS",
          kind: "expense",
          category: "Otros",
          userId: "bea",
        },
      ],
    };
    await expect(
      action(args(store.binding, input, "https://evil.test") as never),
    ).rejects.toMatchObject({ status: 403 });
    expect(await action(args(store.binding, input) as never)).toMatchObject({ ok: true });
    expect(store.sqlite.prepare("SELECT user_id FROM statement_rows").all()).toEqual([
      { user_id: "ana" },
    ]);
    vi.mocked(getAuth).mockResolvedValue({ userId: "bea" } as never);
    expect(await loader(args(store.binding) as never)).toEqual({
      history: [],
      batches: [],
      breakdowns: [],
    });
  } finally {
    store.sqlite.close();
  }
});
it("no recibe originales ni formatos de cuerpo distintos de JSON", async () => {
  for (const type of ["multipart/form-data", "application/pdf", "text/application/json"])
    await expect(
      readBoundedJson(
        new Request("http://localhost/x", {
          method: "POST",
          headers: { "Content-Type": type },
          body: "x",
        }),
      ),
    ).rejects.toMatchObject({ status: 415 });
  await expect(
    readBoundedJson(
      new Request("http://localhost/x", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "no json",
      }),
    ),
  ).rejects.toMatchObject({ status: 400 });
});
it("limita el JSON incluso sin Content-Length", async () => {
  await expect(
    readBoundedJson(
      new Request("http://localhost/x", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '"' + "a".repeat(513 * 1024) + '"',
      }),
    ),
  ).rejects.toMatchObject({ status: 413 });
});
