"use client";

import {
  disperseInventoryRequisitionItem,
  listInventoryRequisitions,
  subscribeToInventoryRequisitions,
} from "@odyssey/supabase-client";
import type {
  DepartmentSummary,
  InventoryItemSummary,
  InventoryRequisitionItemSummary,
  InventoryRequisitionSummary,
} from "@odyssey/types";
import { Button, soundCueEngine } from "@odyssey/ui";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bell,
  Boxes,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileDown,
  Layers,
  Package,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Truck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAdminData } from "./admin-data-context";
import {
  buildRequisitionCsv,
  buildRequisitionPrintDocument,
} from "./inventory-requisition-document";
import { InventoryRequisitionModal } from "./inventory-requisition-modal";

interface Props {
  organizationId: string;
  assignedDepartmentId: string | null;
  rootSupplyDepartmentId: string | null;
  canManageInventory: boolean;
  departments: DepartmentSummary[];
  items: InventoryItemSummary[];
  onNotify?: (notification: { text: string; type: "info" | "success" | "error" }) => void;
}

export function InventoryRequisitionHub({
  organizationId,
  assignedDepartmentId,
  rootSupplyDepartmentId,
  canManageInventory,
  departments,
  items,
  onNotify,
}: Props) {
  const { client } = useAdminData();
  const [requisitions, setRequisitions] = useState<InventoryRequisitionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [hubNotification, setHubNotification] = useState<{
    id: string;
    type: "success" | "info" | "warning";
    message: string;
  } | null>(null);
  const notifTimerRef = useRef<number | null>(null);
  const [dispersingItemId, setDispersingItemId] = useState<string | null>(null);

  const [expandedReqId, setExpandedReqId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "fulfilled">("all");
  const [directionFilter, setDirectionFilter] = useState<"all" | "incoming" | "outgoing">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const showNotification = useCallback(
    (type: "success" | "info" | "warning", message: string) => {
      if (notifTimerRef.current) {
        window.clearTimeout(notifTimerRef.current);
      }
      setHubNotification({
        id: String(Date.now()),
        type,
        message,
      });
      onNotify?.({
        text: message,
        type: type === "warning" ? "info" : type,
      });
      notifTimerRef.current = window.setTimeout(() => {
        setHubNotification(null);
        notifTimerRef.current = null;
      }, 7000);
    },
    [onNotify]
  );

  useEffect(() => {
    return () => {
      if (notifTimerRef.current) {
        window.clearTimeout(notifTimerRef.current);
      }
    };
  }, []);

  // Is current user in Root Supply or Admin?
  const isSupplyOfficer =
    canManageInventory ||
    (assignedDepartmentId && assignedDepartmentId === rootSupplyDepartmentId);

  // Scoped department: if not supply officer, scope to user's assigned department
  const scopeDeptId = isSupplyOfficer ? null : assignedDepartmentId;

  // Evaluate Manila day of week
  const { isWindowOpen, dayName, targetDeliveryDateStr } = useMemo(() => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      weekday: "long",
    });
    const currentDay = formatter.format(now);
    const open = ["Monday", "Tuesday", "Wednesday"].includes(currentDay);

    const nextMon = new Date();
    const dayOfWeek = (nextMon.getDay() + 6) % 7;
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

  const loadRequisitions = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    const res = await listInventoryRequisitions(client, organizationId, scopeDeptId);
    if (res.error) {
      setError(res.error.message || "Failed to load requisitions.");
    } else {
      setRequisitions(res.data);
      if (res.data.length > 0 && !expandedReqId) {
        setExpandedReqId(res.data[0].id);
      }
    }
    setLoading(false);
  }, [client, organizationId, scopeDeptId]);

  useEffect(() => {
    loadRequisitions();
  }, [loadRequisitions]);

  // Real-time subscription to inventory requisition changes
  useEffect(() => {
    if (!organizationId) return;
    const unsubscribe = subscribeToInventoryRequisitions(
      client,
      organizationId,
      (event) => {
        if (!event) return;
        if (event.eventType === "INSERT" && event.table === "inventory_requisitions") {
          const reqNum = event.new?.requisition_number ?? "New requisition";
          const isEmerg = event.new?.is_emergency;
          soundCueEngine.playRequisitionChime();
          showNotification(
            "info",
            isEmerg
              ? `🚨 Emergency Requisition ${reqNum} received! Immediate fulfillment required.`
              : `📦 New Requisition ${reqNum} submitted to Central Supply.`
          );
          void loadRequisitions();
        } else if (event.eventType === "UPDATE") {
          void loadRequisitions();
        }
      }
    );
    return () => {
      unsubscribe();
    };
  }, [client, organizationId, showNotification, loadRequisitions]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadRequisitions();
    setRefreshing(false);
  };

  const handleDisperse = async (reqItemId: string, maxQty?: number) => {
    setActionError(null);
    setDispersingItemId(reqItemId);
    const res = await disperseInventoryRequisitionItem(client, {
      requisitionItemId: reqItemId,
      quantity: maxQty,
    });
    setDispersingItemId(null);

    if (res.error) {
      setActionError(`Dispersal error: ${res.error.message}`);
    } else {
      soundCueEngine.playRequisitionChime();
      showNotification("success", "Item stock successfully dispersed via FEFO.");
      await loadRequisitions();
    }
  };

  const handleExportRequisition = (req: InventoryRequisitionSummary) => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([buildRequisitionCsv(req)], { type: "text/csv;charset=utf-8" })
    );
    link.download = `${req.requisition_number.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-dispersion.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handlePrintRequisition = (req: InventoryRequisitionSummary) => {
    const printWindow = window.open("", "_blank", "width=620,height=820");
    if (!printWindow) {
      setActionError("The print window was blocked. Allow pop-ups to print or save this receipt as a PDF.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(buildRequisitionPrintDocument(req));
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const filteredRequisitions = useMemo(() => {
    return requisitions.filter((req) => {
      if (statusFilter === "pending" && req.status === "fulfilled") return false;
      if (statusFilter === "fulfilled" && req.status !== "fulfilled") return false;

      if (assignedDepartmentId) {
        if (directionFilter === "incoming" && req.supply_department_id !== assignedDepartmentId) {
          return false;
        }
        if (directionFilter === "outgoing" && req.requesting_department_id !== assignedDepartmentId) {
          return false;
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesNum = req.requisition_number.toLowerCase().includes(q);
        const matchesReqDept = (req.requesting_department_name || "").toLowerCase().includes(q);
        const matchesSupplyDept = (req.supply_department_name || "").toLowerCase().includes(q);
        const matchesItem = req.items.some((i) =>
          (i.item_name || "").toLowerCase().includes(q)
        );
        if (!matchesNum && !matchesReqDept && !matchesSupplyDept && !matchesItem) return false;
      }
      return true;
    });
  }, [requisitions, statusFilter, directionFilter, assignedDepartmentId, searchQuery]);

  return (
    <div className="req-hub">
      {/* Schedule Window Status Card */}
      <div className="req-window-card">
        <div className="req-window-card__left">
          <div
            className={`req-window-icon ${
              isWindowOpen ? "req-window-icon--open" : "req-window-icon--closed"
            }`}
          >
            {isWindowOpen ? <CheckCircle2 size={20} /> : <Clock size={20} />}
          </div>
          <div>
            <div className="req-window-header">
              <h3 className="req-window-title">
                {isWindowOpen
                  ? "Central Supply Requisition Window is OPEN (Monday–Wednesday)"
                  : "Routine Central Supply Window is CLOSED"}
              </h3>
              <span
                className={`req-day-badge ${
                  isWindowOpen ? "req-day-badge--open" : "req-day-badge--closed"
                }`}
              >
                {dayName} (PHT)
              </span>
            </div>
            <p className="req-window-subtext">
              {isWindowOpen ? (
                <>
                  Central Supply orders submitted this cycle are guaranteed for delivery next week (
                  <strong>Monday, {targetDeliveryDateStr}</strong>). Direct inter-department requisitions between clinical departments remain open anytime.
                </>
              ) : (
                <>
                  Routine requisitions to Central Supply open Monday through Wednesday. Direct peer-to-peer requisitions between clinical departments are open 24/7 without cutoff restrictions.
                </>
              )}
            </p>
          </div>
        </div>

        <div className="req-window-actions">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => setShowCreateModal(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
          >
            <Plus size={15} />
            New Requisition
          </Button>
        </div>
      </div>

      {actionError && (
        <div className="req-alert-banner req-alert-banner--error">
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          <span>{actionError}</span>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="req-toolbar" style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {assignedDepartmentId && (
          <div className="req-filter-tabs" style={{ width: "100%", borderBottom: "1px solid var(--border, #e2e8f0)", paddingBottom: "0.4rem" }}>
            <button
              type="button"
              onClick={() => setDirectionFilter("all")}
              className={`req-filter-tab ${
                directionFilter === "all" ? "req-filter-tab--active" : ""
              }`}
            >
              All Activity ({requisitions.length})
            </button>
            <button
              type="button"
              onClick={() => setDirectionFilter("incoming")}
              className={`req-filter-tab ${
                directionFilter === "incoming" ? "req-filter-tab--active" : ""
              }`}
            >
              Incoming to Fulfill ({requisitions.filter((r) => r.supply_department_id === assignedDepartmentId).length})
            </button>
            <button
              type="button"
              onClick={() => setDirectionFilter("outgoing")}
              className={`req-filter-tab ${
                directionFilter === "outgoing" ? "req-filter-tab--active" : ""
              }`}
            >
              Outgoing Requests ({requisitions.filter((r) => r.requesting_department_id === assignedDepartmentId).length})
            </button>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", gap: "1rem", flexWrap: "wrap" }}>
          <div className="req-filter-tabs">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`req-filter-tab ${
                statusFilter === "all" ? "req-filter-tab--active" : ""
              }`}
            >
              All Statuses ({requisitions.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("pending")}
              className={`req-filter-tab ${
                statusFilter === "pending" ? "req-filter-tab--active" : ""
              }`}
            >
              Awaiting Fulfillment (
              {requisitions.filter((r) => r.status !== "fulfilled").length}
              )
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("fulfilled")}
              className={`req-filter-tab ${
                statusFilter === "fulfilled" ? "req-filter-tab--active" : ""
              }`}
            >
              Fulfilled ({requisitions.filter((r) => r.status === "fulfilled").length})
            </button>
          </div>

          <div className="req-search-box">
            <Search size={14} style={{ color: "var(--muted-foreground, #94a3b8)", flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search requisition #, department, or item..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Requisitions List */}
      {loading ? (
        <div className="req-loading-state">
          <RefreshCw size={24} className="animate-spin" style={{ marginBottom: "0.5rem", color: "var(--muted-foreground)" }} />
          Loading requisitions...
        </div>
      ) : filteredRequisitions.length === 0 ? (
        <div className="req-empty-state">
          <div className="req-empty-icon">
            <Truck size={24} />
          </div>
          <strong style={{ display: "block", color: "var(--foreground)", marginBottom: "0.25rem" }}>
            No requisitions found
          </strong>
          <span>Click &quot;New Requisition&quot; to request supplies from Central Supply or another department.</span>
        </div>
      ) : (
        <div className="req-list">
          {filteredRequisitions.map((req) => {
            const isExpanded = expandedReqId === req.id;
            const allItemsDispersed = req.items.every((i) => i.status === "dispersed");
            const canCreateFulfillmentDocuments = req.status === "fulfilled" && allItemsDispersed;
            const canDisperseThisReq =
              canManageInventory ||
              (assignedDepartmentId !== null && assignedDepartmentId === req.supply_department_id);

            return (
              <div key={req.id} className="req-card">
                {/* Header Row */}
                <div
                  onClick={() => setExpandedReqId(isExpanded ? null : req.id)}
                  className="req-card-header"
                >
                  <div className="req-card-header__left">
                    <button
                      type="button"
                      className="req-chevron-btn"
                      aria-label={isExpanded ? "Collapse" : "Expand"}
                    >
                      {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </button>
                    <div>
                      <div className="req-card-title-group">
                        <span className="req-number">
                          {req.requisition_number}
                        </span>
                        {req.is_emergency && (
                          <span className="req-status-pill req-status-pill--emergency">
                            <AlertTriangle size={11} />
                            EMERGENCY
                          </span>
                        )}
                        <span
                          className={`req-status-pill ${
                            req.status === "fulfilled"
                              ? "req-status-pill--fulfilled"
                              : req.status === "partially_dispersed"
                              ? "req-status-pill--partial"
                              : "req-status-pill--pending"
                          }`}
                        >
                          {req.status === "fulfilled"
                            ? "Fulfilled"
                            : req.status === "partially_dispersed"
                            ? "Partially Dispersed"
                            : "Submitted / Pending"}
                        </span>
                      </div>
                      <p className="req-meta-line" style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap", marginTop: "0.2rem" }}>
                        <span>From: <strong>{req.supply_department_name || "Supplying Dept"}</strong></span>
                        <ArrowRight size={12} style={{ color: "var(--muted-foreground)" }} />
                        <span>To: <strong>{req.requesting_department_name || "Requesting Dept"}</strong></span>
                        <span style={{ opacity: 0.4 }}>•</span>
                        <span>Delivery: <strong>{req.target_delivery_week}</strong></span>
                      </p>
                    </div>
                  </div>

                  <div className="req-card-header__right">
                    <span className="req-item-count">
                      {req.items.length} item{req.items.length === 1 ? "" : "s"}
                    </span>
                    <span className="req-date-text">
                      {new Date(req.submitted_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Expanded Details / Item Table */}
                {isExpanded && (
                  <div className="req-card-content">
                    {req.emergency_justification && (
                      <div className="req-emergency-box">
                        <strong>Emergency Justification:</strong> {req.emergency_justification}
                      </div>
                    )}
                    {req.notes && (
                      <div className="req-notes-box">
                        &ldquo;{req.notes}&rdquo;
                      </div>
                    )}

                    {canCreateFulfillmentDocuments && (
                      <div className="req-document-actions">
                        <div>
                          <strong>Fulfillment documents</strong>
                          <span>Compact receipt and soft-copy export</span>
                        </div>
                        <div className="req-document-actions__buttons">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handlePrintRequisition(req)}
                          >
                            <Printer size={14} />
                            Print / Save PDF
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleExportRequisition(req)}
                          >
                            <FileDown size={14} />
                            Export CSV
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="req-table-wrapper">
                      <table className="req-table">
                        <thead>
                          <tr>
                            <th>Item</th>
                            <th>Unit</th>
                            <th style={{ textAlign: "right" }}>Requested</th>
                            <th style={{ textAlign: "right" }}>Dispersed</th>
                            <th>Status</th>
                            {canDisperseThisReq && <th style={{ textAlign: "right" }}>Action</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {req.items.map((line) => {
                            const isFullyDispersed = line.status === "dispersed";
                            const isReady = line.status === "ready_for_dispersal";
                            const isAwaiting = line.status === "awaiting_supply_intake";

                            return (
                              <tr key={line.id}>
                                <td>
                                  <strong style={{ color: "var(--foreground, #0f172a)" }}>
                                    {line.item_name || "Item"}
                                  </strong>
                                  {line.notes && (
                                    <span style={{ display: "block", fontSize: "0.68rem", color: "var(--muted-foreground)", fontStyle: "italic", marginTop: "0.1rem" }}>
                                      {line.notes}
                                    </span>
                                  )}
                                </td>
                                <td style={{ color: "var(--muted-foreground)" }}>{line.unit_of_measure}</td>
                                <td style={{ textAlign: "right", fontWeight: 700 }}>
                                  {line.requested_quantity}
                                </td>
                                <td style={{ textAlign: "right", fontWeight: 700, color: "#059669" }}>
                                  {line.dispersed_quantity}
                                </td>
                                <td>
                                  {isFullyDispersed ? (
                                    <span className="req-line-status req-line-status--dispersed">
                                      <CheckCircle2 size={13} />
                                      Dispersed
                                    </span>
                                  ) : isReady ? (
                                    <span className="req-line-status req-line-status--ready">
                                      <Boxes size={13} />
                                      Ready for Dispersal
                                    </span>
                                  ) : (
                                    <span className="req-line-status req-line-status--pending">
                                      <Clock size={13} />
                                      Awaiting Stock / Intake
                                    </span>
                                  )}
                                </td>

                                {canDisperseThisReq && (
                                  <td style={{ textAlign: "right" }}>
                                    {!isFullyDispersed && (
                                      <Button
                                        size="sm"
                                        variant={isReady ? "default" : "secondary"}
                                        disabled={dispersingItemId === line.id}
                                        onClick={() => handleDisperse(line.id)}
                                        style={{ fontSize: "0.72rem", padding: "0.2rem 0.55rem", height: "auto" }}
                                      >
                                        {dispersingItemId === line.id ? (
                                          "Dispersing..."
                                        ) : (
                                          <>
                                            Disperse
                                            <ArrowRight size={12} style={{ marginLeft: "0.25rem" }} />
                                          </>
                                        )}
                                      </Button>
                                    )}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Creation Modal */}
      <InventoryRequisitionModal
        organizationId={organizationId}
        departments={departments}
        items={items}
        assignedDepartmentId={assignedDepartmentId}
        rootSupplyDepartmentId={rootSupplyDepartmentId}
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={async () => {
          await loadRequisitions();
        }}
      />
    </div>
  );
}
