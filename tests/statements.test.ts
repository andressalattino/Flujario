import { beforeEach, afterEach, it, expect } from "vitest";
import { testD1 } from "./helpers/d1";
import { createDb, performOperation, getSnapshot } from "../app/db/repository.server";
import { mutateStatements, readStatementState } from "../app/db/statements.server";
import {
  statementAnalysis,
  statementMutationSchema,
  type ImportMutation,
  type StatementRowInput,
} from "../app/domain/statements";
let store: ReturnType<typeof testD1>, db: ReturnType<typeof createDb>;
beforeEach(async () => {
  store = testD1();
  db = createDb(store.binding);
  for (const user of ["ana", "bea"])
    await performOperation(db, user, {
      intent: "setup",
      ars: 100000,
      usd: 5000,
      arsOpeningDate: "2026-11-01",
      usdOpeningDate: "2026-11-01",
    });
});
afterEach(() => store.sqlite.close());
function row(key = "1", amountMinor = 10000, date = "2026-11-15"): StatementRowInput {
  return {
    key,
    sourceRef: "Fila " + key,
    date,
    description: "Pago de tarjeta " + key,
    currency: "ARS",
    amountMinor,
    kind: "expense",
    category: "Otros",
    duplicateAcknowledged: false,
  };
}
function bank(rows = [row()]): ImportMutation {
  return {
    intent: "import",
    requestKey: crypto.randomUUID(),
    institution: "galicia",
    format: "csv",
    currency: "ARS",
    reviewed: true,
    rows,
  };
}
const state = (user = "ana") => readStatementState(db, user, "ARS", "2026-01-01", "2026-12-31");
async function expense() {
  await performOperation(db, "ana", {
    intent: "entry",
    requestKey: crypto.randomUUID(),
    kind: "expense",
    currency: "ARS",
    amount: 10000,
    description: "Pago tarjeta",
    category: "Otros",
    date: "2026-11-15",
  });
  return (await getSnapshot(db, "ana")).entries[0]!;
}
function card(id: string, total = 10000): ImportMutation {
  return {
    intent: "breakdown",
    requestKey: crypto.randomUUID(),
    institution: "galicia",
    format: "pdf-text",
    currency: "ARS",
    reviewed: true,
    target: { kind: "entry", id },
    rows: [
      { ...row("ropa", 3000), kind: "part", category: "Ropa" },
      { ...row("comida", 4000), kind: "part", category: "Alimentación" },
      { ...row("tax", total - 7000), kind: "part", category: "Impuestos" },
    ],
  };
}
it("importa el historial para análisis y desde el corte crea sólo los movimientos reales", async () => {
  await mutateStatements(
    db,
    "ana",
    bank([
      row("historico", 2000, "2026-10-31"),
      row("corte", 3000, "2026-11-01"),
      { ...row("ingreso", 5000), kind: "income" },
    ]),
  );
  const snapshot = await getSnapshot(db, "ana"),
    data = await state();
  expect(snapshot.entries).toHaveLength(2);
  expect(data.history).toHaveLength(1);
  const report = statementAnalysis(
    snapshot.entries.filter((e) => e.kind === "income" || e.kind === "expense") as never,
    data.history,
    data.breakdowns,
    "ARS",
    "2026-01-01",
    "2026-12-31",
    "month",
  );
  expect(report).toMatchObject({ income: 5000, expense: 5000, net: 0, count: 3 });
  const { accountBalance } = await import("../app/domain/finance");
  expect(
    accountBalance(
      snapshot.accounts.find((a) => a.currency === "ARS")!,
      snapshot.entries,
    ),
  ).toBe(102000);
  expect(snapshot.accounts.find((a) => a.currency === "USD")?.openingMinor).toBe(5000);
});
it("una transferencia propia de la misma moneda conserva evidencia sin tocar el saldo global", async () => {
  await mutateStatements(db, "ana", bank([{ ...row(), kind: "internal" }]));
  expect((await getSnapshot(db, "ana")).entries).toHaveLength(0);
  expect(store.sqlite.prepare("SELECT scope FROM statement_rows").get()).toEqual({
    scope: "internal",
  });
});
it("reintentos simultáneos producen un solo lote y un solo egreso", async () => {
  const input = bank();
  await Promise.all(Array.from({ length: 8 }, () => mutateStatements(db, "ana", input)));
  expect((await getSnapshot(db, "ana")).entries).toHaveLength(1);
  expect((await state()).batches).toHaveLength(1);
});
it("una clave reutilizada con otro contenido se rechaza sin modificar movimientos", async () => {
  const input = bank();
  await mutateStatements(db, "ana", input);
  await expect(
    mutateStatements(db, "ana", { ...input, rows: [row("1", 5000)] }),
  ).rejects.toMatchObject({ status: 409 });
  expect((await getSnapshot(db, "ana")).entries[0]?.amountMinor).toBe(10000);
});
it("avisa coincidencias con el historial existente y sólo conserva otra con confirmación explícita", async () => {
  await mutateStatements(db, "ana", bank());
  const second = bank();
  await expect(mutateStatements(db, "ana", second)).rejects.toMatchObject({
    status: 409,
    duplicateKeys: ["1"],
  });
  await mutateStatements(db, "ana", {
    ...second,
    rows: [{ ...row(), duplicateAcknowledged: true }],
  });
  expect((await getSnapshot(db, "ana")).entries).toHaveLength(2);
});
it("dos compras legítimas iguales dentro del archivo no se borran automáticamente", async () => {
  const input = bank([row("1"), row("2")]);
  await expect(mutateStatements(db, "ana", input)).rejects.toMatchObject({ status: 409 });
  await mutateStatements(db, "ana", {
    ...input,
    rows: input.rows.map((r) => ({ ...r, duplicateAcknowledged: true })),
  });
  expect((await getSnapshot(db, "ana")).entries).toHaveLength(2);
});
it("una carrera entre importaciones distintas exige revisar la coincidencia de la segunda", async () => {
  const results = await Promise.allSettled([
    mutateStatements(db, "ana", bank()),
    mutateStatements(db, "ana", bank()),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  expect((await getSnapshot(db, "ana")).entries).toHaveLength(1);
  expect((await state()).batches).toHaveLength(1);
});
it("un fallo de una fila revierte el lote entero, incluidos sus egresos", async () => {
  store.sqlite.exec(
    "CREATE TRIGGER qa_reject BEFORE INSERT ON statement_rows WHEN NEW.source_key='rechazar' BEGIN SELECT RAISE(ABORT,'qa');END;",
  );
  await expect(
    mutateStatements(db, "ana", bank([row("ok", 1000), row("rechazar", 2000)])),
  ).rejects.toThrow();
  expect((await getSnapshot(db, "ana")).entries).toHaveLength(0);
  expect((await state()).batches).toHaveLength(0);
});
it("los lotes son privados y no se puede desglosar un pago de otra persona", async () => {
  const entry = await expense();
  await mutateStatements(db, "ana", bank([row("hist", 1234, "2026-10-01")]));
  expect(await state("bea")).toEqual({ history: [], batches: [], breakdowns: [] });
  await expect(mutateStatements(db, "bea", card(entry.id))).rejects.toMatchObject({ status: 404 });
});
it("el pago de 100 se desglosa 30/40/30 y el saldo baja una sola vez", async () => {
  const entry = await expense(),
    before = await getSnapshot(db, "ana");
  await mutateStatements(db, "ana", card(entry.id));
  const data = await state(),
    after = await getSnapshot(db, "ana");
  expect(after.entries).toEqual(before.entries);
  expect(data.breakdowns[0]).toMatchObject({ ready: true, totalMinor: 10000, parentMinor: 10000 });
  const report = statementAnalysis(
    after.entries as never,
    data.history,
    data.breakdowns,
    "ARS",
    "2026-01-01",
    "2026-12-31",
    "quarter",
  );
  expect(report.expense).toBe(10000);
  expect(report.categories).toEqual([
    { category: "Alimentación", amountMinor: 4000 },
    { category: "Ropa", amountMinor: 3000 },
    { category: "Impuestos", amountMinor: 3000 },
  ]);
  expect(report.periods[0]).toMatchObject({ period: "2026 · T4", expense: 10000 });
});
it("120 de detalle sobre pago de 100 queda pendiente; una revisión vieja no pisa la nueva", async () => {
  const entry = await expense(),
    old = card(entry.id, 12000);
  await mutateStatements(db, "ana", old);
  let data = await state();
  expect(data.breakdowns[0]).toMatchObject({ ready: false, totalMinor: 12000, parentMinor: 10000 });
  expect(
    statementAnalysis(
      (await getSnapshot(db, "ana")).entries as never,
      [],
      data.breakdowns,
      "ARS",
      "2026-01-01",
      "2026-12-31",
      "year",
    ).categories,
  ).toEqual([{ category: "Otros", amountMinor: 10000 }]);
  await mutateStatements(db, "ana", card(entry.id));
  await mutateStatements(db, "ana", old);
  data = await state();
  expect(data.breakdowns[0]).toMatchObject({ ready: true, totalMinor: 10000 });
  expect(store.sqlite.prepare("SELECT count(*) AS n FROM breakdown_revisions").get()).toEqual({
    n: 2,
  });
  expect((await getSnapshot(db, "ana")).entries).toHaveLength(1);
});
it("también se puede desglosar un pago histórico sin descontar dinero", async () => {
  await mutateStatements(db, "ana", bank([row("old", 10000, "2026-10-02")]));
  const history = (await state()).history[0]!;
  await mutateStatements(db, "ana", {
    ...card("unused"),
    intent: "breakdown",
    target: { kind: "history", id: history.id },
  });
  const data = await state();
  expect(data.breakdowns[0]?.ready).toBe(true);
  expect((await getSnapshot(db, "ana")).entries).toHaveLength(0);
});
it("una devolución dentro del detalle reduce su categoría sin producir un ingreso nuevo", async () => {
  const entry = await expense(),
    input = card(entry.id);
  input.rows = [
    { ...row("gasto", 11000), kind: "part", category: "Ropa" },
    { ...row("devolucion", -1000), kind: "part", category: "Ropa" },
  ];
  await mutateStatements(db, "ana", input);
  expect((await state()).breakdowns[0]).toMatchObject({ ready: true, totalMinor: 10000 });
  expect((await getSnapshot(db, "ana")).entries).toHaveLength(1);
});
it("rechaza mezclas de monedas, fechas inválidas, claves duplicadas y consumos como movimientos", () => {
  const input = bank();
  expect(
    statementMutationSchema.safeParse({ ...input, rows: [{ ...row(), currency: "USD" }] }).success,
  ).toBe(false);
  expect(
    statementMutationSchema.safeParse({ ...input, rows: [row("1", 1000, "2026-02-29")] }).success,
  ).toBe(false);
  expect(statementMutationSchema.safeParse({ ...input, rows: [row(), row()] }).success).toBe(false);
  expect(
    statementMutationSchema.safeParse({ ...input, rows: [{ ...row(), kind: "part" }] }).success,
  ).toBe(false);
});
it("una cuenta sin fecha exige confirmarla, no la infiere ni cambia el importe inicial", async () => {
  await performOperation(db, "sinfecha", { intent: "setup", ars: 12345, usd: 0 });
  await expect(mutateStatements(db, "sinfecha", bank())).rejects.toMatchObject({ status: 409 });
  await mutateStatements(db, "sinfecha", {
    intent: "opening-date",
    currency: "ARS",
    date: "2026-11-01",
  });
  expect(
    (await getSnapshot(db, "sinfecha")).accounts.find((a) => a.currency === "ARS"),
  ).toMatchObject({ openingMinor: 12345, openingDate: "2026-11-01" });
});
it("la fecha no puede contradecir movimientos previos y queda fija al importar", async () => {
  await expense();
  await expect(
    mutateStatements(db, "ana", { intent: "opening-date", currency: "ARS", date: "2026-11-16" }),
  ).rejects.toMatchObject({ status: 409 });
  await mutateStatements(db, "ana", bank([row("hist", 1000, "2026-10-01")]));
  await expect(
    mutateStatements(db, "ana", { intent: "opening-date", currency: "ARS", date: "2026-10-01" }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    mutateStatements(db, "ana", { intent: "opening-date", currency: "ARS", date: "2026-11-01" }),
  ).resolves.toMatchObject({ ok: true });
});
it("una fecha que cambió durante la revisión no reclasifica silenciosamente el lote", async () => {
  let changed = false;
  const race = testD1({
    afterRead(sqlite, query) {
      if (!changed && query.startsWith("SELECT id,opening_date AS openingDate")) {
        changed = true;
        sqlite.exec(
          "UPDATE accounts SET opening_date='2026-11-02' WHERE user_id='ana' AND currency='ARS'",
        );
      }
    },
  });
  try {
    const other = createDb(race.binding);
    await performOperation(other, "ana", {
      intent: "setup",
      ars: 100000,
      usd: 0,
      arsOpeningDate: "2026-11-01",
    });
    await expect(
      mutateStatements(other, "ana", bank([row("cut", 1000, "2026-11-01")])),
    ).rejects.toMatchObject({ status: 409 });
    expect((await getSnapshot(other, "ana")).entries).toHaveLength(0);
  } finally {
    race.sqlite.close();
  }
});
it("los movimientos confirmados y sus revisiones no se pueden editar por UPDATE", async () => {
  const entry = await expense();
  await mutateStatements(db, "ana", card(entry.id));
  expect(() => store.sqlite.exec("UPDATE statement_rows SET amount_minor=1")).toThrow(/immutable/);
  expect(() => store.sqlite.exec("UPDATE breakdown_revisions SET entry_id=NULL")).toThrow(
    /immutable/,
  );
});
it("la base impide movimientos nuevos anteriores al corte incluso fuera del importador", async () => {
  await expect(
    performOperation(db, "ana", {
      intent: "entry",
      requestKey: crypto.randomUUID(),
      kind: "expense",
      currency: "ARS",
      amount: 1,
      description: "Anterior",
      category: "Otros",
      date: "2026-10-31",
    }),
  ).rejects.toThrow(/anterior/);
});
