import { afterEach, beforeEach, expect, it } from "vitest";
import { testD1 } from "./helpers/d1";
import { createDb, getSnapshot, performOperation } from "../app/db/repository.server";
import { MarketError, mutateMarkets, readMarkets } from "../app/db/markets.server";
import { marketPreview } from "../app/data/market-preview";
import { operationSchema } from "../app/domain/validation";
import {
  STOCK_FAVORITES_LIMIT_MESSAGE,
  chartConfiguration,
  marketMutationSchema,
  selectIndexCompanies,
  tradingviewUrl,
} from "../app/domain/markets";
let store: ReturnType<typeof testD1>;
let db: ReturnType<typeof createDb>;
beforeEach(() => {
  store = testD1();
  db = createDb(store.binding);
});
afterEach(() => store.sqlite.close());
const save = (symbol: string, user = "ana") =>
  mutateMarkets(db, user, { intent: "favorite", symbol, saved: "yes" });
const remove = (symbol: string, user = "ana") =>
  mutateMarkets(db, user, { intent: "favorite", symbol, saved: "no" });

it("la composición D1 coincide con el catálogo público fechado y comparte instrumentos", async () => {
  const data = await readMarkets(db, "ana");
  const preview = marketPreview([]);
  expect(data.companies).toEqual(preview.companies);
  expect(data.indices.toSorted((a, b) => a.id.localeCompare(b.id))).toEqual(
    preview.indices.toSorted((a, b) => a.id.localeCompare(b.id)),
  );
  expect(new Set(data.members.map((m) => `${m.indexId}:${m.companyId}`))).toEqual(
    new Set(preview.members.map((m) => `${m.indexId}:${m.companyId}`)),
  );
  expect(data.companies).toHaveLength(167);
  const sp = selectIndexCompanies(data, "sp100", "", false);
  const ndx = selectIndexCompanies(data, "ndx", "", false);
  expect(sp).toHaveLength(101);
  expect(ndx).toHaveLength(101);
  expect(sp.filter((c) => ndx.some((n) => n.id === c.id))).toHaveLength(35);
  expect(ndx.map((c) => c.symbol)).toContain("MRNA");
  expect(ndx.map((c) => c.symbol)).not.toContain("WBD");
  expect(ndx.map((c) => c.symbol)).not.toContain("KHC");
  expect(data.companies.find((c) => c.symbol === "WMT")?.tradingviewSymbol).toBe("NASDAQ:WMT");
  expect(data.companies.find((c) => c.symbol === "BRK.B")?.tradingviewSymbol).toBe("NYSE:BRK.B");
  expect(
    data.indices.every((i) => i.compositionDate === "2026-11-18" && i.verifiedAt === "2026-11-19"),
  ).toBe(true);
});
it("dos índices y reintentos simultáneos comparten una única favorita", async () => {
  await Promise.all(Array.from({ length: 12 }, () => save("AAPL")));
  await mutateMarkets(db, "ana", { intent: "market-index", indexId: "ndx" });
  await save("AAPL");
  const data = await readMarkets(db, "ana");
  expect(data.favorites).toEqual(["AAPL"]);
  expect(selectIndexCompanies(data, "sp100", "", true).map((c) => c.id)).toEqual(["AAPL"]);
  expect(selectIndexCompanies(data, "ndx", "", true).map((c) => c.id)).toEqual(["AAPL"]);
});
it("solicitudes distintas simultáneas no superan cinco y la sexta informa el motivo exacto", async () => {
  const symbols = (await readMarkets(db, "ana")).companies.slice(0, 20).map((c) => c.symbol);
  const attempts = await Promise.allSettled(symbols.map((s) => save(s)));
  expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(5);
  for (const result of attempts)
    if (result.status === "rejected")
      expect(result.reason).toMatchObject({ message: STOCK_FAVORITES_LIMIT_MESSAGE, status: 409 });
  const favorites = (await readMarkets(db, "ana")).favorites;
  expect(favorites).toHaveLength(5);
  await expect(save(favorites[0]!)).resolves.toBeUndefined();
  await remove(favorites[0]!);
  const next = symbols.find((s) => !favorites.includes(s))!;
  await save(next);
  expect((await readMarkets(db, "ana")).favorites).toHaveLength(5);
});
it("las favoritas y la preferencia pertenecen sólo a su dueño y no cambian los saldos", async () => {
  await performOperation(db, "ana", { intent: "setup", ars: 12345, usd: 678 });
  const before = await getSnapshot(db, "ana");
  await save("AAPL");
  await save("MELI", "bea");
  await mutateMarkets(db, "ana", { intent: "market-index", indexId: "ndx" });
  await remove("AAPL", "bea");
  expect(await readMarkets(db, "ana")).toMatchObject({ selectedIndex: "ndx", favorites: ["AAPL"] });
  expect(await readMarkets(db, "bea")).toMatchObject({
    selectedIndex: "sp100",
    favorites: ["MELI"],
  });
  // Otra instancia del repositorio lee la persistencia, sin estado React ni cookies.
  expect(await readMarkets(createDb(store.binding), "ana")).toMatchObject({
    selectedIndex: "ndx",
    favorites: ["AAPL"],
  });
  const after = await getSnapshot(db, "ana");
  expect(after.favorites).toEqual(["AAPL"]);
  expect(after.accounts).toEqual(before.accounts);
  expect(after.entries).toEqual(before.entries);
});
it("la action financiera anterior tampoco permite eludir el máximo", async () => {
  for (const s of ["AAPL", "MSFT", "MELI", "KO", "AMZN"]) await save(s);
  await expect(
    performOperation(db, "ana", { intent: "favorite", symbol: "NVDA", saved: "yes" }),
  ).rejects.toMatchObject({ status: 409, message: STOCK_FAVORITES_LIMIT_MESSAGE });
});
it("rechaza símbolos inexistentes y nuevas favoritas ajenas a los índices", async () => {
  await expect(save("NOEXISTE")).rejects.toBeInstanceOf(MarketError);
  store.sqlite.exec("INSERT INTO stock_companies(id,symbol,name) VALUES('OLD','OLD','Anterior')");
  await expect(save("OLD")).rejects.toMatchObject({ status: 404 });
});
it("D1 tiene claves únicas, referencias y una identidad de favorita inmutable", async () => {
  await save("AAPL");
  expect(() =>
    store.sqlite.exec("UPDATE stock_favorites SET user_id='bea' WHERE user_id='ana'"),
  ).toThrow(/stock_favorite_identity/);
  expect(() =>
    store.sqlite.exec("INSERT INTO stock_favorites VALUES('bea','NOEXISTE','2026-11-19')"),
  ).toThrow();
  expect(() =>
    store.sqlite.exec(
      "INSERT INTO stock_companies(id,symbol,name,exchange) VALUES('INVALID','INVALID','Inválida','NYSE')",
    ),
  ).toThrow(/stock_company_chart/);
  expect(() =>
    store.sqlite.exec("INSERT INTO user_market_preferences VALUES('bea','mundial','2026-11-19')"),
  ).toThrow();
});
it("migra favoritas anteriores sin borrarlas, incluso símbolos fuera del catálogo", async () => {
  const legacy = testD1({
    beforeMigration(sqlite, name) {
      if (name === "0006_stock_markets.sql")
        sqlite.exec(
          "INSERT INTO favorites VALUES('a','ana','AAPL'),('b','ana','ANTERIOR'),('c','bea','AAPL')",
        );
    },
  });
  try {
    const migrated = createDb(legacy.binding);
    expect((await readMarkets(migrated, "ana")).favorites).toEqual(["AAPL", "ANTERIOR"]);
    expect(legacy.sqlite.prepare("SELECT count(*) AS n FROM favorites").get()).toEqual({ n: 3 });
    await mutateMarkets(migrated, "ana", { intent: "favorite", symbol: "ANTERIOR", saved: "yes" });
    await mutateMarkets(migrated, "ana", { intent: "favorite", symbol: "ANTERIOR", saved: "no" });
    expect((await readMarkets(migrated, "ana")).favorites).toEqual(["AAPL"]);
    expect((await readMarkets(migrated, "bea")).favorites).toEqual(["AAPL"]);
  } finally {
    legacy.sqlite.close();
  }
});
it("si una base anterior supera cinco se frena la migración sin recortar favoritas", () => {
  expect(() =>
    testD1({
      beforeMigration(sqlite, name) {
        if (name === "0006_stock_markets.sql")
          sqlite.exec(
            "INSERT INTO favorites VALUES('a','ana','AAPL'),('b','ana','MSFT'),('c','ana','MELI'),('d','ana','KO'),('e','ana','AMZN'),('f','ana','NVDA')",
          );
      },
    }),
  ).toThrow(/stock_favorites_limit/);
});
it("busca nombre y símbolo sin depender de puntuación; ordena y limita al índice", () => {
  const data = marketPreview(["MELI", "AAPL"]);
  expect(selectIndexCompanies(data, "sp100", "brk b", false).map((c) => c.symbol)).toEqual([
    "BRK.B",
  ]);
  expect(selectIndexCompanies(data, "sp100", "coca cola", false).map((c) => c.symbol)).toEqual([
    "KO",
  ]);
  expect(selectIndexCompanies(data, "sp100", "MELI", false)).toEqual([]);
  expect(
    selectIndexCompanies(data, "ndx", "", true)
      .map((c) => c.symbol)
      .toSorted(),
  ).toEqual(["AAPL", "MELI"]);
  expect(selectIndexCompanies(data, "ndx", "", false, true)).toEqual(
    selectIndexCompanies(data, "ndx", "", false).toReversed(),
  );
});
it("el widget sólo recibe un símbolo verificado y su configuración pública", () => {
  expect(chartConfiguration("NYSE:BRK.B", "dark")).toMatchObject({
    symbol: "NYSE:BRK.B",
    theme: "dark",
    interval: "D",
    allow_symbol_change: false,
  });
  expect(chartConfiguration("NASDAQ:AAPL", "light").theme).toBe("light");
  expect(() => chartConfiguration("javascript:alert(1)", "dark")).toThrow();
  expect(tradingviewUrl({ tradingviewSymbol: null })).toBeNull();
  expect(tradingviewUrl({ tradingviewSymbol: "NYSE:BRK.B" })).toBe(
    "https://www.tradingview.com/chart/?symbol=NYSE%3ABRK.B",
  );
  expect(
    marketMutationSchema.parse({
      intent: "favorite",
      symbol: " aapl ",
      saved: "yes",
      userId: "otro",
    }),
  ).toEqual({ intent: "favorite", symbol: "AAPL", saved: "yes" });
});
it("cada ruta conserva su longitud máxima para símbolos de favoritas", () => {
  const favorite = { intent: "favorite", saved: "yes" };
  const market = (symbol: string) => marketMutationSchema.safeParse({ ...favorite, symbol });
  const workspace = (symbol: string) => operationSchema.safeParse({ ...favorite, symbol });
  expect(workspace("a".repeat(20)).success).toBe(true);
  expect(workspace("a".repeat(21)).success).toBe(false);
  expect(market("a".repeat(32)).success).toBe(true);
  expect(market("a".repeat(33)).success).toBe(false);
  expect(market("AA/BB").success).toBe(false);
  expect(workspace("AA/BB").success).toBe(false);
});
