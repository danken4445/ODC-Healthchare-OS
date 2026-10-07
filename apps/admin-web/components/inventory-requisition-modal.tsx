"use client";

import { submitInventoryRequisition } from "@odyssey/supabase-client";
import type {
  DepartmentSummary,
  InventoryItemSummary,
  SubmitRequisitionLineItem,
} from "@odyssey/types";
import { Button } from "@odyssey/ui";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Boxes,
  Calendar,
  CheckCircle2,
  Clock,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAdminData } from "./admin-data-context";

interface Props {
  organizationId: string;
  departments: DepartmentSummary[];
  items: InventoryItemSummary[];
  assignedDepartmentId: string | null;
  rootSupplyDepartmentId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (
    requisitionId: string,
    details?: { requisitionNumber: string; isEmergency?: boolean }
  ) => void;
}

export function InventoryRequisitionModal({
  organizationId,
  departments,
  items,
  assignedDepartmentId,
  rootSupplyDepartmentId,
  isOpen,
  onClose,
  onSuccess,
}: Props) {
  const { client } = useAdminData();

  // Active departments in clinic
  const activeDepartments = useMemo(() => {
    return departments.filter((d) => d.active !== false);
  }, [departments]);

  // Requesting department (Destination)
  const [requestingDeptId, setRequestingDeptId] = useState<string>(() => {
    if (assignedDepartmentId) return assignedDepartmentId;
    const nonRoot = activeDepartments.find((d) => d.id !== rootSupplyDepartmentId);
    return nonRoot?.id || activeDepartments[0]?.id || "";
  });

  // Supplying department (Source)
  const [supplyDeptId, setSupplyDeptId] = useState<string>(() => {
    // Default to root supply if available and distinct from requesting
    if (rootSupplyDepartmentId && rootSupplyDepartmentId !== (assignedDepartmentId || "")) {
      return rootSupplyDepartmentId;
    }
    const alt = activeDepartments.find((d) => d.id !== (assignedDepartmentId || ""));
    return alt?.id || "";
  });

  // Sync department states if departments change
  useEffect(() => {
    if (requestingDeptId && supplyDeptId === requestingDeptId) {
      const alt = activeDepartments.find((d) => d.id !== requestingDeptId);
      if (alt) setSupplyDeptId(alt.id);
    }
  }, [requestingDeptId, supplyDeptId, activeDepartments]);

  const [lines, setLines] = useState<
    Array<{ id: string; itemId: string; quantity: string; notes: string }>
  >([
    { id: "1", itemId: "", quantity: "10", notes: "" },
  ]);
  const [notes, setNotes] = useState("");
  const [isEmergency, setIsEmergency] = useState(false);
  const [emergencyJustification, setEmergencyJustification] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live stock balance preview for the selected supplying department
  const [sourceStockMap, setSourceStockMap] = useState<Record<string, number>>({});
  const [loadingStock, setLoadingStock] = useState(false);

  useEffect(() => {
    if (!isOpen || !supplyDeptId || !organizationId) {
      setSourceStockMap({});
      return;
    }
    let isMounted = true;
    setLoadingStock(true);
    client
      .from("department_stock")
      .select("item_id, quantity")
      .eq("organization_id", organizationId)
      .eq("department_id", supplyDeptId)
      .then(({ data, error: stockErr }) => {
        if (!isMounted) return;
        setLoadingStock(false);
        if (!stockErr && data) {
          const map: Record<string, number> = {};
          for (const row of data) {
            map[row.item_id] = Number(row.quantity ?? 0);
          }
          setSourceStockMap(map);
        } else {
          setSourceStockMap({});
        }
      });

    return () => {
      isMounted = false;
    };
  }, [client, isOpen, organizationId, supplyDeptId]);

  // Is this request targeting the Central Supply Root Warehouse?
  const isSupplyingFromRoot = Boolean(
    rootSupplyDepartmentId && supplyDeptId === rootSupplyDepartmentId
  );

  // Evaluate Manila day of week for Central Supply schedule window
  const { isWindowOpen, dayName, targetDeliveryDateStr } = useMemo(() => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      weekday: "long",
    });
    const currentDay = formatter.format(now);
    const open = ["Monday", "Tuesday", "Wednesday"].includes(currentDay);

    // Compute upcoming Monday
    const nextMon = new Date();
    const dayOfWeek = (nextMon.getDay() + 6) % 7; // 0=Mon, 6=Sun
    const daysUntilNextMon = 7 - dayOfWeek;
    nextMon.setDate(nextMon.getDate() + daysUntilNextMon);

    const targetFormatted = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      dateStyle: "medium",
    }).format(nextMon);

    return {
      isWindowOpen: open,
      dayName: currentDay,
      targetDeliveryDateStr: targetFormatted,
    };
  }, []);

  const requestingDept = activeDepartments.find((d) => d.id === requestingDeptId);
  const supplyingDept = activeDepartments.find((d) => d.id === supplyDeptId);

  if (!isOpen) return null;

  const handleAddLine = () => {
    setLines((prev) => [
      ...prev,
      { id: String(Date.now()), itemId: "", quantity: "10", notes: "" },
    ]);
  };

  const handleRemoveLine = (id: string) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const handleLineChange = (
    id: string,
    field: "itemId" | "quantity" | "notes",
    value: string
  ) => {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, [field]: value } : l))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!requestingDeptId) {
      setError("Please select the requesting department.");
      return;
    }

    if (!supplyDeptId) {
      setError("Please select the supplying department.");
      return;
    }

    if (requestingDeptId === supplyDeptId) {
      setError("A department cannot requisition supplies from itself. Please choose a different source department.");
      return;
    }

    // Schedule window only applies when requesting from Central Supply
    if (isSupplyingFromRoot && !isWindowOpen && !isEmergency) {
      setError(
        `Routine requisitions to Central Supply are accepted Monday to Wednesday only (Today is ${dayName}). Check 'Emergency Request' if this restock is critically urgent.`
      );
      return;
    }

    if (isSupplyingFromRoot && isEmergency && !emergencyJustification.trim()) {
      setError("An emergency justification is required for off-schedule requisitions to Central Supply.");
      return;
    }

    const payloadItems: SubmitRequisitionLineItem[] = [];
    for (const line of lines) {
      if (!line.itemId) {
        setError("Please choose a valid item for all rows.");
        return;
      }
      const qty = parseFloat(line.quantity);
      if (isNaN(qty) || qty <= 0) {
        setError("Quantities must be positive numbers.");
        return;
      }
      payloadItems.push({
        item_id: line.itemId,
        requested_quantity: qty,
        notes: line.notes.trim() || undefined,
      });
    }

    if (payloadItems.length === 0) {
      setError("Please specify at least one item to request.");
      return;
    }

    setSubmitting(true);
    const res = await submitInventoryRequisition(client, {
      organizationId,
      requestingDepartmentId: requestingDeptId,
      supplyDepartmentId: supplyDeptId,
      items: payloadItems,
      notes: notes.trim() || undefined,
      isEmergency: isSupplyingFromRoot ? isEmergency : false,
      emergencyJustification: isSupplyingFromRoot && isEmergency ? emergencyJustification.trim() : undefined,
    });

    setSubmitting(false);

    if (res.error) {
      const msg = res.error.message || "";
      if (msg.includes("REQUISITION_WINDOW_CLOSED")) {
        setError(
          "Requisition window closed. Routine orders to Central Supply are accepted Monday to Wednesday only."
        );
      } else {
        setError(`Failed to submit requisition: ${msg}`);
      }
    } else if (res.data) {
      let requisitionNumber = `REQ-${res.data.slice(0, 8)}`;
      try {
        const { data: reqRow } = await client
          .from("inventory_requisitions")
          .select("requisition_number")
          .eq("id", res.data)
          .maybeSingle();
        if (reqRow?.requisition_number) {
          requisitionNumber = reqRow.requisition_number;
        }
      } catch {
        // Fallback to ID slice
      }

      onSuccess(res.data, {
        requisitionNumber,
        isEmergency: isSupplyingFromRoot ? isEmergency : false,
      });
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="req-modal-backdrop"
      onClick={onClose}
    >
      <div
        className="req-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="req-modal-header">
          <div className="req-modal-header-left">
            <div className="req-modal-header-icon" aria-hidden="true">
              <Calendar size={22} />
            </div>
            <div>
              <h2 className="req-modal-title">New Department Stock Requisition</h2>
              <p className="req-modal-subtitle">
                Request inventory from Central Supply or transfer stock between clinical departments.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inv-modal-close-btn"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Dynamic Status Banner depending on Source Department */}
        <div style={{ padding: "1rem 1.5rem 0" }}>
          {isSupplyingFromRoot ? (
            isWindowOpen ? (
              <div className="req-window-notice req-window-notice--open">
                <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
                <div>
                  <strong>Central Supply Requisition Window is OPEN (Monday–Wednesday).</strong>
                  <p style={{ margin: "0.2rem 0 0", color: "#047857" }}>
                    Requests submitted today ({dayName}) to Central Supply are scheduled for delivery next week:{" "}
                    <strong>Monday, {targetDeliveryDateStr}</strong>.
                  </p>
                </div>
              </div>
            ) : (
              <div className="req-window-notice req-window-notice--closed">
                <Clock size={16} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
                <div>
                  <strong>Routine Requisition Window for Central Supply is CLOSED.</strong>
                  <p style={{ margin: "0.2rem 0 0", color: "#b45309" }}>
                    Standard requisitions to Central Supply open Monday through Wednesday. Routine orders outside this window require emergency authorization, or request directly from another department.
                  </p>
                </div>
              </div>
            )
          ) : (
            <div className="req-window-notice req-window-notice--open" style={{ background: "#eff6ff", borderColor: "#bfdbfe" }}>
              <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: "0.1rem", color: "#2563eb" }} />
              <div>
                <strong style={{ color: "#1e40af" }}>Direct Inter-Department Requisition (Open Anytime)</strong>
                <p style={{ margin: "0.2rem 0 0", color: "#1d4ed8" }}>
                  This request will be routed directly to <strong>{supplyingDept?.name || "the supplying department"}</strong> for prompt inter-departmental fulfillment. No Mon–Wed cutoff applies.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="req-modal-body">
          {error && (
            <div className="req-alert-banner req-alert-banner--error">
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* Department Route Selectors */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            {/* Requesting Department (Destination) */}
            <div className="req-form-group">
              <label className="req-form-label">
                Requesting Department (Destination)
              </label>
              <select
                value={requestingDeptId}
                onChange={(e) => {
                  const newReq = e.target.value;
                  setRequestingDeptId(newReq);
                  if (supplyDeptId === newReq) {
                    const alt = activeDepartments.find((d) => d.id !== newReq);
                    if (alt) setSupplyDeptId(alt.id);
                  }
                }}
                disabled={Boolean(assignedDepartmentId)}
                className="req-form-select"
              >
                {activeDepartments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name} {dept.id === rootSupplyDepartmentId ? "★ Root Supply" : ""}
                  </option>
                ))}
              </select>
              <span style={{ display: "block", fontSize: "0.68rem", color: "var(--muted-foreground)", marginTop: "0.25rem" }}>
                Department receiving and consuming the items.
              </span>
            </div>

            {/* Supplying Department (Source) */}
            <div className="req-form-group">
              <label className="req-form-label">
                Supplying Department (Source / Fulfiller)
              </label>
              <select
                value={supplyDeptId}
                onChange={(e) => setSupplyDeptId(e.target.value)}
                className="req-form-select"
              >
                {activeDepartments
                  .filter((d) => d.id !== requestingDeptId)
                  .map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name} {dept.id === rootSupplyDepartmentId ? "★ Central Supply (GSO)" : ""}
                    </option>
                  ))}
              </select>
              <span style={{ display: "block", fontSize: "0.68rem", color: "var(--muted-foreground)", marginTop: "0.25rem" }}>
                {loadingStock ? "Loading on-hand stock..." : `Department dispersing from its stockroom.`}
              </span>
            </div>
          </div>

          {/* Requested Items Table with Live Stock Preview */}
          <div className="req-form-group">
            <div className="req-lines-header">
              <label className="req-form-label">
                Requested Items & On-Hand Availability
              </label>
              <button
                type="button"
                onClick={handleAddLine}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  background: "transparent",
                  border: 0,
                  color: "#4f46e5",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                <Plus size={14} />
                Add Item
              </button>
            </div>

            <div className="req-lines-list">
              {lines.map((line, idx) => {
                const onHand = line.itemId ? (sourceStockMap[line.itemId] ?? 0) : null;
                const hasStock = onHand !== null && onHand > 0;

                return (
                  <div key={line.id} style={{ display: "flex", flexDirection: "column", gap: "0.2rem", paddingBottom: "0.5rem", borderBottom: "1px dashed var(--border, #e2e8f0)" }}>
                    <div className="req-line-row">
                      <span className="req-line-index">{idx + 1}</span>

                      <select
                        value={line.itemId}
                        onChange={(e) => handleLineChange(line.id, "itemId", e.target.value)}
                        className="req-form-select"
                        style={{ flex: 1 }}
                      >
                        <option value="">Select Item from Catalog...</option>
                        {items.map((i) => {
                          const stockCount = sourceStockMap[i.id] ?? 0;
                          return (
                            <option key={i.id} value={i.id}>
                              {i.name} ({i.unit_of_measure}) — On-Hand: {stockCount}
                            </option>
                          );
                        })}
                      </select>

                      <input
                        type="number"
                        min="1"
                        step="1"
                        placeholder="Qty"
                        value={line.quantity}
                        onChange={(e) => handleLineChange(line.id, "quantity", e.target.value)}
                        className="req-form-input"
                        style={{ width: "5.5rem" }}
                      />

                      <input
                        type="text"
                        placeholder="Notes (optional)"
                        value={line.notes}
                        onChange={(e) => handleLineChange(line.id, "notes", e.target.value)}
                        className="req-form-input"
                        style={{ width: "8.5rem" }}
                      />

                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(line.id)}
                          className="inv-modal-close-btn"
                          style={{ width: "1.85rem", height: "1.85rem", color: "#e11d48" }}
                          aria-label="Delete line"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>

                    {line.itemId && (
                      <div style={{ paddingLeft: "2.1rem", fontSize: "0.7rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        {hasStock ? (
                          <span style={{ color: "#059669", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                            <Boxes size={12} />
                            Available in {supplyingDept?.name || "source dept"}: {onHand}
                          </span>
                        ) : (
                          <span style={{ color: "#d97706", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                            <AlertTriangle size={12} />
                            0 on-hand in {supplyingDept?.name || "source dept"} (will queue as backorder)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* General Notes */}
          <div className="req-form-group">
            <label className="req-form-label">
              General Requisition Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Inter-department transfer of stock / urgent replenishment"
              className="req-form-textarea"
            />
          </div>

          {/* Emergency Requisition Toggle (Only relevant when requesting from Central Supply outside Mon-Wed) */}
          {isSupplyingFromRoot && (
            <div style={{ paddingTop: "0.65rem", borderTop: "1px solid var(--border, #e2e8f0)" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={isEmergency}
                  onChange={(e) => setIsEmergency(e.target.checked)}
                  style={{ width: "1rem", height: "1rem", accentColor: "#e11d48", cursor: "pointer" }}
                />
                <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "#e11d48", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                  <AlertTriangle size={14} />
                  Emergency Off-Schedule Requisition (Central Supply Bypass)
                </span>
              </label>

              {isEmergency && (
                <div style={{ marginTop: "0.65rem", paddingLeft: "1.5rem" }}>
                  <label className="req-form-label" style={{ color: "#9f1239", marginBottom: "0.25rem", display: "block" }}>
                    Emergency Justification (Required)
                  </label>
                  <input
                    type="text"
                    required
                    value={emergencyJustification}
                    onChange={(e) => setEmergencyJustification(e.target.value)}
                    placeholder="e.g. Critical stockout of essential medications due to patient influx"
                    className="req-form-input"
                    style={{ borderColor: "#fecdd3" }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="req-modal-footer" style={{ margin: "0.5rem -1.5rem -1.25rem", padding: "1rem 1.5rem" }}>
            <Button variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="default" type="submit" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit Requisition"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
