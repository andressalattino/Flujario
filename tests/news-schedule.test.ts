import { afterEach, expect, it, vi } from "vitest";
import worker from "../workers/app";
import { syncNews, publishWeeklyNews } from "../app/services/news-sync.server";
import { extendPaymentOccurrences } from "../app/db/repository.server";
import { refreshQuoteCache } from "../app/services/quotes.server";
import { newsSourcesForEnvironment } from "../app/data/news-sources";
vi.mock("../app/services/news-sync.server", () => ({
  syncNews: vi.fn(async () => []),
  publishWeeklyNews: vi.fn(async () => ({ status: "pending" })),
}));
vi.mock("../app/db/repository.server", () => ({
  createDb: () => ({}),
  extendPaymentOccurrences: vi.fn(async () => {}),
}));
vi.mock("../app/services/quotes.server", () => ({
  refreshQuoteCache: vi.fn(async () => ({ status: "cached" })),
}));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
async function run(cron: string) {
  const pending: Promise<unknown>[] = [];
  await worker.scheduled(
    { cron, scheduledTime: Date.parse("2026-11-16T13:00:00Z") } as ScheduledController,
    { DB: {} as D1Database },
    { waitUntil: (value: Promise<unknown>) => pending.push(value) } as unknown as ExecutionContext,
  );
  await Promise.all(pending);
}
it("el cron de 30 minutos sincroniza noticias y no modifica pagos", async () => {
  vi.stubEnv("DEV", false);
  await run("*/30 * * * *");
  expect(syncNews).toHaveBeenCalledWith(
    {},
    new Date("2026-11-16T13:00:00Z"),
    fetch,
    newsSourcesForEnvironment(false),
  );
  expect(extendPaymentOccurrences).not.toHaveBeenCalled();
  expect(publishWeeklyNews).not.toHaveBeenCalled();
});
it("en desarrollo usa el lector local sin dar permisos de publicación", async () => {
  vi.stubEnv("DEV", true);
  await run("*/30 * * * *");
  expect(syncNews).toHaveBeenCalledWith(
    {},
    new Date("2026-11-16T13:00:00Z"),
    fetch,
    newsSourcesForEnvironment(true),
  );
  expect(publishWeeklyNews).toHaveBeenCalledWith(
    {},
    new Date("2026-11-16T13:00:00Z"),
    newsSourcesForEnvironment(true),
  );
  expect(newsSourcesForEnvironment(false).every((source) => source.publication === "pending")).toBe(
    true,
  );
});
it("el lunes publica la semana después de sincronizar", async () => {
  await run("0 13 * * MON");
  expect(syncNews).toHaveBeenCalledTimes(1);
  expect(publishWeeklyNews).toHaveBeenCalledTimes(1);
  expect(vi.mocked(syncNews).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(publishWeeklyNews).mock.invocationCallOrder[0]!,
  );
});
it("la extensión diaria de vencimientos conserva su horario", async () => {
  await run("0 13 * * *");
  expect(extendPaymentOccurrences).toHaveBeenCalledTimes(1);
  expect(syncNews).not.toHaveBeenCalled();
});
it("las divisas mantienen su cron propio", async () => {
  await run("0 */3 * * *");
  expect(refreshQuoteCache).toHaveBeenCalledTimes(1);
  expect(syncNews).not.toHaveBeenCalled();
});
it("un cron desconocido no ejecuta operaciones financieras", async () => {
  await run("unknown");
  expect(extendPaymentOccurrences).not.toHaveBeenCalled();
  expect(syncNews).not.toHaveBeenCalled();
});
