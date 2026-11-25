import { sql, type SQLWrapper } from "drizzle-orm";
import { currencies } from "../domain/currencies";
import { quoteSeries, quoteDefinitions } from "../domain/quotes";
import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
  check,
  foreignKey,
  primaryKey,
} from "drizzle-orm/sqlite-core";
const currencyList = sql.raw(`(${currencies.map((code) => `'${code}'`).join(",")})`);
export const aiDailyUsage = sqliteTable(
  "ai_daily_usage",
  {
    userId: text("user_id").notNull(),
    dayAr: text("day_ar").notNull(),
    questions: integer("questions").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.dayAr] }),
    check("ai_questions_integer", sql`typeof(${t.questions})='integer' AND ${t.questions}>=0`),
  ],
);
export const aiGlobalUsage = sqliteTable(
  "ai_global_usage",
  {
    dayUtc: text("day_utc").primaryKey(),
    reservedMicros: integer("reserved_micros").notNull().default(0),
  },
  (t) => [
    check(
      "ai_global_integer",
      sql`typeof(${t.reservedMicros})='integer' AND ${t.reservedMicros}>=0`,
    ),
  ],
);
export const aiRateWindows = sqliteTable(
  "ai_rate_windows",
  {
    userId: text("user_id").notNull(),
    window: text("window").notNull(),
    count: integer("count").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.window] }),
    check("ai_rate_integer", sql`typeof(${t.count})='integer' AND ${t.count} BETWEEN 1 AND 20`),
  ],
);
export const aiRequests = sqliteTable(
  "ai_requests",
  {
    userId: text("user_id").notNull(),
    requestKey: text("request_key").notNull(),
    payloadHash: text("payload_hash").notNull(),
    dayAr: text("day_ar").notNull(),
    dayUtc: text("day_utc").notNull(),
    spillDay: text("spill_day"),
    questionLimit: integer("question_limit").notNull(),
    budgetMicros: integer("budget_micros").notNull(),
    reservedMicros: integer("reserved_micros").notNull(),
    model: text("model").notNull(),
    maxOutputTokens: integer("max_output_tokens").notNull(),
    status: text("status", { enum: ["reserved", "complete", "failed"] }).notNull(),
    createdAt: text("created_at").notNull(),
    planJson: text("plan_json"),
    errorCode: text("error_code"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    observedMicros: integer("observed_micros"),
    usageSource: text("usage_source"),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.requestKey] }),
    index("ai_owner_created").on(t.userId, t.createdAt),
    check("ai_request_status", sql`${t.status} IN ('reserved','complete','failed')`),
    check(
      "ai_reservation_integer",
      sql`typeof(${t.reservedMicros})='integer' AND ${t.reservedMicros}>0 AND typeof(${t.budgetMicros})='integer' AND ${t.budgetMicros}>=0 AND typeof(${t.questionLimit})='integer' AND ${t.questionLimit}>=0`,
    ),
  ],
);
const validRate = (column: SQLWrapper) =>
  sql`typeof(${column}) = 'text' AND length(${column}) BETWEEN 1 AND 21 AND ${column} GLOB '[0-9]*' AND ${column} NOT GLOB '*[^0-9.]*' AND length(${column}) - length(replace(${column},'.','')) <= 1 AND ${column} NOT LIKE '%.' AND length(replace(replace(${column},'0',''),'.','')) > 0`;

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    currency: text("currency", { enum: currencies }).notNull(),
    openingMinor: integer("opening_cents").notNull().default(0),
    openingDate: text("opening_date"),
  },
  (t) => [
    uniqueIndex("accounts_user_currency").on(t.userId, t.currency),
    uniqueIndex("accounts_owner_currency").on(t.id, t.userId, t.currency),
    check("account_currency", sql`${t.currency} IN ${currencyList}`),
    check(
      "opening_integer",
      sql`typeof(${t.openingMinor}) = 'integer' AND abs(${t.openingMinor}) <= 1000000000000`,
    ),
  ],
);

export const paymentRules = sqliteTable(
  "payment_rules",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    // Sugerencia para vencimientos futuros. No representa un gasto confirmado.
    amountMinor: integer("amount_cents"),
    currency: text("currency", { enum: currencies }).notNull(),
    anchorDate: text("anchor_date").notNull(),
    frequency: text("frequency", { enum: ["once", "monthly", "quarterly", "yearly"] }).notNull(),
    requestKey: text("request_key").notNull(),
    payloadHash: text("payload_hash").notNull(),
  },
  (t) => [
    uniqueIndex("rules_request").on(t.userId, t.requestKey),
    uniqueIndex("rules_owner").on(t.id, t.userId, t.currency),
    check(
      "rule_amount",
      sql`${t.amountMinor} IS NULL OR (typeof(${t.amountMinor}) = 'integer' AND ${t.amountMinor} > 0 AND ${t.amountMinor} <= 1000000000000)`,
    ),
    check("rule_currency", sql`${t.currency} IN ${currencyList}`),
    check("rule_frequency", sql`${t.frequency} IN ('once','monthly','quarterly','yearly')`),
  ],
);
export const occurrences = sqliteTable(
  "payment_occurrences",
  {
    id: text("id").primaryKey(),
    ruleId: text("rule_id").notNull(),
    userId: text("user_id").notNull(),
    dueDate: text("due_date").notNull(),
    amountMinor: integer("amount_cents"),
    amountSource: text("amount_source", { enum: ["manual", "inherited"] })
      .notNull()
      .default("inherited"),
    currency: text("currency", { enum: currencies }).notNull(),
  },
  (t) => [
    uniqueIndex("occurrence_rule_date").on(t.ruleId, t.dueDate),
    uniqueIndex("occurrence_owner").on(t.id, t.userId, t.currency),
    index("occurrence_user_due").on(t.userId, t.dueDate),
    foreignKey({
      columns: [t.ruleId, t.userId, t.currency],
      foreignColumns: [paymentRules.id, paymentRules.userId, paymentRules.currency],
    }),
    check(
      "occurrence_amount",
      sql`${t.amountMinor} IS NULL OR (typeof(${t.amountMinor}) = 'integer' AND ${t.amountMinor} > 0 AND ${t.amountMinor} <= 1000000000000)`,
    ),
    check("occurrence_amount_source", sql`${t.amountSource} IN ('manual','inherited')`),
  ],
);
// Conserva la identidad del envío, incluso después de otras ediciones del mismo mes.
export const paymentMutations = sqliteTable(
  "payment_mutations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    occurrenceId: text("occurrence_id").notNull(),
    currency: text("currency", { enum: currencies }).notNull(),
    requestKey: text("request_key").notNull(),
    payloadHash: text("payload_hash").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("payment_mutation_request").on(t.userId, t.requestKey),
    foreignKey({
      columns: [t.occurrenceId, t.userId, t.currency],
      foreignColumns: [occurrences.id, occurrences.userId, occurrences.currency],
    }),
  ],
);
export const exchangeQuotes = sqliteTable(
  "exchange_quotes",
  {
    id: text("id").primaryKey(),
    series: text("series", { enum: quoteSeries }).notNull(),
    currency: text("currency", { enum: currencies }).notNull(),
    buyRate: text("buy_rate").notNull(),
    sellRate: text("sell_rate").notNull(),
    sourceAsOf: text("source_as_of").notNull(),
    fetchedAt: text("fetched_at").notNull(),
  },
  (t) => [
    index("quote_series_date").on(t.series, t.sourceAsOf, t.fetchedAt),
    check("quote_rates", sql`(${validRate(t.buyRate)}) AND (${validRate(t.sellRate)})`),
    check(
      "quote_series_currency",
      sql.raw(
        quoteSeries
          .map(
            (series) =>
              `(series = '${series}' AND currency = '${quoteDefinitions[series].currency}')`,
          )
          .join(" OR "),
      ),
    ),
  ],
);
export const quoteCacheState = sqliteTable(
  "quote_cache_state",
  {
    id: text("id").primaryKey(),
    lastAttemptAt: text("last_attempt_at").notNull(),
    nextAttemptAt: text("next_attempt_at").notNull(),
    status: text("status", { enum: ["refreshing", "ok", "partial", "error"] }).notNull(),
  },
  (t) => [check("quote_cache_status", sql`${t.status} IN ('refreshing','ok','partial','error')`)],
);
export const entries = sqliteTable(
  "entries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    kind: text("kind", { enum: ["income", "expense", "transfer", "exchange"] }).notNull(),
    accountId: text("account_id").notNull(),
    targetAccountId: text("target_account_id"),
    amountMinor: integer("amount_cents").notNull(),
    currency: text("currency", { enum: currencies }).notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    date: text("date").notNull(),
    occurrenceId: text("occurrence_id"),
    requestKey: text("request_key").notNull(),
    payloadHash: text("payload_hash").notNull(),
    createdAt: text("created_at").notNull(),
    targetCurrency: text("target_currency", { enum: currencies }),
    targetAmountMinor: integer("target_amount_minor"),
    exchangeRate: text("exchange_rate"),
    exchangeQuoteId: text("exchange_quote_id").references(() => exchangeQuotes.id),
  },
  (t) => [
    uniqueIndex("entries_request").on(t.userId, t.requestKey),
    uniqueIndex("entries_occurrence").on(t.occurrenceId),
    index("entries_user_date").on(t.userId, t.date),
    uniqueIndex("entries_owner_currency").on(t.id, t.userId, t.currency),
    foreignKey({
      columns: [t.accountId, t.userId, t.currency],
      foreignColumns: [accounts.id, accounts.userId, accounts.currency],
    }),
    foreignKey({
      columns: [t.targetAccountId, t.userId, t.targetCurrency],
      foreignColumns: [accounts.id, accounts.userId, accounts.currency],
    }),
    foreignKey({
      columns: [t.occurrenceId, t.userId, t.currency],
      foreignColumns: [occurrences.id, occurrences.userId, occurrences.currency],
    }),
    check(
      "entry_amount",
      sql`typeof(${t.amountMinor}) = 'integer' AND ${t.amountMinor} > 0 AND ${t.amountMinor} <= 1000000000000`,
    ),
    check("entry_kind", sql`${t.kind} IN ('income','expense','transfer','exchange')`),
    check(
      "transfer_accounts",
      sql`(${t.kind} IN ('income','expense') AND ${t.targetAccountId} IS NULL AND ${t.targetCurrency} IS NULL AND ${t.targetAmountMinor} IS NULL AND ${t.exchangeRate} IS NULL AND ${t.exchangeQuoteId} IS NULL)
        OR (${t.kind} = 'transfer' AND ${t.targetAccountId} IS NOT NULL AND ${t.targetAccountId} <> ${t.accountId} AND ${t.targetCurrency} = ${t.currency} AND ${t.targetCurrency} IS NOT NULL AND ${t.targetAmountMinor} = ${t.amountMinor} AND ${t.targetAmountMinor} IS NOT NULL AND ${t.exchangeRate} IS NULL AND ${t.exchangeQuoteId} IS NULL)
        OR (${t.kind} = 'exchange' AND ${t.targetAccountId} IS NOT NULL AND ${t.targetAccountId} <> ${t.accountId} AND ${t.targetCurrency} IS NOT NULL AND ${t.targetCurrency} <> ${t.currency} AND typeof(${t.targetAmountMinor}) = 'integer' AND ${t.targetAmountMinor} > 0 AND ${t.targetAmountMinor} <= 1000000000000 AND ${t.exchangeRate} IS NOT NULL)`,
    ),
    check("exchange_rate_text", sql`${t.exchangeRate} IS NULL OR (${validRate(t.exchangeRate)})`),
    check("paid_is_expense", sql`${t.occurrenceId} IS NULL OR ${t.kind} = 'expense'`),
  ],
);
const statementCurrencyCheck = sql.raw(
  "currency IN (" + currencies.map((c) => "'" + c + "'").join(",") + ")",
);
export const statementImports = sqliteTable(
  "statement_imports",
  {
    id: text("id").primaryKey().notNull(),
    userId: text("user_id").notNull(),
    requestKey: text("request_key").notNull(),
    payloadHash: text("payload_hash").notNull(),
    institution: text("institution").notNull(),
    format: text("format").notNull(),
    currency: text("currency", { enum: currencies }).notNull(),
    mode: text("mode", { enum: ["bank", "card"] }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("statement_request").on(t.userId, t.requestKey),
    uniqueIndex("statement_import_owner_currency").on(t.id, t.userId, t.currency),
    index("statement_import_owner_date").on(t.userId, t.createdAt),
    check("statement_import_currency", statementCurrencyCheck),
    check("statement_import_mode", sql.raw("mode IN ('bank','card')")),
    check(
      "statement_import_format",
      sql.raw("format IN ('csv','xlsx','xls','pdf-text','pdf-ocr')"),
    ),
    check(
      "statement_import_institution",
      sql.raw(
        "institution IN ('nacion','credicoop','santander','bbva','galicia','macro','patagonia','mercadopago')",
      ),
    ),
  ],
);
export const statementRows = sqliteTable(
  "statement_rows",
  {
    id: text("id").primaryKey().notNull(),
    importId: text("import_id").notNull(),
    userId: text("user_id").notNull(),
    key: text("source_key").notNull(),
    sourceRef: text("source_ref").notNull(),
    date: text("date").notNull(),
    description: text("description").notNull(),
    currency: text("currency", { enum: currencies }).notNull(),
    amountMinor: integer("amount_minor").notNull(),
    kind: text("kind", { enum: ["income", "expense", "internal", "part"] }).notNull(),
    category: text("category").notNull(),
    scope: text("scope", { enum: ["ledger", "history", "internal", "part"] }).notNull(),
    entryId: text("entry_id"),
    duplicateAcknowledged: integer("duplicate_acknowledged", { mode: "boolean" }).notNull(),
  },
  (t) => [
    uniqueIndex("statement_row_source").on(t.importId, t.key),
    uniqueIndex("statement_row_entry").on(t.entryId),
    uniqueIndex("statement_row_owner_currency").on(t.id, t.userId, t.currency),
    index("statement_history_date").on(t.userId, t.currency, t.date),
    foreignKey({
      columns: [t.importId, t.userId, t.currency],
      foreignColumns: [statementImports.id, statementImports.userId, statementImports.currency],
    }),
    foreignKey({
      columns: [t.entryId, t.userId, t.currency],
      foreignColumns: [entries.id, entries.userId, entries.currency],
    }),
    check(
      "statement_row_money",
      sql.raw(
        "typeof(amount_minor)='integer' AND abs(amount_minor) BETWEEN 1 AND 1000000000000 AND (kind='part' OR amount_minor>0)",
      ),
    ),
    check(
      "statement_row_date",
      sql.raw("length(date)=10 AND date(date,'+0 days') IS NOT NULL AND date(date,'+0 days')=date"),
    ),
    check("statement_row_currency", statementCurrencyCheck),
    check("statement_row_description", sql.raw("length(description) BETWEEN 2 AND 120")),
    check(
      "statement_row_scope",
      sql.raw(
        "(scope='ledger' AND kind IN ('income','expense') AND entry_id IS NOT NULL) OR (scope='history' AND kind IN ('income','expense') AND entry_id IS NULL) OR (scope='internal' AND kind='internal' AND entry_id IS NULL) OR (scope='part' AND kind='part' AND entry_id IS NULL)",
      ),
    ),
    check("statement_row_ack", sql.raw("duplicate_acknowledged IN (0,1)")),
  ],
);
export const breakdownRevisions = sqliteTable(
  "breakdown_revisions",
  {
    importId: text("import_id").primaryKey().notNull(),
    userId: text("user_id").notNull(),
    currency: text("currency", { enum: currencies }).notNull(),
    entryId: text("entry_id"),
    historyRowId: text("history_row_id"),
  },
  (t) => [
    foreignKey({
      columns: [t.importId, t.userId, t.currency],
      foreignColumns: [statementImports.id, statementImports.userId, statementImports.currency],
    }),
    foreignKey({
      columns: [t.entryId, t.userId, t.currency],
      foreignColumns: [entries.id, entries.userId, entries.currency],
    }),
    foreignKey({
      columns: [t.historyRowId, t.userId, t.currency],
      foreignColumns: [statementRows.id, statementRows.userId, statementRows.currency],
    }),
    check(
      "breakdown_revision_target",
      sql.raw(
        "(entry_id IS NOT NULL AND history_row_id IS NULL) OR (entry_id IS NULL AND history_row_id IS NOT NULL)",
      ),
    ),
  ],
);
export const expenseBreakdowns = sqliteTable(
  "expense_breakdowns",
  {
    id: text("id").primaryKey().notNull(),
    userId: text("user_id").notNull(),
    currency: text("currency", { enum: currencies }).notNull(),
    entryId: text("entry_id"),
    historyRowId: text("history_row_id"),
    importId: text("import_id").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("breakdown_entry").on(t.entryId),
    uniqueIndex("breakdown_history").on(t.historyRowId),
    index("breakdown_owner_currency").on(t.userId, t.currency),
    foreignKey({
      columns: [t.importId, t.userId, t.currency],
      foreignColumns: [statementImports.id, statementImports.userId, statementImports.currency],
    }),
    foreignKey({
      columns: [t.entryId, t.userId, t.currency],
      foreignColumns: [entries.id, entries.userId, entries.currency],
    }),
    foreignKey({
      columns: [t.historyRowId, t.userId, t.currency],
      foreignColumns: [statementRows.id, statementRows.userId, statementRows.currency],
    }),
    check(
      "breakdown_target",
      sql.raw(
        "(entry_id IS NOT NULL AND history_row_id IS NULL) OR (entry_id IS NULL AND history_row_id IS NOT NULL)",
      ),
    ),
  ],
);
export const favorites = sqliteTable(
  "favorites",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    symbol: text("symbol").notNull(),
  },
  (t) => [uniqueIndex("favorite_user_symbol").on(t.userId, t.symbol)],
);
// favorites queda como archivo de la versión anterior. La migración conserva sus filas.
export const stockCompanies = sqliteTable(
  "stock_companies",
  {
    id: text("id").primaryKey(),
    symbol: text("symbol").notNull(),
    name: text("name").notNull(),
    exchange: text("exchange", { enum: ["NASDAQ", "NYSE"] }),
    tradingviewSymbol: text("tradingview_symbol"),
    verifiedAt: text("verified_at"),
  },
  (t) => [
    uniqueIndex("stock_company_symbol").on(t.symbol),
    check(
      "stock_company_exchange",
      sql`${t.exchange} IS NULL OR ${t.exchange} IN ('NASDAQ','NYSE')`,
    ),
    check(
      "stock_company_chart",
      sql`(${t.exchange} IS NULL AND ${t.tradingviewSymbol} IS NULL) OR (${t.exchange} IS NOT NULL AND ${t.tradingviewSymbol} IS NOT NULL AND ${t.tradingviewSymbol} = ${t.exchange} || ':' || ${t.symbol})`,
    ),
  ],
);
export const stockIndices = sqliteTable(
  "stock_indices",
  {
    id: text("id", { enum: ["sp100", "ndx"] }).primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    verifiedAt: text("verified_at").notNull(),
    compositionDate: text("composition_date").notNull(),
    sourceUrl: text("source_url").notNull(),
  },
  (t) => [check("stock_index_id", sql`${t.id} IN ('sp100','ndx')`)],
);
export const stockIndexMembers = sqliteTable(
  "stock_index_members",
  {
    indexId: text("index_id", { enum: ["sp100", "ndx"] })
      .notNull()
      .references(() => stockIndices.id, { onDelete: "cascade" }),
    companyId: text("company_id")
      .notNull()
      .references(() => stockCompanies.id, { onDelete: "restrict" }),
  },
  (t) => [
    primaryKey({ columns: [t.indexId, t.companyId] }),
    index("stock_member_company").on(t.companyId),
  ],
);
export const stockFavorites = sqliteTable(
  "stock_favorites",
  {
    userId: text("user_id").notNull(),
    companyId: text("company_id")
      .notNull()
      .references(() => stockCompanies.id, { onDelete: "restrict" }),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.companyId] }),
    index("stock_favorite_company").on(t.companyId),
  ],
);
export const userMarketPreferences = sqliteTable("user_market_preferences", {
  userId: text("user_id").primaryKey(),
  indexId: text("index_id", { enum: ["sp100", "ndx"] })
    .notNull()
    .references(() => stockIndices.id),
  updatedAt: text("updated_at").notNull(),
});
export const dismissedPaymentNotices = sqliteTable(
  "dismissed_payment_notices",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    occurrenceId: text("occurrence_id").notNull(),
    currency: text("currency", { enum: currencies }).notNull(),
    dismissedAt: text("dismissed_at").notNull(),
  },
  (t) => [
    uniqueIndex("dismissed_notice_user_occurrence").on(t.userId, t.occurrenceId),
    foreignKey({
      columns: [t.occurrenceId, t.userId, t.currency],
      foreignColumns: [occurrences.id, occurrences.userId, occurrences.currency],
    }),
  ],
);
export const editions = sqliteTable(
  "news_editions",
  {
    id: text("id").primaryKey(),
    cadence: text("cadence", { enum: ["daily", "weekly"] }).notNull(),
    period: text("period").notNull(),
    refreshedAt: text("refreshed_at").notNull(),
    articlesJson: text("articles_json").notNull(),
  },
  (t) => [uniqueIndex("edition_cadence_period").on(t.cadence, t.period)],
);

// news_editions se conserva como historial de la versión anterior.
export const newsArticles = sqliteTable(
  "news_articles",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    sourceName: text("source_name").notNull(),
    externalId: text("external_id"),
    title: text("title").notNull(),
    description: text("description"),
    url: text("url").notNull(),
    imageUrl: text("image_url"),
    category: text("category").notNull(),
    language: text("language").notNull(),
    publishedAt: text("published_at").notNull(),
    fetchedAt: text("fetched_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("news_article_url").on(t.url),
    index("news_source_published").on(t.source, t.publishedAt),
    index("news_published").on(t.publishedAt),
    index("news_category_published").on(t.category, t.publishedAt),
  ],
);
export const savedNews = sqliteTable(
  "saved_news",
  {
    userId: text("user_id").notNull(),
    articleId: text("article_id")
      .notNull()
      .references(() => newsArticles.id, { onDelete: "cascade" }),
    savedAt: text("saved_at").notNull(),
  },
  (t) => [
    uniqueIndex("saved_news_user_article").on(t.userId, t.articleId),
    index("saved_news_article").on(t.articleId),
  ],
);
export const newsSyncState = sqliteTable("news_sync_state", {
  source: text("source").primaryKey(),
  leaseToken: text("lease_token"),
  leaseUntil: text("lease_until"),
  lastAttemptAt: text("last_attempt_at"),
  lastSuccessAt: text("last_success_at"),
  nextAttemptAt: text("next_attempt_at").notNull(),
  status: text("status").notNull(),
  error: text("error"),
});
export const favoriteNewsSources = sqliteTable(
  "favorite_news_sources",
  {
    userId: text("user_id").notNull(),
    source: text("source").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("favorite_news_user_source").on(t.userId, t.source)],
);
export const weeklyNewsEditions = sqliteTable("weekly_news_editions", {
  period: text("period").primaryKey(),
  publicationToken: text("publication_token").notNull(),
  publishedAt: text("published_at").notNull(),
  fromAt: text("from_at").notNull(),
  toAt: text("to_at").notNull(),
});
export const weeklyNewsArticles = sqliteTable(
  "weekly_news_articles",
  {
    period: text("period")
      .notNull()
      .references(() => weeklyNewsEditions.period, { onDelete: "cascade" }),
    articleId: text("article_id")
      .notNull()
      .references(() => newsArticles.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("weekly_news_period_article").on(t.period, t.articleId),
    index("weekly_news_article").on(t.articleId),
  ],
);
