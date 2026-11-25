import { it, expect, vi } from "vitest";
import sp from "./fixtures/wiki-sp100.json";
import ndx from "./fixtures/wiki-ndx.json";
import { parseWikiCatalog, catalogDue, type WikiCatalog } from "../app/domain/market-catalog";
import {
  fetchWikiCatalog,
  syncMarketCatalog,
  applyWikiCatalog,
} from "../app/services/market-catalog.server";
import { testD1 } from "./helpers/d1";
import { createDb, performOperation, getSnapshot } from "../app/db/repository.server";
import { readMarkets, mutateMarkets } from "../app/db/markets.server";
const now = new Date("2026-11-24T14:00:00Z");
const respond = vi.fn(async (url: string | URL | Request) =>
  Response.json(String(url).includes("S%26P_100") ? sp : ndx),
);
const request = respond as typeof fetch;
it("lee las dos tablas reales por API, mantiene clases y no toma tablas de historia", () => {
  const a = parseWikiCatalog(sp, "sp100", now),
    b = parseWikiCatalog(ndx, "ndx", now);
  expect(a.companies).toHaveLength(101);
  expect(b.companies).toHaveLength(101);
  expect(a.companies.find((c) => c.symbol === "BRK.B")?.name).toContain("Class B");
  expect(b.companies.some((c) => c.symbol === "GOOGL")).toBe(true);
  expect(b.companies.some((c) => c.symbol === "GOOG")).toBe(true);
  expect(a.sourceUrl).toContain(String(sp.latest.id));
  expect(() => parseWikiCatalog({ ...sp, source: sp.source + sp.source }, "sp100", now)).toThrow();
});
it("rechaza filas incompletas, símbolos duplicados, marcado y licencias o revisiones inválidas", () => {
  for (const broken of [
    { ...sp, source: sp.source.replace("| ABBV", "| AAPL") },
    { ...sp, source: sp.source.replace("| AAPL", "| https://evil.test") },
    { ...sp, source: sp.source.replace("[[Apple Inc.]]", "<script>evil</script>") },
    { ...sp, source: sp.source.slice(0, 200) },
    { ...sp, title: "Other" },
    { ...sp, license: { url: "https://example.com/" } },
    { ...sp, latest: { id: 1, timestamp: "2028-02-30T00:00:00Z" } },
    { ...sp, latest: { id: 1, timestamp: "2030-01-01T00:00:00Z" } },
  ])
    expect(() => parseWikiCatalog(broken, "sp100", now)).toThrow();
});
it("actualiza ambas listas, atribuye revisión y espera quince días transcurridos", async () => {
  const store = testD1();
  try {
    const db = createDb(store.binding);
    respond.mockClear();
    expect(await syncMarketCatalog(db, now, request)).toEqual({ sp100: "updated", ndx: "updated" });
    const first = await readMarkets(db, null);
    expect(first.indices.every((i) => i.verifiedAt === "2026-11-24")).toBe(true);
    expect(await syncMarketCatalog(db, new Date("2026-12-08T14:00:00Z"), request)).toEqual({
      sp100: "cached",
      ndx: "cached",
    });
    expect(respond).toHaveBeenCalledTimes(2);
    expect(await syncMarketCatalog(db, new Date("2026-12-09T14:00:00Z"), request)).toEqual({
      sp100: "updated",
      ndx: "updated",
    });
    const index = first.indices[0]!;
    expect(catalogDue({ ...index, verifiedAt: "2028-02-14" }, "2028-02-28")).toBe(false);
    expect(catalogDue({ ...index, verifiedAt: "2028-02-14" }, "2028-02-29")).toBe(true);
    expect(catalogDue({ ...index, verifiedAt: "2027-01-31" }, "2027-02-15")).toBe(true);
  } finally {
    store.sqlite.close();
  }
});
it("retiene favoritas, identidades y datos financieros cuando una empresa sale; la lectura pública no filtra dueños", async () => {
  const store = testD1();
  try {
    const db = createDb(store.binding);
    await performOperation(db, "ana", { intent: "setup", ars: 12345, usd: 678 });
    await mutateMarkets(db, "ana", { intent: "favorite", symbol: "AAPL", saved: "yes" });
    const before = await getSnapshot(db, "ana");
    for (const id of ["sp100", "ndx"] as const) {
      const old = (await readMarkets(db, "ana")).indices.find((i) => i.id === id)!;
      const parsed = parseWikiCatalog(id === "sp100" ? sp : ndx, id, now);
      const changed: WikiCatalog = {
        ...parsed,
        revisionDate: "2026-11-24",
        companies: parsed.companies
          .filter((c) => c.symbol !== "AAPL")
          .concat({ symbol: "NEWX", name: "Nueva empresa de prueba" }),
      };
      expect(await applyWikiCatalog(db, old, changed, "2026-11-24")).toBe("updated");
    }
    const after = await readMarkets(db, "ana");
    expect(after.favorites).toEqual(["AAPL"]);
    expect(after.members.some((m) => m.companyId === "AAPL")).toBe(false);
    expect(after.companies.find((c) => c.id === "AAPL")?.tradingviewSymbol).toBe("NASDAQ:AAPL");
    expect(after.companies.find((c) => c.id === "NEWX")).toMatchObject({
      exchange: null,
      tradingviewSymbol: null,
    });
    const publicView = await readMarkets(db, null);
    expect(publicView.favorites).toEqual([]);
    const final = await getSnapshot(db, "ana");
    expect(final.accounts).toEqual(before.accounts);
    expect(final.entries).toEqual(before.entries);
  } finally {
    store.sqlite.close();
  }
});
it("dos guardados simultáneos no pisan la versión ganadora; aborta cambios inesperados y hace rollback", async () => {
  const store = testD1();
  try {
    const db = createDb(store.binding),
      old = (await readMarkets(db, null)).indices.find((i) => i.id === "sp100")!;
    const parsed = parseWikiCatalog(sp, "sp100", now);
    expect(
      await Promise.all([
        applyWikiCatalog(db, old, parsed, "2026-11-24"),
        applyWikiCatalog(db, old, parsed, "2026-11-24"),
      ]),
    ).toEqual(["updated", "superseded"]);
    const current = (await readMarkets(db, null)).indices.find((i) => i.id === "sp100")!;
    const large = {
      ...parsed,
      companies: parsed.companies
        .slice(11)
        .concat(Array.from({ length: 11 }, (_, i) => ({ symbol: `NEW${i}`, name: `Prueba ${i}` }))),
    };
    await expect(applyWikiCatalog(db, current, large, "2026-12-09")).rejects.toThrow(
      "Cambios inesperados",
    );
    const before = await readMarkets(db, null);
    store.sqlite.exec(
      "CREATE TRIGGER reject_catalog BEFORE INSERT ON stock_index_members BEGIN SELECT RAISE(ABORT,'test rollback'); END;",
    );
    await expect(applyWikiCatalog(db, current, parsed, "2026-12-09")).rejects.toThrow();
    expect(await readMarkets(db, null)).toEqual(before);
  } finally {
    store.sqlite.close();
  }
});
it("un fallo mantiene fecha/catálogo y vuelve a intentar al día siguiente; rechaza redirecciones y cuerpos excesivos", async () => {
  const store = testD1();
  try {
    const db = createDb(store.binding),
      before = await readMarkets(db, null);
    const fail = vi.fn(async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    expect(await syncMarketCatalog(db, now, fail)).toEqual({
      sp100: "error-kept-previous",
      ndx: "error-kept-previous",
    });
    expect(await readMarkets(db, null)).toEqual(before);
    expect(await syncMarketCatalog(db, new Date("2026-11-25T14:00:00Z"), request)).toEqual({
      sp100: "updated",
      ndx: "updated",
    });
    await expect(
      fetchWikiCatalog(
        "sp100",
        now,
        (async () =>
          new Response("{}", {
            status: 302,
            headers: { "Content-Type": "application/json" },
          })) as typeof fetch,
      ),
    ).rejects.toThrow();
    await expect(
      fetchWikiCatalog(
        "sp100",
        now,
        (async () =>
          new Response("x".repeat(270000), {
            headers: { "Content-Type": "application/json" },
          })) as typeof fetch,
      ),
    ).rejects.toThrow();
  } finally {
    store.sqlite.close();
  }
});
