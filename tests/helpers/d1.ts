import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
// Adaptador de pruebas: ejecuta el SQL real de Drizzle sobre SQLite, con batch atómico.
export function testD1(
  options: {
    beforeMigration?: (sqlite: DatabaseSync, name: string) => void;
    afterRead?: (sqlite: DatabaseSync, query: string) => void;
  } = {},
) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const folder = new URL("../../drizzle/", import.meta.url);
  for (const name of readdirSync(folder)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    options.beforeMigration?.(sqlite, name);
    // D1 aplica cada migración dentro de una transacción, con las FK activas.
    sqlite.exec("BEGIN");
    try {
      sqlite.exec(readFileSync(new URL(name, folder), "utf8"));
      sqlite.exec("COMMIT");
    } catch (error) {
      sqlite.exec("ROLLBACK");
      sqlite.close();
      throw error;
    }
  }
  let inBatch = false;
  let deferredReads: string[] = [];
  function afterRead(query: string) {
    if (inBatch) deferredReads.push(query);
    else options.afterRead?.(sqlite, query);
  }
  class Statement {
    constructor(
      public query: string,
      public parameters: unknown[] = [],
    ) {}
    bind(...values: unknown[]) {
      return new Statement(this.query, values);
    }
    async all() {
      return this.allSync();
    }
    allSync() {
      const result = {
        success: true,
        results: sqlite.prepare(this.query).all(...(this.parameters as never[])),
      };
      afterRead(this.query);
      return result;
    }
    async raw(options?: { columnNames?: boolean }) {
      const statement = sqlite.prepare(this.query);
      statement.setReturnArrays(true);
      const rows = statement.all(...(this.parameters as never[]));
      afterRead(this.query);
      return options?.columnNames
        ? [statement.columns().map((column) => column.name), ...rows]
        : rows;
    }
    async first(column?: string) {
      const row = sqlite.prepare(this.query).get(...(this.parameters as never[]));
      return row ? (column ? row[column] : row) : null;
    }
    async run() {
      const info = sqlite.prepare(this.query).run(...(this.parameters as never[]));
      return {
        success: true,
        results: [],
        meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) },
      };
    }
  }
  const binding = {
    prepare(query: string) {
      return new Statement(query);
    },
    async batch(statements: Statement[]) {
      sqlite.exec("BEGIN");
      inBatch = true;
      const result = [];
      try {
        // Sin ceder entre sentencias: otro batch no puede observar escrituras parciales.
        for (const statement of statements) result.push(statement.allSync());
        sqlite.exec("COMMIT");
      } catch (error) {
        inBatch = false;
        deferredReads = [];
        sqlite.exec("ROLLBACK");
        throw error;
      }
      inBatch = false;
      const reads = deferredReads;
      deferredReads = [];
      for (const query of reads) options.afterRead?.(sqlite, query);
      return result;
    },
  } as unknown as D1Database;
  return { binding, sqlite };
}
