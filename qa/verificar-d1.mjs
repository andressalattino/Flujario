// Verificación adicional sobre workerd/D1 local, con datos ficticios y sin Clerk.
// Usa las herramientas de desarrollo ya instaladas; no crea recursos remotos.
import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const output = resolve(".wrangler/qa-runtime/repository.mjs");
await mkdir(resolve(".wrangler/qa-runtime"), { recursive: true });
await build({
  stdin: {
    contents:
      'export * from "./app/db/repository.server.ts"; export { refreshQuoteCache } from "./app/services/quotes.server.ts";',
    resolveDir: resolve("."),
  },
  outfile: output,
  bundle: true,
  platform: "node",
  format: "esm",
  logLevel: "silent",
});
const { createDb, getSnapshot, performOperation, refreshQuoteCache } = await import(
  pathToFileURL(output).href
);
const runtime = new Miniflare(
  convertV4MiniflareOptions({
    name: "qa-flujario",
    compatibilityDate: "2026-11-13",
    modules: true,
    script: `export default { fetch() { return Response.json(JSON.parse('{"rate":12345678901234567890.12345678}', (key,value,context) => typeof value === 'number' ? context.source : value)); } }`,
    d1Databases: ["DB"],
    d1Persist: false,
  }),
);
try {
  assert.deepEqual(await (await runtime.dispatchFetch("http://localhost/exact-json")).json(), {
    rate: "12345678901234567890.12345678",
  });
  const binding = await runtime.getD1Database("DB");
  const migrations = (await readdir("drizzle")).filter((name) => name.endsWith(".sql")).sort();
  for (const name of migrations) {
    if (name.startsWith("0002_")) {
      await binding.batch([
        binding.prepare("INSERT INTO accounts VALUES ('old-ars','old-user','Pesos','ARS',100000)"),
        binding.prepare(
          "INSERT INTO payment_rules VALUES ('old-rule','old-user','Servicio',15000,'ARS','2026-09-30','monthly','old-key','old-hash')",
        ),
        binding.prepare(
          "INSERT INTO payment_occurrences VALUES ('old-occ','old-rule','old-user','2026-09-30',15000,'ARS')",
        ),
        binding.prepare(
          "INSERT INTO entries VALUES ('old-paid','old-user','expense','old-ars',NULL,15000,'ARS','Servicio','Servicios','2026-09-30','old-occ','old-pay','old-pay-hash','2026-09-30T15:00:00Z')",
        ),
        binding.prepare(
          "INSERT INTO dismissed_payment_notices VALUES ('old-notice','old-user','old-occ','ARS','2026-11-01T15:00:00Z')",
        ),
      ]);
    }
    const statements = (await readFile(resolve("drizzle", name), "utf8"))
      .split("--> statement-breakpoint")
      .map((text) => text.trim())
      .filter(Boolean);
    await binding.batch(statements.map((statement) => binding.prepare(statement)));
  }
  assert.equal(
    await binding
      .prepare("SELECT amount_cents FROM entries WHERE id = 'old-paid'")
      .first("amount_cents"),
    15000,
  );
  assert.equal(
    await binding.prepare("SELECT count(*) AS total FROM dismissed_payment_notices").first("total"),
    1,
  );
  const db = createDb(binding);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  await performOperation(db, "qa-user", { intent: "setup", ars: 100000, usd: 5000 });
  await performOperation(db, "qa-user", {
    intent: "payment",
    title: "Luz de prueba",
    amount: 15000,
    keepAmount: "no",
    currency: "ARS",
    dueDate: date,
    frequency: "monthly",
    requestKey: crypto.randomUUID(),
  });
  let state = await getSnapshot(db, "qa-user");
  const [current, next, manual, inherited] = state.payments;
  assert.equal(next.amountMinor, null);
  const pay = {
    intent: "pay",
    currency: "ARS",
    occurrenceId: next.id,
    amount: 18999,
    date,
    futureAmount: "unchanged",
    requestKey: crypto.randomUUID(),
  };
  await performOperation(db, "qa-user", pay);
  await performOperation(db, "qa-user", pay);
  const edit = (payment, amount, futureAmount) => ({
    intent: "edit-payment",
    currency: "ARS",
    occurrenceId: payment.id,
    amount,
    futureAmount,
    requestKey: crypto.randomUUID(),
  });
  await performOperation(db, "qa-user", edit(manual, 25000, "unchanged"));
  await performOperation(db, "qa-user", edit(current, 21000, "use"));
  state = await getSnapshot(db, "qa-user");
  assert.equal(state.entries.length, 1);
  assert.equal(state.payments.find((p) => p.id === next.id).amountMinor, 18999);
  assert.equal(state.payments.find((p) => p.id === manual.id).amountMinor, 25000);
  assert.equal(state.payments.find((p) => p.id === inherited.id).amountMinor, 21000);
  await assert.rejects(performOperation(db, "qa-user", edit(next, 999, "use")), { status: 409 });
  await assert.rejects(performOperation(db, "other-user", edit(current, 999, "use")), {
    status: 404,
  });
  await performOperation(db, "qa-user", {
    intent: "add-currency",
    currency: "CLP",
    opening: 15000,
  });
  const conversion = {
    intent: "exchange",
    currency: "ARS",
    targetCurrency: "USD",
    amount: 15000,
    targetAmount: 1000,
    rate: "15",
    quoteId: "",
    date,
    requestKey: crypto.randomUUID(),
  };
  await performOperation(db, "qa-user", conversion);
  await performOperation(db, "qa-user", conversion);
  const converted = await getSnapshot(db, "qa-user");
  assert.equal(converted.entries.filter((entry) => entry.kind === "exchange").length, 1);
  assert.equal(
    converted.accounts.find((account) => account.currency === "CLP").openingMinor,
    15000,
  );
  if (process.argv.includes("--capturar-cotizaciones")) {
    const result = await refreshQuoteCache(db);
    const captured = await getSnapshot(db, "qa-user");
    assert.ok(captured.quotes.some((quote) => quote.series === "usd-oficial"));
    assert.ok(captured.quotes.some((quote) => quote.series === "eur"));
    assert.ok(captured.quotes.some((quote) => quote.series === "brl"));
    await writeFile(
      resolve("app/data/captured-quotes.json"),
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          asOf: date,
          quotes: captured.quotes,
          quoteState: captured.quoteState,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      `Cotizaciones públicas verificadas y capturadas: ${captured.quotes.length}; estado ${result.status}.`,
    );
  }
  assert.deepEqual((await binding.prepare("PRAGMA foreign_key_check").all()).results, []);
  console.log(
    "D1 local: migración con datos anteriores, pago sin importe, reintento, edición, propagación y autorización aprobados.",
  );
} finally {
  await runtime.dispose();
}
