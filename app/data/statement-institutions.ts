export const statementInstitutions = [
  { id: "nacion", name: "Banco Nación" },
  { id: "credicoop", name: "Banco Credicoop" },
  { id: "santander", name: "Santander (Río)" },
  { id: "bbva", name: "BBVA (Francés)" },
  { id: "galicia", name: "Galicia" },
  { id: "macro", name: "Banco Macro" },
  { id: "patagonia", name: "Banco Patagonia" },
  { id: "mercadopago", name: "Mercado Pago" },
] as const;
export const institutionIds = [
  "nacion",
  "credicoop",
  "santander",
  "bbva",
  "galicia",
  "macro",
  "patagonia",
  "mercadopago",
] as const;
export type StatementInstitution = (typeof institutionIds)[number];
