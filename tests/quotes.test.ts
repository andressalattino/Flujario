import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { testD1 } from "./helpers/d1";
import { createDb, getSnapshot, performOperation } from "../app/db/repository.server";
import { getQuoteSnapshot } from "../app/db/quotes.server";
import {
  refreshQuoteCache,
  parseQuoteFeed,
  QUOTE_INTERVAL_MS,
} from "../app/services/quotes.server";
import { quoteSide } from "../app/domain/quotes";
import { summarize } from "../app/domain/finance";

let store: ReturnType<typeof testD1>;
let db: ReturnType<typeof createDb>;
const stamp = "2026-11-17T14:00:00.000Z";
// Datos ficticios exclusivos de pruebas: nunca se publican como cotizaciones.
const dollars = ["oficial", "bolsa", "blue"].map((casa) => ({
  moneda: "USD",
  casa,
  compra: 1490.125,
  venta: 1500.12345678,
  fechaActualizacion: stamp,
}));
const others = ["EUR", "BRL", "CLP", "UYU"].map((moneda) => ({
  moneda,
  casa: "oficial",
  compra: 10.1,
  venta: 10.2,
  fechaActualizacion: stamp,
}));
const mockSource = () =>
  vi.fn<typeof fetch>(
    async (url) =>
      new Response(JSON.stringify(String(url).endsWith("/dolares") ? dollars : others), {
        headers: { "Content-Type": "application/json" },
      }),
  );
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-17T15:00:00.000Z"));
  store = testD1();
  db = createDb(store.binding);
});
afterEach(() => {
  store.sqlite.close();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("guarda tasas exactas, fuente temporal y ambos lados del precio sin datos personales", async () => {
  const source = mockSource();
  expect(await refreshQuoteCache(db, new Date(), source)).toEqual({ status: "ok" });
  const { quotes, quoteState } = await getQuoteSnapshot(db);
  expect(quotes).toHaveLength(7);
  const usd = quotes.find((q) => q.series === "usd-oficial")!;
  expect(usd).toMatchObject({ buyRate: "1490.125", sellRate: "1500.12345678", sourceAsOf: stamp });
  expect(quoteSide(usd, "ARS")).toBe(usd.sellRate);
  expect(quoteSide(usd, "USD")).toBe(usd.buyRate);
  expect(quoteState).toMatchObject({ status: "ok", nextAttemptAt: "2026-11-17T18:00:00.000Z" });
  for (const [url, options] of source.mock.calls) {
    expect(url).toMatch(/^https:\/\/dolarapi.com\/v1\/(dolares|cotizaciones)$/);
    expect(options).toMatchObject({ redirect: "manual", headers: { Accept: "application/json" } });
    expect(options).not.toHaveProperty("body");
  }
});
it("rechaza redirecciones incluso si el cuerpo contiene precios válidos", async () => {
  await refreshQuoteCache(db, new Date(), mockSource());
  const before = await getQuoteSnapshot(db);
  vi.setSystemTime(new Date(Date.now() + QUOTE_INTERVAL_MS));
  const source = vi.fn<typeof fetch>(
    async (url) =>
      new Response(JSON.stringify(String(url).endsWith("/dolares") ? dollars : others), {
        status: 302,
        headers: { Location: "https://otro-proveedor.test" },
      }),
  );
  expect(await refreshQuoteCache(db, new Date(), source)).toEqual({ status: "error" });
  expect((await getQuoteSnapshot(db)).quotes).toEqual(before.quotes);
  expect(source).toHaveBeenCalledTimes(2);
});
it("varios lectores comparten una consulta por feed durante tres horas", async () => {
  const source = mockSource();
  await Promise.all([
    refreshQuoteCache(db, new Date(), source),
    refreshQuoteCache(db, new Date(), source),
  ]);
  await refreshQuoteCache(db, new Date(), source);
  expect(source).toHaveBeenCalledTimes(2);
  vi.setSystemTime(new Date(Date.now() + QUOTE_INTERVAL_MS));
  await refreshQuoteCache(db, new Date(), source);
  expect(source).toHaveBeenCalledTimes(4);
  expect((await getQuoteSnapshot(db)).quotes).toHaveLength(7);
  expect(store.sqlite.prepare("SELECT count(*) AS n FROM exchange_quotes").get()).toMatchObject({
    n: 7,
  });
});
it("si una fuente falla conserva sus referencias y permite actualizar las otras", async () => {
  await refreshQuoteCache(db, new Date(), mockSource());
  const before = await getQuoteSnapshot(db);
  vi.setSystemTime(new Date(Date.now() + QUOTE_INTERVAL_MS));
  const source = vi.fn<typeof fetch>(async (url) => {
    if (String(url).endsWith("/dolares")) throw new Error("sin red");
    return new Response(JSON.stringify(others));
  });
  expect(await refreshQuoteCache(db, new Date(), source)).toEqual({ status: "partial" });
  const after = await getQuoteSnapshot(db);
  expect(after.quotes.find((q) => q.series === "usd-oficial")).toEqual(
    before.quotes.find((q) => q.series === "usd-oficial"),
  );
  expect(after.quotes).toHaveLength(7);
});
it.each(["{", "[]", "x".repeat(70000)])(
  "una respuesta vacía, inválida o excesiva no borra datos anteriores",
  async (body) => {
    await refreshQuoteCache(db, new Date(), mockSource());
    const before = await getQuoteSnapshot(db);
    vi.setSystemTime(new Date(Date.now() + QUOTE_INTERVAL_MS));
    const source = vi.fn<typeof fetch>(async () => new Response(body));
    expect(await refreshQuoteCache(db, new Date(), source)).toEqual({ status: "error" });
    expect((await getQuoteSnapshot(db)).quotes).toEqual(before.quotes);
  },
);
it("rechaza precios futuros, cero, invertidos, excesivamente precisos y series duplicadas", () => {
  for (const patch of [
    { compra: 0 },
    { venta: -1 },
    { compra: 10000, venta: 100 },
    { venta: "1500.123456789" },
    { fechaActualizacion: "2026-11-18T14:00:00Z" },
  ]) {
    const rows = [{ ...dollars[0], ...patch }, ...dollars.slice(1)];
    expect(
      parseQuoteFeed(JSON.stringify(rows), "dollars", new Date()).map((q) => q.series),
    ).not.toContain("usd-oficial");
  }
  expect(
    parseQuoteFeed(JSON.stringify([...dollars, dollars[0]]), "dollars", new Date()).map(
      (q) => q.series,
    ),
  ).not.toContain("usd-oficial");
});
it("una respuesta anterior no reemplaza una referencia más reciente", async () => {
  await refreshQuoteCache(db, new Date(), mockSource());
  const before = await getQuoteSnapshot(db);
  vi.setSystemTime(new Date(Date.now() + QUOTE_INTERVAL_MS));
  const old = vi.fn<typeof fetch>(
    async (url) =>
      new Response(
        JSON.stringify(
          (String(url).endsWith("/dolares") ? dollars : others).map((row) => ({
            ...row,
            fechaActualizacion: "2026-11-16T14:00:00Z",
          })),
        ),
      ),
  );
  await refreshQuoteCache(db, new Date(), old);
  expect((await getQuoteSnapshot(db)).quotes).toEqual(before.quotes);
});
it("una nueva cotización conserva la usada en el registro y nunca recalcula saldos pasados", async () => {
  await performOperation(db, "ana", { intent: "setup", ars: 20000000, usd: 0 });
  await refreshQuoteCache(db, new Date(), mockSource());
  const quote = (await getQuoteSnapshot(db)).quotes.find((q) => q.series === "usd-oficial")!;
  const operation = {
    intent: "exchange" as const,
    currency: "ARS" as const,
    targetCurrency: "USD" as const,
    amount: 15000000,
    targetAmount: 10000,
    rate: "1500",
    quoteId: quote.id,
    date: "2026-11-17",
    requestKey: crypto.randomUUID(),
  };
  await performOperation(db, "ana", operation);
  vi.setSystemTime(new Date(Date.now() + QUOTE_INTERVAL_MS));
  const source = vi.fn<typeof fetch>(
    async (url) =>
      new Response(
        JSON.stringify(
          (String(url).endsWith("/dolares") ? dollars : others).map((row) => ({
            ...row,
            compra: 1600,
            venta: 1700,
            fechaActualizacion: "2026-11-17T17:00:00Z",
          })),
        ),
      ),
  );
  await refreshQuoteCache(db, new Date(), source);
  const snapshot = await getSnapshot(db, "ana");
  expect(snapshot.entries[0]).toMatchObject({
    exchangeQuoteId: quote.id,
    exchangeRate: "1500",
    amountMinor: 15000000,
    targetAmountMinor: 10000,
  });
  expect(summarize(snapshot, "ARS").balance).toBe(5000000);
  expect(summarize(snapshot, "USD").balance).toBe(10000);
  expect(
    store.sqlite.prepare("SELECT sell_rate FROM exchange_quotes WHERE id=?").get(quote.id),
  ).toMatchObject({ sell_rate: "1500.12345678" });
  await expect(
    performOperation(db, "ana", {
      ...operation,
      requestKey: crypto.randomUUID(),
      date: "2026-11-16",
    }),
  ).rejects.toThrow();
});
