import type { createDb } from "./repository.server";
import { payloadHash } from "./repository.server";
import { today, isISODate } from "../domain/dates";
import {
  statementMutationSchema,
  duplicateStatementKeys,
  breakdownTotal,
  type StatementMutation,
  type StatementState,
  type StoredStatementRow,
  type StatementRowInput,
  type ImportMutation,
  type StatementTarget,
  type ExpenseBreakdown,
  type StatementBatch,
  type AnalysisLine,
} from "../domain/statements";
import type { Currency } from "../domain/money";
import { calculateStatistics, type StatisticsPageData } from "../domain/statistics";
type Db = ReturnType<typeof createDb>;
export class StatementError extends Error {
  constructor(
    message: string,
    public status = 400,
    public duplicateKeys: string[] = [],
  ) {
    super(message);
  }
}
const columns =
  "r.id,r.import_id AS importId,r.source_key AS key,r.source_ref AS sourceRef,r.date,r.description,r.currency,r.amount_minor AS amountMinor,r.kind,r.category,r.scope,r.entry_id AS entryId,r.duplicate_acknowledged AS duplicateAcknowledged";
async function all<T>(db: Db, query: string, values: unknown[] = []) {
  return (
    await db.$client
      .prepare(query)
      .bind(...values)
      .all<T>()
  ).results;
}
function errorChain(error: unknown) {
  let text = "",
    current = error;
  for (let i = 0; i < 6 && current instanceof Error; i++, current = current.cause)
    text += " " + current.message;
  return text;
}
async function parentFor(db: Db, userId: string, target: StatementTarget, currency: Currency) {
  const rows =
    target.kind === "entry"
      ? await all<{ amountMinor: number }>(
          db,
          "SELECT amount_cents AS amountMinor FROM entries WHERE id=? AND user_id=? AND currency=? AND kind='expense'",
          [target.id, userId, currency],
        )
      : await all<{ amountMinor: number }>(
          db,
          "SELECT amount_minor AS amountMinor FROM statement_rows WHERE id=? AND user_id=? AND currency=? AND kind='expense' AND scope='history'",
          [target.id, userId, currency],
        );
  if (!rows[0]) throw new StatementError("No encontramos ese egreso en tu cuenta y moneda.", 404);
  return rows[0].amountMinor;
}
export async function mutateStatements(db: Db, userId: string, input: StatementMutation) {
  const mutation = statementMutationSchema.parse(input);
  const now = today();
  if (mutation.intent === "opening-date") {
    if (mutation.date > now)
      throw new StatementError("La fecha del saldo inicial no puede ser futura.");
    const account = await all<{ openingDate: string | null }>(
      db,
      "SELECT opening_date AS openingDate FROM accounts WHERE user_id=? AND currency=?",
      [userId, mutation.currency],
    );
    if (!account[0]) throw new StatementError("Primero agregá esta moneda.", 404);
    if (account[0].openingDate === mutation.date) return { ok: true, openingDate: mutation.date };
    try {
      const result = await db.$client
        .prepare("UPDATE accounts SET opening_date=? WHERE user_id=? AND currency=?")
        .bind(mutation.date, userId, mutation.currency)
        .run();
      if (!result.meta.changes) throw new StatementError("No pudimos guardar la fecha.", 409);
    } catch (error) {
      if (errorChain(error).includes("statement_opening_date_locked"))
        throw new StatementError(
          "La fecha debe ser anterior o igual al primer movimiento registrado y queda fija al usarla en una importación.",
          409,
        );
      throw error;
    }
    return { ok: true, openingDate: mutation.date };
  }
  const hash = await payloadHash(mutation);
  const previous = await all<{ id: string; payloadHash: string }>(
    db,
    "SELECT id,payload_hash AS payloadHash FROM statement_imports WHERE user_id=? AND request_key=?",
    [userId, mutation.requestKey],
  );
  if (previous[0]) {
    if (previous[0].payloadHash !== hash)
      throw new StatementError(
        "El envío cambió. Actualizá la vista antes de confirmar nuevamente.",
        409,
      );
    return importResult(db, userId, previous[0].id, false, mutation);
  }
  if (mutation.rows.some((r) => r.date > now))
    throw new StatementError(
      "No se importan movimientos futuros como dinero ya recibido o pagado.",
    );
  const accounts = await all<{ id: string; openingDate: string | null }>(
    db,
    "SELECT id,opening_date AS openingDate FROM accounts WHERE user_id=? AND currency=?",
    [userId, mutation.currency],
  );
  const account = accounts[0];
  if (!account) throw new StatementError("Primero agregá la moneda elegida.", 404);
  if (mutation.intent === "import" && !account.openingDate)
    throw new StatementError("Confirmá primero la fecha del saldo inicial de esta moneda.", 409);
  if (mutation.intent === "breakdown")
    await parentFor(db, userId, mutation.target, mutation.currency);
  else {
    const from = mutation.rows.reduce((a, r) => (r.date < a ? r.date : a), mutation.rows[0]!.date);
    const to = mutation.rows.reduce((a, r) => (r.date > a ? r.date : a), mutation.rows[0]!.date);
    const previousRows = await all<StatementRowInput>(
      db,
      "SELECT date,currency,amount_cents AS amountMinor,kind FROM entries WHERE user_id=? AND currency=? AND date BETWEEN ? AND ? AND kind IN ('income','expense') UNION ALL SELECT date,currency,amount_minor AS amountMinor,kind FROM statement_rows WHERE user_id=? AND currency=? AND date BETWEEN ? AND ? AND scope='history'",
      [userId, mutation.currency, from, to, userId, mutation.currency, from, to],
    );
    const duplicates = duplicateStatementKeys(mutation.rows, previousRows);
    const pending = mutation.rows
      .filter((r) => duplicates.has(r.key) && !r.duplicateAcknowledged)
      .map((r) => r.key);
    if (pending.length)
      throw new StatementError(
        "Hay movimientos iguales en fecha, moneda, importe y tipo. Revisalos y confirmá si querés conservarlos.",
        409,
        pending,
      );
  }
  const id = crypto.randomUUID(),
    stamp = new Date().toISOString();
  const rows = mutation.rows.map((r) => ({
    ...r,
    id: id + ":" + r.key,
    entryId: crypto.randomUUID(),
  }));
  const json = JSON.stringify(rows);
  const q = (query: string, ...values: unknown[]) => db.$client.prepare(query).bind(...values);
  const mode = mutation.intent === "import" ? "bank" : "card";
  const queries = [
    q(
      "INSERT INTO statement_imports(id,user_id,request_key,payload_hash,institution,format,currency,mode,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE ?='card' OR EXISTS(SELECT 1 FROM accounts WHERE user_id=? AND currency=? AND opening_date=?) ON CONFLICT(user_id,request_key) DO NOTHING",
      id,
      userId,
      mutation.requestKey,
      hash,
      mutation.institution,
      mutation.format,
      mutation.currency,
      mode,
      stamp,
      mode,
      userId,
      mutation.currency,
      account.openingDate,
    ),
  ];
  if (mutation.intent === "import") {
    queries.push(
      q(
        "INSERT INTO entries(id,user_id,kind,account_id,amount_cents,currency,description,category,date,request_key,payload_hash,created_at) SELECT json_extract(j.value,'$.entryId'),?,json_extract(j.value,'$.kind'),a.id,json_extract(j.value,'$.amountMinor'),a.currency,json_extract(j.value,'$.description'),json_extract(j.value,'$.category'),json_extract(j.value,'$.date'),?||':'||json_extract(j.value,'$.key'),?,? FROM json_each(?) j JOIN accounts a ON a.user_id=? AND a.currency=? JOIN statement_imports b ON b.id=? AND b.user_id=? WHERE json_extract(j.value,'$.kind') IN ('income','expense') AND a.opening_date IS NOT NULL AND json_extract(j.value,'$.date')>=a.opening_date",
        userId,
        mutation.requestKey,
        hash,
        stamp,
        json,
        userId,
        mutation.currency,
        id,
        userId,
      ),
    );
  }
  queries.push(
    q(
      "INSERT INTO statement_rows(id,import_id,user_id,source_key,source_ref,date,description,currency,amount_minor,kind,category,scope,entry_id,duplicate_acknowledged) SELECT json_extract(j.value,'$.id'),b.id,?,json_extract(j.value,'$.key'),json_extract(j.value,'$.sourceRef'),json_extract(j.value,'$.date'),json_extract(j.value,'$.description'),b.currency,json_extract(j.value,'$.amountMinor'),json_extract(j.value,'$.kind'),json_extract(j.value,'$.category'),CASE WHEN b.mode='card' THEN 'part' WHEN json_extract(j.value,'$.kind')='internal' THEN 'internal' WHEN json_extract(j.value,'$.date')<a.opening_date THEN 'history' ELSE 'ledger' END,CASE WHEN b.mode='bank' AND json_extract(j.value,'$.kind') IN ('income','expense') AND json_extract(j.value,'$.date')>=a.opening_date THEN json_extract(j.value,'$.entryId') ELSE NULL END,json_extract(j.value,'$.duplicateAcknowledged') FROM json_each(?) j JOIN statement_imports b ON b.id=? AND b.user_id=? JOIN accounts a ON a.user_id=? AND a.currency=b.currency",
      userId,
      json,
      id,
      userId,
      userId,
    ),
  );
  if (mutation.intent === "breakdown") {
    const entryId = mutation.target.kind === "entry" ? mutation.target.id : null;
    const rowId = mutation.target.kind === "history" ? mutation.target.id : null;
    queries.push(
      q(
        "INSERT INTO breakdown_revisions(import_id,user_id,currency,entry_id,history_row_id) SELECT id,user_id,currency,?,? FROM statement_imports WHERE id=? AND user_id=?",
        entryId,
        rowId,
        id,
        userId,
      ),
    );
    queries.push(
      q(
        "INSERT INTO expense_breakdowns(id,user_id,currency,entry_id,history_row_id,import_id,updated_at) SELECT ?,user_id,currency,?,?,id,? FROM statement_imports WHERE id=? AND user_id=? ON CONFLICT(id) DO UPDATE SET import_id=excluded.import_id,updated_at=excluded.updated_at",
        userId + ":" + mutation.target.kind + ":" + mutation.target.id,
        entryId,
        rowId,
        stamp,
        id,
        userId,
      ),
    );
  }
  try {
    await db.$client.batch(queries);
  } catch (error) {
    const message = errorChain(error);
    if (message.includes("statement_duplicate_review"))
      throw new StatementError(
        "Apareció una coincidencia mientras confirmabas. Actualizá los datos y revisá las filas.",
        409,
        mutation.rows.filter((r) => r.kind === "expense" || r.kind === "income").map((r) => r.key),
      );
    if (/statement_before_opening|statement_cutoff_changed|statement_opening_date/.test(message))
      throw new StatementError(
        "Cambió la fecha de corte. Actualizá la vista y revisá la importación.",
        409,
      );
    if (/statement_breakdown_target|statement_revision_target/.test(message))
      throw new StatementError("El detalle no corresponde a un egreso propio en esta moneda.", 409);
    throw error;
  }
  const result = await all<{ id: string; payloadHash: string }>(
    db,
    "SELECT id,payload_hash AS payloadHash FROM statement_imports WHERE user_id=? AND request_key=?",
    [userId, mutation.requestKey],
  );
  if (!result[0])
    throw new StatementError("Cambió la fecha de corte. Actualizá la vista y revisá el lote.", 409);
  if (result[0].payloadHash !== hash)
    throw new StatementError("Este identificador ya se usó con otros datos.", 409);
  return importResult(db, userId, result[0].id, result[0].id === id, mutation);
}
async function importResult(
  db: Db,
  userId: string,
  id: string,
  created: boolean,
  mutation: ImportMutation,
) {
  const counts = await all<{ scope: string; n: number }>(
    db,
    "SELECT scope,count(*) AS n FROM statement_rows WHERE import_id=? AND user_id=? GROUP BY scope",
    [id, userId],
  );
  const totalMinor =
    mutation.intent === "breakdown" ? breakdownTotal(mutation.rows, mutation.currency) : null;
  const parentMinor =
    mutation.intent === "breakdown"
      ? await parentFor(db, userId, mutation.target, mutation.currency)
      : null;
  return {
    ok: true,
    importId: id,
    created,
    counts,
    totalMinor,
    parentMinor,
    ready: totalMinor !== null && totalMinor === parentMinor,
  };
}
async function readStatementData(
  db: Db,
  userId: string,
  currency: Currency,
  from: string,
  to: string,
  includeLedger: boolean,
) {
  if (!isISODate(from) || !isISODate(to) || from > to)
    throw new StatementError("Elegí un rango de fechas válido.");
  const bind = (query: string, ...values: unknown[]) => db.$client.prepare(query).bind(...values);
  const results = await db.$client.batch([
    bind(
      "SELECT " +
        columns +
        " FROM statement_rows r WHERE r.user_id=? AND r.currency=? AND r.scope='history' AND r.date BETWEEN ? AND ? ORDER BY r.date,r.id LIMIT 5001",
      userId,
      currency,
      from,
      to,
    ),
    includeLedger
      ? bind(
          "SELECT id,date,currency,kind,amount_cents AS amountMinor,category FROM entries WHERE user_id=? AND currency=? AND kind IN ('income','expense') AND date BETWEEN ? AND ? ORDER BY date,id LIMIT 5001",
          userId,
          currency,
          from,
          to,
        )
      : bind(
          "SELECT b.id,b.institution,b.format,b.currency,b.mode,b.created_at AS createdAt,(SELECT count(*) FROM statement_rows r WHERE r.import_id=b.id AND r.user_id=b.user_id) AS count FROM statement_imports b WHERE b.user_id=? AND b.currency=? ORDER BY b.created_at DESC,b.id DESC LIMIT 40",
          userId,
          currency,
        ),
    bind(
      "SELECT b.entry_id AS entryId,b.history_row_id AS historyRowId,b.import_id AS importId,b.currency,coalesce(e.amount_cents,h.amount_minor) AS parentMinor FROM expense_breakdowns b LEFT JOIN entries e ON e.id=b.entry_id AND e.user_id=b.user_id LEFT JOIN statement_rows h ON h.id=b.history_row_id AND h.user_id=b.user_id WHERE b.user_id=? AND b.currency=? AND coalesce(e.date,h.date) BETWEEN ? AND ? LIMIT 5001",
      userId,
      currency,
      from,
      to,
    ),
    bind(
      "SELECT " +
        columns +
        " FROM statement_rows r JOIN expense_breakdowns b ON b.import_id=r.import_id AND b.user_id=r.user_id LEFT JOIN entries e ON e.id=b.entry_id AND e.user_id=b.user_id LEFT JOIN statement_rows h ON h.id=b.history_row_id AND h.user_id=b.user_id WHERE b.user_id=? AND b.currency=? AND coalesce(e.date,h.date) BETWEEN ? AND ? ORDER BY r.id LIMIT 5001",
      userId,
      currency,
      from,
      to,
    ),
  ]);
  const [history, ledgerOrBatches, headers, parts] = results.map((r) => r.results);
  if (results.some((result) => result.results.length > 5000))
    throw new StatementError(
      "Este rango contiene demasiados detalles para una sola vista. Acotá las fechas.",
      413,
    );
  const normalizedParts = (parts as unknown as StoredStatementRow[]).map((r) => ({
    ...r,
    duplicateAcknowledged: Boolean(r.duplicateAcknowledged),
  }));
  const breakdowns = (
    headers as unknown as {
      entryId: string | null;
      historyRowId: string | null;
      importId: string;
      currency: Currency;
      parentMinor: number;
    }[]
  ).map((h) => {
    const rows = normalizedParts.filter((p) => p.importId === h.importId);
    const totalMinor = breakdownTotal(rows, h.currency);
    return {
      target: { kind: h.entryId ? "entry" : "history", id: h.entryId ?? h.historyRowId! },
      importId: h.importId,
      currency: h.currency,
      parentMinor: h.parentMinor,
      totalMinor,
      ready: rows.length > 0 && totalMinor === h.parentMinor,
      parts: rows,
    } as ExpenseBreakdown;
  });
  const statements: StatementState = {
    history: (history as unknown as StoredStatementRow[]).map((r) => ({
      ...r,
      duplicateAcknowledged: Boolean(r.duplicateAcknowledged),
    })),
    batches: includeLedger ? [] : (ledgerOrBatches as unknown as StatementBatch[]),
    breakdowns,
  };
  const ledger = includeLedger ? (ledgerOrBatches as unknown as AnalysisLine[]) : [];
  return { statements, ledger };
}

export async function readStatementState(
  db: Db,
  userId: string,
  currency: Currency,
  from: string,
  to: string,
): Promise<StatementState> {
  return (await readStatementData(db, userId, currency, from, to, false)).statements;
}

export async function readStatisticsPage(
  db: Db,
  userId: string,
  filters: Pick<StatisticsPageData, "query" | "error">,
): Promise<StatisticsPageData> {
  const { query, error } = filters;
  if (error) return { query, report: null, error };
  let records: Awaited<ReturnType<typeof readStatementData>>;
  try {
    // Movimientos, históricos y desgloses reflejan la misma lectura de D1.
    records = await readStatementData(db, userId, query.currency, query.from, query.to, true);
  } catch (cause) {
    if (cause instanceof StatementError) return { query, report: null, error: cause.message };
    throw cause;
  }
  try {
    return {
      query,
      report: calculateStatistics(query, records.ledger, records.statements),
      error: null,
    };
  } catch (cause) {
    if (!(cause instanceof Error) || cause.message !== "El importe supera el límite permitido.")
      throw cause;
    return {
      query,
      report: null,
      error: "Los totales superan el límite admitido. Acotá las fechas.",
    };
  }
}
