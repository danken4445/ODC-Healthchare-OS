"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { InventoryWorkspace } from "@odyssey/types";
import { Button } from "@odyssey/ui";
import {
  AlertCircle,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Image as ImageIcon,
  Info,
  Layers,
  PackageSearch,
  Pill,
  Printer,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
  X,
} from "lucide-react";
import {
  calculateReportDates,
  computeDepartmentInventoryReport,
  getDefaultHeaderConfig,
  buildInventoryReportPrintDocument,
  buildInventoryReportCsv,
  type DepartmentInventoryReport,
  type InventoryReportHeaderConfig,
  type InventoryReportPeriod,
} from "./inventory-report-document";

interface Props {
  organizationId: string;
  organizationName?: string;
  assignedDepartmentId: string | null;
  rootSupplyDepartmentId: string | null;
  isSuperadmin: boolean;
  departments: Array<{ id: string; name: string; is_root_supply?: boolean }>;
  workspace: InventoryWorkspace;
  isOpen: boolean;
  onClose: () => void;
  signedInAs?: string | null;
}

export function InventoryReportModal({
  organizationId,
  organizationName = "Odyssey Healthcare Network",
  assignedDepartmentId,
  rootSupplyDepartmentId,
  isSuperadmin,
  departments,
  workspace,
  isOpen,
  onClose,
  signedInAs,
}: Props) {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Department Selection: default to assigned department
  const defaultDeptId = useMemo(() => {
    if (assignedDepartmentId) return assignedDepartmentId;
    if (rootSupplyDepartmentId) return rootSupplyDepartmentId;
    return departments[0]?.id || "";
  }, [assignedDepartmentId, rootSupplyDepartmentId, departments]);

  const [selectedDeptId, setSelectedDeptId] = useState<string>(defaultDeptId);

  useEffect(() => {
    if (isOpen) {
      if (assignedDepartmentId) {
        setSelectedDeptId(assignedDepartmentId);
      } else if (departments.length > 0 && !selectedDeptId) {
        setSelectedDeptId(departments[0].id);
      }
    }
  }, [isOpen, assignedDepartmentId, departments, selectedDeptId]);

  const currentDept = useMemo(() => {
    return departments.find((d) => d.id === selectedDeptId);
  }, [departments, selectedDeptId]);

  const isPharmacyDept = useMemo(() => {
    return Boolean(
      currentDept?.name?.toLowerCase().includes("pharmacy") ||
      (signedInAs?.toLowerCase().includes("pharmacy") && selectedDeptId === assignedDepartmentId)
    );
  }, [currentDept, signedInAs, selectedDeptId, assignedDepartmentId]);

  const isRootSupplyDept = useMemo(() => {
    return Boolean(
      currentDept?.is_root_supply ||
      (rootSupplyDepartmentId && selectedDeptId === rootSupplyDepartmentId) ||
      currentDept?.name?.toLowerCase().includes("supply")
    );
  }, [currentDept, rootSupplyDepartmentId, selectedDeptId]);

  // Period state
  const [periodType, setPeriodType] = useState<InventoryReportPeriod["type"]>("weekly");
  const [customDays, setCustomDays] = useState<number>(14);
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [customEnd, setCustomEnd] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });

  const period: InventoryReportPeriod = useMemo(() => {
    return calculateReportDates(periodType, customDays, customStart, customEnd);
  }, [periodType, customDays, customStart, customEnd]);

  // Header configuration & uploaded image
  const [headerConfig, setHeaderConfig] = useState<InventoryReportHeaderConfig>(() =>
    getDefaultHeaderConfig(currentDept?.name, isPharmacyDept, isRootSupplyDept, organizationName)
  );

  const [showHeaderSettings, setShowHeaderSettings] = useState<boolean>(false);
  const [uploadedHeaderUrl, setUploadedHeaderUrl] = useState<string | null>(null);

  // Load persisted header from localStorage
  useEffect(() => {
    if (typeof window === "undefined" || !organizationId || !selectedDeptId) return;
    try {
      const storageKey = `odyssey_inv_header_${organizationId}_${selectedDeptId}`;
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setUploadedHeaderUrl(saved);
      } else {
        setUploadedHeaderUrl(null);
      }
    } catch {
      // ignore
    }
  }, [organizationId, selectedDeptId]);

  // Sync default header text when department changes
  useEffect(() => {
    setHeaderConfig((prev) => {
      const defaults = getDefaultHeaderConfig(
        currentDept?.name,
        isPharmacyDept,
        isRootSupplyDept,
        organizationName
      );
      return {
        ...defaults,
        customHeaderImageUrl: uploadedHeaderUrl,
        preparedBy: prev.preparedBy || defaults.preparedBy,
        verifiedBy: prev.verifiedBy || defaults.verifiedBy,
        approvedBy: prev.approvedBy || defaults.approvedBy,
      };
    });
  }, [currentDept, isPharmacyDept, isRootSupplyDept, organizationName, uploadedHeaderUrl]);

  // Handle header image upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please upload a valid image file (PNG, JPG, SVG, WebP).");
      return;
    }

    // Limit to 3MB
    if (file.size > 3 * 1024 * 1024) {
      alert("Header image size exceeds 3MB limit.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setUploadedHeaderUrl(result);
      setHeaderConfig((prev) => ({ ...prev, customHeaderImageUrl: result }));
      try {
        const storageKey = `odyssey_inv_header_${organizationId}_${selectedDeptId}`;
        localStorage.setItem(storageKey, result);
      } catch {
        // storage quota exceeded
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveUploadedHeader = () => {
    setUploadedHeaderUrl(null);
    setHeaderConfig((prev) => ({ ...prev, customHeaderImageUrl: null }));
    try {
      const storageKey = `odyssey_inv_header_${organizationId}_${selectedDeptId}`;
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Search & filter inside the report preview
  const [reportSearch, setReportSearch] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Compute live report data
  const reportData: DepartmentInventoryReport = useMemo(() => {
    return computeDepartmentInventoryReport({
      departmentId: selectedDeptId,
      departmentName: currentDept?.name || "Assigned Department",
      isPharmacy: isPharmacyDept,
      isRootSupply: isRootSupplyDept,
      organizationId,
      organizationName,
      generatedBy: signedInAs || "Department Staff",
      period,
      headerConfig: {
        ...headerConfig,
        customHeaderImageUrl: uploadedHeaderUrl,
      },
      items: workspace.items,
      stock: workspace.stock,
      batches: workspace.batches,
      movements: workspace.movements,
      categoryFilter,
      searchQuery: reportSearch,
    });
  }, [
    selectedDeptId,
    currentDept,
    isPharmacyDept,
    isRootSupplyDept,
    organizationId,
    organizationName,
    signedInAs,
    period,
    headerConfig,
    uploadedHeaderUrl,
    workspace,
    categoryFilter,
    reportSearch,
  ]);

  // Print & PDF Export
  const [printNotice, setPrintNotice] = useState<string | null>(null);

  const handlePrintReport = useCallback(() => {
    setPrintNotice(null);
    const printWindow = window.open("", "_blank", "width=1050,height=800");
    if (!printWindow) {
      setPrintNotice("Pop-up window was blocked. Please allow pop-ups to print or save as PDF.");
      return;
    }

    const html = buildInventoryReportPrintDocument(reportData);
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();

    // Small delay to ensure images/CSS render before triggering print
    setTimeout(() => {
      try {
        printWindow.print();
      } catch {
        // ignore
      }
    }, 450);
  }, [reportData]);

  // CSV Export
  const handleExportCsv = () => {
    const csvContent = buildInventoryReportCsv(reportData);
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const deptSlug = (currentDept?.name || "department").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    link.href = url;
    link.download = `inventory-report-${deptSlug}-${period.startDate}-to-${period.endDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div
      className="gso-modal-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(15, 23, 42, 0.72)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        overflowY: "auto",
      }}
    >
      <div
        className="gso-modal-card"
        style={{
          width: "100%",
          maxWidth: "1180px",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          borderRadius: "0.85rem",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          border: "1px solid #cbd5e1",
          overflow: "hidden",
        }}
      >
        {/* ── Top Modal Header ───────────────────────────────────── */}
        <div
          style={{
            padding: "1rem 1.4rem",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#f8fafc",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "0.55rem",
                background: isPharmacyDept ? "#ecfdf5" : "#eff6ff",
                color: isPharmacyDept ? "#059669" : "#0284c7",
                border: `1px solid ${isPharmacyDept ? "#a7f3d0" : "#bae6fd"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <FileText size={22} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <h3 style={{ margin: 0, fontSize: "1.08rem", fontWeight: 700, color: "#0f172a" }}>
                  Generate Department Inventory Report
                </h3>
                <span
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    padding: "0.15rem 0.55rem",
                    borderRadius: "9999px",
                    background: isPharmacyDept ? "#dcfce7" : "#e0f2fe",
                    color: isPharmacyDept ? "#166534" : "#0369a1",
                    border: `1px solid ${isPharmacyDept ? "#bbf7d0" : "#bae6fd"}`,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.25rem",
                  }}
                >
                  <Building2 size={11} />
                  {currentDept?.name || "Department"}
                </span>
                {assignedDepartmentId === selectedDeptId && (
                  <span
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      padding: "0.15rem 0.45rem",
                      borderRadius: "0.3rem",
                      background: "#fef3c7",
                      color: "#92400e",
                      border: "1px solid #fde68a",
                    }}
                  >
                    Your Assigned Dept
                  </span>
                )}
              </div>
              <p style={{ margin: "0.15rem 0 0", fontSize: "0.78rem", color: "#64748b" }}>
                Generate official stock balance, receipts, and dispensed inventory ledger. Customizable header, printable and saveable to PDF.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              padding: "0.4rem",
              borderRadius: "0.4rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* ── Control Bar: Dept & Time Period & Header Toggle ───── */}
        <div
          style={{
            padding: "0.85rem 1.4rem",
            background: "#ffffff",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.85rem",
          }}
        >
          {/* Department Selector */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <label style={{ fontSize: "0.76rem", fontWeight: 700, color: "#475569" }}>
              Department:
            </label>
            <select
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              disabled={!isSuperadmin && !isRootSupplyDept && Boolean(assignedDepartmentId)}
              style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                padding: "0.38rem 0.7rem",
                borderRadius: "0.4rem",
                border: "1px solid #cbd5e1",
                background: "#f8fafc",
                color: "#0f172a",
                cursor: !isSuperadmin && !isRootSupplyDept && Boolean(assignedDepartmentId) ? "not-allowed" : "pointer",
              }}
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} {d.id === assignedDepartmentId ? "★ (Assigned)" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Time Period Selector */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span style={{ fontSize: "0.76rem", fontWeight: 700, color: "#475569", marginRight: "0.2rem" }}>
              Period:
            </span>
            <div
              style={{
                display: "inline-flex",
                background: "#f1f5f9",
                borderRadius: "0.45rem",
                padding: "2px",
                border: "1px solid #e2e8f0",
              }}
            >
              <button
                type="button"
                onClick={() => setPeriodType("weekly")}
                style={{
                  fontSize: "0.74rem",
                  fontWeight: periodType === "weekly" ? 700 : 500,
                  padding: "0.3rem 0.65rem",
                  borderRadius: "0.35rem",
                  border: "none",
                  cursor: "pointer",
                  background: periodType === "weekly" ? "#ffffff" : "transparent",
                  color: periodType === "weekly" ? "#0284c7" : "#64748b",
                  boxShadow: periodType === "weekly" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                }}
              >
                Weekly (7d)
              </button>
              <button
                type="button"
                onClick={() => setPeriodType("monthly")}
                style={{
                  fontSize: "0.74rem",
                  fontWeight: periodType === "monthly" ? 700 : 500,
                  padding: "0.3rem 0.65rem",
                  borderRadius: "0.35rem",
                  border: "none",
                  cursor: "pointer",
                  background: periodType === "monthly" ? "#ffffff" : "transparent",
                  color: periodType === "monthly" ? "#0284c7" : "#64748b",
                  boxShadow: periodType === "monthly" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                }}
              >
                Monthly (30d)
              </button>
              <button
                type="button"
                onClick={() => setPeriodType("custom_days")}
                style={{
                  fontSize: "0.74rem",
                  fontWeight: periodType === "custom_days" ? 700 : 500,
                  padding: "0.3rem 0.65rem",
                  borderRadius: "0.35rem",
                  border: "none",
                  cursor: "pointer",
                  background: periodType === "custom_days" ? "#ffffff" : "transparent",
                  color: periodType === "custom_days" ? "#0284c7" : "#64748b",
                  boxShadow: periodType === "custom_days" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                }}
              >
                Custom Days
              </button>
              <button
                type="button"
                onClick={() => setPeriodType("custom_range")}
                style={{
                  fontSize: "0.74rem",
                  fontWeight: periodType === "custom_range" ? 700 : 500,
                  padding: "0.3rem 0.65rem",
                  borderRadius: "0.35rem",
                  border: "none",
                  cursor: "pointer",
                  background: periodType === "custom_range" ? "#ffffff" : "transparent",
                  color: periodType === "custom_range" ? "#0284c7" : "#64748b",
                  boxShadow: periodType === "custom_range" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                }}
              >
                Date Range
              </button>
            </div>

            {/* Custom Days Input */}
            {periodType === "custom_days" && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", marginLeft: "0.4rem" }}>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={customDays}
                  onChange={(e) => setCustomDays(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{
                    width: "56px",
                    padding: "0.28rem 0.4rem",
                    fontSize: "0.76rem",
                    fontWeight: 600,
                    borderRadius: "0.35rem",
                    border: "1px solid #cbd5e1",
                    textAlign: "center",
                  }}
                />
                <span style={{ fontSize: "0.72rem", color: "#64748b" }}>days</span>
              </div>
            )}

            {/* Date Range Inputs */}
            {periodType === "custom_range" && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", marginLeft: "0.4rem" }}>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  style={{
                    padding: "0.25rem 0.45rem",
                    fontSize: "0.74rem",
                    borderRadius: "0.35rem",
                    border: "1px solid #cbd5e1",
                  }}
                />
                <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  style={{
                    padding: "0.25rem 0.45rem",
                    fontSize: "0.74rem",
                    borderRadius: "0.35rem",
                    border: "1px solid #cbd5e1",
                  }}
                />
              </div>
            )}
          </div>

          {/* Toggle Header Config Accordion */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowHeaderSettings((prev) => !prev)}
            style={{
              fontSize: "0.74rem",
              borderColor: uploadedHeaderUrl ? "#38bdf8" : "#cbd5e1",
              background: uploadedHeaderUrl ? "#f0f9ff" : "#ffffff",
              color: uploadedHeaderUrl ? "#0369a1" : "#334155",
            }}
          >
            <ImageIcon size={13} className="mr-1 text-sky-600" />
            {uploadedHeaderUrl ? "Header Banner (Uploaded)" : "Header & Letterhead"}
            {showHeaderSettings ? <ChevronUp size={13} className="ml-1" /> : <ChevronDown size={13} className="ml-1" />}
          </Button>
        </div>

        {/* ── Collapsible Header & Letterhead Upload Drawer ──────── */}
        {showHeaderSettings && (
          <div
            style={{
              padding: "1rem 1.4rem",
              background: "#f8fafc",
              borderBottom: "1px solid #e2e8f0",
              animation: "fadeIn 0.15s ease-in-out",
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 2fr", gap: "1.2rem" }}>
              {/* Left Column: Header Banner Upload */}
              <div
                style={{
                  background: "#ffffff",
                  padding: "0.9rem",
                  borderRadius: "0.55rem",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <label style={{ fontSize: "0.76rem", fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <Upload size={13} className="text-sky-600" />
                    Upload Header Banner / Logo
                  </label>
                  {uploadedHeaderUrl && (
                    <button
                      type="button"
                      onClick={handleRemoveUploadedHeader}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#ef4444",
                        fontSize: "0.7rem",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.2rem",
                      }}
                    >
                      <Trash2 size={11} /> Remove
                    </button>
                  )}
                </div>

                <p style={{ margin: "0 0 0.6rem 0", fontSize: "0.71rem", color: "#64748b", lineHeight: 1.35 }}>
                  Upload official facility letterhead banner or municipal seal (just like in the sample files). Stored securely and automatically embedded at top of report.
                </p>

                {uploadedHeaderUrl ? (
                  <div
                    style={{
                      border: "1px dashed #0284c7",
                      borderRadius: "0.45rem",
                      padding: "0.5rem",
                      background: "#f0f9ff",
                      textAlign: "center",
                    }}
                  >
                    <img
                      src={uploadedHeaderUrl}
                      alt="Uploaded Header Preview"
                      style={{ maxHeight: "48px", maxWidth: "100%", objectFit: "contain", borderRadius: "0.25rem" }}
                    />
                    <div style={{ marginTop: "0.4rem", fontSize: "0.68rem", color: "#0369a1", fontWeight: 600 }}>
                      ✓ Header image active on print preview
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: "1.5px dashed #cbd5e1",
                      borderRadius: "0.45rem",
                      padding: "0.8rem",
                      textAlign: "center",
                      cursor: "pointer",
                      background: "#f8fafc",
                    }}
                  >
                    <ImageIcon size={22} style={{ color: "#94a3b8", margin: "0 auto 0.3rem auto" }} />
                    <div style={{ fontSize: "0.74rem", fontWeight: 600, color: "#0284c7" }}>
                      Click to choose image file
                    </div>
                    <div style={{ fontSize: "0.67rem", color: "#94a3b8" }}>PNG, JPG, SVG, WebP up to 3MB</div>
                  </div>
                )}

                <input
                  id={fileInputId}
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                />
              </div>

              {/* Right Column: Template Presets & Editable Signatories */}
              <div
                style={{
                  background: "#ffffff",
                  padding: "0.9rem",
                  borderRadius: "0.55rem",
                  border: "1px solid #e2e8f0",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.6rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <label style={{ fontSize: "0.76rem", fontWeight: 700, color: "#0f172a" }}>
                    Header Title & Signatories Preset
                  </label>
                  <div style={{ display: "flex", gap: "0.3rem" }}>
                    <button
                      type="button"
                      onClick={() =>
                        setHeaderConfig((prev) => ({
                          ...prev,
                          template: "pharmacy",
                          departmentTitle: "PHARMACY DEPARTMENT WEEKLY MEDICINES and MEDICAL SUPPLIES INVENTORY",
                          preparedBy: "Staff Pharmacist, RPh",
                          verifiedBy: "Chief Pharmacist / Inventory Custodian",
                          approvedBy: "Medical Director / Hospital Administrator",
                        }))
                      }
                      style={{
                        fontSize: "0.68rem",
                        padding: "0.2rem 0.5rem",
                        borderRadius: "0.3rem",
                        border: "1px solid #cbd5e1",
                        background: headerConfig.template === "pharmacy" ? "#ecfdf5" : "#ffffff",
                        color: headerConfig.template === "pharmacy" ? "#065f46" : "#475569",
                        fontWeight: headerConfig.template === "pharmacy" ? 700 : 500,
                        cursor: "pointer",
                      }}
                    >
                      Pharmacy (OCT 05 style)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setHeaderConfig((prev) => ({
                          ...prev,
                          template: "gso",
                          departmentTitle: "GENERAL SERVICES OFFICE (GSO) & ROOT SUPPLY INVENTORY REPORT",
                          preparedBy: "Supply Custodian / Storekeeper",
                          verifiedBy: "Supply Officer / GSO Lead",
                          approvedBy: "Head of Procuring Entity / Municipal Admin",
                        }))
                      }
                      style={{
                        fontSize: "0.68rem",
                        padding: "0.2rem 0.5rem",
                        borderRadius: "0.3rem",
                        border: "1px solid #cbd5e1",
                        background: headerConfig.template === "gso" ? "#eff6ff" : "#ffffff",
                        color: headerConfig.template === "gso" ? "#1e40af" : "#475569",
                        fontWeight: headerConfig.template === "gso" ? 700 : 500,
                        cursor: "pointer",
                      }}
                    >
                      GSO / Supply Manifest style
                    </button>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                  <div>
                    <label style={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 600 }}>Institution Name</label>
                    <input
                      type="text"
                      value={headerConfig.institutionName}
                      onChange={(e) => setHeaderConfig((prev) => ({ ...prev, institutionName: e.target.value }))}
                      style={{
                        width: "100%",
                        padding: "0.3rem 0.5rem",
                        fontSize: "0.74rem",
                        borderRadius: "0.35rem",
                        border: "1px solid #cbd5e1",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 600 }}>Document Title</label>
                    <input
                      type="text"
                      value={headerConfig.departmentTitle}
                      onChange={(e) => setHeaderConfig((prev) => ({ ...prev, departmentTitle: e.target.value }))}
                      style={{
                        width: "100%",
                        padding: "0.3rem 0.5rem",
                        fontSize: "0.74rem",
                        borderRadius: "0.35rem",
                        border: "1px solid #cbd5e1",
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
                  <div>
                    <label style={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 600 }}>Prepared By</label>
                    <input
                      type="text"
                      value={headerConfig.preparedBy || ""}
                      onChange={(e) => setHeaderConfig((prev) => ({ ...prev, preparedBy: e.target.value }))}
                      style={{
                        width: "100%",
                        padding: "0.3rem 0.5rem",
                        fontSize: "0.74rem",
                        borderRadius: "0.35rem",
                        border: "1px solid #cbd5e1",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 600 }}>Verified By</label>
                    <input
                      type="text"
                      value={headerConfig.verifiedBy || ""}
                      onChange={(e) => setHeaderConfig((prev) => ({ ...prev, verifiedBy: e.target.value }))}
                      style={{
                        width: "100%",
                        padding: "0.3rem 0.5rem",
                        fontSize: "0.74rem",
                        borderRadius: "0.35rem",
                        border: "1px solid #cbd5e1",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 600 }}>Approved By</label>
                    <input
                      type="text"
                      value={headerConfig.approvedBy || ""}
                      onChange={(e) => setHeaderConfig((prev) => ({ ...prev, approvedBy: e.target.value }))}
                      style={{
                        width: "100%",
                        padding: "0.3rem 0.5rem",
                        fontSize: "0.74rem",
                        borderRadius: "0.35rem",
                        border: "1px solid #cbd5e1",
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Summary Metrics Strip ──────────────────────────────── */}
        <div
          style={{
            padding: "0.65rem 1.4rem",
            background: "#f1f5f9",
            borderBottom: "1px solid #e2e8f0",
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: "0.6rem",
          }}
        >
          <div style={{ background: "#ffffff", padding: "0.45rem 0.6rem", borderRadius: "0.4rem", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Line Items</div>
            <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0f172a" }}>{reportData.metrics.totalLines}</div>
          </div>
          <div style={{ background: "#ffffff", padding: "0.45rem 0.6rem", borderRadius: "0.4rem", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Starting Units</div>
            <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#475569" }}>{reportData.metrics.totalStartingUnits.toLocaleString()}</div>
          </div>
          <div style={{ background: "#ffffff", padding: "0.45rem 0.6rem", borderRadius: "0.4rem", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Received (+)</div>
            <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#16a34a" }}>+{reportData.metrics.totalReceivedUnits.toLocaleString()}</div>
          </div>
          <div style={{ background: "#ffffff", padding: "0.45rem 0.6rem", borderRadius: "0.4rem", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Dispensed (-)</div>
            <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#dc2626" }}>-{reportData.metrics.totalDispensedUnits.toLocaleString()}</div>
          </div>
          <div style={{ background: "#ffffff", padding: "0.45rem 0.6rem", borderRadius: "0.4rem", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Current On-Hand</div>
            <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0284c7" }}>{reportData.metrics.totalEndingUnits.toLocaleString()}</div>
          </div>
          <div style={{ background: "#ffffff", padding: "0.45rem 0.6rem", borderRadius: "0.4rem", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Stock Valuation</div>
            <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#059669" }}>
              ₱{(reportData.metrics.totalValuationInCentavos / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* ── Table Filter Toolbar ───────────────────────────────── */}
        <div
          style={{
            padding: "0.5rem 1.4rem",
            background: "#ffffff",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.8rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flex: 1, maxWidth: "420px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                background: "#f8fafc",
                border: "1px solid #cbd5e1",
                borderRadius: "0.4rem",
                padding: "0.3rem 0.6rem",
                width: "100%",
              }}
            >
              <Search size={14} style={{ color: "#94a3b8" }} />
              <input
                type="text"
                placeholder="Search items, dosage, lot number..."
                value={reportSearch}
                onChange={(e) => setReportSearch(e.target.value)}
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: "0.78rem",
                  width: "100%",
                  outline: "none",
                }}
              />
              {reportSearch && (
                <button
                  type="button"
                  onClick={() => setReportSearch("")}
                  style={{ border: "none", background: "none", cursor: "pointer", color: "#94a3b8" }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Filter size={13} style={{ color: "#64748b" }} />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{
                fontSize: "0.75rem",
                padding: "0.3rem 0.55rem",
                borderRadius: "0.35rem",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
              }}
            >
              <option value="all">All Categories</option>
              <option value="MEDICINES">Medicines Only</option>
              <option value="MEDICAL SUPPLIES">Medical Supplies Only</option>
              <option value="OFFICE SUPPLIES">Office Supplies Only</option>
              <option value="GENERAL SUPPLIES">General Supplies</option>
            </select>
          </div>
        </div>

        {/* ── Scrollable Report Table Preview ────────────────────── */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0 1.4rem",
            background: "#ffffff",
          }}
        >
          {reportData.rows.length === 0 ? (
            <div style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
              <PackageSearch size={36} style={{ margin: "0 auto 0.6rem", color: "#cbd5e1" }} />
              <p style={{ fontWeight: 600, fontSize: "0.9rem", margin: "0 0 0.3rem 0" }}>No inventory items found</p>
              <p style={{ fontSize: "0.75rem", color: "#94a3b8", margin: 0 }}>
                This department has no recorded stock balances or movements matching the selected filter.
              </p>
            </div>
          ) : (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.75rem",
                marginTop: "0.7rem",
                marginBottom: "1rem",
              }}
            >
              <thead>
                <tr style={{ background: "#0f172a", color: "#ffffff", textAlign: "left" }}>
                  <th style={{ padding: "0.5rem 0.4rem", width: "24px", textAlign: "center" }}>#</th>
                  <th style={{ padding: "0.5rem 0.6rem" }}>Item / Description</th>
                  <th style={{ padding: "0.5rem 0.5rem", width: "95px" }}>Category</th>
                  <th style={{ padding: "0.5rem 0.5rem", width: "55px", textAlign: "center" }}>Unit</th>
                  <th style={{ padding: "0.5rem 0.5rem", width: "90px", textAlign: "center" }}>Lot #</th>
                  <th style={{ padding: "0.5rem 0.5rem", width: "90px", textAlign: "center" }}>Expiry</th>
                  <th style={{ padding: "0.5rem 0.5rem", textAlign: "right" }}>Starting</th>
                  <th style={{ padding: "0.5rem 0.5rem", textAlign: "right", color: "#4ade80" }}>Received (+)</th>
                  <th style={{ padding: "0.5rem 0.5rem", textAlign: "right", color: "#f87171" }}>Dispensed (-)</th>
                  <th style={{ padding: "0.5rem 0.5rem", textAlign: "right", fontWeight: 700 }}>Ending</th>
                  <th style={{ padding: "0.5rem 0.5rem", textAlign: "right" }}>Unit Cost</th>
                  <th style={{ padding: "0.5rem 0.6rem", textAlign: "right", fontWeight: 700 }}>Total Value</th>
                </tr>
              </thead>
              <tbody>
                {reportData.rows.map((row, idx) => (
                  <tr
                    key={`${row.itemId}-${row.lotNumber || idx}`}
                    style={{
                      borderBottom: "1px solid #e2e8f0",
                      background: idx % 2 === 0 ? "#ffffff" : "#f8fafc",
                    }}
                  >
                    <td style={{ padding: "0.45rem 0.4rem", textAlign: "center", color: "#94a3b8", fontSize: "0.7rem" }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: "0.45rem 0.6rem" }}>
                      <div style={{ fontWeight: 600, color: "#0f172a" }}>{row.itemName}</div>
                      <div style={{ fontSize: "0.68rem", color: "#64748b" }}>{row.dosageOrDescription}</div>
                    </td>
                    <td style={{ padding: "0.45rem 0.5rem" }}>
                      <span
                        style={{
                          fontSize: "0.64rem",
                          fontWeight: 600,
                          padding: "0.15rem 0.4rem",
                          borderRadius: "0.25rem",
                          background: "#f1f5f9",
                          color: "#334155",
                        }}
                      >
                        {row.category}
                      </span>
                    </td>
                    <td style={{ padding: "0.45rem 0.5rem", textAlign: "center", color: "#475569" }}>
                      {row.unitOfMeasure}
                    </td>
                    <td style={{ padding: "0.45rem 0.5rem", textAlign: "center", fontFamily: "monospace", fontSize: "0.72rem", color: "#0284c7" }}>
                      {row.lotNumber || "—"}
                    </td>
                    <td style={{ padding: "0.45rem 0.5rem", textAlign: "center" }}>
                      <div>{row.expiryDate ? new Date(row.expiryDate).toLocaleDateString("en-PH") : "—"}</div>
                      {row.expiryStatus === "expired" && (
                        <span style={{ fontSize: "0.6rem", fontWeight: 700, color: "#991b1b", background: "#fee2e2", padding: "0.1rem 0.3rem", borderRadius: "0.2rem" }}>
                          EXPIRED
                        </span>
                      )}
                      {row.expiryStatus === "near_expiry" && (
                        <span style={{ fontSize: "0.6rem", fontWeight: 700, color: "#854d0e", background: "#fef08a", padding: "0.1rem 0.3rem", borderRadius: "0.2rem" }}>
                          NEAR EXPIRY
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "0.45rem 0.5rem", textAlign: "right" }}>{row.startingBalance}</td>
                    <td style={{ padding: "0.45rem 0.5rem", textAlign: "right", color: "#16a34a", fontWeight: row.receivedQuantity > 0 ? 600 : 400 }}>
                      {row.receivedQuantity > 0 ? `+${row.receivedQuantity}` : "—"}
                    </td>
                    <td style={{ padding: "0.45rem 0.5rem", textAlign: "right", color: "#dc2626", fontWeight: row.dispensedQuantity > 0 ? 600 : 400 }}>
                      {row.dispensedQuantity > 0 ? `-${row.dispensedQuantity}` : "—"}
                    </td>
                    <td style={{ padding: "0.45rem 0.5rem", textAlign: "right", fontWeight: 700, color: "#0f172a" }}>
                      {row.endingBalance}
                    </td>
                    <td style={{ padding: "0.45rem 0.5rem", textAlign: "right", color: "#475569" }}>
                      ₱{(row.unitCostInCentavos / 100).toFixed(2)}
                    </td>
                    <td style={{ padding: "0.45rem 0.6rem", textAlign: "right", fontWeight: 700, color: "#0f172a" }}>
                      ₱{(row.totalValueInCentavos / 100).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Notice / Instructions ──────────────────────────────── */}
        {printNotice && (
          <div
            style={{
              padding: "0.45rem 1.4rem",
              background: "#fef3c7",
              color: "#92400e",
              fontSize: "0.74rem",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              borderTop: "1px solid #fde68a",
            }}
          >
            <AlertCircle size={14} />
            {printNotice}
          </div>
        )}

        {/* ── Action Footer ──────────────────────────────────────── */}
        <div
          style={{
            padding: "0.85rem 1.4rem",
            background: "#f8fafc",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.73rem", color: "#64748b" }}>
            <Info size={14} className="text-sky-600 shrink-0" />
            <span>
              Tip: In the print dialog, set <strong>Destination</strong> to <strong>&ldquo;Save as PDF&rdquo;</strong> to save a digital copy with your uploaded header banner.
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <Button variant="outline" size="sm" onClick={handleExportCsv} title="Download CSV for Excel / Sheets">
              <Download size={14} className="mr-1 text-emerald-600" />
              Export CSV
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={handlePrintReport}
              style={{
                background: "#0284c7",
                color: "#ffffff",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              <Printer size={14} className="mr-1" />
              Print / Save as PDF
            </Button>

            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
