import { getSnapshot, type createDb } from "./repository.server";
import { accountBalance } from "~/domain/finance";
import { readStatementState } from "./statements.server";
import { emptyStatementState } from "~/domain/statements";
import {
  analysisPeriod,
  comparisonPeriod,
  type AnalysisPlan,
  type AssistantUsage,
} from "~/domain/assistant";
import type {
  FinancialContext,
  AssistantLedgerLine,
  AssistantPayment,
} from "~/domain/assistant-analysis";
import type { Currency } from "~/domain/currencies";
import { usageDays, type AssistantConfig } from "~/services/assistant-config.server";
type Db = ReturnType<typeof createDb>;
type AssistantPaymentRow = Omit<AssistantPayment, "paid"> & { paid: number };
export class AssistantError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "invalid",
  ) {
    super(message);
  }
}
export async function readFinancialContext(
  db: Db,
  userId: string,
  currency: Currency,
  plan: AnalysisPlan,
  asOf: string,
): Promise<FinancialContext> {
  const range = analysisPeriod(plan, asOf),
    prior = plan.operation === "compare" ? comparisonPeriod(plan, range) : range;
  const from = prior.from < range.from ? prior.from : range.from,
    to = prior.to > range.to ? prior.to : range.to;
  if (plan.operation === "balance") {
    const snapshot = await getSnapshot(db, userId),
      account = snapshot.accounts.find((a) => a.currency === currency);
    let balance: FinancialContext["balance"];
    if (!account)
      balance = {
        amountMinor: null,
        reason: "Todavía no tenés una cuenta registrada en esta moneda.",
      };
    else if (
      (account.openingDate && range.to < account.openingDate) ||
      (!account.openingDate && range.to < asOf)
    )
      balance = {
        amountMinor: null,
        reason:
          "La fecha del saldo inicial no permite reconstruir con confianza el saldo de ese día.",
      };
    else
      balance = {
        amountMinor: accountBalance(
          account,
          snapshot.entries.filter((e) => e.date <= range.to),
        ),
      };
    return { ledger: [], payments: [], statements: emptyStatementState(), balance };
  }
  const bind = (query: string, ...values: unknown[]) => db.$client.prepare(query).bind(...values);
  const [ledgerResult, paymentResult] = await db.$client.batch<
    AssistantLedgerLine | AssistantPaymentRow
  >([
    bind(
      "SELECT id,date,currency,kind,amount_cents AS amountMinor,category,description,occurrence_id AS occurrenceId FROM entries WHERE user_id=? AND currency=? AND kind IN ('income','expense') AND date BETWEEN ? AND ? ORDER BY date,id LIMIT 5001",
      userId,
      currency,
      from,
      to,
    ),
    bind(
      "SELECT o.id,r.title,coalesce((SELECT e.amount_cents FROM entries e WHERE e.occurrence_id=o.id AND e.user_id=o.user_id),o.amount_cents) AS amountMinor,o.due_date AS dueDate,r.frequency,EXISTS(SELECT 1 FROM entries e WHERE e.occurrence_id=o.id AND e.user_id=o.user_id) AS paid FROM payment_occurrences o JOIN payment_rules r ON r.id=o.rule_id AND r.user_id=o.user_id AND r.currency=o.currency WHERE o.user_id=? AND o.currency=? AND (o.due_date BETWEEN ? AND ? OR EXISTS(SELECT 1 FROM entries e WHERE e.occurrence_id=o.id AND e.user_id=o.user_id AND e.date BETWEEN ? AND ?)) ORDER BY o.due_date,o.id LIMIT 5001",
      userId,
      currency,
      from,
      to,
      from,
      to,
    ),
  ]);
  if (ledgerResult!.results.length > 5000 || paymentResult!.results.length > 5000)
    throw new AssistantError("Hay demasiados registros. Elegí un período más corto.", 413);
  let stateRange: { from: string; to: string } | null = { from, to };
  if (plan.operation === "card") {
    const parents = await bind(
      "SELECT min(coalesce(e.date,h.date)) AS firstDate,max(coalesce(e.date,h.date)) AS lastDate FROM expense_breakdowns b JOIN statement_rows r ON r.import_id=b.import_id AND r.user_id=b.user_id LEFT JOIN entries e ON e.id=b.entry_id AND e.user_id=b.user_id LEFT JOIN statement_rows h ON h.id=b.history_row_id AND h.user_id=b.user_id WHERE b.user_id=? AND b.currency=? AND r.date BETWEEN ? AND ?",
      userId,
      currency,
      from,
      to,
    ).first<{ firstDate: string | null; lastDate: string | null }>();
    stateRange =
      parents?.firstDate && parents.lastDate
        ? { from: parents.firstDate, to: parents.lastDate }
        : null;
  }
  return {
    ledger: ledgerResult!.results as AssistantLedgerLine[],
    payments: (paymentResult!.results as AssistantPaymentRow[]).map((r) => ({
      ...r,
      paid: Boolean(r.paid),
    })),
    statements: stateRange
      ? await readStatementState(db, userId, currency, stateRange.from, stateRange.to)
      : emptyStatementState(),
  };
}
export async function checkAssistantRate(db: Db, userId: string, now: Date) {
  const window = now.toISOString().slice(0, 16);
  const result = await db.$client
    .prepare(
      "INSERT INTO ai_rate_windows(user_id,window,count) VALUES(?,?,1) ON CONFLICT(user_id,window) DO UPDATE SET count=count+1 WHERE count<20 RETURNING count",
    )
    .bind(userId, window)
    .first();
  if (!result)
    throw new AssistantError(
      "Recibimos muchas consultas juntas. Esperá un minuto y volvé a intentar.",
      429,
      "rate",
    );
}
export async function readAssistantUsage(
  db: Db,
  userId: string,
  config: AssistantConfig,
  enabled: boolean,
  now = new Date(),
): Promise<AssistantUsage> {
  const day = usageDays(now);
  const [person, global] = await db.$client.batch<Record<string, unknown>>([
    db.$client
      .prepare("SELECT questions FROM ai_daily_usage WHERE user_id=? AND day_ar=?")
      .bind(userId, day.ar),
    db.$client.prepare("SELECT reserved_micros FROM ai_global_usage WHERE day_utc=?").bind(day.utc),
  ]);
  const used = Number(person!.results[0]?.questions ?? 0),
    reserved = Number(global!.results[0]?.reserved_micros ?? 0);
  const reason =
    !enabled || !config.maxOutputTokens
      ? "unconfigured"
      : used >= config.dailyLimit
        ? "user-limit"
        : reserved >= config.budgetMicros
          ? "global-limit"
          : "ready";
  return {
    limit: config.dailyLimit,
    used,
    remaining: Math.max(0, config.dailyLimit - used),
    resetsAt: day.resetsAt,
    globalResetsAt: day.globalResetsAt,
    available: reason === "ready",
    reason,
  };
}
export interface StoredAIRequest {
  dayAr: string;
  payloadHash: string;
  status: string;
  planJson: string | null;
  errorCode: string | null;
  reservedMicros: number;
  dayUtc: string;
  spillDay: string | null;
}
export async function findAIRequest(db: Db, userId: string, key: string) {
  return db.$client
    .prepare(
      "SELECT day_ar AS dayAr,payload_hash AS payloadHash,status,plan_json AS planJson,error_code AS errorCode,reserved_micros AS reservedMicros,day_utc AS dayUtc,spill_day AS spillDay FROM ai_requests WHERE user_id=? AND request_key=?",
    )
    .bind(userId, key)
    .first<StoredAIRequest>();
}
export async function reserveAIRequest(
  db: Db,
  userId: string,
  key: string,
  hash: string,
  config: AssistantConfig,
  reserved: number,
  now: Date,
) {
  const day = usageDays(now);
  try {
    return await db.$client
      .prepare(
        "INSERT INTO ai_requests(user_id,request_key,payload_hash,day_ar,day_utc,spill_day,question_limit,budget_micros,reserved_micros,model,max_output_tokens,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,'reserved',?) ON CONFLICT(user_id,request_key) DO NOTHING RETURNING request_key",
      )
      .bind(
        userId,
        key,
        hash,
        day.ar,
        day.utc,
        day.spillDay,
        config.dailyLimit,
        config.budgetMicros,
        reserved,
        config.model,
        config.maxOutputTokens,
        now.toISOString(),
      )
      .first();
  } catch (error) {
    const message = String(error);
    if (message.includes("ai_user_limit"))
      throw new AssistantError(
        "Alcanzaste tu límite de consultas con IA por hoy. Podés seguir utilizando las consultas estadísticas disponibles.",
        429,
        "user-limit",
      );
    if (message.includes("ai_global_limit"))
      throw new AssistantError(
        "El cupo general de IA está agotado temporalmente. Las consultas estadísticas siguen disponibles.",
        429,
        "global-limit",
      );
    if (message.includes("ai_in_flight"))
      throw new AssistantError(
        "Ya hay una consulta con IA en curso. Esperá a que termine.",
        409,
        "busy",
      );
    if (message.includes("ai_cooldown"))
      throw new AssistantError(
        "Esperá unos segundos antes de enviar otra consulta con IA.",
        429,
        "rate",
      );
    throw error;
  }
}
export async function settleAIRequest(
  db: Db,
  userId: string,
  key: string,
  record: StoredAIRequest,
  result: {
    plan?: AnalysisPlan;
    errorCode?: string;
    inputTokens?: number;
    outputTokens?: number;
    observedMicros?: number;
    usageSource?: string;
  },
) {
  const extra = Math.max(0, (result.observedMicros ?? 0) - record.reservedMicros);
  const pending =
    "EXISTS(SELECT 1 FROM ai_requests WHERE user_id=? AND request_key=? AND status='reserved')";
  const statements = [
    db.$client
      .prepare(
        `UPDATE ai_global_usage SET reserved_micros=reserved_micros+? WHERE day_utc=? AND ${pending}`,
      )
      .bind(extra, record.dayUtc, userId, key),
  ];
  if (record.spillDay)
    statements.push(
      db.$client
        .prepare(
          `UPDATE ai_global_usage SET reserved_micros=reserved_micros+? WHERE day_utc=? AND ${pending}`,
        )
        .bind(extra, record.spillDay, userId, key),
    );
  statements.push(
    db.$client
      .prepare(
        "UPDATE ai_requests SET status=?,plan_json=?,error_code=?,input_tokens=?,output_tokens=?,observed_micros=?,usage_source=? WHERE user_id=? AND request_key=? AND status='reserved'",
      )
      .bind(
        result.plan ? "complete" : "failed",
        result.plan ? JSON.stringify(result.plan) : null,
        result.errorCode ?? null,
        result.inputTokens ?? null,
        result.outputTokens ?? null,
        result.observedMicros ?? null,
        result.usageSource ?? "reservation",
        userId,
        key,
      ),
  );
  await db.$client.batch(statements);
}
