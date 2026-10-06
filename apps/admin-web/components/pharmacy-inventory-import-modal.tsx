"use client";

import {
  getPharmacyDepartment,
  getStaffDepartments,
  importPharmacyInventoryRows,
  parsePharmacyInventoryWorkbook,
  saveStaffDepartment,
} from "@odyssey/supabase-client";
import type {
  PharmacyInventoryImportRow,
  PharmacyInventoryParseResult,
} from "@odyssey/types";
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
  PackageCheck,
  PackagePlus,
  Pill,
  Plus,
  Search,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
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
}

const CATEGORY_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  MEDICINES: {
    bg: "#ecfdf5",
    color: "#065f46",
    border: "#a7f3d0",
  },
  "DANGEROUS DRUGS": {
    bg: "#fef2f2",
    color: "#991b1b",
    border: "#fecaca",
  },
  "ANESTHESIA MEDICINES": {
    bg: "#fff7ed",
    color: "#9a3412",
    border: "#fed7aa",
  },
  "FAST MOVING INTRAVENOUS FLUIDS": {
    bg: "#eff6ff",
    color: "#1e40af",
    border: "#bfdbfe",
  },
  SUTURES: {
    bg: "#faf5ff",
    color: "#6b21a8",
    border: "#e9d5ff",
  },
  "MEDICAL SUPPLIES": {
    bg: "#f0fdf4",
    color: "#166534",
    border: "#bbf7d0",
  },
  "NEAR EXPIRY MEDICINES": {
    bg: "#fefce8",
    color: "#854d0e",
    border: "#fef08a",
  },
};

const DEFAULT_CATEGORY_COLOR = {
  bg: "#f1f5f9",
  color: "#334155",
  border: "#cbd5e1",
};

export function PharmacyInventoryImportModal({
  organizationId,
  isOpen,
  onClose,
  onSuccess,
}: Props) {
  const { client } = useAdminData();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Target Pharmacy Department state
  const [pharmDeptId, setPharmDeptId] = useState<string | null>(null);
  const [pharmDeptName, setPharmDeptName] = useState<string | null>(null);
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>("");
  const [loadingDept, setLoadingDept] = useState<boolean>(false);
  const [creatingDept, setCreatingDept] = useState<boolean>(false);

  // File & Parsing state
  const [fileData, setFileData] = useState<ArrayBuffer | string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>("INVENTORY");
  const [parseResult, setParseResult] = useState<PharmacyInventoryParseResult | null>(null);
  const [editableItems, setEditableItems] = useState<PharmacyInventoryImportRow[]>([]);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Filter & Search state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [stockFilter, setStockFilter] = useState<"ALL" | "WITH_STOCK" | "ZERO_STOCK">("WITH_STOCK");

  // Options & Import state
  const [includeZeroStock, setIncludeZeroStock] = useState<boolean>(false);
  const [defaultQtyIfZero, setDefaultQtyIfZero] = useState<number>(0);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importProgress, setImportProgress] = useState<{
    processed: number;
    total: number;
    percent: number;
    currentItem: string;
  } | null>(null);
  const [importSummary, setImportSummary] = useState<{
    importedCount: number;
    catalogCreatedCount: number;
    departmentName: string;
    errors: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load pharmacy department options
  const refreshPharmacyDepartmentInfo = async () => {
    if (!organizationId) return;
    setLoadingDept(true);
    try {
      const pharmRes = await getPharmacyDepartment(client, organizationId);
      const staffDeptsRes = await getStaffDepartments(client, organizationId);

      let deptList: DeptOption[] = [];
      if (staffDeptsRes.data) {
        deptList = staffDeptsRes.data.map((d) => ({ id: d.id, name: d.name }));
      } else {
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

      if (pharmRes.data) {
        setPharmDeptId(pharmRes.data.id);
        setPharmDeptName(pharmRes.data.name);
        setSelectedDeptId(pharmRes.data.id);
      } else {
        const preferred = deptList.find((d) => /pharm/i.test(d.name)) || deptList[0];
        if (preferred) {
          setPharmDeptId(preferred.id);
          setPharmDeptName(preferred.name);
          setSelectedDeptId(preferred.id);
        }
      }
    } catch (e: any) {
      console.warn("Failed to load pharmacy department:", e);
    } finally {
      setLoadingDept(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !organizationId) return;
    void refreshPharmacyDepartmentInfo();
  }, [client, isOpen, organizationId]);

  // Handle creating Pharmacy department if absent
  const handleCreatePharmacyDepartment = async () => {
    setCreatingDept(true);
    setError(null);
    try {
      const res = await saveStaffDepartment(client, {
        organizationId,
        name: "Pharmacy",
        description: "Departmental Pharmacy stockroom for drugs, medicines, IV fluids, and POS dispensations.",
        active: true,
      });

      if (res.error || !res.data) {
        setError(`Failed to create Pharmacy department: ${res.error?.message || "Unknown error"}`);
        return;
      }

      const newId = res.data;
      setPharmDeptId(newId);
      setPharmDeptName("Pharmacy");
      setSelectedDeptId(newId);
      await refreshPharmacyDepartmentInfo();
    } catch (e: any) {
      setError(`Error creating department: ${e.message || String(e)}`);
    } finally {
      setCreatingDept(false);
    }
  };

  // Process and parse the loaded file buffer/text
  const processFileContent = (data: ArrayBuffer | string, name: string, sheetOverride?: string) => {
    setIsParsing(true);
    setError(null);
    try {
      const parsed = parsePharmacyInventoryWorkbook(data, sheetOverride || selectedSheet);
      setFileData(data);
      setFileName(name);
      setSelectedSheet(parsed.sheetName || "INVENTORY");
      setParseResult(parsed);
      setEditableItems(parsed.items);
      // Auto-set filter based on whether items have stock
      if (parsed.withStockCount > 0) {
        setStockFilter("WITH_STOCK");
      } else {
        setStockFilter("ALL");
      }
    } catch (err: any) {
      setError(`Failed to parse file "${name}": ${err.message || String(err)}`);
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileUpload = (file: File) => {
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    const isCsv = /\.csv$/i.test(file.name);

    if (!isExcel && !isCsv) {
      setError("Please upload an Excel spreadsheet (.xlsx, .xls) or a CSV file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result;
      if (buffer) {
        processFileContent(buffer, file.name);
      }
    };
    reader.onerror = () => {
      setError("Failed to read file from disk.");
    };

    if (isExcel) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  };

  const handleSheetChange = (newSheet: string) => {
    if (!fileData || !fileName) return;
    processFileContent(fileData, fileName, newSheet);
  };

  const handleReset = () => {
    setParseResult(null);
    setEditableItems([]);
    setFileData(null);
    setFileName(null);
    setImportSummary(null);
    setError(null);
  };

  // Filtered preview items
  const filteredItems = useMemo(() => {
    return editableItems.filter((item) => {
      // Stock filter
      if (stockFilter === "WITH_STOCK" && item.effectiveQuantity <= 0) return false;
      if (stockFilter === "ZERO_STOCK" && item.effectiveQuantity > 0) return false;

      // Category filter
      if (selectedCategory !== "ALL" && item.category !== selectedCategory) return false;

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = item.itemName.toLowerCase().includes(q);
        const matchGeneric = item.genericName.toLowerCase().includes(q);
        const matchBrand = item.brandName?.toLowerCase().includes(q) || false;
        const matchLot = item.lotNumber?.toLowerCase().includes(q) || false;
        const matchDose = item.dosageForm?.toLowerCase().includes(q) || false;
        if (!matchName && !matchGeneric && !matchBrand && !matchLot && !matchDose) {
          return false;
        }
      }

      return true;
    });
  }, [editableItems, stockFilter, selectedCategory, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const totalItems = editableItems.length;
    const totalStock = editableItems.reduce((acc, i) => acc + (i.effectiveQuantity || 0), 0);
    const datedCount = editableItems.filter((i) => Boolean(i.expiryDateNormalized)).length;
    const undatedCount = totalItems - datedCount;
    const withStockCount = editableItems.filter((i) => i.effectiveQuantity > 0).length;
    const zeroStockCount = totalItems - withStockCount;

    return {
      totalItems,
      totalStock,
      datedCount,
      undatedCount,
      withStockCount,
      zeroStockCount,
    };
  }, [editableItems]);

  // Update item inline
  const updateItem = (indexInAll: number, changes: Partial<PharmacyInventoryImportRow>) => {
    setEditableItems((prev) => {
      const next = [...prev];
      if (next[indexInAll]) {
        next[indexInAll] = { ...next[indexInAll], ...changes };
      }
      return next;
    });
  };

  // Remove single row from intake
  const handleRemoveRow = (indexInAll: number) => {
    setEditableItems((prev) => prev.filter((_, idx) => idx !== indexInAll));
  };

  // Bulk commit
  const handleCommitImport = async () => {
    const targetDept = selectedDeptId || pharmDeptId;
    if (!targetDept) {
      setError("Please select or configure the Pharmacy department destination.");
      return;
    }

    if (editableItems.length === 0) {
      setError("No items available to import.");
      return;
    }

    // Filter items according to options
    const itemsToImport = includeZeroStock
      ? editableItems
      : editableItems.filter((i) => i.effectiveQuantity > 0);

    if (itemsToImport.length === 0) {
      setError("No items with active stock to import. Toggle 'Include Catalog Items with 0 Stock' if you want to import all items.");
      return;
    }

    setIsImporting(true);
    setError(null);
    setImportSummary(null);

    try {
      const res = await importPharmacyInventoryRows(
        client,
        organizationId,
        itemsToImport,
        {
          departmentId: targetDept,
          includeZeroStock,
          defaultQuantityIfZero: defaultQtyIfZero,
        },
        (prog) => {
          setImportProgress(prog);
        }
      );

      if (res.error) {
        setError(`Pharmacy intake failed: ${res.error.message}`);
      } else if (res.data) {
        setImportSummary({
          importedCount: res.data.importedCount,
          catalogCreatedCount: res.data.catalogCreatedCount,
          departmentName: res.data.departmentName,
          errors: res.data.errors,
        });
        onSuccess(res.data.importedCount);
      }
    } catch (err: any) {
      setError(`Import error: ${err.message || String(err)}`);
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  if (!isOpen) return null;

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
        style={{ maxWidth: "66rem" }}
      >
        {/* ── Modal Header ────────────────────────────────────────────── */}
        <div className="gso-modal-header">
          <div className="gso-modal-header-left">
            <div
              className="gso-modal-header-icon"
              aria-hidden="true"
              style={{ background: "linear-gradient(135deg, #0d9488 0%, #059669 100%)" }}
            >
              <Pill size={22} />
            </div>
            <div>
              <div className="gso-modal-title-row">
                <h3 className="gso-modal-title">Pharmacy Weekly Inventory Intake</h3>
                <span className="gso-modal-badge">
                  <Building2 size={12} />
                  {pharmDeptName || "Pharmacy Department"}
                </span>
                <span className="gso-modal-badge-sec">MPH Pharmacy Pricelist & Manifest</span>
              </div>
              <p className="gso-modal-subtitle">
                Automated intake for pharmacy drugs, IV fluids, and supplies from weekly spreadsheets (OCT. 05, 2026.xlsx) with batch lot and FEFO tracking.
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
                2. Review ({editableItems.length})
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isImporting}
              className="inv-modal-close-btn"
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Modal Body ──────────────────────────────────────────────── */}
        <div className="gso-modal-body">
          {/* Intake Destination Bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.75rem 1rem",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "0.65rem",
              gap: "0.75rem",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <div
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: "2rem",
                  height: "2rem",
                  borderRadius: "0.5rem",
                  background: "#ecfdf5",
                  color: "#059669",
                  border: "1px solid #a7f3d0",
                }}
              >
                <Building2 size={16} />
              </div>
              <div>
                <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                  Intake Destination Stockroom
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <strong style={{ fontSize: "0.85rem", color: "#0f172a" }}>
                    {pharmDeptName || "Pharmacy Department"}
                  </strong>
                  <span
                    style={{
                      fontSize: "0.65rem",
                      fontWeight: 700,
                      padding: "0.1rem 0.45rem",
                      borderRadius: "0.3rem",
                      background: "#ecfdf5",
                      color: "#065f46",
                      border: "1px solid #a7f3d0",
                    }}
                  >
                    Isolated Satellite Stockroom
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {departments.length > 1 && (
                <select
                  value={selectedDeptId}
                  onChange={(e) => {
                    setSelectedDeptId(e.target.value);
                    const match = departments.find((d) => d.id === e.target.value);
                    if (match) setPharmDeptName(match.name);
                  }}
                  disabled={loadingDept || isImporting}
                  style={{
                    padding: "0.35rem 0.65rem",
                    fontSize: "0.76rem",
                    fontWeight: 600,
                    borderRadius: "0.45rem",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    color: "#0f172a",
                  }}
                >
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              )}

              {!pharmDeptId && (
                <Button
                  size="sm"
                  onClick={handleCreatePharmacyDepartment}
                  disabled={creatingDept || isImporting}
                  className="gap-1 bg-emerald-600 hover:bg-emerald-500 text-xs"
                >
                  {creatingDept ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                  Create Pharmacy Dept
                </Button>
              )}
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                padding: "0.65rem 0.9rem",
                borderRadius: "0.5rem",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#991b1b",
                fontSize: "0.78rem",
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* ── STEP 1: Upload Dropzone ─────────────────────────────────── */}
          {!parseResult && !importSummary && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFileUpload(file);
                }}
                className={`gso-dropzone ${isDragging ? "drag-over" : ""}`}
              >
                <div
                  className="gso-dropzone-icon"
                  style={{
                    background: "linear-gradient(135deg, #ecfdf5 0%, #f0fdfa 100%)",
                    color: "#059669",
                    borderColor: "#a7f3d0",
                  }}
                >
                  <FileSpreadsheet size={28} />
                </div>
                <h4 className="gso-dropzone-title">Drop your Pharmacy Excel (.xlsx, .xls) or CSV here</h4>
                <p className="gso-dropzone-desc">
                  Supports weekly department spreadsheets like <strong style={{ color: "#059669" }}>OCT. 05, 2026.xlsx</strong>, EDPMS quarterly price reports, and Masbate Provincial Hospital pharmacy catalogs.
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="gso-browse-btn"
                  disabled={isParsing}
                >
                  {isParsing ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Parsing Workbook...
                    </>
                  ) : (
                    <>
                      <Upload size={14} />
                      Browse Pharmacy Files
                    </>
                  )}
                </button>
              </div>

              {/* Pharmacy Intake Feature Highlights */}
              <div className="gso-feature-grid">
                <div className="gso-feature-card">
                  <div className="gso-feature-title">
                    <Layers size={14} style={{ color: "#059669" }} />
                    Multi-Section Recognition
                  </div>
                  <p className="gso-feature-desc">
                    Auto-categorizes Medicines, Dangerous Drugs, Anesthesia, IV Fluids, Sutures, and Medical Supplies into distinct catalog classifications.
                  </p>
                </div>

                <div className="gso-feature-card">
                  <div className="gso-feature-title">
                    <Calendar size={14} style={{ color: "#0891b2" }} />
                    FEFO Batch Normalization
                  </div>
                  <p className="gso-feature-desc">
                    Translates Excel date numbers (45611, 46569) and text formats ("OCT. 2026") into ISO standard dates for automated FEFO stock deductions.
                  </p>
                </div>

                <div className="gso-feature-card">
                  <div className="gso-feature-title">
                    <Pill size={14} style={{ color: "#7c3aed" }} />
                    Dosage & Brand Preservation
                  </div>
                  <p className="gso-feature-desc">
                    Accurately pairs Generic Names with Dosage Forms and Brand Names (e.g. TACHYBAN, SEROALBUMIN, ZILGAM, LESTOR) with unit inference.
                  </p>
                </div>
              </div>
            </>
          )}

          {/* ── STEP 2: Review, Adjust & Intake Screen ───────────────────── */}
          {parseResult && !importSummary && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              {/* Sheet & File Info Banner */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.55rem 0.85rem",
                  borderRadius: "0.55rem",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  gap: "0.5rem",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <FileSpreadsheet size={16} style={{ color: "#059669" }} />
                  <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#0f172a" }}>
                    {fileName}
                  </span>
                  <span style={{ fontSize: "0.72rem", color: "#64748b" }}>
                    • Active Sheet: <strong style={{ color: "#059669" }}>{selectedSheet}</strong>
                  </span>
                </div>

                {/* Multi-Sheet Selector Tabs */}
                {parseResult.sheetsAvailable.length > 1 && (
                  <div className="gso-tab-group">
                    {parseResult.sheetsAvailable.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleSheetChange(s)}
                        className={`gso-tab-btn ${selectedSheet === s ? "active" : ""}`}
                        style={{ fontSize: "0.72rem", padding: "0.3rem 0.6rem" }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Statistics Grid */}
              <div className="gso-stats-grid">
                <div className="gso-stat-card">
                  <span className="gso-stat-label">Total Catalog Items</span>
                  <div className="gso-stat-val">
                    {stats.totalItems}
                    <span className="gso-stat-unit">items</span>
                  </div>
                </div>

                <div className="gso-stat-card gso-stat-card--emerald">
                  <span className="gso-stat-label">On-Hand Stock Qty</span>
                  <div className="gso-stat-val">
                    {stats.totalStock.toLocaleString()}
                    <span className="gso-stat-unit">units</span>
                  </div>
                </div>

                <div className="gso-stat-card gso-stat-card--teal">
                  <span className="gso-stat-label">Dated Batches (FEFO)</span>
                  <div className="gso-stat-val">
                    {stats.datedCount}
                    <span className="gso-stat-unit">lots</span>
                  </div>
                </div>

                <div className="gso-stat-card">
                  <span className="gso-stat-label">Items with Stock &gt; 0</span>
                  <div className="gso-stat-val">
                    {stats.withStockCount}
                    <span className="gso-stat-unit">available</span>
                  </div>
                </div>
              </div>

              {/* Filter and Search Bar */}
              <div className="gso-filter-row">
                {/* Stock status filter toggles */}
                <div className="gso-tab-group" style={{ background: "#f1f5f9", padding: "0.2rem", borderRadius: "0.5rem" }}>
                  <button
                    type="button"
                    onClick={() => setStockFilter("WITH_STOCK")}
                    className={`gso-preset-btn ${stockFilter === "WITH_STOCK" ? "active" : ""}`}
                  >
                    With Stock ({stats.withStockCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStockFilter("ALL")}
                    className={`gso-preset-btn ${stockFilter === "ALL" ? "active" : ""}`}
                  >
                    All Items ({stats.totalItems})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStockFilter("ZERO_STOCK")}
                    className={`gso-preset-btn ${stockFilter === "ZERO_STOCK" ? "active" : ""}`}
                  >
                    Zero Stock ({stats.zeroStockCount})
                  </button>
                </div>

                {/* Search Box */}
                <div className="gso-search-box">
                  <Search size={14} style={{ color: "#94a3b8" }} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search medicine, lot, brand..."
                    className="gso-search-input"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      style={{ border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer", padding: 0 }}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Category Chip List */}
                <div className="gso-chip-row">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory("ALL")}
                    className={`gso-chip ${selectedCategory === "ALL" ? "active" : ""}`}
                  >
                    All ({editableItems.length})
                  </button>
                  {parseResult.categoriesFound.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`gso-chip ${selectedCategory === cat ? "active" : ""}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* High-Density Preview Table */}
              <div className="gso-table-wrap" style={{ maxHeight: "320px" }}>
                <table className="gso-table">
                  <thead>
                    <tr>
                      <th style={{ width: "16%" }}>Category</th>
                      <th style={{ width: "32%" }}>Drug / Item Description</th>
                      <th style={{ width: "14%" }}>Brand Name</th>
                      <th style={{ width: "12%" }}>Batch / Lot #</th>
                      <th style={{ width: "12%" }}>Expiry Date</th>
                      <th style={{ width: "9%", textAlign: "right" }}>Intake Qty</th>
                      <th style={{ width: "5%", textAlign: "center" }}>Act</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: "center", padding: "2rem", color: "#64748b" }}>
                          No items match the active category or search filter.
                        </td>
                      </tr>
                    ) : (
                      filteredItems.map((item, idx) => {
                        const globalIndex = editableItems.findIndex(
                          (i) => i.sku === item.sku && i.lotNumber === item.lotNumber
                        );
                        const catColor = CATEGORY_COLORS[item.category] || DEFAULT_CATEGORY_COLOR;

                        return (
                          <tr key={`${item.sku}-${item.lotNumber}-${idx}`}>
                            <td>
                              <span
                                style={{
                                  display: "inline-block",
                                  fontSize: "0.65rem",
                                  fontWeight: 700,
                                  padding: "0.15rem 0.45rem",
                                  borderRadius: "0.3rem",
                                  backgroundColor: catColor.bg,
                                  color: catColor.color,
                                  border: `1px solid ${catColor.border}`,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {item.category}
                              </span>
                            </td>
                            <td>
                              <strong style={{ color: "#0f172a", fontSize: "0.78rem" }}>
                                {item.genericName}
                              </strong>
                              {item.dosageForm && (
                                <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "0.1rem" }}>
                                  {item.dosageForm}
                                </div>
                              )}
                            </td>
                            <td>
                              {item.brandName ? (
                                <span
                                  style={{
                                    display: "inline-block",
                                    fontSize: "0.68rem",
                                    fontWeight: 600,
                                    padding: "0.1rem 0.4rem",
                                    borderRadius: "0.3rem",
                                    background: "#f1f5f9",
                                    color: "#334155",
                                    border: "1px solid #e2e8f0",
                                  }}
                                >
                                  {item.brandName}
                                </span>
                              ) : (
                                <span style={{ color: "#94a3b8", fontSize: "0.72rem" }}>—</span>
                              )}
                            </td>
                            <td>
                              <span style={{ fontFamily: "monospace", fontSize: "0.72rem", color: item.lotNumber ? "#0f172a" : "#94a3b8" }}>
                                {item.lotNumber || "None"}
                              </span>
                            </td>
                            <td>
                              {item.expiryDateNormalized ? (
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.25rem",
                                    fontSize: "0.7rem",
                                    fontWeight: 650,
                                    padding: "0.12rem 0.4rem",
                                    borderRadius: "0.3rem",
                                    background: "#ecfdf5",
                                    color: "#065f46",
                                    border: "1px solid #a7f3d0",
                                  }}
                                >
                                  <Calendar size={11} />
                                  {item.expiryDateNormalized}
                                </span>
                              ) : (
                                <span
                                  style={{
                                    fontSize: "0.68rem",
                                    color: "#64748b",
                                    background: "#f1f5f9",
                                    padding: "0.1rem 0.35rem",
                                    borderRadius: "0.3rem",
                                  }}
                                >
                                  Undated
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <div style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                                <input
                                  type="number"
                                  min="0"
                                  value={item.effectiveQuantity}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    updateItem(globalIndex, { effectiveQuantity: val });
                                  }}
                                  style={{
                                    width: "4.5rem",
                                    padding: "0.25rem 0.4rem",
                                    fontSize: "0.76rem",
                                    fontFamily: "monospace",
                                    fontWeight: 700,
                                    textAlign: "right",
                                    borderRadius: "0.35rem",
                                    border: item.effectiveQuantity > 0 ? "1.5px solid #059669" : "1px solid #cbd5e1",
                                    background: item.effectiveQuantity > 0 ? "#f0fdf4" : "#ffffff",
                                    color: item.effectiveQuantity > 0 ? "#15803d" : "#64748b",
                                  }}
                                />
                                <span style={{ fontSize: "0.68rem", color: "#64748b" }}>
                                  {item.unitOfMeasure}
                                </span>
                              </div>
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <button
                                type="button"
                                onClick={() => handleRemoveRow(globalIndex)}
                                className="gso-delete-btn"
                                title="Remove item from this intake"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Options & Table Footer */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.65rem 0.9rem",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "0.6rem",
                  gap: "0.75rem",
                  flexWrap: "wrap",
                  fontSize: "0.75rem",
                }}
              >
                <label style={{ display: "flex", alignItems: "center", gap: "0.45rem", cursor: "pointer", color: "#334155" }}>
                  <input
                    type="checkbox"
                    checked={includeZeroStock}
                    onChange={(e) => setIncludeZeroStock(e.target.checked)}
                    style={{ accentColor: "#059669" }}
                  />
                  <span>
                    Include catalog items with 0 stock (pre-populates Pharmacy Master Catalog for future replenishment)
                  </span>
                </label>

                <span style={{ color: "#64748b" }}>
                  Showing <strong>{filteredItems.length}</strong> of <strong>{editableItems.length}</strong> items
                </span>
              </div>
            </div>
          )}

          {/* ── Progress Card during intake ────────────────────────────── */}
          {isImporting && importProgress && (
            <div className="gso-progress-card">
              <div className="gso-progress-header">
                <span className="gso-progress-title">
                  Receiving stock into {pharmDeptName || "Pharmacy"} ({importProgress.processed}/{importProgress.total})
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

          {/* ── Summary Screen on Completion ───────────────────────────── */}
          {importSummary && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                padding: "2.5rem 1.5rem",
                background: "#f0fdf4",
                border: "1.5px solid #a7f3d0",
                borderRadius: "0.85rem",
                gap: "0.75rem",
              }}
            >
              <div
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: "4rem",
                  height: "4rem",
                  borderRadius: "50%",
                  background: "#dcfce7",
                  color: "#16a34a",
                }}
              >
                <CheckCircle2 size={36} />
              </div>
              <h4 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: "#14532d" }}>
                Pharmacy Stock Ingestion Complete
              </h4>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "#166534", maxWidth: "32rem", lineHeight: 1.5 }}>
                Successfully received <strong>{importSummary.importedCount}</strong> item batches into{" "}
                <strong>{importSummary.departmentName}</strong> stockroom.
              </p>
              {importSummary.catalogCreatedCount > 0 && (
                <p style={{ margin: 0, fontSize: "0.76rem", color: "#475569" }}>
                  ({importSummary.catalogCreatedCount} new drug & supply items were registered in the Master Catalog)
                </p>
              )}

              {importSummary.errors.length > 0 && (
                <div
                  style={{
                    marginTop: "0.5rem",
                    padding: "0.75rem 1rem",
                    background: "#fef3c7",
                    border: "1px solid #fde68a",
                    borderRadius: "0.5rem",
                    color: "#92400e",
                    fontSize: "0.74rem",
                    textAlign: "left",
                    maxWidth: "32rem",
                  }}
                >
                  <strong>Warnings / Review items ({importSummary.errors.length}):</strong>
                  <ul style={{ margin: "0.35rem 0 0 1rem", padding: 0 }}>
                    {importSummary.errors.slice(0, 4).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div style={{ marginTop: "1rem" }}>
                <Button
                  onClick={onClose}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-6"
                >
                  Close & View Pharmacy Stock
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── Modal Footer ────────────────────────────────────────────── */}
        <div className="gso-modal-footer">
          {parseResult && !importSummary ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleReset}
              disabled={isImporting}
            >
              <ArrowLeft size={14} style={{ marginRight: "0.35rem" }} />
              Upload Different File
            </Button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.74rem", color: "#64748b" }}>
              <CheckCircle2 size={14} style={{ color: "#059669" }} />
              <span>Direct intake into {pharmDeptName || "Pharmacy Department"}</span>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={isImporting}
            >
              Cancel
            </Button>

            {parseResult && !importSummary && (
              <button
                type="button"
                onClick={handleCommitImport}
                disabled={isImporting || editableItems.length === 0}
                className="gso-btn-commit"
              >
                {isImporting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    {importProgress
                      ? `Booking (${importProgress.processed} / ${importProgress.total} · ${importProgress.percent}%)`
                      : "Booking Pharmacy Stock..."}
                  </>
                ) : (
                  <>
                    <PackageCheck size={14} />
                    Commit Pharmacy Intake ({
                      (includeZeroStock
                        ? editableItems
                        : editableItems.filter((i) => i.effectiveQuantity > 0)
                      ).length
                    } Items · {stats.totalStock.toLocaleString()} Units)
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
