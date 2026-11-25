import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import { themeScript, parseTheme } from "../app/components/theme";
it.each([
  ["light", true, "light"],
  ["dark", false, "dark"],
  ["system", true, "dark"],
  ["invalid", false, "light"],
  [null, true, "dark"],
])("el tema inicial %s respeta la preferencia antes de hidratar", (saved, systemDark, expected) => {
  const document = { documentElement: { dataset: {} as Record<string, string> } };
  runInNewContext(themeScript, {
    document,
    localStorage: { getItem: () => saved },
    matchMedia: () => ({ matches: systemDark }),
  });
  expect(document.documentElement.dataset.theme).toBe(expected);
});
it("el bloqueo de almacenamiento no impide aplicar el tema del sistema", () => {
  const document = { documentElement: { dataset: {} as Record<string, string> } };
  runInNewContext(themeScript, {
    document,
    localStorage: {
      getItem: () => {
        throw new Error("blocked");
      },
    },
    matchMedia: () => ({ matches: true }),
  });
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(parseTheme('dark";alert(1)')).toBe("system");
});
