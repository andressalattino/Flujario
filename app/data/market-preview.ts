import catalog from "./stock-catalog.json";
import { marketIndex, type MarketSnapshot } from "../domain/markets";
export function marketPreview(favorites: string[], index?: unknown): MarketSnapshot {
  const snapshot = catalog as Omit<MarketSnapshot, "favorites" | "selectedIndex">;
  return {
    ...snapshot,
    favorites: favorites
      .filter((symbol) => snapshot.companies.some((c) => c.symbol === symbol))
      .slice(0, 5),
    selectedIndex: marketIndex(index),
  };
}
