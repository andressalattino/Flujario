import { describe, it, expect } from "vitest";
import { parseMoney, splitInstallments, sumMinor, formatMoney } from "../app/domain/money";
describe("Dinero exacto", () => {
  it.each([
    ["0,10", 10],
    ["0,20", 20],
    ["1.234,56", 123456],
    ["1234,5", 123450],
    ["0", 0],
  ])("convierte %s a centavos", (input, output) => expect(parseMoney(input)).toBe(output));
  it.each([
    "1.2",
    "1,234",
    "-20",
    "1e3",
    "Infinity",
    "NaN",
    "1,2,3",
    "",
    "1.00",
    "00,1",
    "9.999.999.999.999.999",
  ])("rechaza %s", (input) => expect(() => parseMoney(input)).toThrow());
  it("suma 10 + 20 centavos sin error decimal", () =>
    expect(sumMinor([parseMoney("0,10"), parseMoney("0,20")])).toBe(30));
  it("rechaza overflow y decimales en centavos", () => {
    expect(() => sumMinor([Number.MAX_SAFE_INTEGER, 1])).toThrow();
    expect(() => sumMinor([1.1])).toThrow();
  });
  it("muestra centavos exactos aun en totales grandes y negativos", () => {
    expect(formatMoney(Number.MAX_SAFE_INTEGER)).toContain("90.071.992.547.409,91");
    expect(formatMoney(-1)).toContain("0,01");
    expect(formatMoney(101)).toContain("1,01");
  });
  it("distribuye el sobrante y conserva el total de cuotas", () => {
    expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(sumMinor(splitInstallments(1, 1))).toBe(1);
  });
  it.each([0, -1, 1.5, 121, 101])("rechaza cuotas inválidas %s", (count) =>
    expect(() => splitInstallments(100, count)).toThrow(),
  );
});
