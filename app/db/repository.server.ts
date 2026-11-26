import { and, eq, desc, getTableColumns, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import { today, addMonthsFromAnchor, type Frequency } from "../domain/dates";
import type { Snapshot } from "../domain/finance";
import type { Operation } from "../domain/validation";
import { sumMinor } from "../domain/money";
import { visiblePaymentNotices } from "../domain/payments";
import { currencyInfo } from "../domain/currencies";
import {
  latestQuoteQuery,
  previousQuoteQuery,
  quoteStateQuery,
  readQuoteState,
} from "./quotes.server";
import { quoteSeries } from "../domain/quotes";
import { mutateMarkets, MarketError } from "./markets.server";

export const createDb = (binding: D1Database) => drizzle(binding, { schema });
type Db = ReturnType<typeof createDb>;
export class OperationError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function payloadHash(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function samePayload(existing: { payloadHash: string } | undefined, hash: string): boolean {
  if (!existing) return false;
  if (existing.payloadHash !== hash)
    throw new OperationError(
      "Este identificador ya se usó para otro envío. Cerrá el formulario y volvé a intentarlo.",
      409,
    );
  return true;
}
const importedEntry = sql<boolean>`EXISTS (
  SELECT 1 FROM statement_rows r WHERE r.entry_id = entries.id AND r.user_id = entries.user_id
)`.mapWith(Boolean);

export async function getSnapshot(db: Db, userId: string): Promise<Snapshot> {
  const asOf = today();
  // Una sola lectura transaccional evita combinar el saldo de antes de un pago
  // con una lista de pendientes de después de ese mismo pago.
  const [accounts, entries, payments, favorites, dismissed, quotes, quoteState, ...previous] =
    await db.batch([
      db.select().from(schema.accounts).where(eq(schema.accounts.userId, userId)),
      db
        .select({ ...getTableColumns(schema.entries), imported: importedEntry })
        .from(schema.entries)
        .where(eq(schema.entries.userId, userId))
        .orderBy(desc(schema.entries.date), desc(schema.entries.createdAt)),
      db
        .select({
          id: schema.occurrences.id,
          title: schema.paymentRules.title,
          amountMinor: sql<
            number | null
          >`coalesce((SELECT e.amount_cents FROM entries e WHERE e.occurrence_id = ${schema.occurrences.id} AND e.user_id = ${userId}), ${schema.occurrences.amountMinor})`,
          amountSource: schema.occurrences.amountSource,
          currency: schema.occurrences.currency,
          dueDate: schema.occurrences.dueDate,
          frequency: schema.paymentRules.frequency,
          paid: sql<boolean>`EXISTS (SELECT 1 FROM entries e WHERE e.occurrence_id = ${schema.occurrences.id} AND e.user_id = ${userId})`.mapWith(
            Boolean,
          ),
        })
        .from(schema.occurrences)
        .innerJoin(
          schema.paymentRules,
          and(
            eq(schema.paymentRules.id, schema.occurrences.ruleId),
            eq(schema.paymentRules.userId, userId),
          ),
        )
        .where(eq(schema.occurrences.userId, userId))
        .orderBy(schema.occurrences.dueDate),
      db
        .select({ symbol: schema.stockCompanies.symbol })
        .from(schema.stockFavorites)
        .innerJoin(
          schema.stockCompanies,
          eq(schema.stockCompanies.id, schema.stockFavorites.companyId),
        )
        .where(eq(schema.stockFavorites.userId, userId))
        .orderBy(schema.stockCompanies.symbol),
      db
        .select({ occurrenceId: schema.dismissedPaymentNotices.occurrenceId })
        .from(schema.dismissedPaymentNotices)
        .where(eq(schema.dismissedPaymentNotices.userId, userId)),
      latestQuoteQuery(db),
      quoteStateQuery(db),
      ...quoteSeries.map((series) => previousQuoteQuery(db, series)),
    ]);
  const dismissedPaymentIds = dismissed.map((notice) => notice.occurrenceId);
  const noticePayments = visiblePaymentNotices(payments, asOf, dismissedPaymentIds);
  return {
    accounts,
    entries,
    payments,
    favorites: favorites.map((f) => f.symbol),
    // El historial editorial anterior no se expone: Noticias aplica su propio control de fuentes.
    editions: { daily: null, weekly: null },
    asOf,
    dismissedPaymentIds,
    quotes,
    previousQuotes: previous.flat(),
    quoteState: readQuoteState(quoteState[0]),
    paymentNoticeFingerprint: noticePayments.length
      ? await payloadHash(noticePayments.map((payment) => payment.id).sort())
      : null,
  };
}

function ruleDates(anchor: string, frequency: Frequency, through: string): string[] {
  if (frequency === "once") return [anchor];
  const interval = { monthly: 1, quarterly: 3, yearly: 12 }[frequency];
  const dates: string[] = [];
  for (let i = 0; i < 4000; i++) {
    let due: string;
    try {
      due = addMonthsFromAnchor(anchor, i * interval);
    } catch {
      break;
    }
    // Siempre se guarda al menos el primer vencimiento, aunque quede fuera del horizonte.
    if (due > through && i > 0) break;
    dates.push(due);
  }
  return dates;
}
function occurrenceValues(rule: typeof schema.paymentRules.$inferSelect, through: string) {
  return ruleDates(rule.anchorDate, rule.frequency, through).map((dueDate) => ({
    id: `${rule.id}:${dueDate}`,
    ruleId: rule.id,
    userId: rule.userId,
    dueDate,
    amountMinor: rule.amountMinor,
    amountSource: "inherited" as const,
    currency: rule.currency,
  }));
}
export async function extendPaymentOccurrences(db: Db, userId?: string): Promise<void> {
  const [rules, latest] = await Promise.all([
    db
      .select()
      .from(schema.paymentRules)
      .where(userId ? eq(schema.paymentRules.userId, userId) : undefined),
    db
      .select({
        ruleId: schema.occurrences.ruleId,
        dueDate: sql<string>`max(${schema.occurrences.dueDate})`,
      })
      .from(schema.occurrences)
      .where(userId ? eq(schema.occurrences.userId, userId) : undefined)
      .groupBy(schema.occurrences.ruleId),
  ]);
  const latestByRule = new Map(latest.map((row) => [row.ruleId, row.dueDate]));
  const through = addMonthsFromAnchor(today(), 12);
  for (const rule of rules) {
    const last = latestByRule.get(rule.id);
    const rows = occurrenceValues(rule, through).filter((row) => !last || row.dueDate > last);
    // La sugerencia se lee al insertar, no desde la copia cargada antes del bucle.
    // Así una edición concurrente no deja vencimientos nuevos con un monto anterior.
    for (let offset = 0; offset < rows.length; offset += 10) {
      const inserts = rows.slice(offset, offset + 10).map((row) =>
        db
          .insert(schema.occurrences)
          .select(
            sql`
        SELECT ${row.id}, id, user_id, ${row.dueDate}, amount_cents, 'inherited', currency
        FROM payment_rules WHERE id = ${rule.id} AND user_id = ${rule.userId}
      `,
          )
          .onConflictDoNothing({ target: [schema.occurrences.ruleId, schema.occurrences.dueDate] }),
      );
      if (inserts[0]) await db.batch([inserts[0], ...inserts.slice(1)]);
    }
  }
}

function isUniqueConstraint(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    if (/UNIQUE constraint|SQLITE_CONSTRAINT_UNIQUE/i.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}
export async function performOperation(
  db: Db,
  userId: string,
  operation: Operation,
): Promise<void> {
  try {
    await applyOperation(db, userId, operation);
  } catch (error) {
    if (!isUniqueConstraint(error)) throw error;
    // D1 serializa las escrituras. Tras un choque concurrente se relee la clave y su huella.
    await applyOperation(db, userId, operation);
  }
}
async function applyOperation(db: Db, userId: string, operation: Operation): Promise<void> {
  const now = today();
  if (operation.intent === "dismiss-payment-notices") {
    const snapshot = await getSnapshot(db, userId);
    if (!snapshot.paymentNoticeFingerprint) return;
    if (snapshot.paymentNoticeFingerprint !== operation.fingerprint)
      throw new OperationError(
        "La lista de pendientes cambió. Revisá el aviso actualizado antes de volver a silenciarlo.",
        409,
      );
    const rows = visiblePaymentNotices(
      snapshot.payments,
      snapshot.asOf,
      snapshot.dismissedPaymentIds,
    ).map((payment) => ({
      id: crypto.randomUUID(),
      userId,
      occurrenceId: payment.id,
      currency: payment.currency,
      dismissedAt: new Date().toISOString(),
    }));
    const queries = [];
    for (let offset = 0; offset < rows.length; offset += 10) {
      queries.push(
        db
          .insert(schema.dismissedPaymentNotices)
          .values(rows.slice(offset, offset + 10))
          .onConflictDoNothing({
            target: [
              schema.dismissedPaymentNotices.userId,
              schema.dismissedPaymentNotices.occurrenceId,
            ],
          }),
      );
    }
    if (queries[0]) await db.batch([queries[0], ...queries.slice(1)]);
    return;
  }
  if (operation.intent === "setup") {
    if ([operation.arsOpeningDate, operation.usdOpeningDate].some((date) => date && date > now))
      throw new OperationError("La fecha del saldo inicial no puede ser futura.");
    const existing = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.userId, userId));
    if (existing.length) throw new OperationError("Los saldos iniciales ya fueron guardados.", 409);
    await db.batch([
      db.insert(schema.accounts).values({
        id: `${userId}:ARS`,
        userId,
        name: "Cuenta en pesos",
        currency: "ARS",
        openingMinor: operation.ars,
        openingDate: operation.arsOpeningDate ?? null,
      }),
      db.insert(schema.accounts).values({
        id: `${userId}:USD`,
        userId,
        name: "Cuenta en dólares",
        currency: "USD",
        openingMinor: operation.usd,
        openingDate: operation.usdOpeningDate ?? null,
      }),
    ]);
    return;
  }
  if (operation.intent === "add-currency") {
    if (operation.openingDate && operation.openingDate > now)
      throw new OperationError("La fecha del saldo inicial no puede ser futura.");
    const owned = await db.select().from(schema.accounts).where(eq(schema.accounts.userId, userId));
    if (!owned.length) throw new OperationError("Primero configurá tus saldos iniciales.");
    const existing = owned.find((account) => account.currency === operation.currency);
    if (existing) {
      if (existing.openingMinor === operation.opening) return;
      throw new OperationError("Esta moneda ya está agregada. Su saldo inicial se conserva.", 409);
    }
    await db.insert(schema.accounts).values({
      id: `${userId}:${operation.currency}`,
      userId,
      currency: operation.currency,
      name: currencyInfo[operation.currency].name,
      openingMinor: operation.opening,
      openingDate: operation.openingDate ?? null,
    });
    return;
  }
  if (operation.intent === "favorite") {
    try {
      await mutateMarkets(db, userId, operation);
    } catch (error) {
      if (error instanceof MarketError) throw new OperationError(error.message, error.status);
      throw error;
    }
    return;
  }
  const hash = await payloadHash(operation);
  if (operation.intent === "edit-expense") {
    await editExpense(db, userId, operation, hash, now);
    return;
  }
  if (operation.intent === "payment") {
    const existing = await db
      .select()
      .from(schema.paymentRules)
      .where(
        and(
          eq(schema.paymentRules.userId, userId),
          eq(schema.paymentRules.requestKey, operation.requestKey),
        ),
      )
      .get();
    if (samePayload(existing, hash)) return;
    const account = await db
      .select({ id: schema.accounts.id })
      .from(schema.accounts)
      .where(
        and(eq(schema.accounts.userId, userId), eq(schema.accounts.currency, operation.currency)),
      )
      .get();
    if (!account) throw new OperationError("Agregá esta moneda antes de crear un pago.");
    const rule = {
      id: crypto.randomUUID(),
      userId,
      title: operation.title,
      currency: operation.currency,
      amountMinor: operation.keepAmount === "yes" ? operation.amount : null,
      anchorDate: operation.dueDate,
      frequency: operation.frequency,
      requestKey: operation.requestKey,
      payloadHash: hash,
    };
    const rows = occurrenceValues(rule, addMonthsFromAnchor(now, 12)).map((row) => ({
      ...row,
      amountMinor: row.dueDate === rule.anchorDate ? operation.amount : row.amountMinor,
      amountSource: row.dueDate === rule.anchorDate ? ("manual" as const) : ("inherited" as const),
    }));
    const queries = rows.map((row) => db.insert(schema.occurrences).values(row));
    // Un batch D1 es atómico: si falla un vencimiento, tampoco queda una regla incompleta.
    await db.batch([db.insert(schema.paymentRules).values(rule), ...queries]);
    return;
  }
  if (operation.intent === "pay" || operation.intent === "edit-payment") {
    await mutatePayment(db, userId, operation, hash, now);
    return;
  }
  const existing = await db
    .select()
    .from(schema.entries)
    .where(
      and(eq(schema.entries.userId, userId), eq(schema.entries.requestKey, operation.requestKey)),
    )
    .get();
  if (samePayload(existing, hash)) return;
  if (operation.date > now)
    throw new OperationError(
      "Para una fecha futura, agregá un pago pendiente. Los movimientos representan dinero ya recibido o pagado.",
    );
  const account = await db
    .select()
    .from(schema.accounts)
    .where(
      and(eq(schema.accounts.userId, userId), eq(schema.accounts.currency, operation.currency)),
    )
    .get();
  if (!account) throw new OperationError("Primero configurá tus saldos iniciales.");
  if (account.openingDate && operation.date < account.openingDate)
    throw new OperationError(
      "Ese movimiento es anterior al saldo inicial. Usá Importar resumen para conservarlo como histórico.",
    );
  if (operation.intent === "exchange") {
    const target = await db
      .select()
      .from(schema.accounts)
      .where(
        and(
          eq(schema.accounts.userId, userId),
          eq(schema.accounts.currency, operation.targetCurrency),
        ),
      )
      .get();
    if (!target)
      throw new OperationError("Agregá la moneda de destino antes de registrar el cambio.");
    if (target.openingDate && operation.date < target.openingDate)
      throw new OperationError("La fecha es anterior al saldo inicial de la moneda de destino.");
    if (operation.currency === operation.targetCurrency)
      throw new OperationError("Elegí dos monedas diferentes.");
    if (operation.quoteId) {
      const quote = await db
        .select()
        .from(schema.exchangeQuotes)
        .where(eq(schema.exchangeQuotes.id, operation.quoteId))
        .get();
      const foreign =
        operation.currency === "ARS"
          ? operation.targetCurrency
          : operation.targetCurrency === "ARS"
            ? operation.currency
            : null;
      if (!quote || quote.currency !== foreign)
        throw new OperationError(
          "La referencia no corresponde a estas monedas. Elegí otra o ingresá una cotización manual.",
          400,
        );
      if (operation.date !== now || today(new Date(quote.sourceAsOf)) > operation.date)
        throw new OperationError(
          "Para otra fecha, ingresá la cotización que usaste y elegí referencia manual.",
        );
    }
    await db.insert(schema.entries).values({
      id: crypto.randomUUID(),
      userId,
      kind: "exchange",
      accountId: account.id,
      targetAccountId: target.id,
      amountMinor: operation.amount,
      currency: operation.currency,
      targetCurrency: target.currency,
      targetAmountMinor: operation.targetAmount,
      exchangeRate: operation.rate,
      exchangeQuoteId: operation.quoteId || null,
      description: `Cambio de ${operation.currency} a ${operation.targetCurrency}`,
      category: "Cambio de moneda",
      date: operation.date,
      requestKey: operation.requestKey,
      payloadHash: hash,
      createdAt: new Date().toISOString(),
    });
    return;
  }
  // Comprueba el límite antes del INSERT. Los centavos también se validan en SQL.
  const amounts = await db
    .select({ amount: schema.entries.amountMinor })
    .from(schema.entries)
    .where(
      and(
        eq(schema.entries.userId, userId),
        eq(schema.entries.currency, operation.currency),
        eq(schema.entries.kind, operation.kind),
      ),
    );
  sumMinor([...amounts.map((e) => e.amount), operation.amount]);
  await db.insert(schema.entries).values({
    id: crypto.randomUUID(),
    userId,
    kind: operation.kind,
    accountId: account.id,
    targetAccountId: null,
    amountMinor: operation.amount,
    currency: operation.currency,
    description: operation.description,
    category: operation.category,
    date: operation.date,
    requestKey: operation.requestKey,
    payloadHash: hash,
    createdAt: new Date().toISOString(),
  });
}

async function editExpense(
  db: Db,
  userId: string,
  operation: Extract<Operation, { intent: "edit-expense" }>,
  hash: string,
  now: string,
) {
  const { entryId, currency, amount, description, category, date, requestKey } = operation;
  const receipt = () =>
    db
      .select({ payloadHash: schema.expenseEdits.payloadHash })
      .from(schema.expenseEdits)
      .where(
        and(eq(schema.expenseEdits.userId, userId), eq(schema.expenseEdits.requestKey, requestKey)),
      )
      .get();
  if (samePayload(await receipt(), hash)) return;
  if (date > now) throw new OperationError("La fecha del gasto no puede ser futura.");

  const editId = crypto.randomUUID();
  const target = and(
    eq(schema.entries.id, entryId),
    eq(schema.entries.userId, userId),
    eq(schema.entries.currency, currency),
    eq(schema.entries.kind, "expense"),
  );
  // El historial lee los valores anteriores dentro del mismo batch que actualiza el gasto.
  const claim = db
    .insert(schema.expenseEdits)
    .select(
      sql`
    SELECT ${editId}, e.user_id, e.id, e.currency, ${requestKey}, ${hash},
      e.amount_cents, e.description, e.category, e.date,
      ${amount}, ${description}, ${category}, ${date}, ${new Date().toISOString()}
    FROM entries e JOIN accounts a ON a.id = e.account_id AND a.user_id = e.user_id
    WHERE e.id = ${entryId} AND e.user_id = ${userId} AND e.currency = ${currency}
      AND e.kind = 'expense' AND e.occurrence_id IS NULL
      AND (a.opening_date IS NULL OR a.opening_date <= ${date})
      AND ((e.amount_cents = ${amount} AND e.date = ${date}) OR NOT EXISTS (
        SELECT 1 FROM statement_rows r WHERE r.entry_id = e.id AND r.user_id = e.user_id
      ))
      AND (SELECT COALESCE(SUM(other.amount_cents), 0) FROM entries other
        WHERE other.user_id = e.user_id AND other.currency = e.currency
          AND other.kind = 'expense' AND other.id <> e.id) <= ${Number.MAX_SAFE_INTEGER - amount}
  `,
    )
    .onConflictDoNothing({ target: [schema.expenseEdits.userId, schema.expenseEdits.requestKey] })
    .returning({ id: schema.expenseEdits.id });
  const [claimed] = await db.batch([
    claim,
    db
      .update(schema.entries)
      .set({ amountMinor: amount, description, category, date })
      .where(and(target, sql`EXISTS (SELECT 1 FROM expense_edits WHERE id = ${editId})`)),
  ]);
  if (claimed.length || samePayload(await receipt(), hash)) return;

  const entry = await db
    .select({
      occurrenceId: schema.entries.occurrenceId,
      imported: importedEntry,
      amountMinor: schema.entries.amountMinor,
      date: schema.entries.date,
      openingDate: schema.accounts.openingDate,
    })
    .from(schema.entries)
    .innerJoin(
      schema.accounts,
      and(
        eq(schema.accounts.id, schema.entries.accountId),
        eq(schema.accounts.userId, schema.entries.userId),
      ),
    )
    .where(target)
    .get();
  if (!entry) throw new OperationError("No encontramos ese gasto en tu cuenta.", 404);
  if (entry.occurrenceId)
    throw new OperationError("Este gasto corresponde a un pago registrado.", 409);
  if (entry.imported && (entry.amountMinor !== amount || entry.date !== date))
    throw new OperationError("En un gasto importado podés corregir la descripción y la categoría.");
  if (entry.openingDate && date < entry.openingDate)
    throw new OperationError("La fecha del gasto es anterior al saldo inicial.");
  throw new OperationError("El total de gastos supera el límite permitido.");
}

async function mutatePayment(
  db: Db,
  userId: string,
  operation: Extract<Operation, { intent: "pay" | "edit-payment" }>,
  hash: string,
  now: string,
) {
  const existing = await db
    .select()
    .from(schema.paymentMutations)
    .where(
      and(
        eq(schema.paymentMutations.userId, userId),
        eq(schema.paymentMutations.requestKey, operation.requestKey),
      ),
    )
    .get();
  if (samePayload(existing, hash)) return;
  const priorEntry = await db
    .select()
    .from(schema.entries)
    .where(
      and(eq(schema.entries.userId, userId), eq(schema.entries.requestKey, operation.requestKey)),
    )
    .get();
  if (samePayload(priorEntry, hash)) return;
  if (operation.intent === "pay" && operation.date > now)
    throw new OperationError("La fecha de pago no puede ser futura.");
  const payment = await db
    .select()
    .from(schema.occurrences)
    .innerJoin(
      schema.paymentRules,
      and(
        eq(schema.paymentRules.id, schema.occurrences.ruleId),
        eq(schema.paymentRules.userId, userId),
      ),
    )
    .where(
      and(eq(schema.occurrences.id, operation.occurrenceId), eq(schema.occurrences.userId, userId)),
    )
    .get();
  if (!payment) throw new OperationError("No encontramos ese vencimiento.", 404);
  const p = payment.payment_occurrences;
  const rule = payment.payment_rules;
  if (operation.currency !== p.currency)
    throw new OperationError("La moneda del formulario no coincide con el vencimiento.");
  const account =
    operation.intent === "pay"
      ? await db
          .select()
          .from(schema.accounts)
          .where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.currency, p.currency)))
          .get()
      : null;
  if (operation.intent === "pay" && !account)
    throw new OperationError("Primero configurá tus saldos iniciales.");

  const receiptId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  // El permiso se comprueba dentro del batch: una lectura previa no protege
  // contra un pago registrado por otra pestaña entre la lectura y la escritura.
  const claim = db
    .insert(schema.paymentMutations)
    .select(
      sql`
    SELECT ${receiptId}, user_id, id, currency, ${operation.requestKey}, ${hash}, ${createdAt}
    FROM payment_occurrences
    WHERE id = ${p.id} AND user_id = ${userId}
      AND NOT EXISTS (SELECT 1 FROM entries e WHERE e.occurrence_id = ${p.id} AND e.user_id = ${userId})
  `,
    )
    .returning({ id: schema.paymentMutations.id });
  const accepted = sql`EXISTS (SELECT 1 FROM payment_mutations WHERE id = ${receiptId} AND user_id = ${userId})`;
  const writes = [];
  if (operation.intent === "edit-payment") {
    writes.push(
      db
        .update(schema.occurrences)
        .set({ amountMinor: operation.amount, amountSource: "manual" })
        .where(
          and(eq(schema.occurrences.id, p.id), eq(schema.occurrences.userId, userId), accepted),
        ),
    );
  } else {
    writes.push(
      db.insert(schema.entries).select(sql`
      SELECT ${crypto.randomUUID()}, ${userId}, 'expense', ${account!.id}, NULL, ${operation.amount}, ${p.currency},
        ${rule.title}, 'Servicios', ${operation.date}, ${p.id}, ${operation.requestKey}, ${hash}, ${createdAt}, NULL, NULL, NULL, NULL
      WHERE ${accepted}
    `),
    );
  }
  if (rule.frequency !== "once" && operation.futureAmount !== "unchanged") {
    const futureMinor = operation.futureAmount === "use" ? operation.amount : null;
    writes.push(
      db
        .update(schema.occurrences)
        .set({ amountMinor: futureMinor })
        .where(
          and(
            eq(schema.occurrences.ruleId, p.ruleId),
            eq(schema.occurrences.userId, userId),
            sql`${schema.occurrences.dueDate} > ${p.dueDate}`,
            eq(schema.occurrences.amountSource, "inherited"),
            sql`NOT EXISTS (SELECT 1 FROM entries e WHERE e.occurrence_id = ${schema.occurrences.id} AND e.user_id = ${userId})`,
            accepted,
          ),
        ),
    );
    writes.push(
      db
        .update(schema.paymentRules)
        .set({ amountMinor: futureMinor })
        .where(
          and(
            eq(schema.paymentRules.id, p.ruleId),
            eq(schema.paymentRules.userId, userId),
            accepted,
          ),
        ),
    );
  }
  // Último guardado gana, pero el conjunto completo se confirma o se revierte.
  // El comprobante evita que un reintento viejo vuelva a ejecutar una edición.
  const [claimed] = await db.batch([claim, ...writes]);
  if (!claimed.length)
    throw new OperationError(
      "Este vencimiento ya está pagado. Actualizá la lista para revisarlo.",
      409,
    );
}
