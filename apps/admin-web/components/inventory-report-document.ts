export interface InventoryReportPeriod {
  type: "weekly" | "monthly" | "custom_days" | "custom_range";
  days?: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  label: string;
}

export interface InventoryReportHeaderConfig {
  template: "pharmacy" | "gso" | "custom";
  customHeaderImageUrl?: string | null;
  institutionName: string;
  departmentTitle: string;
  subtitle?: string;
  preparedBy?: string;
  verifiedBy?: string;
  approvedBy?: string;
}

export interface InventoryReportItemRow {
  itemId: string;
  itemName: string;
  dosageOrDescription: string;
  category: string;
  unitOfMeasure: string;
  lotNumber?: string | null;
  expiryDate?: string | null;
  expiryStatus?: "ok" | "near_expiry" | "expired" | "unassigned";
  startingBalance: number;
  receivedQuantity: number;
  dispensedQuantity: number;
  adjustmentsQuantity: number;
  endingBalance: number;
  unitCostInCentavos: number;
  totalValueInCentavos: number;
}

export interface DepartmentInventoryReport {
  organizationId: string;
  organizationName: string;
  departmentId: string;
  departmentName: string;
  isPharmacy: boolean;
  isRootSupply: boolean;
  period: InventoryReportPeriod;
  headerConfig: InventoryReportHeaderConfig;
  generatedAt: string;
  generatedBy?: string;
  metrics: {
    totalLines: number;
    totalStartingUnits: number;
    totalReceivedUnits: number;
    totalDispensedUnits: number;
    totalEndingUnits: number;
    totalValuationInCentavos: number;
    lowStockCount: number;
    nearExpiryCount: number;
    expiredCount: number;
  };
  rows: InventoryReportItemRow[];
}

function csvValue(value: unknown): string {
  const text = String(value ?? "");
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fmtNum(value: number): string {
  return new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 }).format(value);
}

function fmtCentavos(centavos: number): string {
  const pesos = centavos / 100;
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(pesos);
}

function formatDateDisplay(isoDateString?: string | null): string {
  if (!isoDateString) return "—";
  const d = new Date(isoDateString);
  if (Number.isNaN(d.valueOf())) return isoDateString;
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(d);
}

/**
 * Calculates start and end ISO dates given a period configuration.
 */
export function calculateReportDates(
  type: InventoryReportPeriod["type"],
  customDays?: number,
  customStart?: string,
  customEnd?: string
): InventoryReportPeriod {
  const today = new Date();
  const todayIso = today.toISOString().split("T")[0];

  if (type === "weekly") {
    const start = new Date(today);
    start.setDate(today.getDate() - 7);
    const startIso = start.toISOString().split("T")[0];
    return {
      type: "weekly",
      days: 7,
      startDate: startIso,
      endDate: todayIso,
      label: `Weekly (${formatDateDisplay(startIso)} – ${formatDateDisplay(todayIso)})`,
    };
  }

  if (type === "monthly") {
    const start = new Date(today);
    start.setDate(today.getDate() - 30);
    const startIso = start.toISOString().split("T")[0];
    return {
      type: "monthly",
      days: 30,
      startDate: startIso,
      endDate: todayIso,
      label: `Monthly (${formatDateDisplay(startIso)} – ${formatDateDisplay(todayIso)})`,
    };
  }

  if (type === "custom_days") {
    const days = Math.max(1, customDays || 14);
    const start = new Date(today);
    start.setDate(today.getDate() - days);
    const startIso = start.toISOString().split("T")[0];
    return {
      type: "custom_days",
      days,
      startDate: startIso,
      endDate: todayIso,
      label: `Past ${days} Days (${formatDateDisplay(startIso)} – ${formatDateDisplay(todayIso)})`,
    };
  }

  // custom_range
  const startIso = customStart || todayIso;
  const endIso = customEnd || todayIso;
  return {
    type: "custom_range",
    startDate: startIso,
    endDate: endIso,
    label: `Custom Period (${formatDateDisplay(startIso)} – ${formatDateDisplay(endIso)})`,
  };
}

/**
 * Generates default header configuration matching the department and templates.
 */
export function getDefaultHeaderConfig(
  departmentName?: string,
  isPharmacy?: boolean,
  isRootSupply?: boolean,
  organizationName?: string
): InventoryReportHeaderConfig {
  const org = organizationName || "Odyssey Health Care Network";

  if (isPharmacy || departmentName?.toLowerCase().includes("pharmacy")) {
    return {
      template: "pharmacy",
      institutionName: org.toUpperCase(),
      departmentTitle: "PHARMACY DEPARTMENT WEEKLY MEDICINES and MEDICAL SUPPLIES INVENTORY",
      subtitle: "Official Stock Monitoring, Inflows, Dispensing, and Physical Balance Ledger",
      preparedBy: "Staff Pharmacist, RPh",
      verifiedBy: "Chief Pharmacist / Inventory Custodian",
      approvedBy: "Medical Director / Hospital Administrator",
    };
  }

  if (isRootSupply || departmentName?.toLowerCase().includes("supply")) {
    return {
      template: "gso",
      institutionName: org.toUpperCase(),
      departmentTitle: "GENERAL SERVICES OFFICE (GSO) & ROOT SUPPLY INVENTORY REPORT",
      subtitle: "Central Warehouse Municipal Procurement, Intake, and Department Dispersal Ledger",
      preparedBy: "Supply Custodian / Storekeeper",
      verifiedBy: "Supply Officer / GSO Lead",
      approvedBy: "Head of Procuring Entity / Municipal Administrator",
    };
  }

  return {
    template: "custom",
    institutionName: org.toUpperCase(),
    departmentTitle: `${(departmentName || "DEPARTMENT").toUpperCase()} INVENTORY STATUS REPORT`,
    subtitle: "Departmental Stock Monitoring and Supply Consumption Ledger",
    preparedBy: "Department Inventory Custodian",
    verifiedBy: "Department Head / Supervisor",
    approvedBy: "Clinic / Hospital Director",
  };
}

/**
 * Pure calculation engine to assemble the department inventory report from workspace state.
 */
export function computeDepartmentInventoryReport(params: {
  departmentId: string;
  departmentName: string;
  isPharmacy?: boolean;
  isRootSupply?: boolean;
  organizationId: string;
  organizationName: string;
  generatedBy?: string;
  period: InventoryReportPeriod;
  headerConfig: InventoryReportHeaderConfig;
  items: Array<{
    id: string;
    name: string;
    description?: string | null;
    unit_of_measure: string;
    unit_cost?: number;
    selling_price?: number;
    sku?: string | null;
  }>;
  stock: Array<{
    id?: string;
    item_id: string;
    department_id: string;
    quantity: number;
    reorder_level?: number;
  }>;
  batches?: Array<{
    id: string;
    item_id: string;
    department_id: string;
    lot_number: string | null;
    expiry_date: string | null;
    quantity: number;
    days_until_expiry: number | null;
    expiry_status: "ok" | "near_expiry" | "expired" | "legacy_unassigned";
  }>;
  movements?: Array<{
    id: string;
    item_id: string;
    department_id: string;
    movement_type: string;
    quantity_delta: number;
    occurred_at: string;
    batch_id?: string | null;
  }>;
  categoryFilter?: string;
  searchQuery?: string;
}): DepartmentInventoryReport {
  const {
    departmentId,
    departmentName,
    isPharmacy = false,
    isRootSupply = false,
    organizationId,
    organizationName,
    generatedBy,
    period,
    headerConfig,
    items,
    stock,
    batches = [],
    movements = [],
    categoryFilter,
    searchQuery,
  } = params;

  // Filter stock rows for this department
  const deptStockMap = new Map<string, { quantity: number; reorderLevel: number }>();
  for (const s of stock) {
    if (s.department_id === departmentId) {
      deptStockMap.set(s.item_id, {
        quantity: Number(s.quantity) || 0,
        reorderLevel: Number(s.reorder_level) || 0,
      });
    }
  }

  // Filter batches for this department
  const deptBatches = batches.filter((b) => b.department_id === departmentId);
  const batchesByItem = new Map<string, typeof deptBatches>();
  for (const b of deptBatches) {
    const list = batchesByItem.get(b.item_id) || [];
    list.push(b);
    batchesByItem.set(b.item_id, list);
  }

  // Filter movements for this department in period
  const startTimestamp = new Date(period.startDate + "T00:00:00").getTime();
  const endTimestamp = new Date(period.endDate + "T23:59:59.999").getTime();

  // Movements inside period per item
  const periodMovementsByItem = new Map<
    string,
    { received: number; dispensed: number; adjustments: number; netDelta: number }
  >();

  // Movements strictly AFTER end of period per item (to unwind stock if looking back in history)
  const afterPeriodDeltaByItem = new Map<string, number>();

  for (const m of movements) {
    if (m.department_id !== departmentId) continue;
    const occ = new Date(m.occurred_at).getTime();
    const delta = Number(m.quantity_delta) || 0;

    if (occ > endTimestamp) {
      afterPeriodDeltaByItem.set(
        m.item_id,
        (afterPeriodDeltaByItem.get(m.item_id) || 0) + delta
      );
      continue;
    }

    if (occ >= startTimestamp && occ <= endTimestamp) {
      const current = periodMovementsByItem.get(m.item_id) || {
        received: 0,
        dispensed: 0,
        adjustments: 0,
        netDelta: 0,
      };

      current.netDelta += delta;

      if (m.movement_type === "receipt" || m.movement_type === "transfer_in") {
        current.received += Math.abs(delta);
      } else if (
        m.movement_type === "usage" ||
        m.movement_type === "transfer_out" ||
        m.movement_type === "pos_sale"
      ) {
        current.dispensed += Math.abs(delta);
      } else if (m.movement_type === "adjustment") {
        if (delta > 0) current.received += delta;
        else current.dispensed += Math.abs(delta);
        current.adjustments += delta;
      } else if (m.movement_type === "opening") {
        current.received += Math.abs(delta);
      } else {
        if (delta > 0) current.received += delta;
        else current.dispensed += Math.abs(delta);
      }

      periodMovementsByItem.set(m.item_id, current);
    }
  }

  const rows: InventoryReportItemRow[] = [];
  let totalStartingUnits = 0;
  let totalReceivedUnits = 0;
  let totalDispensedUnits = 0;
  let totalEndingUnits = 0;
  let totalValuationInCentavos = 0;
  let lowStockCount = 0;
  let nearExpiryCount = 0;
  let expiredCount = 0;

  // Process each master item associated with this department or having stock/movement
  for (const item of items) {
    const stockInfo = deptStockMap.get(item.id);
    const itemBatches = batchesByItem.get(item.id) || [];
    const pMovements = periodMovementsByItem.get(item.id) || {
      received: 0,
      dispensed: 0,
      adjustments: 0,
      netDelta: 0,
    };

    // If item has no stock and no movements in this department, skip
    if (!stockInfo && itemBatches.length === 0 && pMovements.netDelta === 0) {
      continue;
    }

    // Optional search query
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = item.name.toLowerCase().includes(q);
      const matchDesc = (item.description || "").toLowerCase().includes(q);
      const matchSku = (item.sku || "").toLowerCase().includes(q);
      const matchBatch = itemBatches.some((b) => (b.lot_number || "").toLowerCase().includes(q));
      if (!matchName && !matchDesc && !matchSku && !matchBatch) {
        continue;
      }
    }

    // Optional category filter
    const inferredCategory = inferItemCategory(item.name, item.description);
    if (categoryFilter && categoryFilter !== "all" && inferredCategory !== categoryFilter) {
      continue;
    }

    const currentStock = stockInfo ? stockInfo.quantity : 0;
    const deltaAfterPeriod = afterPeriodDeltaByItem.get(item.id) || 0;
    // Calculate ending balance as of the report endDate
    const endingBalance = Math.max(0, currentStock - deltaAfterPeriod);
    // Calculate starting balance as of the report startDate
    const startingBalance = Math.max(0, endingBalance - pMovements.netDelta);

    const unitCostInCentavos = Number(item.unit_cost) || 0;
    const totalValueInCentavos = Math.round(endingBalance * unitCostInCentavos);

    if (stockInfo && endingBalance <= stockInfo.reorderLevel && endingBalance > 0) {
      lowStockCount++;
    }

    totalStartingUnits += startingBalance;
    totalReceivedUnits += pMovements.received;
    totalDispensedUnits += pMovements.dispensed;
    totalEndingUnits += endingBalance;
    totalValuationInCentavos += totalValueInCentavos;

    // If item has specific batches, create rows or roll up
    if (itemBatches.length > 0) {
      for (const batch of itemBatches) {
        let expStatus: InventoryReportItemRow["expiryStatus"] = "ok";
        if (batch.expiry_status === "expired") {
          expStatus = "expired";
          expiredCount++;
        } else if (batch.expiry_status === "near_expiry") {
          expStatus = "near_expiry";
          nearExpiryCount++;
        } else if (batch.expiry_status === "legacy_unassigned" || !batch.expiry_date) {
          expStatus = "unassigned";
        }

        const batchQty = Math.max(0, batch.quantity);
        const batchValue = Math.round(batchQty * unitCostInCentavos);

        rows.push({
          itemId: item.id,
          itemName: item.name,
          dosageOrDescription: item.description || "Standard",
          category: inferredCategory,
          unitOfMeasure: item.unit_of_measure || "unit",
          lotNumber: batch.lot_number || "Unassigned",
          expiryDate: batch.expiry_date,
          expiryStatus: expStatus,
          startingBalance: Math.max(0, Math.round(startingBalance * (batchQty / Math.max(1, currentStock)))),
          receivedQuantity: pMovements.received,
          dispensedQuantity: pMovements.dispensed,
          adjustmentsQuantity: pMovements.adjustments,
          endingBalance: batchQty,
          unitCostInCentavos,
          totalValueInCentavos: batchValue,
        });
      }
    } else {
      // Item has no distinct batch tracked yet
      rows.push({
        itemId: item.id,
        itemName: item.name,
        dosageOrDescription: item.description || "General Formulation",
        category: inferredCategory,
        unitOfMeasure: item.unit_of_measure || "unit",
        lotNumber: null,
        expiryDate: null,
        expiryStatus: "unassigned",
        startingBalance,
        receivedQuantity: pMovements.received,
        dispensedQuantity: pMovements.dispensed,
        adjustmentsQuantity: pMovements.adjustments,
        endingBalance,
        unitCostInCentavos,
        totalValueInCentavos,
      });
    }
  }

  // Sort rows by item name
  rows.sort((a, b) => a.itemName.localeCompare(b.itemName));

  return {
    organizationId,
    organizationName,
    departmentId,
    departmentName,
    isPharmacy,
    isRootSupply,
    period,
    headerConfig,
    generatedAt: new Date().toISOString(),
    generatedBy,
    metrics: {
      totalLines: rows.length,
      totalStartingUnits,
      totalReceivedUnits,
      totalDispensedUnits,
      totalEndingUnits,
      totalValuationInCentavos,
      lowStockCount,
      nearExpiryCount,
      expiredCount,
    },
    rows,
  };
}

function inferItemCategory(name: string, desc?: string | null): string {
  const text = `${name} ${desc || ""}`.toLowerCase();
  if (
    text.includes("tablet") ||
    text.includes("capsule") ||
    text.includes("syrup") ||
    text.includes("suspension") ||
    text.includes("mg") ||
    text.includes("paracetamol") ||
    text.includes("amoxicillin") ||
    text.includes("antibiotic") ||
    text.includes("ampule") ||
    text.includes("vial")
  ) {
    return "MEDICINES";
  }
  if (
    text.includes("syringe") ||
    text.includes("cotton") ||
    text.includes("bandage") ||
    text.includes("cannula") ||
    text.includes("gauze") ||
    text.includes("gloves") ||
    text.includes("alcohol")
  ) {
    return "MEDICAL SUPPLIES";
  }
  if (
    text.includes("paper") ||
    text.includes("ballpen") ||
    text.includes("folder") ||
    text.includes("envelope") ||
    text.includes("tape")
  ) {
    return "OFFICE SUPPLIES";
  }
  return "GENERAL SUPPLIES";
}

/**
 * Builds standard CSV export for spreadsheet analysis.
 */
export function buildInventoryReportCsv(report: DepartmentInventoryReport): string {
  const headerLines = [
    [report.headerConfig.institutionName],
    [report.headerConfig.departmentTitle],
    [`Reporting Period: ${report.period.label}`],
    [`Department: ${report.departmentName}`, `Generated: ${formatDateDisplay(report.generatedAt)}`],
    [],
    [
      "Line",
      "Generic / Item Name",
      "Dosage / Description",
      "Category",
      "Unit",
      "Lot / Batch No.",
      "Expiry Date",
      "Expiry Status",
      "Starting Balance",
      "Stocks Received (+)",
      "Qty Dispensed (-)",
      "Ending Balance",
      "Unit Cost (PHP)",
      "Total Value (PHP)",
    ],
  ];

  const itemLines = report.rows.map((row, index) => [
    index + 1,
    row.itemName,
    row.dosageOrDescription,
    row.category,
    row.unitOfMeasure,
    row.lotNumber ?? "Unassigned",
    row.expiryDate ? formatDateDisplay(row.expiryDate) : "N/A",
    row.expiryStatus?.toUpperCase() ?? "OK",
    row.startingBalance,
    row.receivedQuantity,
    row.dispensedQuantity,
    row.endingBalance,
    (row.unitCostInCentavos / 100).toFixed(2),
    (row.totalValueInCentavos / 100).toFixed(2),
  ]);

  const summaryLines = [
    [],
    [
      "TOTALS",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      report.metrics.totalStartingUnits,
      report.metrics.totalReceivedUnits,
      report.metrics.totalDispensedUnits,
      report.metrics.totalEndingUnits,
      "",
      (report.metrics.totalValuationInCentavos / 100).toFixed(2),
    ],
    [],
    [`Prepared By: ${report.headerConfig.preparedBy || "—"}`],
    [`Verified By: ${report.headerConfig.verifiedBy || "—"}`],
    [`Approved By: ${report.headerConfig.approvedBy || "—"}`],
  ];

  return [...headerLines, ...itemLines, ...summaryLines]
    .map((line) => line.map(csvValue).join(","))
    .join("\r\n");
}

/**
 * Builds standalone, print-optimized and saveable PDF document with custom uploaded header support.
 */
export function buildInventoryReportPrintDocument(report: DepartmentInventoryReport): string {
  const { headerConfig, period, metrics, rows } = report;

  const tableRowsHtml = rows
    .map((row, idx) => {
      let badgeClass = "badge-ok";
      let badgeLabel = "OK";
      if (row.expiryStatus === "expired") {
        badgeClass = "badge-expired";
        badgeLabel = "EXPIRED";
      } else if (row.expiryStatus === "near_expiry") {
        badgeClass = "badge-near";
        badgeLabel = "NEAR EXPIRY";
      } else if (row.expiryStatus === "unassigned") {
        badgeClass = "badge-unassigned";
        badgeLabel = "NO LOT";
      }

      return `<tr>
        <td class="col-num">${idx + 1}</td>
        <td>
          <div class="item-name">${escapeHtml(row.itemName)}</div>
          <div class="item-desc">${escapeHtml(row.dosageOrDescription)}</div>
        </td>
        <td><span class="category-pill">${escapeHtml(row.category)}</span></td>
        <td class="col-center">${escapeHtml(row.unitOfMeasure)}</td>
        <td class="col-center">
          <span class="lot-tag">${escapeHtml(row.lotNumber || "—")}</span>
        </td>
        <td class="col-center">
          <div>${escapeHtml(row.expiryDate ? formatDateDisplay(row.expiryDate) : "—")}</div>
          <span class="badge ${badgeClass}">${badgeLabel}</span>
        </td>
        <td class="col-num">${fmtNum(row.startingBalance)}</td>
        <td class="col-num number-plus">${row.receivedQuantity > 0 ? `+${fmtNum(row.receivedQuantity)}` : "—"}</td>
        <td class="col-num number-minus">${row.dispensedQuantity > 0 ? `-${fmtNum(row.dispensedQuantity)}` : "—"}</td>
        <td class="col-num number-bold">${fmtNum(row.endingBalance)}</td>
        <td class="col-num">${fmtCentavos(row.unitCostInCentavos)}</td>
        <td class="col-num number-bold">${fmtCentavos(row.totalValueInCentavos)}</td>
      </tr>`;
    })
    .join("");

  const headerGraphicHtml = headerConfig.customHeaderImageUrl
    ? `<div class="uploaded-header-banner">
         <img src="${headerConfig.customHeaderImageUrl}" alt="Official Header" />
       </div>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(headerConfig.departmentTitle)} - ${escapeHtml(period.label)}</title>
    <style>
      @page {
        size: A4 landscape;
        margin: 8mm 7mm 10mm 7mm;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        padding: 0;
        color: #0f172a;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        font-size: 8pt;
        line-height: 1.25;
        background: #ffffff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      /* Uploaded Header Banner */
      .uploaded-header-banner {
        width: 100%;
        text-align: center;
        margin-bottom: 4mm;
        border-bottom: 1.5px solid #0f172a;
        padding-bottom: 2mm;
      }
      .uploaded-header-banner img {
        max-width: 100%;
        max-height: 28mm;
        object-fit: contain;
      }

      /* Typographic Header */
      .header-container {
        border-bottom: 2px solid #0f172a;
        padding-bottom: 3mm;
        margin-bottom: 3.5mm;
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
      }
      .header-titles {
        flex: 1;
      }
      .org-name {
        font-size: 8pt;
        letter-spacing: 0.08em;
        font-weight: 700;
        color: #475569;
        text-transform: uppercase;
        margin-bottom: 1mm;
      }
      .doc-title {
        font-size: 13pt;
        font-weight: 800;
        color: #0f172a;
        letter-spacing: -0.01em;
        line-height: 1.15;
        margin: 0 0 1mm 0;
        text-transform: uppercase;
      }
      .doc-subtitle {
        font-size: 7.5pt;
        color: #64748b;
        margin: 0;
      }
      .header-meta {
        text-align: right;
        min-width: 70mm;
      }
      .period-badge {
        display: inline-block;
        background: #0f172a;
        color: #ffffff;
        font-weight: 700;
        font-size: 8pt;
        padding: 1.5mm 3.5mm;
        border-radius: 1mm;
        margin-bottom: 1.5mm;
      }
      .dept-badge {
        font-size: 7.5pt;
        color: #334155;
        font-weight: 600;
      }

      /* Summary Strip */
      .summary-grid {
        display: grid;
        grid-template-columns: repeat(6, 1fr);
        gap: 2mm;
        margin-bottom: 3.5mm;
        background: #f8fafc;
        border: 1px solid #cbd5e1;
        border-radius: 1.5mm;
        padding: 2mm 3mm;
      }
      .stat-card {
        border-right: 1px solid #e2e8f0;
        padding-right: 2mm;
      }
      .stat-card:last-child {
        border-right: none;
        padding-right: 0;
      }
      .stat-label {
        font-size: 6.5pt;
        font-weight: 700;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .stat-value {
        font-size: 10pt;
        font-weight: 800;
        color: #0f172a;
        margin-top: 0.5mm;
      }
      .stat-value.primary {
        color: #0284c7;
      }
      .stat-value.success {
        color: #166534;
      }

      /* Inventory Table */
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 7.5pt;
      }
      thead {
        display: table-header-group;
      }
      tr {
        page-break-inside: avoid;
      }
      th {
        background: #0f172a;
        color: #ffffff;
        font-weight: 700;
        font-size: 6.8pt;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        padding: 2mm 1.5mm;
        border: 1px solid #0f172a;
        text-align: left;
      }
      th.col-center, td.col-center {
        text-align: center;
      }
      th.col-num, td.col-num {
        text-align: right;
      }
      td {
        border: 1px solid #cbd5e1;
        padding: 1.8mm 1.5mm;
        vertical-align: middle;
      }
      tbody tr:nth-child(even) {
        background: #f8fafc;
      }
      .item-name {
        font-weight: 700;
        color: #0f172a;
        font-size: 7.8pt;
      }
      .item-desc {
        color: #475569;
        font-size: 6.8pt;
      }
      .category-pill {
        display: inline-block;
        background: #e2e8f0;
        color: #334155;
        font-size: 6pt;
        font-weight: 700;
        padding: 0.5mm 1.5mm;
        border-radius: 0.8mm;
      }
      .lot-tag {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 6.8pt;
        font-weight: 600;
        color: #0284c7;
      }
      .badge {
        display: inline-block;
        font-size: 5.8pt;
        font-weight: 700;
        padding: 0.4mm 1.2mm;
        border-radius: 0.6mm;
        margin-top: 0.5mm;
      }
      .badge-ok {
        background: #dcfce7;
        color: #166534;
      }
      .badge-near {
        background: #fef08a;
        color: #854d0e;
      }
      .badge-expired {
        background: #fee2e2;
        color: #991b1b;
      }
      .badge-unassigned {
        background: #f1f5f9;
        color: #64748b;
      }
      .number-plus {
        color: #15803d;
        font-weight: 600;
      }
      .number-minus {
        color: #b91c1c;
        font-weight: 600;
      }
      .number-bold {
        font-weight: 800;
        color: #0f172a;
      }

      /* Total row */
      .totals-row td {
        background: #e2e8f0;
        font-weight: 800;
        font-size: 8pt;
        border-top: 2px solid #0f172a;
        border-bottom: 2px solid #0f172a;
        padding: 2.2mm 1.5mm;
      }

      /* Signatures Section */
      .signatures-section {
        margin-top: 6mm;
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 10mm;
        page-break-inside: avoid;
      }
      .sig-block {
        text-align: left;
      }
      .sig-label {
        font-size: 6.5pt;
        font-weight: 700;
        color: #64748b;
        text-transform: uppercase;
        margin-bottom: 8mm;
      }
      .sig-line {
        border-top: 1.2px solid #0f172a;
        padding-top: 1.2mm;
      }
      .sig-name {
        font-weight: 700;
        font-size: 8pt;
        color: #0f172a;
      }
      .sig-role {
        font-size: 6.8pt;
        color: #64748b;
      }

      /* Footer */
      .report-footer {
        margin-top: 4mm;
        border-top: 1px solid #cbd5e1;
        padding-top: 2mm;
        display: flex;
        justify-content: space-between;
        font-size: 6.5pt;
        color: #94a3b8;
      }
    </style>
  </head>
  <body>
    ${headerGraphicHtml}

    <header class="header-container">
      <div class="header-titles">
        <div class="org-name">${escapeHtml(headerConfig.institutionName)}</div>
        <h1 class="doc-title">${escapeHtml(headerConfig.departmentTitle)}</h1>
        <p class="doc-subtitle">${escapeHtml(headerConfig.subtitle || "")}</p>
      </div>
      <div class="header-meta">
        <div class="period-badge">${escapeHtml(period.label)}</div>
        <div class="dept-badge">
          DEPARTMENT: <strong>${escapeHtml(report.departmentName)}</strong> &middot; ${rows.length} Items
        </div>
      </div>
    </header>

    <section class="summary-grid">
      <div class="stat-card">
        <div class="stat-label">Total Catalog Items</div>
        <div class="stat-value primary">${fmtNum(metrics.totalLines)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Starting Units</div>
        <div class="stat-value">${fmtNum(metrics.totalStartingUnits)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Period Receipts (+)</div>
        <div class="stat-value success">+${fmtNum(metrics.totalReceivedUnits)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Period Dispensed (-)</div>
        <div class="stat-value">-${fmtNum(metrics.totalDispensedUnits)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Current Ending On-Hand</div>
        <div class="stat-value primary">${fmtNum(metrics.totalEndingUnits)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Inventory Valuation</div>
        <div class="stat-value success">${fmtCentavos(metrics.totalValuationInCentavos)}</div>
      </div>
    </section>

    <table>
      <thead>
        <tr>
          <th style="width: 18px;" class="col-center">#</th>
          <th>Generic / Item Description</th>
          <th style="width: 55px;">Category</th>
          <th style="width: 38px;" class="col-center">Unit</th>
          <th style="width: 55px;" class="col-center">Batch / Lot</th>
          <th style="width: 60px;" class="col-center">Expiry</th>
          <th style="width: 48px;" class="col-num">Starting</th>
          <th style="width: 48px;" class="col-num">Received</th>
          <th style="width: 48px;" class="col-num">Dispensed</th>
          <th style="width: 48px;" class="col-num">Ending</th>
          <th style="width: 55px;" class="col-num">Unit Cost</th>
          <th style="width: 68px;" class="col-num">Total Value</th>
        </tr>
      </thead>
      <tbody>
        ${tableRowsHtml}
        <tr class="totals-row">
          <td colspan="6" style="text-align: right;">TOTAL DEPARTMENT BALANCES:</td>
          <td class="col-num">${fmtNum(metrics.totalStartingUnits)}</td>
          <td class="col-num number-plus">+${fmtNum(metrics.totalReceivedUnits)}</td>
          <td class="col-num number-minus">-${fmtNum(metrics.totalDispensedUnits)}</td>
          <td class="col-num number-bold">${fmtNum(metrics.totalEndingUnits)}</td>
          <td></td>
          <td class="col-num number-bold">${fmtCentavos(metrics.totalValuationInCentavos)}</td>
        </tr>
      </tbody>
    </table>

    <section class="signatures-section">
      <div class="sig-block">
        <div class="sig-label">Prepared By:</div>
        <div class="sig-line">
          <div class="sig-name">${escapeHtml(headerConfig.preparedBy || "Staff In-Charge")}</div>
          <div class="sig-role">Inventory Custodian / Pharmacist</div>
        </div>
      </div>
      <div class="sig-block">
        <div class="sig-label">Checked & Verified By:</div>
        <div class="sig-line">
          <div class="sig-name">${escapeHtml(headerConfig.verifiedBy || "Supervisor")}</div>
          <div class="sig-role">Department Head / Chief Pharmacist</div>
        </div>
      </div>
      <div class="sig-block">
        <div class="sig-label">Approved By:</div>
        <div class="sig-line">
          <div class="sig-name">${escapeHtml(headerConfig.approvedBy || "Medical Director")}</div>
          <div class="sig-role">Hospital Chief / Head of Agency</div>
        </div>
      </div>
    </section>

    <footer class="report-footer">
      <div>Generated by Odyssey Healthcare OS &middot; Official Department Stock Ledger</div>
      <div>Date: ${formatDateDisplay(report.generatedAt)} &middot; Page 1 of 1</div>
    </footer>
  </body>
</html>`;
}
