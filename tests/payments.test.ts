import { describe, it, expect } from "vitest";
import {
  selectedPaymentMonth,
  shiftMonth,
  paymentFilter,
  paymentsInMonth,
  pendingFromClosedMonths,
  visiblePaymentNotices,
} from "../app/domain/payments";
import type { Payment } from "../app/domain/finance";
const payment = (
  id: string,
  dueDate: string,
  paid = false,
  currency: "ARS" | "USD" = "ARS",
): Payment => ({
  id,
  dueDate,
  paid,
  currency,
  title: "Servicio",
  amountMinor: 1200,
  amountSource: "inherited",
  frequency: "monthly",
});
const payments = [
  payment("old", "2026-03-20"),
  payment("previous", "2026-10-20"),
  payment("paid", "2026-11-10", true),
  payment("current", "2026-11-20"),
  payment("usd", "2026-11-21", false, "USD"),
  payment("next", "2026-12-20"),
];
describe("Lista mensual de pagos", () => {
  it("empieza en el mes actual y admite cinco anteriores y cinco siguientes", () => {
    expect(selectedPaymentMonth(null, "2026-11-14")).toBe("2026-11");
    expect(selectedPaymentMonth("2026-06", "2026-11-14")).toBe("2026-06");
    expect(selectedPaymentMonth("2027-04", "2026-11-14")).toBe("2027-04");
  });
  it.each(["2026-05", "2027-05", "2026-13", "2026-1", "otro", ""])(
    "no admite un mes inválido o fuera del límite: %s",
    (value) => expect(selectedPaymentMonth(value, "2026-11-14")).toBe("2026-11"),
  );
  it("navega entre años sin perder el mes", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
  it("no mezcla vencimientos de otros meses ni monedas", () => {
    expect(paymentsInMonth(payments, "2026-11", "ARS").map((p) => p.id)).toEqual(["current"]);
    expect(paymentsInMonth(payments, "2026-12", "ARS").map((p) => p.id)).toEqual(["next"]);
    expect(paymentsInMonth(payments, "2026-11", "USD").map((p) => p.id)).toEqual(["usd"]);
  });
  it("separa pagados y pendientes dentro del mismo mes", () => {
    expect(paymentsInMonth(payments, "2026-11", "ARS", "paid").map((p) => p.id)).toEqual(["paid"]);
    expect(paymentsInMonth(payments, "2026-11", "ARS", "all")).toHaveLength(2);
  });
  it("mantiene accesibles los pendientes de hace más de cinco meses", () =>
    expect(pendingFromClosedMonths(payments, "2026-11-14").map((p) => p.id)).toEqual([
      "old",
      "previous",
    ]));
  it("sólo avisa por meses cerrados, no por un vencimiento del mes actual", () =>
    expect(visiblePaymentNotices(payments, "2026-11-14", ["old"]).map((p) => p.id)).toEqual([
      "previous",
    ]));
  it("reconoce el cierre de mes al pasar a diciembre", () =>
    expect(
      visiblePaymentNotices(payments, "2026-12-01", ["old", "previous"]).map((p) => p.id),
    ).toEqual(["current", "usd"]));
  it("un filtro de estado inválido vuelve a pendientes", () =>
    expect(paymentFilter("desconocido")).toBe("pending"));
  it("incluye el 29 de febrero en su propio mes", () =>
    expect(
      paymentsInMonth(
        [payment("leap", "2028-02-29"), payment("march", "2028-03-01")],
        "2028-02",
        "ARS",
      ).map((p) => p.id),
    ).toEqual(["leap"]));
});
