"use client";

import {
  getRootSupplyDepartment,
  getStaffDepartments,
  importGsoInventoryRows,
  parseGsoInventoryCsv,
  saveStaffDepartment,
  setRootSupplyDepartment,
} from "@odyssey/supabase-client";
import type { GsoCsvParseResult, GsoCsvRow } from "@odyssey/types";
import { Button } from "@odyssey/ui";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Boxes,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  FileText,
  Filter,
  Layers,
  Loader2,
  Minus,
  PackageCheck,
  PackagePlus,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import React, { useEffect, useId, useMemo, useState } from "react";
import { useAdminData } from "./admin-data-context";

interface Props {
  organizationId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (count: number) => void;
}

interface DeptOption {
  id: string;
  name: string;
  is_root_supply?: boolean;
}

const SAMPLE_GSO_CSV = `,DESCRIPTION,EXPIRY,UNIT,QUANTITY
,,OFFICE SUPPLIES,,
,BALLPEN black,,PCS,100
,BOND PAPER A4 70gsm,,REAMS,50
,STAPLER heavy duty #35,,UNITS,10
,CORRECTION TAPE 5mm x 6m,,PCS,30
,,GSO MEDICAL SUPPLIES,,
,AMBU BAG ADULT,7/2027,PCS,15
,ALCOHOL 70% ISOPROPYL 500ml,11/19/26,BOTS,60
,STERILE GAUZE PAD 4x4,9/14/2029,PACKS,120
,DISPOSABLE SYRINGE 3ml w/ needle,SEPT. 2027,BOXES,40
,SURGICAL GLOVES SIZE 7.5,AUG. 5, 2027,BOXES,25
,DIGITAL THERMOMETER,,UNITS,20
,,MEDICAL EQUIPMENTS,,
,BP APPARATUS ANEORID WITH STETH,,SET,8
,PULSE OXIMETER FINGERTIP,,UNITS,12
,WHEELCHAIR STANDARD FOLDABLE,,UNITS,4
,,LAUNDRY & JANITORIAL SUPPLIES,,
,DISINFECTANT BLEACH 1 GAL,,GALS,15
,TRASH BAG BLACK XXL,,ROLLS,20`;

// Category colors for badges
const CATEGORY_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  "GSO MEDICAL SUPPLIES": {
    bg: "#ecfdf5",
    color: "#065f46",
    border: "#a7f3d0",
  },
  "MEDICAL EQUIPMENTS": {
    bg: "#eff6ff",
    color: "#1e40af",
    border: "#bfdbfe",
  },
  "OFFICE SUPPLIES": {
    bg: "#fffbeb",
    color: "#92400e",
    border: "#fde68a",
  },
  "LAUNDRY & JANITORIAL SUPPLIES": {
    bg: "#faf5ff",
    color: "#6b21a8",
    border: "#e9d5ff",
  },
  "ICT, OFFICE SUPPLIES": {
    bg: "#eef2ff",
    color: "#3730a3",
    border: "#c7d2fe",
  },
};

const DEFAULT_CATEGORY_STYLE = {
  bg: "#f1f5f9",
  color: "#334155",
  border: "#cbd5e1",
};

export function GsoCsvImportModal({
  organizationId,
  isOpen,
  onClose,
  onSuccess,
}: Props) {
  const { client } = useAdminData();
  const fileInputId = useId();

  // Root Supply Department state
  const [rootDeptId, setRootDeptId] = useState<string | null>(null);
  const [rootDeptName, setRootDeptName] = useState<string | null>(null);
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>("");
  const [configuringDept, setConfiguringDept] = useState(false);
  const [creatingDept, setCreatingDept] = useState(false);
  const [loadingRootDept, setLoadingRootDept] = useState(true);

  // State
  const [sourceTab, setSourceTab] = useState<"file" | "paste">("file");
  const [csvRaw, setCsvRaw] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<GsoCsvParseResult | null>(null);
  const [editedRows, setEditedRows] = useState<GsoCsvRow[]>([]);
  const [defaultQty, setDefaultQty] = useState(25);
  const [isDragOver, setIsDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    processed: number;
    total: number;
    percent: number;
    currentItem: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Table filtering & search
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  // Function to load departments & check root supply
  const refreshRootSupplyInfo = async () => {
    setLoadingRootDept(true);
    try {
      // 1. Get root supply dept
      const rootRes = await getRootSupplyDepartment(client, organizationId);
      const currentRootId = rootRes.error ? null : rootRes.data;

      // 2. Fetch all active departments using getStaffDepartments (robust RPC + fallback)
      const staffDeptRes = await getStaffDepartments(client, organizationId);
      let deptList: DeptOption[] = [];

      if (!staffDeptRes.error && staffDeptRes.data) {
        deptList = staffDeptRes.data
          .filter((d) => d.active !== false)
          .map((d) => ({ id: d.id, name: d.name }));
      } else {
        // Fallback directly from table
        const { data: rawDepts } = await client
          .from("departments")
          .select("id, name")
          .eq("organization_id", organizationId)
          .eq("active", true)
          .order("name");
        if (rawDepts) {
          deptList = rawDepts.map((d) => ({ id: d.id, name: d.name }));
        }
      }

      setDepartments(deptList);
      setRootDeptId(currentRootId);

      if (currentRootId) {
        const found = deptList.find((d) => d.id === currentRootId);
        setRootDeptName(found ? found.name : "Central Supply Room");
      } else {
        setRootDeptName(null);
        // Default dropdown selection to a likely central supply or first dept
        const preferred =
          deptList.find((d) =>
            /supply|central|warehouse|gso|materials/i.test(d.name)
          ) || deptList[0];
        if (preferred) setSelectedDeptId(preferred.id);
      }
    } catch (e: any) {
      console.warn("Failed to load root supply info:", e);
    } finally {
      setLoadingRootDept(false);
    }
  };

  // Load on mount / open
  useEffect(() => {
    if (!isOpen || !organizationId) return;
    void refreshRootSupplyInfo();
  }, [client, isOpen, organizationId]);

  // Set existing department as Root Supply Department handler
  const handleSetRootDepartment = async (deptIdToSet?: string) => {
    const targetId = deptIdToSet || selectedDeptId;
    if (!targetId) return;
    setConfiguringDept(true);
    setError(null);

    const res = await setRootSupplyDepartment(client, organizationId, targetId);
    setConfiguringDept(false);

    if (res.error) {
      setError(`Failed to set Root Supply Department: ${res.error.message}`);
    } else {
      setRootDeptId(targetId);
      const match = departments.find((d) => d.id === targetId);
      const name = match ? match.name : "Central Supply Room";
      setRootDeptName(name);
      setSuccessToast(`Successfully designated "${name}" as the Root Supply Room.`);
    }
  };

  // Create new "Central Supply Room" and set as Root
  const handleCreateAndSetCentralSupply = async () => {
    setCreatingDept(true);
    setError(null);

    try {
      // 1. Create department
      const createRes = await saveStaffDepartment(client, {
        organizationId,
        name: "Central Supply Room",
        description: "Root inventory warehouse for inbound municipal supply deliveries and inter-department requisitions.",
        active: true,
      });

      if (createRes.error || !createRes.data) {
        setError(`Failed to create Central Supply Room: ${createRes.error?.message || "Unknown error"}`);
        setCreatingDept(false);
        return;
      }

      const newDeptId = createRes.data;

      // 2. Designate as root
      const rootRes = await setRootSupplyDepartment(client, organizationId, newDeptId);
      if (rootRes.error) {
        setError(`Created department, but failed to set as root: ${rootRes.error.message}`);
      } else {
        setRootDeptId(newDeptId);
        setRootDeptName("Central Supply Room");
        setSuccessToast(`Created and designated "Central Supply Room" as the Root Supply Department.`);
        void refreshRootSupplyInfo();
      }
    } catch (e: any) {
      setError(`Error configuring root supply: ${e?.message || String(e)}`);
    } finally {
      setCreatingDept(false);
    }
  };

  // Filtered rows for the preview table
  const filteredRowsWithIndices = useMemo(() => {
    return editedRows
      .map((row, originalIndex) => ({ row, originalIndex }))
      .filter(({ row }) => {
        const matchesCat =
          selectedCategory === "ALL" ||
          row.category.toLowerCase() === selectedCategory.toLowerCase();

        const q = searchQuery.trim().toLowerCase();
        const matchesSearch =
          !q ||
          row.description.toLowerCase().includes(q) ||
          (row.sku && row.sku.toLowerCase().includes(q)) ||
          row.unitOfMeasure.toLowerCase().includes(q);

        return matchesCat && matchesSearch;
      });
  }, [editedRows, selectedCategory, searchQuery]);

  // Total quantity calculation
  const totalUnitsCalculated = useMemo(() => {
    return editedRows.reduce((sum, r) => sum + (r.quantity || 0), 0);
  }, [editedRows]);

  // Categories list
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    editedRows.forEach((r) => {
      counts[r.category] = (counts[r.category] || 0) + 1;
    });
    return counts;
  }, [editedRows]);

  const handleFileUpload = (file?: File) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setCsvRaw(text);
        processCsv(text);
      }
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  };

  const loadSampleData = () => {
    setFileName("sample_gso_municipal_manifest.csv");
    setCsvRaw(SAMPLE_GSO_CSV);
    processCsv(SAMPLE_GSO_CSV);
  };

  const processCsv = (text: string) => {
    setError(null);
    try {
      const parsed = parseGsoInventoryCsv(text);
      if (parsed.items.length === 0) {
        setError(
          "No inventory items found in the CSV. Please check the file formatting or load the sample template."
        );
        return;
      }
      setParseResult(parsed);
      setEditedRows(
        parsed.items.map((row) => ({
          ...row,
          quantity: row.quantity && row.quantity > 0 ? row.quantity : defaultQty,
        }))
      );
      setSelectedCategory("ALL");
      setSelectedIndices(new Set());
    } catch (err: any) {
      setError(`Failed to parse GSO CSV: ${err?.message || String(err)}`);
    }
  };

  const handleApplyDefaultQty = (onlyEmpty = false) => {
    setEditedRows((prev) =>
      prev.map((row) => {
        if (onlyEmpty && row.quantity && row.quantity > 0) return row;
        return {
          ...row,
          quantity: defaultQty,
        };
      })
    );
  };

  const handleRowQtyChange = (idx: number, qty: string) => {
    const num = parseFloat(qty);
    setEditedRows((prev) =>
      prev.map((row, i) =>
        i === idx ? { ...row, quantity: isNaN(num) ? 0 : Math.max(0, num) } : row
      )
    );
  };

  const handleRowQtyStep = (idx: number, delta: number) => {
    setEditedRows((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        const current = row.quantity ?? defaultQty;
        return { ...row, quantity: Math.max(0, current + delta) };
      })
    );
  };

  const handleDeleteRow = (idx: number) => {
    setEditedRows((prev) => prev.filter((_, i) => i !== idx));
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      next.delete(idx);
      return next;
    });
  };

  const handleToggleSelectAll = (filteredIndices: number[]) => {
    const allSelected = filteredIndices.every((i) => selectedIndices.has(i));
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        filteredIndices.forEach((i) => next.delete(i));
      } else {
        filteredIndices.forEach((i) => next.add(i));
      }
      return next;
    });
  };

  const handleToggleSelectRow = (idx: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleDeleteSelected = () => {
    if (selectedIndices.size === 0) return;
    setEditedRows((prev) => prev.filter((_, i) => !selectedIndices.has(i)));
    setSelectedIndices(new Set());
  };

  const handleCommit = async () => {
    if (editedRows.length === 0) return;
    if (!rootDeptId) {
      setError("No root supply department configured for this organization.");
      return;
    }

    setSubmitting(true);
    setImportProgress({
      processed: 0,
      total: editedRows.length,
      percent: 0,
      currentItem: "Starting intake batch...",
    });
    setError(null);

    const res = await importGsoInventoryRows(
      client,
      organizationId,
      editedRows,
      defaultQty,
      (prog) => {
        setImportProgress(prog);
      }
    );

    setSubmitting(false);
    setImportProgress(null);

    if (res.error) {
      setError(`Import failed: ${res.error.message}`);
    } else {
      onSuccess(res.data?.importedCount ?? editedRows.length);
      onClose();
    }
  };

  const handleReset = () => {
    setParseResult(null);
    setEditedRows([]);
    setCsvRaw("");
    setFileName(null);
    setError(null);
    setSearchQuery("");
    setSelectedCategory("ALL");
  };

  if (!isOpen) return null;

  const showRootSetupBanner = !loadingRootDept && !rootDeptId;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="gso-modal-backdrop"
      onClick={onClose}
    >
      <div
        className="gso-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Modal Header ────────────────────────────────────────────── */}
        <div className="gso-modal-header">
          <div className="gso-modal-header-left">
            <div className="gso-modal-header-icon" aria-hidden="true">
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <div className="gso-modal-title-row">
                <h3 className="gso-modal-title">GSO Bulk Inventory Intake</h3>
                <span
                  className="gso-modal-badge"
                  style={!rootDeptId ? { background: "#fef3c7", color: "#92400e", borderColor: "#fde68a" } : undefined}
                >
                  <Boxes size={12} />
                  {rootDeptName ? rootDeptName : "No Root Department Set"}
                </span>
                <span className="gso-modal-badge-sec">Municipal / GSO Manifest</span>
              </div>
              <p className="gso-modal-subtitle">
                Automated intake for municipal supply manifests with multi-category splitting and lot expiry tracking.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {/* Step indicator */}
            <div className="gso-stepper-pill">
              <span className={`gso-stepper-step ${!parseResult ? "active" : ""}`}>
                1. Source
              </span>
              <ArrowRight size={12} style={{ color: "#94a3b8", margin: "0 0.25rem" }} />
              <span className={`gso-stepper-step ${parseResult ? "active" : ""}`}>
                2. Review ({editedRows.length})
              </span>
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
        </div>

        {/* ── Modal Body ──────────────────────────────────────────────── */}
        <div className="gso-modal-body">
          {/* Missing Root Supply Department Notice & Setup Card */}
          {showRootSetupBanner && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
                padding: "1rem 1.15rem",
                background: "#fffbeb",
                border: "1.5px solid #f59e0b",
                borderRadius: "0.75rem",
                color: "#92400e",
                boxShadow: "0 2px 8px rgba(245, 158, 11, 0.12)",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem" }}>
                <Building2 size={20} style={{ color: "#d97706", flexShrink: 0, marginTop: "0.1rem" }} />
                <div>
                  <strong style={{ fontSize: "0.85rem", color: "#78350f" }}>
                    Action Required: Set Root Supply Room
                  </strong>
                  <p style={{ margin: "0.2rem 0 0", fontSize: "0.75rem", color: "#92400e", lineHeight: 1.45 }}>
                    To receive inbound GSO bulk stock, your clinic/hospital needs a designated <strong>Root Supply Department</strong> (central warehouse) where deliveries are logged before dispersal.
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap", paddingTop: "0.25rem" }}>
                {departments.length > 0 ? (
                  <>
                    <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#78350f" }}>
                      Choose existing department:
                    </label>
                    <select
                      value={selectedDeptId}
                      onChange={(e) => setSelectedDeptId(e.target.value)}
                      style={{
                        padding: "0.4rem 0.75rem",
                        fontSize: "0.76rem",
                        fontWeight: 600,
                        borderRadius: "0.45rem",
                        border: "1px solid #d97706",
                        background: "#ffffff",
                        color: "#0f172a",
                        minWidth: "220px",
                      }}
                    >
                      {departments.map((dept) => (
                        <option key={dept.id} value={dept.id}>
                          {dept.name}
                        </option>
                      ))}
                    </select>

                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleSetRootDepartment()}
                      disabled={configuringDept || !selectedDeptId}
                      style={{ background: "#d97706", color: "#ffffff", borderColor: "#b45309" }}
                    >
                      {configuringDept ? (
                        <>
                          <Loader2 size={13} className="animate-spin" style={{ marginRight: "0.35rem" }} />
                          Saving...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={13} style={{ marginRight: "0.35rem" }} />
                          Designate as Root Supply Room
                        </>
                      )}
                    </Button>
                  </>
                ) : null}

                <Button
                  size="sm"
                  variant={departments.length > 0 ? "secondary" : "default"}
                  onClick={handleCreateAndSetCentralSupply}
                  disabled={creatingDept}
                  style={departments.length === 0 ? { background: "#059669", color: "#ffffff" } : undefined}
                >
                  {creatingDept ? (
                    <>
                      <Loader2 size={13} className="animate-spin" style={{ marginRight: "0.35rem" }} />
                      Creating Central Supply Room...
                    </>
                  ) : (
                    <>
                      <Sparkles size={13} style={{ marginRight: "0.35rem" }} />
                      Auto-Create & Set &quot;Central Supply Room&quot;
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Success Toast */}
          {successToast && (
            <div className="inv-toast inv-toast--success" style={{ marginBottom: "0.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <CheckCircle2 size={16} />
                <span style={{ fontSize: "0.76rem", fontWeight: 600 }}>{successToast}</span>
              </div>
              <button
                type="button"
                onClick={() => setSuccessToast(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Error Banner */}
          {error && !showRootSetupBanner && (
            <div className="inv-toast inv-toast--error" style={{ marginBottom: "0.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <AlertCircle size={16} />
                <span style={{ fontSize: "0.76rem", fontWeight: 600 }}>{error}</span>
              </div>
              <button
                type="button"
                onClick={() => setError(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Live Progress Bar & Intake Status */}
          {importProgress && (
            <div className="gso-progress-card">
              <div className="gso-progress-header">
                <span style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                  <Loader2 size={16} className="animate-spin" style={{ color: "#059669" }} />
                  <span>Booking Stock into Root Supply Ledger...</span>
                </span>
                <span style={{ fontFamily: "monospace", fontSize: "0.8rem", color: "#065f46" }}>
                  {importProgress.processed} / {importProgress.total} ({importProgress.percent}%)
                </span>
              </div>

              <div className="gso-progress-track">
                <div
                  className="gso-progress-fill"
                  style={{ width: `${importProgress.percent}%` }}
                />
              </div>

              <div className="gso-progress-current-item">
                <PackageCheck size={13} style={{ color: "#059669", flexShrink: 0 }} />
                <span>
                  Processing item: <strong>{importProgress.currentItem}</strong>
                </span>
              </div>
            </div>
          )}

          {/* STEP 1: Upload / Source View */}
          {!parseResult ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Tab Selector */}
              <div className="gso-tab-nav">
                <div className="gso-tab-group">
                  <button
                    type="button"
                    onClick={() => setSourceTab("file")}
                    className={`gso-tab-btn ${sourceTab === "file" ? "active" : ""}`}
                  >
                    <Upload size={14} />
                    CSV File Upload
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceTab("paste")}
                    className={`gso-tab-btn ${sourceTab === "paste" ? "active" : ""}`}
                  >
                    <FileText size={14} />
                    Paste Raw CSV
                  </button>
                </div>

                <button
                  type="button"
                  onClick={loadSampleData}
                  className="gso-sample-btn"
                >
                  <Sparkles size={14} />
                  Load Official Sample Manifest
                </button>
              </div>

              {sourceTab === "file" ? (
                /* Drag & Drop Zone */
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`gso-dropzone ${isDragOver ? "drag-over" : ""}`}
                >
                  <input
                    id={fileInputId}
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleFileChange}
                    style={{ display: "none" }}
                  />

                  <div className="gso-dropzone-icon">
                    <Upload size={24} />
                  </div>

                  <h4 className="gso-dropzone-title">
                    {fileName ? fileName : "Drag & drop your GSO CSV inventory file here"}
                  </h4>
                  <p className="gso-dropzone-desc">
                    Accepts official municipal General Services Office inventory sheets with section banners, flexible date formats (e.g. 7/2027, 11/19/26, SEPT. 2027), and optional quantities.
                  </p>

                  <label htmlFor={fileInputId} className="gso-browse-btn">
                    <Upload size={14} />
                    Browse CSV File
                  </label>
                </div>
              ) : (
                /* Paste Raw CSV Area */
                <div className="gso-textarea-wrap">
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.74rem", color: "#64748b" }}>
                    <span>Paste raw tabular CSV text:</span>
                    <span>{csvRaw ? `${csvRaw.split("\n").length} lines` : "Empty"}</span>
                  </div>
                  <textarea
                    value={csvRaw}
                    onChange={(e) => setCsvRaw(e.target.value)}
                    placeholder={`,DESCRIPTION,EXPIRY,UNIT,QUANTITY\n,,OFFICE SUPPLIES,,\n,BALLPEN black,,PCS,100\n,,GSO MEDICAL SUPPLIES,,\n,AMBU BAG ADULT,7/2027,PCS,15`}
                    className="gso-textarea"
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={() => setCsvRaw("")}
                      disabled={!csvRaw}
                      style={{ background: "none", border: "none", color: "#94a3b8", fontSize: "0.74rem", cursor: "pointer" }}
                    >
                      Clear text
                    </button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => processCsv(csvRaw)}
                      disabled={!csvRaw.trim()}
                    >
                      <Sparkles size={14} style={{ marginRight: "0.35rem" }} />
                      Parse Inventory Data
                    </Button>
                  </div>
                </div>
              )}

              {/* Supported Feature Cards */}
              <div className="gso-feature-grid">
                <div className="gso-feature-card">
                  <div className="gso-feature-title">
                    <Layers size={14} style={{ color: "#059669" }} />
                    <span>Multi-Section Detection</span>
                  </div>
                  <p className="gso-feature-desc">
                    Auto-splits items by department/category section banners found in municipal manifests.
                  </p>
                </div>
                <div className="gso-feature-card">
                  <div className="gso-feature-title">
                    <Calendar size={14} style={{ color: "#0d9488" }} />
                    <span>Flexible Lot Expiry</span>
                  </div>
                  <p className="gso-feature-desc">
                    Normalizes month/year, 2-digit years, and named months into ISO dates for FEFO dispensing.
                  </p>
                </div>
                <div className="gso-feature-card">
                  <div className="gso-feature-title">
                    <PackageCheck size={14} style={{ color: "#0284c7" }} />
                    <span>Direct Root Ledger</span>
                  </div>
                  <p className="gso-feature-desc">
                    Directly books all stock into the Root Supply Room ready for inter-department dispersal.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* STEP 2: Interactive Review & Adjust */
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              {/* Stat Metric Cards */}
              <div className="gso-stats-grid">
                <div className="gso-stat-card">
                  <span className="gso-stat-label">Total Line Items</span>
                  <div className="gso-stat-val">
                    <span>{editedRows.length}</span>
                    <span className="gso-stat-unit">items</span>
                  </div>
                </div>

                <div className="gso-stat-card gso-stat-card--emerald">
                  <span className="gso-stat-label">Dated Batches</span>
                  <div className="gso-stat-val">
                    <span>{editedRows.filter((r) => Boolean(r.expiryDateNormalized)).length}</span>
                    <span className="gso-stat-unit">tracked</span>
                  </div>
                </div>

                <div className="gso-stat-card">
                  <span className="gso-stat-label">Categories</span>
                  <div className="gso-stat-val">
                    <span>{Object.keys(categoryCounts).length}</span>
                    <span className="gso-stat-unit">sections</span>
                  </div>
                </div>

                <div className="gso-stat-card gso-stat-card--teal">
                  <span className="gso-stat-label">Estimated Units</span>
                  <div className="gso-stat-val">
                    <span>{totalUnitsCalculated.toLocaleString()}</span>
                    <span className="gso-stat-unit">units</span>
                  </div>
                </div>
              </div>

              {/* Bulk Adjustment Toolbar */}
              <div className="gso-bulk-adjuster">
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, color: "#334155" }}>Default Quantity:</span>
                  <input
                    type="number"
                    min="1"
                    value={defaultQty}
                    onChange={(e) => setDefaultQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    style={{
                      width: "3.5rem",
                      textAlign: "center",
                      padding: "0.2rem",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      borderRadius: "0.35rem",
                      border: "1px solid #cbd5e1",
                    }}
                  />
                  <div style={{ display: "flex", gap: "0.25rem" }}>
                    {[10, 25, 50, 100].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setDefaultQty(preset)}
                        className={`gso-preset-btn ${defaultQty === preset ? "active" : ""}`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleApplyDefaultQty(false)}
                    title="Apply to all items"
                  >
                    Apply to All
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleApplyDefaultQty(true)}
                    title="Fill items with 0 quantity"
                  >
                    Fill Empty (0)
                  </Button>
                </div>
              </div>

              {/* Search, Filter Chips & Table Header */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <div className="gso-filter-row">
                  <div className="gso-search-box">
                    <Search size={14} style={{ color: "#94a3b8" }} />
                    <input
                      type="text"
                      placeholder="Search items, SKU, or unit..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="gso-search-input"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>

                  {selectedIndices.size > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.74rem", color: "#e11d48", background: "#fff1f2", padding: "0.2rem 0.6rem", borderRadius: "0.35rem", border: "1px solid #fecdd3" }}>
                      <span>{selectedIndices.size} selected</span>
                      <button
                        type="button"
                        onClick={handleDeleteSelected}
                        style={{ background: "none", border: "none", color: "#e11d48", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.2rem" }}
                      >
                        <Trash2 size={12} />
                        Remove from batch
                      </button>
                    </div>
                  )}
                </div>

                {/* Category Chips */}
                <div className="gso-chip-row">
                  <span style={{ fontSize: "0.68rem", color: "#94a3b8", display: "inline-flex", alignItems: "center", gap: "0.25rem", marginRight: "0.25rem" }}>
                    <Filter size={11} /> Section:
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedCategory("ALL")}
                    className={`gso-chip ${selectedCategory === "ALL" ? "active" : ""}`}
                  >
                    All ({editedRows.length})
                  </button>
                  {Object.entries(categoryCounts).map(([cat, count]) => {
                    const isSelected = selectedCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={`gso-chip ${isSelected ? "active" : ""}`}
                      >
                        {cat} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Data Table */}
              <div className="gso-table-wrap">
                <table className="gso-table">
                  <thead>
                    <tr>
                      <th style={{ width: "2rem" }}>
                        <input
                          type="checkbox"
                          checked={
                            filteredRowsWithIndices.length > 0 &&
                            filteredRowsWithIndices.every(({ originalIndex }) =>
                              selectedIndices.has(originalIndex)
                            )
                          }
                          onChange={() =>
                            handleToggleSelectAll(
                              filteredRowsWithIndices.map((x) => x.originalIndex)
                            )
                          }
                        />
                      </th>
                      <th style={{ width: "2rem", color: "#94a3b8" }}>#</th>
                      <th>Category</th>
                      <th>Description & SKU</th>
                      <th>Unit</th>
                      <th>Expiry Date</th>
                      <th style={{ textAlign: "right" }}>Intake Qty</th>
                      <th style={{ width: "2.5rem", textAlign: "center" }}>Del</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRowsWithIndices.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>
                          No items match your filter criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredRowsWithIndices.map(({ row, originalIndex }, displayIdx) => {
                        const style = CATEGORY_STYLES[row.category] || DEFAULT_CATEGORY_STYLE;
                        const isSelected = selectedIndices.has(originalIndex);

                        return (
                          <tr
                            key={originalIndex}
                            style={{ background: isSelected ? "#ecfdf5" : undefined }}
                          >
                            <td>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleSelectRow(originalIndex)}
                              />
                            </td>
                            <td style={{ color: "#94a3b8", fontFamily: "monospace" }}>
                              {displayIdx + 1}
                            </td>
                            <td>
                              <span
                                className="gso-cat-pill"
                                style={{
                                  background: style.bg,
                                  color: style.color,
                                  border: `1px solid ${style.border}`,
                                }}
                              >
                                {row.category}
                              </span>
                            </td>
                            <td>
                              <div style={{ fontWeight: 600, color: "#0f172a" }}>
                                {row.description}
                              </div>
                              {row.sku && <div className="gso-sku-tag">SKU: {row.sku}</div>}
                            </td>
                            <td>
                              <span className="gso-unit-tag">{row.unitOfMeasure}</span>
                            </td>
                            <td>
                              {row.expiryDateNormalized ? (
                                <span className="gso-expiry-tag">
                                  <Calendar size={12} />
                                  {row.expiryDateNormalized}
                                </span>
                              ) : (
                                <span style={{ color: "#94a3b8", fontStyle: "italic", fontSize: "0.7rem" }}>
                                  Optional (none)
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <div className="gso-stepper">
                                <button
                                  type="button"
                                  onClick={() => handleRowQtyStep(originalIndex, -1)}
                                  className="gso-stepper-btn"
                                >
                                  <Minus size={11} />
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  value={row.quantity ?? 0}
                                  onChange={(e) =>
                                    handleRowQtyChange(originalIndex, e.target.value)
                                  }
                                  className="gso-stepper-input"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRowQtyStep(originalIndex, 1)}
                                  className="gso-stepper-btn"
                                >
                                  <Plus size={11} />
                                </button>
                              </div>
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <button
                                type="button"
                                onClick={() => handleDeleteRow(originalIndex)}
                                className="gso-delete-btn"
                                title="Remove item from intake"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "#64748b", padding: "0 0.25rem" }}>
                <span>Showing {filteredRowsWithIndices.length} of {editedRows.length} items</span>
                <span>Active batch total: <strong style={{ color: "#0f172a" }}>{totalUnitsCalculated}</strong> units</span>
              </div>
            </div>
          )}

          {/* Progress Card during intake */}
          {submitting && importProgress && (
            <div className="gso-progress-card">
              <div className="gso-progress-header">
                <span className="gso-progress-title">
                  Ingesting stock into {rootDeptName || "Root Supply Room"} ({importProgress.processed}/{importProgress.total})
                </span>
                <span className="gso-progress-pct">{importProgress.percent}%</span>
              </div>
              <div className="gso-progress-track">
                <div
                  className="gso-progress-fill"
                  style={{ width: `${importProgress.percent}%` }}
                />
              </div>
              <p className="gso-progress-current-item">
                <Clock size={12} />
                Ingesting: <strong>{importProgress.currentItem}</strong>
              </p>
            </div>
          )}
        </div>

        {/* ── Modal Footer ────────────────────────────────────────────── */}
        <div className="gso-modal-footer">
          {parseResult ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleReset}
              disabled={submitting}
            >
              <ArrowLeft size={14} style={{ marginRight: "0.35rem" }} />
              Upload Different File
            </Button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.74rem", color: "#64748b" }}>
              <CheckCircle2 size={14} style={{ color: "#059669" }} />
              <span>Direct ingestion into {rootDeptName || "Root Supply Room"}</span>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>

            {parseResult && (
              <button
                type="button"
                onClick={handleCommit}
                disabled={submitting || editedRows.length === 0}
                className="gso-btn-commit"
              >
                {submitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    {importProgress
                      ? `Booking (${importProgress.processed} / ${importProgress.total} · ${importProgress.percent}%)`
                      : "Booking Intake Ledger..."}
                  </>
                ) : (
                  <>
                    <PackagePlus size={14} />
                    Book Intake ({editedRows.length} Items · {totalUnitsCalculated} Units)
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
