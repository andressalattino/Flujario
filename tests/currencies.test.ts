import { it, expect } from "vitest";
import { availableCurrencies, currencies, currencyInfo } from "../app/domain/currencies";
import { parseMoney, formatMoney, moneyInput, MAX_MINOR } from "../app/domain/money";
import { parseExactJSON } from "../app/lib/exact-json";

it("ofrece diez monedas regionales y excluye las que el usuario ya tiene", () => {
  expect(currencies).toHaveLength(10);
  expect(availableCurrencies(["ARS", "USD"])).toEqual([
    "EUR",
    "BRL",
    "CLP",
    "UYU",
    "GBP",
    "CAD",
    "AUD",
    "CHF",
  ]);
  expect(availableCurrencies([...currencies])).toEqual([]);
});
it("los pesos chilenos se guardan en pesos enteros y las demás monedas en centavos", () => {
  expect(parseMoney("15.000", "CLP")).toBe(15000);
  expect(() => parseMoney("15.000,50", "CLP")).toThrow();
  expect(() => parseMoney("15.000,00", "CLP")).toThrow();
  expect(parseMoney("15.000,50", "UYU")).toBe(1500050);
  for (const currency of currencies) {
    for (const minor of [1, 101, MAX_MINOR])
      expect(parseMoney(moneyInput(minor, currency), currency)).toBe(minor);
    expect(currencyInfo[currency].digits).toBe(currency === "CLP" ? 0 : 2);
  }
  expect(formatMoney(15000, "CLP")).toContain("15.000");
  expect(formatMoney(1500050, "UYU")).toContain("15.000,50");
});
it("la lectura de JSON conserva el decimal original incluso por encima del entero seguro", () => {
  expect(
    parseExactJSON('{"compra":12345678901234567890.12345678,"nombre":"1.23","nulo":null}'),
  ).toEqual({ compra: "12345678901234567890.12345678", nombre: "1.23", nulo: null });
});
