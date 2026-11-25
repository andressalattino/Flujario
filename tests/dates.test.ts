import { describe, it, expect } from "vitest";
import { occurrenceDates, isISODate, today } from "../app/domain/dates";
describe("Fechas financieras", () => {
  it("recupera el día 31 después de febrero", () =>
    expect(occurrenceDates("2027-01-31", "monthly", 3)).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
    ]));
  it("contempla febrero bisiesto", () =>
    expect(occurrenceDates("2028-01-31", "monthly", 3)[1]).toBe("2028-02-29"));
  it("conserva el ancla bisiesta anual", () =>
    expect(occurrenceDates("2028-02-29", "yearly", 5)).toEqual([
      "2028-02-29",
      "2029-02-28",
      "2030-02-28",
      "2031-02-28",
      "2032-02-29",
    ]));
  it("cambia de año y admite trimestrales", () =>
    expect(occurrenceDates("2026-11-30", "quarterly", 2)).toEqual(["2026-11-30", "2027-02-28"]));
  it("pago único produce un vencimiento", () =>
    expect(occurrenceDates("2026-12-01", "once")).toHaveLength(1));
  it.each(["2027-02-29", "2028-02-30", "2026-13-01", "2026-1-1", "2026-00-00", "1899-12-31"])(
    "rechaza fecha %s",
    (date) => expect(isISODate(date)).toBe(false),
  );
  it("usa la fecha argentina en el límite UTC", () =>
    expect(today(new Date("2026-11-14T01:00:00Z"))).toBe("2026-11-13"));
});
