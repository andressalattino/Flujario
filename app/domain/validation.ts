import { z } from "zod";
import { isISODate } from "./dates";
import { parseMoney, type Currency } from "./money";
import { parseRate } from "./decimal";
import { categorySchema, currencySchema, yesNoSchema } from "./field-schemas";
import { stockFavoriteSchema } from "./markets";
const moneyText = z.string().max(64);
const date = z.string().refine(isISODate, "Ingresá una fecha válida.");
const requestKey = z.uuid("La operación necesita un identificador válido. Recargá la página.");
const futureAmount = z.enum(["unchanged", "use", "clear"]).default("unchanged");
const occurrenceId = z.string().min(1).max(150);
const inputSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("dismiss-payment-notices"),
    fingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/, "El aviso cambió. Actualizá el panel antes de volver a intentarlo."),
  }),
  z.object({
    intent: z.literal("setup"),
    ars: moneyText,
    usd: moneyText,
    arsOpeningDate: date.optional(),
    usdOpeningDate: date.optional(),
  }),
  z.object({
    intent: z.literal("add-currency"),
    currency: currencySchema,
    opening: moneyText.default("0"),
    openingDate: date.optional(),
  }),
  z.object({
    intent: z.literal("entry"),
    kind: z.enum(["income", "expense"]),
    currency: currencySchema,
    amount: moneyText,
    description: z
      .string()
      .trim()
      .min(2, "Escribí una descripción de al menos 2 caracteres.")
      .max(120),
    category: categorySchema,
    date,
    requestKey,
  }),
  z.object({
    intent: z.literal("payment"),
    currency: currencySchema,
    amount: moneyText,
    keepAmount: yesNoSchema.default("no"),
    title: z.string().trim().min(2, "Escribí un nombre de al menos 2 caracteres.").max(120),
    dueDate: date,
    frequency: z.enum(["once", "monthly", "quarterly", "yearly"]),
    requestKey,
  }),
  z.object({
    intent: z.literal("edit-payment"),
    occurrenceId,
    currency: currencySchema,
    amount: moneyText,
    futureAmount,
    requestKey,
  }),
  z.object({
    intent: z.literal("pay"),
    occurrenceId,
    currency: currencySchema,
    amount: moneyText,
    futureAmount,
    date,
    requestKey,
  }),
  z.object({
    intent: z.literal("exchange"),
    currency: currencySchema,
    targetCurrency: currencySchema,
    amount: moneyText,
    targetAmount: moneyText,
    rate: z.string().max(32),
    quoteId: z.string().max(100).default(""),
    date,
    requestKey,
  }),
  stockFavoriteSchema(20, "Usá un símbolo válido, por ejemplo AAPL o BRK.B."),
]);
function money(
  value: string,
  currency: Currency,
  ctx: z.RefinementCtx,
  path: string,
  positive = true,
): number {
  try {
    const minor = parseMoney(positive ? value : value.trim() || "0", currency);
    if (positive && minor <= 0) throw new Error("El importe debe ser mayor a cero.");
    return minor;
  } catch (error) {
    ctx.addIssue({ code: "custom", message: (error as Error).message, path: [path] });
    return z.NEVER;
  }
}
export const operationSchema = inputSchema.transform((value, ctx) => {
  switch (value.intent) {
    case "setup":
      return {
        ...value,
        ars: money(value.ars, "ARS", ctx, "ars", false),
        usd: money(value.usd, "USD", ctx, "usd", false),
      };
    case "add-currency":
      return { ...value, opening: money(value.opening, value.currency, ctx, "opening", false) };
    case "entry":
    case "pay":
      return { ...value, amount: money(value.amount, value.currency, ctx, "amount") };
    case "payment":
    case "edit-payment": {
      const amount =
        value.amount.trim() === "" ? null : money(value.amount, value.currency, ctx, "amount");
      if (
        amount === null &&
        (value.intent === "payment" ? value.keepAmount === "yes" : value.futureAmount === "use")
      )
        ctx.addIssue({
          code: "custom",
          message: "Ingresá un importe para usarlo en los próximos vencimientos.",
          path: ["amount"],
        });
      return { ...value, amount };
    }
    case "exchange": {
      if (value.currency === value.targetCurrency)
        ctx.addIssue({
          code: "custom",
          message: "Elegí dos monedas diferentes.",
          path: ["targetCurrency"],
        });
      let rate = "";
      try {
        rate = parseRate(value.rate);
      } catch (error) {
        ctx.addIssue({ code: "custom", message: (error as Error).message, path: ["rate"] });
      }
      return {
        ...value,
        amount: money(value.amount, value.currency, ctx, "amount"),
        targetAmount: money(value.targetAmount, value.targetCurrency, ctx, "targetAmount"),
        rate,
      };
    }
    default:
      return value;
  }
});
export type Operation = z.infer<typeof operationSchema>;
