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
  Calendar,
  CheckCircle2,
  Clock,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useAdminData } from "./admin-data-context";

interface Props {
  organizationId: string;
  departments: DepartmentSummary[];
  items: InventoryItemSummary[];
  assignedDepartmentId: string | null;
  rootSupplyDepartmentId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (requisitionId: string) => void;
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
  const [requestingDeptId, setRequestingDeptId] = useState<string>(
    assignedDepartmentId || departments.find((d) => d.id !== rootSupplyDepartmentId)?.id || ""
  );
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

  // Evaluate Manila day of week
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

    if (!isWindowOpen && !isEmergency) {
      setError(
        `Routine requisitions are accepted Monday to Wednesday only (Today is ${dayName}). Check 'Emergency Request' if this restock is critically urgent.`
      );
      return;
    }

    if (isEmergency && !emergencyJustification.trim()) {
      setError("An emergency justification is required for off-schedule requisitions.");
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
      items: payloadItems,
      notes: notes.trim() || undefined,
      isEmergency,
      emergencyJustification: isEmergency ? emergencyJustification.trim() : undefined,
    });

    setSubmitting(false);

    if (res.error) {
      const msg = res.error.message || "";
      if (msg.includes("REQUISITION_WINDOW_CLOSED")) {
        setError(
          "Requisition window closed. Requisitions are accepted Monday to Wednesday only for guaranteed next-week fulfillment."
        );
      } else {
        setError(`Failed to submit requisition: ${msg}`);
      }
    } else if (res.data) {
      onSuccess(res.data);
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
                Request supplies from the Central Supply Room for next-week delivery.
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

        {/* Requisition Window Status Banner */}
        <div style={{ padding: "1rem 1.5rem 0" }}>
          {isWindowOpen ? (
            <div className="req-window-notice req-window-notice--open">
              <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
              <div>
                <strong>Requisition Window is OPEN (Monday–Wednesday).</strong>
                <p style={{ margin: "0.2rem 0 0", color: "#047857" }}>
                  Requests submitted today ({dayName}) are scheduled for delivery next week:{" "}
                  <strong>Monday, {targetDeliveryDateStr}</strong>.
                </p>
              </div>
            </div>
          ) : (
            <div className="req-window-notice req-window-notice--closed">
              <Clock size={16} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
              <div>
                <strong>Routine Requisition Window is CLOSED.</strong>
                <p style={{ margin: "0.2rem 0 0", color: "#b45309" }}>
                  Standard requisitions open Monday through Wednesday. Routine orders submitted outside this window are paused until the next cycle.
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

          {/* Requesting Department Selector */}
          <div className="req-form-group">
            <label className="req-form-label">
              Requesting Department
            </label>
            <select
              value={requestingDeptId}
              onChange={(e) => setRequestingDeptId(e.target.value)}
              disabled={Boolean(assignedDepartmentId)}
              className="req-form-select"
            >
              {departments
                .filter((d) => d.id !== rootSupplyDepartmentId)
                .map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name} ({dept.code || "DEPT"})
                  </option>
                ))}
            </select>
          </div>

          {/* Requested Items Table */}
          <div className="req-form-group">
            <div className="req-lines-header">
              <label className="req-form-label">
                Requested Items
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
              {lines.map((line, idx) => (
                <div key={line.id} className="req-line-row">
                  <span className="req-line-index">{idx + 1}</span>

                  <select
                    value={line.itemId}
                    onChange={(e) => handleLineChange(line.id, "itemId", e.target.value)}
                    className="req-form-select"
                    style={{ flex: 1 }}
                  >
                    <option value="">Select Item from Catalog...</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.unit_of_measure})
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Qty"
                    value={line.quantity}
                    onChange={(e) => handleLineChange(line.id, "quantity", e.target.value)}
                    className="req-form-input"
                    style={{ width: "5rem" }}
                  />

                  <input
                    type="text"
                    placeholder="Notes (optional)"
                    value={line.notes}
                    onChange={(e) => handleLineChange(line.id, "notes", e.target.value)}
                    className="req-form-input"
                    style={{ width: "9rem" }}
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
              ))}
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
              placeholder="e.g. Standard weekly restock for Pharmacy dispensary"
              className="req-form-textarea"
            />
          </div>

          {/* Emergency Requisition Toggle */}
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
                Emergency Off-Schedule Requisition
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
