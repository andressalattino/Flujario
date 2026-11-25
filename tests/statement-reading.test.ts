import { expect, it } from "vitest";
import {
  readStatementAmount,
  readStatementDate,
  guessMapping,
  mapStatementGrid,
  validateDraft,
  ocrTableRows,
} from "../app/domain/statement-reading";
it("reconstruye columnas de OCR con posiciones, sin separar las palabras de una descripción", () => {
  const word = (text: string, x: number, y: number, width = 70) => ({
    text,
    bbox: { x0: x, x1: x + width, y0: y, y1: y + 20 },
  });
  expect(
    ocrTableRows([
      word("Fecha", 0, 0),
      word("Compra", 200, 40),
      word("Importe", 500, 0),
      word("15/11/2026", 0, 40, 110),
      word("Descripción", 200, 0),
      word("supermercado", 275, 41, 150),
      word("100,00", 500, 40),
    ]),
  ).toEqual([
    ["Fecha", "Descripción", "Importe"],
    ["15/11/2026", "Compra supermercado", "100,00"],
  ]);
});
it.each([
  ["1.234,56", "ar", 123456],
  ["1,234.56", "en", 123456],
  ["(1.234,56)", "ar", -123456],
  ["−0,01", "ar", -1],
  ["US$ 100.01", "en", 10001],
] as const)("lee %s sin cálculos decimales", (s, l, n) =>
  expect(readStatementAmount(s, "ARS", l)).toBe(n),
);
it("rechaza precisión extra, agrupación errónea y límites", () => {
  for (const value of ["1,005", "1.23,45", "1e4", "NaN", "10000000001", "--20", "(-20)"])
    expect(() => readStatementAmount(value, "ARS", "ar")).toThrow();
  expect(readStatementAmount("1.234", "CLP", "ar")).toBe(1234);
  expect(() => readStatementAmount("1,20", "CLP", "ar")).toThrow();
});
it("fechas argentinas, cambio de año y bisiestos sin adivinar años cortos", () => {
  expect(readStatementDate("29/02/2024")).toBe("2024-02-29");
  expect(readStatementDate("2026-12-31")).toBe("2026-12-31");
  for (const date of ["29/02/2026", "31/04/2026", "01/02/26", "13/40/2026"])
    expect(() => readStatementDate(date)).toThrow();
});
it("mapea débito/crédito y conserva filas problemáticas para revisión", () => {
  const grid = {
    name: "Hoja",
    rows: [
      ["Banco"],
      ["Fecha", "Detalle", "Débito", "Crédito"],
      ["15/11/2026", "Compra", "1.200,30", ""],
      ["16/11/2026", "Cobro", "", "4.000,00"],
      ["16/11/2026", "Confuso", "20", "30"],
      ["Fecha", "Detalle", "Débito", "Crédito"],
      ["Total", "Saldo", "0", ""],
    ],
  };
  const mapping = guessMapping(grid);
  expect(mapping.header).toBe(1);
  const rows = mapStatementGrid(grid, mapping, "ARS", false);
  expect(rows).toHaveLength(4);
  expect(rows[0]).toMatchObject({ date: "2026-11-15", kind: "expense", amount: "1200,30" });
  expect(rows[1]).toMatchObject({ kind: "income", amount: "4000,00" });
  expect(rows[2]?.issue).toContain("único sentido");
  expect(rows[3]?.issue).toContain("Fecha inválida");
  expect(validateDraft(rows[0]!, false, "2026-11-20").value?.amountMinor).toBe(120030);
  expect(validateDraft({ ...rows[0]!, date: "2027-01-01" }, false, "2026-11-20").error).toContain(
    "futura",
  );
});
it("un consumo positivo de tarjeta sigue siendo una parte y un reintegro conserva su signo", () => {
  const g = {
    name: "Tarjeta",
    rows: [
      ["Fecha", "Descripción", "Importe"],
      ["15/11/2026", "Compra", "110,00"],
      ["16/11/2026", "Reintegro", "-10,00"],
    ],
  };
  const rows = mapStatementGrid(g, guessMapping(g), "ARS", true);
  expect(rows.every((r) => r.kind === "part")).toBe(true);
  expect(validateDraft(rows[1]!, true, "2026-11-20").value?.amountMinor).toBe(-1000);
});
it("una moneda diferente se señala y no se convierte ni se suma silenciosamente", () => {
  const g = {
    name: "Cuenta",
    rows: [
      ["Fecha", "Descripción", "Importe", "Moneda"],
      ["15/11/2026", "Compra", "100,00", "USD"],
    ],
  };
  expect(mapStatementGrid(g, guessMapping(g), "ARS", false)[0]?.issue).toContain("USD");
});
