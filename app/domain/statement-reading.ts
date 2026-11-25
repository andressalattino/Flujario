import { isISODate } from "./dates";
import { parseMoney, moneyInput, type Currency } from "./money";
import { statementRowSchema, type StatementRowInput } from "./statements";

export type Grid = { name: string; rows: string[][] };
// Reúne palabras por posición, incluso si el OCR separó la tabla en bloques por columna.
export function ocrTableRows(
  words: { text: string; bbox: { x0: number; x1: number; y0: number; y1: number } }[],
): string[][] {
  const heights = words
    .map((w) => w.bbox.y1 - w.bbox.y0)
    .filter((h) => h > 0)
    .sort((a, b) => a - b);
  const height = heights[Math.floor(heights.length / 2)] ?? 20;
  const lines: { y: number; words: typeof words }[] = [];
  for (const word of words) {
    if (!word.text.trim()) continue;
    const y = (word.bbox.y0 + word.bbox.y1) / 2;
    let line = lines.find((l) => Math.abs(l.y - y) < height * 0.65);
    if (!line) {
      line = { y, words: [] };
      lines.push(line);
    }
    line.words.push(word);
  }
  return lines
    .sort((a, b) => a.y - b.y)
    .map((line) => {
      const cells: string[] = [];
      let end = -Infinity;
      for (const word of line.words.sort((a, b) => a.bbox.x0 - b.bbox.x0)) {
        if (word.bbox.x0 - end < height * 0.9 && cells.length)
          cells[cells.length - 1] += " " + word.text;
        else cells.push(word.text);
        end = word.bbox.x1;
      }
      return cells;
    });
}
export type Mapping = {
  header: number;
  date: number;
  description: number;
  amount: number;
  debit: number;
  credit: number;
  currency: number;
  type: number;
  convention: "signed" | "expense" | "income";
  locale: "ar" | "en";
};
export type DraftRow = {
  key: string;
  sourceRef: string;
  date: string;
  description: string;
  amount: string;
  currency: Currency;
  kind: StatementRowInput["kind"];
  category: StatementRowInput["category"];
  selected: boolean;
  duplicateAcknowledged: boolean;
  issue?: string;
};
const normalized = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
const aliases = {
  date: /^(fecha|date|fecha de (operacion|movimiento)|fecha operacion)$/,
  description: /^(descripcion|description|concepto|detalle|operacion|comercio)$/,
  amount: /^(importe|monto|amount|valor|importe neto)$/,
  debit: /^(debito|debitos|egreso|egresos|debit|debe)$/,
  credit: /^(credito|creditos|ingreso|ingresos|credit|haber)$/,
  currency: /^(moneda|currency|divisa)$/,
  type: /^(tipo|type|sentido)$/,
};
export function guessMapping(grid: Grid): Mapping {
  let best = 0,
    score = -1;
  grid.rows.slice(0, 40).forEach((r, i) => {
    const n = r.filter((c) => Object.values(aliases).some((re) => re.test(normalized(c)))).length;
    if (n > score) {
      score = n;
      best = i;
    }
  });
  const head = grid.rows[best] ?? [];
  const find = (key: keyof typeof aliases) =>
    head.findIndex((s) => aliases[key].test(normalized(s)));
  return {
    header: best,
    date: find("date"),
    description: find("description"),
    amount: find("amount"),
    debit: find("debit"),
    credit: find("credit"),
    currency: find("currency"),
    type: find("type"),
    convention: "signed",
    locale: "ar",
  };
}
export function readStatementDate(input: string) {
  const s = input.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/.exec(s);
  const ar = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})(?:\s.*)?$/.exec(s);
  const date = iso
    ? `${iso[1]}-${iso[2]}-${iso[3]}`
    : ar
      ? `${ar[3]}-${ar[2]!.padStart(2, "0")}-${ar[1]!.padStart(2, "0")}`
      : "";
  if (!isISODate(date)) throw new Error("Fecha inválida: usá día/mes/año de cuatro dígitos.");
  return date;
}
export function readStatementAmount(input: string, currency: Currency, locale: "ar" | "en") {
  let s = input
    .trim()
    .replace(/^(?:ARS|USD|EUR|BRL|CLP|UYU|GBP|CAD|CHF|AUD|US\$|\$)\s*/i, "")
    .replace(/\u2212/g, "-");
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/^[+-]/.test(s)) {
    if (negative) throw new Error("Revisá el signo del importe.");
    negative = s[0] === "-";
    s = s.slice(1);
  }
  if (locale === "en") {
    if (!/^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(s))
      throw new Error("Revisá el separador decimal y los miles.");
    s = s.replaceAll(",", "").replace(".", ",");
  }
  return parseMoney(s, currency) * (negative ? -1 : 1);
}
export function mapStatementGrid(
  grid: Grid,
  m: Mapping,
  currency: Currency,
  card: boolean,
): DraftRow[] {
  if (m.date < 0 || m.description < 0 || (m.amount < 0 && (m.debit < 0 || m.credit < 0)))
    throw new Error("Elegí fecha, descripción y un importe o las columnas débito y crédito.");
  const head = grid.rows[m.header];
  return grid.rows.slice(m.header + 1).flatMap((cells, i) => {
    if (!cells.some((s) => s.trim()) || (head && cells.join("|") === head.join("|"))) return [];
    const row: DraftRow = {
      key: `r${m.header + i + 2}`,
      sourceRef: `${grid.name} · fila ${m.header + i + 2}`.slice(0, 80),
      date: cells[m.date] ?? "",
      description: cells[m.description] ?? "",
      amount: "",
      currency,
      kind: card ? "part" : "expense",
      category: "Otros",
      selected: true,
      duplicateAcknowledged: false,
    };
    try {
      row.date = readStatementDate(row.date);
      const originalCurrency =
        m.currency >= 0 ? (cells[m.currency] ?? "").trim().toUpperCase() : "";
      if (originalCurrency && originalCurrency !== currency)
        throw new Error(`La fila indica ${originalCurrency}; elegí su moneda o excluila.`);
      let amount: number;
      if (m.debit >= 0 && m.credit >= 0) {
        const d = (cells[m.debit] ?? "").trim(),
          c = (cells[m.credit] ?? "").trim();
        const debit = d ? readStatementAmount(d, currency, m.locale) : 0;
        const credit = c ? readStatementAmount(c, currency, m.locale) : 0;
        if (debit < 0 || credit < 0 || (debit && credit))
          throw new Error("Revisá débito y crédito: debe haber un único sentido.");
        amount = card ? debit - credit : credit - debit;
      } else amount = readStatementAmount(cells[m.amount] ?? "", currency, m.locale);
      const type = m.type >= 0 ? normalized(cells[m.type] ?? "") : "";
      if (!card) {
        if (
          type &&
          !/^(ingreso|income|credito|egreso|gasto|expense|debito|transferencia propia|internal)$/.test(
            type,
          )
        )
          throw new Error("Tipo desconocido: elegí ingreso, gasto o transferencia propia.");
        row.kind = /^(transferencia propia|internal)$/.test(type)
          ? "internal"
          : /^(ingreso|income|credito)$/.test(type)
            ? "income"
            : /^(egreso|gasto|expense|debito)$/.test(type)
              ? "expense"
              : m.convention === "signed"
                ? amount < 0
                  ? "expense"
                  : "income"
                : m.convention;
      }
      row.amount = signedMoneyInput(card ? amount : Math.abs(amount), currency);
      if (!amount) throw new Error("El importe es cero; revisá o excluí esta fila.");
      row.issue = undefined;
    } catch (e) {
      row.issue = e instanceof Error ? e.message : "Revisá la fila.";
    }
    return [row];
  });
}
export function signedMoneyInput(minor: number, currency: Currency) {
  return (minor < 0 ? "-" : "") + moneyInput(Math.abs(minor), currency);
}
export function validateDraft(
  row: DraftRow,
  card: boolean,
  asOf: string,
): { value?: StatementRowInput; error?: string } {
  if (row.issue) return { error: row.issue };
  try {
    const amountMinor = readStatementAmount(row.amount, row.currency, "ar");
    const parsed = statementRowSchema.safeParse({
      ...row,
      amountMinor,
      kind: card ? "part" : row.kind,
    });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisá la fila." };
    if (!card && amountMinor <= 0)
      return { error: "Ingresá un importe positivo y elegí el sentido." };
    if (parsed.data.date > asOf) return { error: "La fecha es futura." };
    return { value: parsed.data };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Revisá el importe." };
  }
}
