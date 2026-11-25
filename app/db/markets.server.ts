import { and, eq, sql } from "drizzle-orm";
import type { createDb } from "./repository.server";
import {
  stockCompanies,
  stockFavorites,
  stockIndexMembers,
  stockIndices,
  userMarketPreferences,
} from "./schema";
import {
  STOCK_FAVORITES_LIMIT_MESSAGE,
  marketIndex,
  type MarketMutation,
  type MarketSnapshot,
} from "../domain/markets";
type Db = ReturnType<typeof createDb>;
export class MarketError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function readMarkets(db: Db, userId: string | null): Promise<MarketSnapshot> {
  const [companies, indices, members, favorites, preferences] = await db.batch([
    db.select().from(stockCompanies).orderBy(stockCompanies.symbol),
    db.select().from(stockIndices),
    db.select().from(stockIndexMembers),
    db
      .select({ companyId: stockFavorites.companyId })
      .from(stockFavorites)
      .where(userId === null ? sql`0` : eq(stockFavorites.userId, userId))
      .orderBy(stockFavorites.companyId),
    db
      .select({ indexId: userMarketPreferences.indexId })
      .from(userMarketPreferences)
      .where(userId === null ? sql`0` : eq(userMarketPreferences.userId, userId)),
  ]);
  return {
    companies,
    indices,
    members,
    favorites: favorites.map((f) => f.companyId),
    selectedIndex: marketIndex(preferences[0]?.indexId),
  };
}
function limitError(error: unknown) {
  let cause = error;
  for (let depth = 0; depth < 6 && cause instanceof Error; depth++, cause = cause.cause)
    if (/stock_favorites_limit/.test(cause.message)) return true;
  return false;
}
export async function mutateMarkets(db: Db, userId: string, mutation: MarketMutation) {
  if (mutation.intent === "market-index") {
    await db
      .insert(userMarketPreferences)
      .values({ userId, indexId: mutation.indexId, updatedAt: new Date().toISOString() })
      .onConflictDoUpdate({
        target: userMarketPreferences.userId,
        set: { indexId: mutation.indexId, updatedAt: new Date().toISOString() },
      });
    return;
  }
  const company = (
    await db
      .select({ id: stockCompanies.id })
      .from(stockCompanies)
      .where(eq(stockCompanies.symbol, mutation.symbol))
      .limit(1)
  )[0];
  if (!company) throw new MarketError("Esta acción no está en el catálogo verificado.", 404);
  if (mutation.saved === "no") {
    await db
      .delete(stockFavorites)
      .where(and(eq(stockFavorites.userId, userId), eq(stockFavorites.companyId, company.id)));
    return;
  }
  const allowed = await db.get(
    sql`SELECT 1 FROM stock_companies c WHERE c.id=${company.id} AND (EXISTS (SELECT 1 FROM stock_index_members m WHERE m.company_id=c.id) OR EXISTS (SELECT 1 FROM stock_favorites f WHERE f.company_id=c.id AND f.user_id=${userId}))`,
  );
  if (!allowed)
    throw new MarketError("Esta acción ya no pertenece a los índices disponibles.", 404);
  try {
    // El trigger verifica el máximo dentro de la misma escritura de D1.
    // Un SELECT count(*) previo en JavaScript permitiría carreras entre pestañas.
    await db
      .insert(stockFavorites)
      .values({ userId, companyId: company.id, createdAt: new Date().toISOString() })
      .onConflictDoNothing();
  } catch (error) {
    if (limitError(error)) throw new MarketError(STOCK_FAVORITES_LIMIT_MESSAGE, 409);
    throw error;
  }
}
