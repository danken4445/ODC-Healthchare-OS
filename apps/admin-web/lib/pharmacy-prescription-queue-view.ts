export const PHARMACY_QUEUE_PAGE_SIZE = 10;

export type PharmacyQueueStatusFilter = "all" | string;
export type PharmacyQueuePriorityFilter = "all" | "routine" | "urgent" | "emergency";
export type PharmacyPrescriptionQueueAction = "dispense" | "partial" | "cancel" | "external_referral";

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

export function buildPharmacyPrescriptionCompletionOutcome(input: {
  lineId: string;
  action: PharmacyPrescriptionQueueAction;
  quantity: number;
  remainingQuantity: number;
  reason: string;
}) {
  if (input.action === "partial" && (
    !Number.isFinite(input.quantity)
    || input.quantity <= 0
    || input.quantity >= input.remainingQuantity
  )) {
    throw new Error("Partial quantity must be greater than zero and less than the remaining quantity.");
  }

  return {
    lineId: input.lineId,
    action: input.action === "partial" ? "dispense" as const : input.action,
    quantity: input.quantity,
    reason: input.reason || undefined,
  };
}

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
