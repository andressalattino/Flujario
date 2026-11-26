import {
  readStatementAmount,
  readStatementDate,
  signedMoneyInput,
  type DraftRow,
} from "./statement-reading";
import { sumMinor } from "./money";
import { MAX_STATEMENT_ROWS } from "./statements";

export type PdfTextLine = {
  y: number;
  items: { x: number; width: number; text: string }[];
};

type SantanderCurrency = "ARS" | "USD";
export type SantanderBatch = { currency: SantanderCurrency; rows: DraftRow[] };
type AccountTable = SantanderBatch & { balance?: number; closed: boolean };

const headings = { ARS: "Caja de Ahorro en pesos", USD: "Caja de Ahorro en dólares" } as const;
const movementDate = /^\d{2}\/\d{2}\/\d{2}(?:\d{2})?$/;

function columnsIn(line: PdfTextLine) {
  const find = (label: string) => line.items.find((item) => item.text.trim() === label);
  const date = find("Fecha"),
    receipt = find("Comprobante"),
    description = find("Movimiento");
  const balance = find("Saldo en cuenta");
  const pesos = find(headings.ARS),
    dollars = find(headings.USD);
  const amount = pesos ?? dollars;
  if (!date || !receipt || !description || !amount || !balance || (pesos && dollars)) return;
  if (!(
    date.x < receipt.x &&
    receipt.x < description.x &&
    description.x < amount.x &&
    amount.x < balance.x
  ))
    return;
  const currency: SantanderCurrency = pesos ? "ARS" : "USD";
  return {
    currency,
    receipt: receipt.x - 7,
    description: description.x - 8,
    amount: amount.x - 18,
    balance: balance.x - 8,
  };
}

function santanderDate(value: string) {
  return readStatementDate(value.length === 8 ? `${value.slice(0, 6)}20${value.slice(6)}` : value);
}

function statementPeriod(page: PdfTextLine[], headerIndex: number) {
  const texts = page
    .slice(0, headerIndex)
    .flatMap((line) => line.items.map((item) => item.text.trim()));
  const start = texts.find((text) => /^Desde:\s*\d{2}\/\d{2}\/\d{2}(?:\d{2})?$/i.test(text));
  const end = texts.find((text) => /^Hasta:\s*\d{2}\/\d{2}\/\d{2}(?:\d{2})?$/i.test(text));
  if (!start || !end) throw new Error("No encontramos el período del resumen.");
  const from = santanderDate(start.slice(6).trim()),
    to = santanderDate(end.slice(6).trim());
  if (from > to) throw new Error("El período del resumen tiene fechas inconsistentes.");
  return { from, to };
}

function bankAmount(text: string, currency: SantanderCurrency) {
  const match = /^([-−+]?)\s*(\$|U\$S)\s*([\d.,]+)$/i.exec(text);
  if (!match || (match[2] === "$") !== (currency === "ARS"))
    throw new Error(`No pudimos identificar un importe de la tabla en ${currency}.`);
  return readStatementAmount(`${match[1]}${match[3]}`, currency, "ar");
}

function suggestCategory(description: string, kind: DraftRow["kind"]): DraftRow["category"] {
  const text = description
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (kind === "income") return /\b(sueldo|haberes|nomina)\b/.test(text) ? "Trabajo" : "Otros";
  if (/\b(impuestos?|iibb|iva)\b/.test(text)) return "Impuestos";
  if (/\b(suscripcion(?:es)?|netflix|youtube[\s*._-]*premium|hbo[\s*._-]*max)\b/.test(text))
    return "Suscripciones";
  if (/\b(supermercado|panaderia|verduleria|carniceria|restaurante|pizzeria)\b/.test(text))
    return "Alimentación";
  if (/\b(farmacia|obra social|prepaga)\b/.test(text)) return "Salud";
  if (/\b(peaje|estacionamiento|carga sube)\b/.test(text)) return "Transporte";
  if (/\b(internet|electricidad|telefonia)\b/.test(text)) return "Servicios";
  return "Otros";
}

export function readSantanderStatement(pages: PdfTextLine[][]): SantanderBatch[] | undefined {
  const firstPage = pages[0] ?? [];
  const headerIndex = firstPage.findIndex((line) => columnsIn(line) !== undefined);
  if (
    headerIndex < 0 ||
    !pages.some((page) =>
      page.some((line) => line.items.some((item) => /\bsantander\b/i.test(item.text))),
    )
  )
    return;

  const period = statementPeriod(firstPage, headerIndex);
  const tables = new Map<SantanderCurrency, AccountTable>();
  let rowCount = 0;
  for (const [pageIndex, lines] of pages.entries()) {
    let columns: ReturnType<typeof columnsIn>;
    let table: AccountTable | undefined;
    let draft: DraftRow | undefined;
    for (const [lineIndex, line] of lines.entries()) {
      const header = columnsIn(line);
      if (header) {
        columns = header;
        table = tables.get(header.currency) ?? {
          currency: header.currency,
          rows: [],
          closed: false,
        };
        if (table.closed) throw new Error(`Hay más de una tabla de cuenta en ${header.currency}.`);
        tables.set(header.currency, table);
        draft = undefined;
        continue;
      }
      if (!columns || !table) continue;
      const { currency, receipt, description, amount, balance } = columns;
      const date = line.items.find(
        (item) => item.x < receipt && movementDate.test(item.text.trim()),
      );
      const detail = line.items
        .filter((item) => item.x >= description && item.x < amount)
        .map((item) => item.text.trim())
        .join(" ");
      const money = line.items
        .filter((item) => item.x >= amount && item.x + item.width < balance)
        .map((item) => item.text.trim())
        .join(" ");
      const rowBalance = line.items
        .filter((item) => item.x >= amount && item.x + item.width >= balance)
        .map((item) => item.text.trim())
        .join(" ");

      if (line.items.some((item) => item.x > description && item.text.trim() === "Saldo total")) {
        if (table.balance !== bankAmount(rowBalance, currency))
          throw new Error(`El saldo final de ${currency} no coincide con los movimientos.`);
        table.closed = true;
        table = undefined;
        draft = undefined;
        continue;
      }
      if (!date) {
        if (money && rowBalance)
          throw new Error(`Encontramos un movimiento sin fecha en ${currency}.`);
        if (
          draft &&
          detail &&
          line.items.every((item) => item.x >= description && item.x < amount)
        ) {
          draft.description = `${draft.description} ${detail}`
            .replace(/\s+/g, " ")
            .slice(0, 120)
            .trim();
          draft.category = suggestCategory(draft.description, draft.kind);
        } else draft = undefined;
        continue;
      }

      draft = undefined;
      const day = santanderDate(date.text.trim());
      const entry = bankAmount(money, currency);
      const nextBalance = bankAmount(rowBalance, currency);
      if (detail === "Saldo Inicial") {
        if (table.balance !== undefined || entry !== nextBalance)
          throw new Error(`El saldo inicial de ${currency} es inconsistente.`);
        table.balance = nextBalance;
        continue;
      }
      if (day < period.from || day > period.to || detail.length < 2)
        throw new Error(
          `Encontramos un movimiento fuera del período o sin descripción en ${currency}.`,
        );
      if (table.balance === undefined || sumMinor([table.balance, entry]) !== nextBalance)
        throw new Error(`El saldo de ${currency} no coincide en la página ${pageIndex + 1}.`);
      table.balance = nextBalance;
      if (entry === 0) continue;
      if (++rowCount > MAX_STATEMENT_ROWS)
        throw new Error("El resumen supera los 2.000 movimientos.");
      const kind = entry < 0 ? "expense" : "income";
      draft = {
        key: `p${pageIndex + 1}-f${lineIndex + 1}`,
        sourceRef: `Santander · página ${pageIndex + 1}, fila ${lineIndex + 1}`,
        date: day,
        description: detail.slice(0, 120).trim(),
        amount: signedMoneyInput(Math.abs(entry), currency),
        currency,
        kind,
        category: suggestCategory(detail, kind),
        selected: true,
        duplicateAcknowledged: false,
      };
      table.rows.push(draft);
    }
  }
  if ([...tables.values()].some((table) => !table.closed))
    throw new Error("No pudimos verificar el cierre de todas las cuentas del resumen.");
  return [...tables.values()]
    .filter((table) => table.rows.length)
    .map(({ currency, rows }) => ({ currency, rows }));
}
