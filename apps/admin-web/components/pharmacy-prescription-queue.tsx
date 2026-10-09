"use client";

import {
  completePharmacyPrescriptionOrder,
  listInventoryStaffNames,
  listPharmacyPrescriptionQueue,
  reviewPharmacyPrescriptionOrder,
  subscribeToPharmacyPrescriptionQueue,
} from "@odyssey/supabase-client";
import type { PharmacyPrescriptionOrderSummary } from "@odyssey/types";
import { Button, Card, Field, Input } from "@odyssey/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Pill, RefreshCw, Search, Wifi, WifiOff } from "lucide-react";
import { useAdminData } from "./admin-data-context";
import { NbbCompletedReceipt } from "./nbb-completed-receipt";
import { buildNbbCompletedReceiptData, type NbbCompletedReceiptData } from "./nbb-completed-receipt-data";
import {
  buildPharmacyPrescriptionCompletionOutcome,
  filterPharmacyPrescriptionQueue,
  findNewPharmacyPrescriptionOrders,
  paginatePharmacyPrescriptionQueue,
  type PharmacyQueuePriorityFilter,
  type PharmacyPrescriptionQueueAction,
} from "../lib/pharmacy-prescription-queue-view";

const labels: Record<PharmacyPrescriptionOrderSummary["status"], string> = {
  draft: "Draft",
  submitted: "Awaiting pharmacist review",
  under_pharmacist_review: "Pharmacist reviewing",
  ready_to_dispense: "Ready to dispense",
  partially_dispensed: "Partially dispensed",
  completed: "Completed",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

type Action = PharmacyPrescriptionQueueAction;
type Draft = { itemId: string; quantity: string; action: Action; reason: string };
export function PharmacyPrescriptionQueue({ organizationId }: { organizationId: string }) {
  const { client, organization, permissions } = useAdminData();
  const canDispense = permissions.includes("can_dispense_pharmacy_prescriptions");
  const canTagInventory = permissions.includes("can_tag_inventory_usage");
  const [orders, setOrders] = useState<PharmacyPrescriptionOrderSummary[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [queueFilter, setQueueFilter] = useState<"all" | PharmacyPrescriptionOrderSummary["status"]>("all");
  const [priorityFilter, setPriorityFilter] = useState<PharmacyQueuePriorityFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [queuePage, setQueuePage] = useState(1);
  const [realtimeStatus, setRealtimeStatus] = useState("CONNECTING");
  const [requesterNames, setRequesterNames] = useState<Record<string, string>>({});
  const [queueNotifications, setQueueNotifications] = useState<Array<{ id: string; text: string }>>([]);
  const [completedReceipt, setCompletedReceipt] = useState<NbbCompletedReceiptData | null>(null);
  const refreshRequestRef = useRef(0);
  const knownOrderIdsRef = useRef(new Set<string>());
  const initializedOrdersRef = useRef(false);
  const requesterNamesRef = useRef<Record<string, string>>({});

  const addQueueNotification = useCallback((text: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setQueueNotifications((previous) => [...previous, { id, text }].slice(-5));
    window.setTimeout(() => {
      setQueueNotifications((previous) => previous.filter((notification) => notification.id !== id));
    }, 10_000);
  }, []);

  const refresh = useCallback(async (notifyForNewSubmission = false) => {
    const requestId = ++refreshRequestRef.current;
    const [result, staffResult] = await Promise.all([
      listPharmacyPrescriptionQueue(client, organizationId, queueFilter === "all" ? null : queueFilter),
      listInventoryStaffNames(client, organizationId),
    ]);
    if (requestId !== refreshRequestRef.current) return;
    const staffNames = staffResult.data
      ? Object.fromEntries(staffResult.data.map((staff) => [staff.userId, staff.displayName]))
      : requesterNamesRef.current;
    const newOrders = initializedOrdersRef.current && notifyForNewSubmission
      ? findNewPharmacyPrescriptionOrders(knownOrderIdsRef.current, result.data ?? [])
      : [];
    for (const order of result.data ?? []) knownOrderIdsRef.current.add(order.id);
    initializedOrdersRef.current = true;
    for (const order of newOrders) {
      addQueueNotification(`New prescription submitted by ${staffNames[order.submitted_by] ?? "Staff member"}.`);
    }
    if (staffResult.data) {
      requesterNamesRef.current = staffNames;
      setRequesterNames(staffNames);
    }
    if (result.error) setError(result.error.message);
    else {
      setOrders(result.data);
      setDrafts((previous) => {
        const next = { ...previous };
        for (const order of result.data) {
          for (const line of order.lines) {
            next[line.id] ??= { itemId: line.item_id ?? "", quantity: String(line.requested_quantity), action: "dispense", reason: "" };
          }
        }
        return next;
      });
    }
    setLoading(false);
  }, [addQueueNotification, client, organizationId, queueFilter]);

  const handleRealtimeChange = useCallback((event: { eventType: string; table: string }) => {
    void refresh(event.table === "pharmacy_prescription_orders" && event.eventType === "INSERT");
  }, [refresh]);

  useEffect(() => {
    void refresh();
    return subscribeToPharmacyPrescriptionQueue(
      client,
      organizationId,
      handleRealtimeChange,
      setRealtimeStatus,
    );
  }, [client, handleRealtimeChange, organizationId, refresh]);

  const filteredOrders = useMemo(
    () => filterPharmacyPrescriptionQueue(orders, { query: searchQuery, priority: priorityFilter, status: queueFilter }),
    [orders, priorityFilter, queueFilter, searchQuery],
  );

  const paginatedOrders = useMemo(
    () => paginatePharmacyPrescriptionQueue(filteredOrders, queuePage),
    [filteredOrders, queuePage],
  );

  useEffect(() => {
    setQueuePage(1);
  }, [priorityFilter, queueFilter, searchQuery]);

  function updateDraft(lineId: string, patch: Partial<Draft>) {
    setDrafts((previous) => ({ ...previous, [lineId]: { ...previous[lineId], ...patch } }));
  }

  async function review(order: PharmacyPrescriptionOrderSummary) {
    setBusyId(order.id); setError(null); setMessage(null);
    const result = await reviewPharmacyPrescriptionOrder(client, {
      orderId: order.id,
      lines: order.lines.map((line) => ({ lineId: line.id, itemId: drafts[line.id]?.itemId ?? line.item_id ?? "", requestedQuantity: Number(drafts[line.id]?.quantity ?? line.requested_quantity), unitOfMeasure: line.unit_of_measure ?? undefined })),
      reason: "Pharmacist stock verification",
    });
    if (result.error) setError(result.error.message);
    else { setMessage("Prescription reviewed; status and stock decision recorded."); await refresh(); }
    setBusyId(null);
  }

  async function complete(order: PharmacyPrescriptionOrderSummary) {
    setBusyId(order.id); setError(null); setMessage(null);
    let outcomes: Array<{ lineId: string; action: "dispense" | "cancel" | "external_referral"; quantity: number; reason?: string }>;
    try {
      outcomes = order.lines.map((line) => {
        const draft = drafts[line.id];
        return buildPharmacyPrescriptionCompletionOutcome({
          lineId: line.id,
          action: draft?.action ?? "dispense",
          quantity: Number(draft?.quantity ?? line.requested_quantity),
          remainingQuantity: line.requested_quantity - line.dispensed_quantity,
          reason: draft?.reason ?? "",
        });
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to complete prescription dispensing.");
      setBusyId(null);
      return;
    }
    const result = await completePharmacyPrescriptionOrder(client, {
      orderId: order.id,
      outcomes,
    });
    if (result.error) setError(result.error.message);
    else {
      const receiptMessage = result.data.receipt_number
        ? ` Receipt ${result.data.receipt_number} generated${result.data.billing_mode === "nbb" ? " (NBB, ₱0 due)" : ""}.`
        : "";
      setMessage(`Prescription ${result.data.status.replaceAll("_", " ")}.${receiptMessage}`);
      if (result.data.receipt_number) {
        const receiptItems = order.lines
          .map((line) => {
            const draft = drafts[line.id];
            const dispensedQuantity = draft?.action === "dispense" || draft?.action === "partial"
              ? Math.min(line.requested_quantity, line.dispensed_quantity + Number(draft.quantity || 0))
              : line.dispensed_quantity;
            const unitPrice = Number(line.unit_price_in_centavos ?? 0);
            return {
              name: line.original_medication,
              quantity: dispensedQuantity,
              standardCentavos: unitPrice * dispensedQuantity,
            };
          })
          .filter((item) => item.quantity > 0);
        setCompletedReceipt(buildNbbCompletedReceiptData({
          result: result.data,
          patientName: order.patient_reference ?? "Standalone prescription",
          items: receiptItems,
          issuedAt: new Date().toISOString(),
        }));
      }
      await refresh();
    }
    setBusyId(null);
  }

  if (loading) return <section className="pharmacy-workspace"><p>Loading Pharmacy queue…</p></section>;
  if (!canDispense) return <section className="pharmacy-workspace"><p className="error-text">This account can view POS, but does not have Pharmacy dispensing privilege.</p></section>;
  if (completedReceipt) {
    return (
      <NbbCompletedReceipt
        data={completedReceipt}
        organizationName={organization?.name}
        onNewSale={() => setCompletedReceipt(null)}
        newSaleLabel="Back to Queue"
      />
    );
  }

  return (
    <section className="pharmacy-workspace" aria-labelledby="pharmacy-queue-heading">
      <div className="pharmacy-workspace__heading">
        <div>
          <p className="eyebrow">Pharmacy POS</p>
          <h1 id="pharmacy-queue-heading">Prescription queue</h1>
          <p>Every request is reviewed, dispensed, and tracked in one transaction record.</p>
        </div>
        <div className="pharmacy-form__actions">
          <span className="pharmacy-queue-live" role="status">
            {realtimeStatus === "SUBSCRIBED" ? <Wifi size={14} /> : <WifiOff size={14} />}
            {realtimeStatus === "SUBSCRIBED" ? "Live updates" : "Reconnecting"}
          </span>
          <Button type="button" variant="outline" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw size={15} /> Refresh
          </Button>
        </div>
      </div>

      {queueNotifications.length > 0 ? (
        <div className="pharmacy-queue-notifications" aria-live="polite" aria-label="Prescription notifications">
          {queueNotifications.map((notification) => (
            <div className="pharmacy-queue-notification" key={notification.id}>
              <strong>New prescription</strong>
              <span>{notification.text}</span>
              <button type="button" onClick={() => setQueueNotifications((previous) => previous.filter((item) => item.id !== notification.id))} aria-label="Dismiss prescription notification">Dismiss</button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="pharmacy-queue-filters" aria-label="Prescription queue filters">
        <label className="pharmacy-queue-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search prescriptions</span>
          <input
            type="search"
            placeholder="Search patient, ward, medicine, Rx no., or prescriber"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
        <label>
          <span>Status</span>
          <select className="odyssey-input" aria-label="Filter prescription status" value={queueFilter} onChange={(event) => setQueueFilter(event.target.value as typeof queueFilter)}>
            <option value="all">Active prescriptions</option>
            <option value="submitted">Awaiting review</option>
            <option value="under_pharmacist_review">Under review</option>
            <option value="ready_to_dispense">Ready to dispense</option>
            <option value="partially_dispensed">Partially dispensed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        <label>
          <span>Priority</span>
          <select className="odyssey-input" aria-label="Filter prescription priority" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as PharmacyQueuePriorityFilter)}>
            <option value="all">All priorities</option>
            <option value="routine">Routine</option>
            <option value="urgent">Urgent</option>
            <option value="emergency">Emergency</option>
          </select>
        </label>
      </div>

      {error && <p className="error-text" role="alert">{error}</p>}
      {message && <p className="success-text" role="status">{message}</p>}
      <div className="pharmacy-queue-summary"><span>{filteredOrders.length} matching prescription{filteredOrders.length === 1 ? "" : "s"}</span><span>Page {paginatedOrders.page} of {paginatedOrders.totalPages}</span></div>

      {filteredOrders.length === 0 ? <Card><p className="hint">No prescriptions match these filters. New nurse submissions will appear here automatically.</p></Card> : paginatedOrders.items.map((order) => (
        <Card key={order.id} className="pharmacy-queue-card">
          <div className="pharmacy-queue-card__header">
            <div>
              <span className="eyebrow">{order.priority} · {order.patient_reference ?? order.patient_id?.slice(0, 8) ?? "Standalone order"}{order.ward_reference ? ` · ${order.ward_reference}` : ""}</span>
              <h2>{order.physical_prescription_reference ?? "Prescription"}</h2>
              <p>Submitted {new Date(order.submitted_at).toLocaleString()} · {order.prescriber_name ?? "Prescriber not recorded"}</p>
              <p>Requesting nurse: <strong>{requesterNames[order.submitted_by] ?? "Staff member"}</strong></p>
              {order.receipt_number ? <p>Receipt: <strong>{order.receipt_number}</strong></p> : null}
            </div>
            <span className={`pharmacy-order-status pharmacy-order-status--${order.status === "ready_to_dispense" ? "warning" : order.status === "completed" ? "success" : "neutral"}`}><Clock size={14} /> {labels[order.status]}</span>
          </div>
          <div className="pharmacy-queue-lines">
            {order.lines.map((line) => {
              const draft = drafts[line.id] ?? { itemId: line.item_id ?? "", quantity: String(line.requested_quantity), action: "dispense" as const, reason: "" };
              return <div className="pharmacy-queue-line" key={line.id}><Pill size={17} /><div className="pharmacy-queue-line__copy"><strong>{line.original_medication}</strong><span>{line.dosage_instruction ?? "Dose not recorded"}</span></div><div className="pharmacy-queue-line__controls"><Field label="SKU"><Input value={line.item_sku ?? "SKU unavailable"} readOnly /></Field><Field label="Qty"><Input type="number" min="1" value={draft.quantity} onChange={(event) => updateDraft(line.id, { quantity: event.target.value })} /></Field><Field label="Action"><select className="odyssey-input" value={draft.action} onChange={(event) => updateDraft(line.id, { action: event.target.value as Action })}><option value="dispense">Dispense</option><option value="partial">Partial</option><option value="cancel">Cancel</option><option value="external_referral">External referral</option></select></Field>{["cancel", "external_referral"].includes(draft.action) && <Field label="Reason"><Input value={draft.reason} onChange={(event) => updateDraft(line.id, { reason: event.target.value })} required /></Field>}</div></div>;
            })}
          </div>
          <div className="pharmacy-status-timeline" aria-label="Prescription status history">{order.events.slice(-5).map((event) => <span key={event.id}>{event.status.replaceAll("_", " ")} · {new Date(event.created_at).toLocaleTimeString()}</span>)}</div>
          <div className="pharmacy-form__actions"><Button type="button" variant="outline" disabled={busyId === order.id} onClick={() => void review(order)}><CheckCircle2 size={15} /> Verify stock</Button><Button type="button" disabled={busyId === order.id || !canTagInventory || !["ready_to_dispense", "partially_dispensed"].includes(order.status)} onClick={() => void complete(order)}>{busyId === order.id ? "Saving…" : "Complete dispense"}</Button>{!canTagInventory && <span className="hint">Requires inventory-tagging privilege to deduct stock.</span>}</div>
        </Card>
      ))}

      {paginatedOrders.totalPages > 1 ? <nav className="pharmacy-queue-pagination" aria-label="Prescription queue pages"><Button type="button" variant="outline" size="sm" disabled={paginatedOrders.page === 1} onClick={() => setQueuePage((page) => Math.max(1, page - 1))}><ChevronLeft size={14} /> Previous</Button><span>{paginatedOrders.page} / {paginatedOrders.totalPages}</span><Button type="button" variant="outline" size="sm" disabled={paginatedOrders.page === paginatedOrders.totalPages} onClick={() => setQueuePage((page) => Math.min(paginatedOrders.totalPages, page + 1))}>Next <ChevronRight size={14} /></Button></nav> : null}

    </section>
  );
}
