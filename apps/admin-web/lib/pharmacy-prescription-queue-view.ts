export const PHARMACY_QUEUE_PAGE_SIZE = 10;

export type PharmacyQueueStatusFilter = "all" | string;
export type PharmacyQueuePriorityFilter = "all" | "routine" | "urgent" | "emergency";

export interface PharmacyQueueViewOrder {
  id: string;
  priority: string;
  status: string;
  patient_reference: string | null;
  ward_reference: string | null;
  physical_prescription_reference: string | null;
  prescriber_name: string | null;
  lines: ReadonlyArray<{ original_medication: string }>;
}

export interface PharmacyQueueFilters {
  query: string;
  priority: PharmacyQueuePriorityFilter;
  status: PharmacyQueueStatusFilter;
}

const terminalStatuses = new Set(["completed", "cancelled", "rejected"]);

export function findNewPharmacyPrescriptionOrders<T extends { id: string }>(previousIds: ReadonlySet<string>, orders: readonly T[]) {
  return orders.filter((order) => !previousIds.has(order.id));
}

export function filterPharmacyPrescriptionQueue<T extends PharmacyQueueViewOrder>(
  orders: readonly T[],
  filters: PharmacyQueueFilters,
) {
  const query = filters.query.trim().toLowerCase();
  return orders.filter((order) => {
    if (filters.status === "all" && terminalStatuses.has(order.status)) return false;
    if (filters.status !== "all" && order.status !== filters.status) return false;
    if (filters.priority !== "all" && order.priority !== filters.priority) return false;
    if (!query) return true;
    return [
      order.patient_reference,
      order.ward_reference,
      order.physical_prescription_reference,
      order.prescriber_name,
      ...order.lines.map((line) => line.original_medication),
    ].some((value) => value?.toLowerCase().includes(query));
  });
}

export function paginatePharmacyPrescriptionQueue<T>(orders: readonly T[], requestedPage: number, pageSize = PHARMACY_QUEUE_PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(orders.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const start = (page - 1) * pageSize;
  return { items: orders.slice(start, start + pageSize), page, totalPages };
}
