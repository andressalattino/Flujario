// Preparación única de la migración aún no aplicada. No modifica ninguna base.
import { readFile, writeFile, rename } from "node:fs/promises";
const old = "drizzle/0007_yummy_the_liberteens.sql",
  next = "drizzle/0007_statement_imports.sql";
const journalPath = "drizzle/meta/_journal.json",
  snapshotPath = "drizzle/meta/0007_snapshot.json";
const journal = JSON.parse(await readFile(journalPath, "utf8"));
if (journal.entries.at(-1).tag !== "0007_yummy_the_liberteens")
  throw Error("La migración ya fue preparada o cambió el esquema.");
const oldCheck = "length(date)=10 AND date(date,'+0 days')=date",
  newCheck = "length(date)=10 AND date(date,'+0 days') IS NOT NULL AND date(date,'+0 days')=date";
const ddl = (await readFile(old, "utf8")).replace(oldCheck, newCheck);
const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
snapshot.tables.statement_rows.checkConstraints.statement_row_date.value = newCheck;
await writeFile(old, ddl);
await rename(old, next);
journal.entries.at(-1).tag = "0007_statement_imports";
await writeFile(journalPath, JSON.stringify(journal, null, 2) + "\n");
await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2) + "\n");
console.log("Migración 0007 preparada; ninguna base fue aplicada.");
