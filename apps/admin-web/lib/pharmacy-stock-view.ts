import type { NbbPharmacyPosCatalogItem } from "@odyssey/types";

export const PHARMACY_STOCK_PAGE_SIZE = 20;
export const PHARMACY_LOW_STOCK_THRESHOLD = 5;

export type PharmacyStockState = "all" | "available" | "low" | "out";

export interface PharmacyStockFilters {
  query: string;
  unit: string;
  stock: PharmacyStockState;
}

type PharmacyStockItem = Pick<NbbPharmacyPosCatalogItem, "name" | "sku" | "unit_of_measure" | "available_quantity">;

export function filterPharmacyStock<T extends PharmacyStockItem>(
  items: T[],
  filters: PharmacyStockFilters,
) {
  const query = filters.query.trim().toLowerCase();
  return items.filter((item) => {
    const matchesQuery = !query || item.name.toLowerCase().includes(query) || item.sku.toLowerCase().includes(query);
    const matchesUnit = !filters.unit || item.unit_of_measure === filters.unit;
    const matchesStock =
      filters.stock === "all" ||
      (filters.stock === "available" && item.available_quantity > PHARMACY_LOW_STOCK_THRESHOLD) ||
      (filters.stock === "low" && item.available_quantity > 0 && item.available_quantity <= PHARMACY_LOW_STOCK_THRESHOLD) ||
      (filters.stock === "out" && item.available_quantity <= 0);
    return matchesQuery && matchesUnit && matchesStock;
  });
}

export function paginatePharmacyStock<T extends PharmacyStockItem>(
  items: T[],
  requestedPage: number,
  pageSize = PHARMACY_STOCK_PAGE_SIZE,
) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page, totalPages };
}
