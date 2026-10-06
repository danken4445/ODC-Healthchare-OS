"use client";

import type { InventoryViewMode, InventoryWorkspace } from "@odyssey/types";
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Layers,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

type Props = {
  mode: InventoryViewMode;
  onModeChange: (mode: InventoryViewMode) => void;
  workspace: InventoryWorkspace;
};

type StockRow = InventoryWorkspace["stock"][number] & {
  itemName: string;
  sku: string;
  unit: string;
  unitPrice: number;
  alertLevel: "none" | "low" | "critical";
  billingStatus: "unbilled" | "paid" | "no-balance-billing";
};

function number(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(
    value,
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (!values.some(Boolean))
    return (
      <span className="inventory-sparkline__empty">No 7d usage</span>
    );
  const max = Math.max(...values, 1);
  const points = values
    .map(
      (value, index) =>
        `${(index / Math.max(values.length - 1, 1)) * 64},${22 - (value / max) * 18}`,
    )
    .join(" ");
  return (
    <svg
      className="inventory-sparkline"
      viewBox="0 0 64 24"
      role="img"
      aria-label={`Seven day usage: ${values.join(", ")}`}
    >
      <polyline fill="none" points={points} />
    </svg>
  );
}

export function InventoryHierarchy({ mode, onModeChange, workspace }: Props) {
  const [openDepartmentId, setOpenDepartmentId] = useState<string | null>(null);
  const [searchDepartmentId, setSearchDepartmentId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeDepartmentId, setActiveDepartmentId] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const rows = useMemo<StockRow[]>(
    () =>
      workspace.stock.map((stock) => {
        const item = workspace.items.find(
          (candidate) => candidate.id === stock.item_id,
        );
        const quantity = Number(stock.quantity);
        const reorder = Number(stock.reorder_level);
        const latestUsage = workspace.usages.find(
          (usage) => usage.stock_id === stock.id,
        );
        return {
          ...stock,
          itemName: item?.name ?? "Unknown item",
          sku: item?.sku ?? "—",
          unit: item?.unit_of_measure ?? "unit",
          unitPrice: Number(item?.selling_price ?? item?.unit_price ?? 0),
          alertLevel:
            quantity <= 0 ? "critical" : quantity <= reorder ? "low" : "none",
          billingStatus: latestUsage?.billingStatus ?? "unbilled",
        };
      }),
    [workspace],
  );

  const matchingDepartments = useMemo(
    () =>
      new Set(
        rows
          .filter(
            (row) =>
              !deferredQuery ||
              [row.itemName, row.sku, row.unit].some((value) =>
                value.toLowerCase().includes(deferredQuery),
              ),
          )
          .map((row) => row.department_id),
      ),
    [deferredQuery, rows],
  );

  useEffect(() => {
    if (!deferredQuery || matchingDepartments.size !== 1) return;
    setOpenDepartmentId([...matchingDepartments][0]);
  }, [deferredQuery, matchingDepartments]);

  const activeRows = rows.filter(
    (row) =>
      row.department_id === activeDepartmentId &&
      (!deferredQuery ||
        [row.itemName, row.sku, row.unit].some((value) =>
          value.toLowerCase().includes(deferredQuery),
        )),
  );

  /* Drawer Search, Filter & Pagination State */
  const [drawerSearch, setDrawerSearch] = useState("");
  const [drawerAlertFilter, setDrawerAlertFilter] = useState("all");
  const [drawerBillingFilter, setDrawerBillingFilter] = useState("all");
  const [drawerSortBy, setDrawerSortBy] = useState("name_asc");
  const [drawerPage, setDrawerPage] = useState(1);
  const [drawerPageSize, setDrawerPageSize] = useState(10);

  useEffect(() => {
    setDrawerPage(1);
  }, [activeDepartmentId]);

  const departmentStockRows = useMemo(() => {
    if (!activeDepartmentId) return [];
    return rows.filter((row) => row.department_id === activeDepartmentId);
  }, [rows, activeDepartmentId]);

  const filteredDrawerRows = useMemo(() => {
    let list = [...departmentStockRows];

    // Global / Drawer search query
    const searchQuery = (drawerSearch.trim() || deferredQuery).toLowerCase();
    if (searchQuery) {
      list = list.filter((row) =>
        [row.itemName, row.sku, row.unit].some((value) =>
          value.toLowerCase().includes(searchQuery),
        ),
      );
    }

    // Alert / Stock Level filter
    if (drawerAlertFilter === "in_stock") {
      list = list.filter(
        (row) =>
          Number(row.quantity) > Number(row.reorder_level) &&
          Number(row.quantity) > 0,
      );
    } else if (drawerAlertFilter === "low") {
      list = list.filter(
        (row) =>
          Number(row.quantity) > 0 &&
          Number(row.quantity) <= Number(row.reorder_level),
      );
    } else if (drawerAlertFilter === "critical") {
      list = list.filter((row) => Number(row.quantity) <= 0);
    } else if (drawerAlertFilter === "alerts_only") {
      list = list.filter((row) => row.alertLevel !== "none");
    }

    // Billing status filter
    if (drawerBillingFilter !== "all") {
      list = list.filter((row) => row.billingStatus === drawerBillingFilter);
    }

    // Sort
    list.sort((a, b) => {
      switch (drawerSortBy) {
        case "name_asc":
          return a.itemName.localeCompare(b.itemName, undefined, {
            sensitivity: "base",
          });
        case "name_desc":
          return b.itemName.localeCompare(a.itemName, undefined, {
            sensitivity: "base",
          });
        case "stock_desc":
          return Number(b.quantity) - Number(a.quantity);
        case "stock_asc":
          return Number(a.quantity) - Number(b.quantity);
        case "price_desc":
          return b.unitPrice - a.unitPrice;
        case "price_asc":
          return a.unitPrice - b.unitPrice;
        default:
          return a.itemName.localeCompare(b.itemName, undefined, {
            sensitivity: "base",
          });
      }
    });

    return list;
  }, [
    departmentStockRows,
    drawerSearch,
    deferredQuery,
    drawerAlertFilter,
    drawerBillingFilter,
    drawerSortBy,
  ]);

  const totalDrawerRows = filteredDrawerRows.length;
  const totalDrawerPages = Math.max(
    1,
    Math.ceil(totalDrawerRows / drawerPageSize),
  );
  const currentDrawerPage = Math.min(drawerPage, totalDrawerPages);
  const drawerStartIndex = (currentDrawerPage - 1) * drawerPageSize;
  const drawerEndIndex = Math.min(
    drawerStartIndex + drawerPageSize,
    totalDrawerRows,
  );

  const paginatedDrawerRows = useMemo(() => {
    return filteredDrawerRows.slice(drawerStartIndex, drawerEndIndex);
  }, [filteredDrawerRows, drawerStartIndex, drawerEndIndex]);

  const isDrawerFiltered =
    drawerSearch.trim() !== "" ||
    drawerAlertFilter !== "all" ||
    drawerBillingFilter !== "all" ||
    drawerSortBy !== "name_asc";

  const handleResetDrawerFilters = () => {
    setDrawerSearch("");
    setDrawerAlertFilter("all");
    setDrawerBillingFilter("all");
    setDrawerSortBy("name_asc");
    setDrawerPage(1);
  };

  const getDrawerPageNumbers = () => {
    const pages: (number | "ellipsis")[] = [];
    if (totalDrawerPages <= 5) {
      for (let i = 1; i <= totalDrawerPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentDrawerPage <= 3) {
        pages.push(1, 2, 3, "ellipsis", totalDrawerPages);
      } else if (currentDrawerPage >= totalDrawerPages - 2) {
        pages.push(
          1,
          "ellipsis",
          totalDrawerPages - 2,
          totalDrawerPages - 1,
          totalDrawerPages,
        );
      } else {
        pages.push(
          1,
          "ellipsis",
          currentDrawerPage,
          "ellipsis",
          totalDrawerPages,
        );
      }
    }
    return pages;
  };

  /* Simple Table Search, Filter & Pagination State */
  const [simpleSearch, setSimpleSearch] = useState("");
  const [simpleDeptFilter, setSimpleDeptFilter] = useState("all");
  const [simpleAlertFilter, setSimpleAlertFilter] = useState("all");
  const [simpleBillingFilter, setSimpleBillingFilter] = useState("all");
  const [simpleSortBy, setSimpleSortBy] = useState("dept_asc");
  const [simplePage, setSimplePage] = useState(1);
  const [simplePageSize, setSimplePageSize] = useState(10);

  const filteredAndSortedSimpleRows = useMemo(() => {
    let list = [...rows];

    // Search query (matches Item Name, SKU, Unit, or Department Name)
    const q = simpleSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((row) => {
        const dept =
          workspace.departments.find((d) => d.id === row.department_id)
            ?.name ?? "";
        return (
          row.itemName.toLowerCase().includes(q) ||
          row.sku.toLowerCase().includes(q) ||
          row.unit.toLowerCase().includes(q) ||
          dept.toLowerCase().includes(q)
        );
      });
    }

    // Department filter
    if (simpleDeptFilter !== "all") {
      list = list.filter((row) => row.department_id === simpleDeptFilter);
    }

    // Alert filter
    if (simpleAlertFilter === "in_stock") {
      list = list.filter(
        (row) =>
          Number(row.quantity) > Number(row.reorder_level) &&
          Number(row.quantity) > 0,
      );
    } else if (simpleAlertFilter === "low") {
      list = list.filter(
        (row) =>
          Number(row.quantity) > 0 &&
          Number(row.quantity) <= Number(row.reorder_level),
      );
    } else if (simpleAlertFilter === "critical") {
      list = list.filter((row) => Number(row.quantity) <= 0);
    } else if (simpleAlertFilter === "alerts_only") {
      list = list.filter((row) => row.alertLevel !== "none");
    }

    // Billing status filter
    if (simpleBillingFilter !== "all") {
      list = list.filter((row) => row.billingStatus === simpleBillingFilter);
    }

    // Sort
    list.sort((a, b) => {
      switch (simpleSortBy) {
        case "dept_asc": {
          const deptA =
            workspace.departments.find((d) => d.id === a.department_id)
              ?.name ?? "";
          const deptB =
            workspace.departments.find((d) => d.id === b.department_id)
              ?.name ?? "";
          const cmp = deptA.localeCompare(deptB, undefined, {
            sensitivity: "base",
          });
          if (cmp !== 0) return cmp;
          return a.itemName.localeCompare(b.itemName, undefined, {
            sensitivity: "base",
          });
        }
        case "name_asc":
          return a.itemName.localeCompare(b.itemName, undefined, {
            sensitivity: "base",
          });
        case "name_desc":
          return b.itemName.localeCompare(a.itemName, undefined, {
            sensitivity: "base",
          });
        case "stock_desc":
          return Number(b.quantity) - Number(a.quantity);
        case "stock_asc":
          return Number(a.quantity) - Number(b.quantity);
        case "price_desc":
          return b.unitPrice - a.unitPrice;
        case "price_asc":
          return a.unitPrice - b.unitPrice;
        default:
          return a.itemName.localeCompare(b.itemName, undefined, {
            sensitivity: "base",
          });
      }
    });

    return list;
  }, [
    rows,
    workspace.departments,
    simpleSearch,
    simpleDeptFilter,
    simpleAlertFilter,
    simpleBillingFilter,
    simpleSortBy,
  ]);

  const totalSimpleRows = filteredAndSortedSimpleRows.length;
  const totalSimplePages = Math.max(
    1,
    Math.ceil(totalSimpleRows / simplePageSize),
  );
  const currentSimplePage = Math.min(simplePage, totalSimplePages);
  const simpleStartIndex = (currentSimplePage - 1) * simplePageSize;
  const simpleEndIndex = Math.min(
    simpleStartIndex + simplePageSize,
    totalSimpleRows,
  );

  const paginatedSimpleRows = useMemo(() => {
    return filteredAndSortedSimpleRows.slice(simpleStartIndex, simpleEndIndex);
  }, [filteredAndSortedSimpleRows, simpleStartIndex, simpleEndIndex]);

  const isSimpleFiltered =
    simpleSearch.trim() !== "" ||
    simpleDeptFilter !== "all" ||
    simpleAlertFilter !== "all" ||
    simpleBillingFilter !== "all" ||
    simpleSortBy !== "dept_asc";

  const handleResetSimpleFilters = () => {
    setSimpleSearch("");
    setSimpleDeptFilter("all");
    setSimpleAlertFilter("all");
    setSimpleBillingFilter("all");
    setSimpleSortBy("dept_asc");
    setSimplePage(1);
  };

  const getSimplePageNumbers = () => {
    const pages: (number | "ellipsis")[] = [];
    if (totalSimplePages <= 7) {
      for (let i = 1; i <= totalSimplePages; i++) {
        pages.push(i);
      }
    } else {
      if (currentSimplePage <= 4) {
        pages.push(1, 2, 3, 4, 5, "ellipsis", totalSimplePages);
      } else if (currentSimplePage >= totalSimplePages - 3) {
        pages.push(
          1,
          "ellipsis",
          totalSimplePages - 4,
          totalSimplePages - 3,
          totalSimplePages - 2,
          totalSimplePages - 1,
          totalSimplePages,
        );
      } else {
        pages.push(
          1,
          "ellipsis",
          currentSimplePage - 1,
          currentSimplePage,
          currentSimplePage + 1,
          "ellipsis",
          totalSimplePages,
        );
      }
    }
    return pages;
  };

  const usageByDepartmentAndDay = (departmentId: string) =>
    Array.from({ length: 7 }, (_, offset) => {
      const day = new Date();
      day.setDate(day.getDate() - (6 - offset));
      const key = day.toISOString().slice(0, 10);
      return workspace.usages
        .filter(
          (usage) =>
            usage.department_id === departmentId &&
            usage.used_at.slice(0, 10) === key,
        )
        .reduce((total, usage) => total + Number(usage.quantity), 0);
    });

  return (
    <section
      className="inventory-hierarchy"
      aria-labelledby="inventory-map-heading"
    >
      <div className="inventory-hierarchy__header">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="eyebrow">Department Hierarchy</span>
            <span className="text-xs text-muted-foreground font-normal">
              · {workspace.departments.filter((d) => d.active).length} locations
            </span>
          </div>
          <h2 id="inventory-map-heading" className="text-base font-bold text-foreground">
            Location Stock Map & Utilization
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Hierarchical overview of physical inventory distributed across clinic departments.
          </p>
        </div>
        <div
          className="inventory-mode-toggle"
          role="group"
          aria-label="Inventory presentation mode"
        >
          <button
            type="button"
            aria-pressed={mode === "visual"}
            onClick={() => onModeChange("visual")}
          >
            <Layers size={13} className="inline mr-1" />
            Visual Tree
          </button>
          <button
            type="button"
            aria-pressed={mode === "simple"}
            onClick={() => onModeChange("simple")}
          >
            <SlidersHorizontal size={13} className="inline mr-1" />
            Simple Table
          </button>
        </div>
      </div>

      {mode === "simple" ? (
        <div className="space-y-3">
          {/* Simple Table Search & Filter Toolbar */}
          <div className="inv-catalog-toolbar">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="inv-catalog-search-wrap">
                <Search size={14} className="inv-catalog-search-icon" />
                <input
                  type="text"
                  className="odyssey-input inv-catalog-search-input"
                  placeholder="Search simple stock table by item, SKU, unit, or department..."
                  value={simpleSearch}
                  onChange={(e) => {
                    setSimpleSearch(e.target.value);
                    setSimplePage(1);
                  }}
                />
                {simpleSearch.trim() !== "" && (
                  <button
                    type="button"
                    className="inv-catalog-search-clear"
                    onClick={() => {
                      setSimpleSearch("");
                      setSimplePage(1);
                    }}
                    title="Clear search"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            <div className="inv-catalog-filters">
              <div className="inv-filter">
                <label htmlFor="simple-dept-select">Department</label>
                <select
                  id="simple-dept-select"
                  className="odyssey-input text-xs"
                  value={simpleDeptFilter}
                  onChange={(e) => {
                    setSimpleDeptFilter(e.target.value);
                    setSimplePage(1);
                  }}
                >
                  <option value="all">All Departments</option>
                  {workspace.departments
                    .filter((d) => d.active)
                    .map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="inv-filter">
                <label htmlFor="simple-alert-select">Alert & Level</label>
                <select
                  id="simple-alert-select"
                  className="odyssey-input text-xs"
                  value={simpleAlertFilter}
                  onChange={(e) => {
                    setSimpleAlertFilter(e.target.value);
                    setSimplePage(1);
                  }}
                >
                  <option value="all">All Levels</option>
                  <option value="in_stock">In Stock</option>
                  <option value="low">Low Stock (≤ Reorder)</option>
                  <option value="critical">Out of Stock</option>
                  <option value="alerts_only">Alerts Only</option>
                </select>
              </div>

              <div className="inv-filter">
                <label htmlFor="simple-billing-select">Billing Status</label>
                <select
                  id="simple-billing-select"
                  className="odyssey-input text-xs"
                  value={simpleBillingFilter}
                  onChange={(e) => {
                    setSimpleBillingFilter(e.target.value);
                    setSimplePage(1);
                  }}
                >
                  <option value="all">All Billing</option>
                  <option value="unbilled">Unbilled</option>
                  <option value="paid">Paid</option>
                  <option value="no-balance-billing">No-Balance-Billing</option>
                </select>
              </div>

              <div className="inv-filter">
                <label htmlFor="simple-sort-select">Sort By</label>
                <select
                  id="simple-sort-select"
                  className="odyssey-input text-xs"
                  value={simpleSortBy}
                  onChange={(e) => {
                    setSimpleSortBy(e.target.value);
                    setSimplePage(1);
                  }}
                >
                  <option value="dept_asc">Department (A → Z)</option>
                  <option value="name_asc">Item Name (A → Z)</option>
                  <option value="name_desc">Item Name (Z → A)</option>
                  <option value="stock_desc">Physical Stock (High → Low)</option>
                  <option value="stock_asc">Physical Stock (Low → High)</option>
                  <option value="price_desc">Unit Price (High → Low)</option>
                  <option value="price_asc">Unit Price (Low → High)</option>
                </select>
              </div>

              {isSimpleFiltered && (
                <div className="flex items-center self-end mb-[2px]">
                  <button
                    type="button"
                    className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-background border border-border transition-colors text-xs flex items-center gap-1.5 h-[32px] px-2.5"
                    onClick={handleResetSimpleFilters}
                    title="Reset filters"
                  >
                    <RotateCcw size={12} />
                    Reset Filters
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="inventory-simple-table">
            <table>
              <caption>
                Department stock. Physical quantity and billing reconciliation remain distinct.
              </caption>
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Item</th>
                  <th>Physical stock</th>
                  <th>Unit price</th>
                  <th>Billing</th>
                  <th>Alert</th>
                </tr>
              </thead>
              <tbody>
                {paginatedSimpleRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-6 text-muted-foreground">
                      {isSimpleFiltered
                        ? "No stock rows match your search and filter criteria."
                        : "No stock records found."}
                    </td>
                  </tr>
                ) : (
                  paginatedSimpleRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <span className="inv-dept-badge font-semibold">
                          {workspace.departments.find(
                            (department) => department.id === row.department_id,
                          )?.name ?? "Unknown"}
                        </span>
                      </td>
                      <td>
                        <strong>{row.itemName}</strong>
                        <small>{row.sku}</small>
                      </td>
                      <td className="font-semibold text-foreground">
                        {number(Number(row.quantity))} {row.unit}
                      </td>
                      <td>₱{row.unitPrice.toFixed(2)}</td>
                      <td>
                        <span className="inventory-billing-status">
                          {row.billingStatus.replaceAll("-", " ")}
                        </span>
                      </td>
                      <td>
                        {row.alertLevel === "none" ? (
                          "—"
                        ) : (
                          <span
                            className={`inventory-alert inventory-alert--${row.alertLevel}`}
                          >
                            <AlertTriangle size={13} />
                            {row.alertLevel}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Simple Table Pagination */}
          {totalSimpleRows > 0 && (
            <div className="inv-pagination-bar">
              <div className="inv-pagination-info">
                <span>
                  Showing{" "}
                  <strong>
                    {simpleStartIndex + 1}–{simpleEndIndex}
                  </strong>{" "}
                  of <strong>{totalSimpleRows}</strong> records
                  {isSimpleFiltered && (
                    <span className="ml-1 text-muted-foreground">
                      (filtered from {rows.length} total)
                    </span>
                  )}
                </span>

                <div className="flex items-center gap-1.5 ml-2">
                  <label htmlFor="simple-page-size" className="text-xs text-muted-foreground whitespace-nowrap">
                    Rows per page:
                  </label>
                  <select
                    id="simple-page-size"
                    className="odyssey-input text-xs py-1 px-2 h-7"
                    value={simplePageSize}
                    onChange={(e) => {
                      setSimplePageSize(Number(e.target.value));
                      setSimplePage(1);
                    }}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>

              {totalSimplePages > 1 && (
                <div className="inv-pagination-controls" aria-label="Simple table pagination">
                  <button
                    type="button"
                    className="inv-page-btn"
                    onClick={() => setSimplePage(1)}
                    disabled={currentSimplePage === 1}
                    title="First page"
                    aria-label="First page"
                  >
                    <ChevronsLeft size={14} />
                  </button>
                  <button
                    type="button"
                    className="inv-page-btn"
                    onClick={() => setSimplePage((prev) => Math.max(1, prev - 1))}
                    disabled={currentSimplePage === 1}
                    title="Previous page"
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={14} />
                  </button>

                  {getSimplePageNumbers().map((p, idx) => {
                    if (p === "ellipsis") {
                      return (
                        <span key={`simple-ellipsis-${idx}`} className="inv-page-ellipsis">
                          …
                        </span>
                      );
                    }
                    const isActive = p === currentSimplePage;
                    return (
                      <button
                        key={`simple-page-${p}`}
                        type="button"
                        className={`inv-page-btn ${isActive ? "inv-page-btn--active" : ""}`}
                        onClick={() => setSimplePage(p)}
                        aria-current={isActive ? "page" : undefined}
                      >
                        {p}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    className="inv-page-btn"
                    onClick={() =>
                      setSimplePage((prev) => Math.min(totalSimplePages, prev + 1))
                    }
                    disabled={currentSimplePage === totalSimplePages}
                    title="Next page"
                    aria-label="Next page"
                  >
                    <ChevronRight size={14} />
                  </button>
                  <button
                    type="button"
                    className="inv-page-btn"
                    onClick={() => setSimplePage(totalSimplePages)}
                    disabled={currentSimplePage === totalSimplePages}
                    title="Last page"
                    aria-label="Last page"
                  >
                    <ChevronsRight size={14} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="inventory-tree-layout">
          <div
            className="inventory-tree"
            aria-label="Hospital inventory hierarchy"
          >
            <div className="inventory-root">
              <span className="inventory-root__mark" aria-hidden="true">
                <Building2 size={16} />
              </span>
              <div>
                <strong>Central Medical Facility</strong>
                <small>
                  {rows.length} stock allocations ·{" "}
                  {rows.filter((row) => row.alertLevel !== "none").length} alerts
                </small>
              </div>
            </div>
            <div className="inventory-branches">
              {workspace.departments
                .filter((department) => department.active)
                .map((department) => {
                  const departmentRows = rows.filter(
                    (row) => row.department_id === department.id,
                  );
                  const alerts = departmentRows.filter(
                    (row) => row.alertLevel !== "none",
                  );
                  const matching =
                    !deferredQuery || matchingDepartments.has(department.id);
                  const open = openDepartmentId === department.id;
                  const searchOpen = searchDepartmentId === department.id;

                  return (
                    <div
                      className={`inventory-department ${
                        matching ? "" : "inventory-department--faded"
                      }`}
                      key={department.id}
                    >
                      <div className="inventory-node inventory-node--department">
                        <button
                          className="inventory-node__toggle"
                          type="button"
                          aria-expanded={open}
                          aria-label={`${open ? "Collapse" : "Expand"} ${
                            department.name
                          }`}
                          onClick={() =>
                            setOpenDepartmentId(open ? null : department.id)
                          }
                        >
                          {open ? (
                            <ChevronDown size={16} />
                          ) : (
                            <ChevronRight size={16} />
                          )}
                        </button>
                        <div
                          className="inventory-node__content cursor-pointer"
                          onClick={() => {
                            setActiveDepartmentId(department.id);
                            if (!open) setOpenDepartmentId(department.id);
                          }}
                        >
                          <strong>{department.name}</strong>
                          <small>
                            {departmentRows.length} items ·{" "}
                            {number(
                              departmentRows.reduce(
                                (sum, row) => sum + Number(row.quantity),
                                0,
                              ),
                            )}{" "}
                            units total
                          </small>
                        </div>
                        {alerts.length ? (
                          <span className="inventory-alert inventory-alert--critical">
                            <AlertTriangle size={12} />
                            {alerts.length}
                          </span>
                        ) : null}
                        <button
                          className="inventory-node__search"
                          type="button"
                          aria-label={`Search ${department.name}`}
                          aria-expanded={searchOpen}
                          onClick={() => {
                            setSearchDepartmentId(
                              searchOpen ? null : department.id,
                            );
                            setQuery("");
                          }}
                        >
                          <Search size={15} />
                        </button>
                      </div>
                      {searchOpen ? (
                        <div className="inventory-local-search">
                          <Search size={14} aria-hidden="true" />
                          <input
                            autoFocus
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder={`Search ${department.name} items…`}
                            aria-label={`Search ${department.name} stock`}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setQuery("");
                              setSearchDepartmentId(null);
                            }}
                            aria-label="Clear department search"
                          >
                            <X size={14} />
                          </button>
                          {deferredQuery ? (
                            <div
                              className="inventory-autocomplete"
                              role="listbox"
                            >
                              {departmentRows
                                .filter((row) =>
                                  [row.itemName, row.sku].some((value) =>
                                    value.toLowerCase().includes(deferredQuery),
                                  ),
                                )
                                .slice(0, 6)
                                .map((row) => (
                                  <button
                                    type="button"
                                    key={row.id}
                                    onClick={() => {
                                      setActiveDepartmentId(department.id);
                                      setOpenDepartmentId(department.id);
                                    }}
                                    role="option"
                                  >
                                    <span>{row.itemName}</span>
                                    <small>{row.sku}</small>
                                  </button>
                                ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {open ? (
                        <div className="inventory-category">
                          <button
                            type="button"
                            onClick={() => setActiveDepartmentId(department.id)}
                            className={
                              activeDepartmentId === department.id
                                ? "inventory-category__btn--active"
                                : ""
                            }
                          >
                            <span>
                              <strong>Department Stock Ledger</strong>
                              <small>
                                Inspect inventory & 7d usage activity
                              </small>
                            </span>
                            <Sparkline
                              values={usageByDepartmentAndDay(department.id)}
                            />
                            <ChevronRight size={15} />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
            </div>
          </div>
          <aside className="inventory-drawer" aria-live="polite">
            <div className="inventory-drawer__header">
              <span className="eyebrow">Location Detail</span>
              <h3>
                {activeDepartmentId
                  ? `${
                      workspace.departments.find(
                        (department) => department.id === activeDepartmentId,
                      )?.name ?? "Department"
                    } Stock`
                  : "Select a location"}
              </h3>
              <p>
                {activeDepartmentId
                  ? "Real-time stock rows stored in this location."
                  : "Select a department from the hierarchy to view stock and activity."}
              </p>
            </div>

            {activeDepartmentId ? (
              <>
                {/* Search & Filter Toolbar */}
                <div className="inventory-drawer__toolbar">
                  <div className="inventory-drawer__search-wrap">
                    <Search size={13} className="inventory-drawer__search-icon" />
                    <input
                      type="text"
                      className="odyssey-input inventory-drawer__search-input"
                      placeholder="Search items by name, SKU..."
                      value={drawerSearch}
                      onChange={(e) => {
                        setDrawerSearch(e.target.value);
                        setDrawerPage(1);
                      }}
                    />
                    {drawerSearch.trim() !== "" && (
                      <button
                        type="button"
                        className="inventory-drawer__search-clear"
                        onClick={() => {
                          setDrawerSearch("");
                          setDrawerPage(1);
                        }}
                        title="Clear search"
                      >
                        <X size={11} />
                      </button>
                    )}
                  </div>

                  <div className="inventory-drawer__filters">
                    <select
                      className="inventory-drawer__filter-select"
                      value={drawerAlertFilter}
                      onChange={(e) => {
                        setDrawerAlertFilter(e.target.value);
                        setDrawerPage(1);
                      }}
                      title="Filter by stock health"
                    >
                      <option value="all">All Levels</option>
                      <option value="in_stock">In Stock</option>
                      <option value="low">Low Stock</option>
                      <option value="critical">Out of Stock</option>
                      <option value="alerts_only">Alerts Only</option>
                    </select>

                    <select
                      className="inventory-drawer__filter-select"
                      value={drawerBillingFilter}
                      onChange={(e) => {
                        setDrawerBillingFilter(e.target.value);
                        setDrawerPage(1);
                      }}
                      title="Filter by billing status"
                    >
                      <option value="all">All Billing</option>
                      <option value="unbilled">Unbilled</option>
                      <option value="paid">Paid</option>
                      <option value="no-balance-billing">NBB</option>
                    </select>

                    <select
                      className="inventory-drawer__filter-select"
                      value={drawerSortBy}
                      onChange={(e) => {
                        setDrawerSortBy(e.target.value);
                        setDrawerPage(1);
                      }}
                      title="Sort items"
                    >
                      <option value="name_asc">Name (A→Z)</option>
                      <option value="name_desc">Name (Z→A)</option>
                      <option value="stock_desc">Stock (High→Low)</option>
                      <option value="stock_asc">Stock (Low→High)</option>
                      <option value="price_desc">Price (High→Low)</option>
                      <option value="price_asc">Price (Low→High)</option>
                    </select>

                    {isDrawerFiltered && (
                      <button
                        type="button"
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-background border border-transparent hover:border-border transition-colors text-[11px] flex items-center gap-1"
                        onClick={handleResetDrawerFilters}
                        title="Reset filters"
                      >
                        <RotateCcw size={11} />
                        Reset
                      </button>
                    )}
                  </div>
                </div>

                <div className="inventory-drawer__table">
                  <table>
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>On hand</th>
                        <th>Billing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedDrawerRows.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="text-center py-4 text-muted-foreground">
                            {isDrawerFiltered
                              ? "No stock items match your filter criteria."
                              : "No stock allocated to this department."}
                          </td>
                        </tr>
                      ) : (
                        paginatedDrawerRows.map((row) => (
                          <tr key={row.id}>
                            <td>
                              <strong>{row.itemName}</strong>
                              <small>
                                {row.sku} · ₱{row.unitPrice.toFixed(2)}
                              </small>
                            </td>
                            <td>
                              <div className="font-semibold text-foreground">
                                {number(Number(row.quantity))} {row.unit}
                              </div>
                              {row.alertLevel !== "none" && (
                                <span
                                  className={`inventory-alert inventory-alert--${row.alertLevel} text-[10px] px-1 py-0 inline-flex items-center gap-1 mt-0.5`}
                                >
                                  <AlertTriangle size={10} />
                                  {row.alertLevel}
                                </span>
                              )}
                            </td>
                            <td>
                              <span className="inventory-billing-status">
                                {row.billingStatus.replaceAll("-", " ")}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Drawer Pagination */}
                {totalDrawerRows > 0 && (
                  <div className="inventory-drawer__pagination">
                    <div className="inventory-drawer__pagination-info">
                      <span>
                        {drawerStartIndex + 1}–{drawerEndIndex} of {totalDrawerRows}
                        {isDrawerFiltered && (
                          <span className="text-muted-foreground ml-1">
                            ({departmentStockRows.length} total)
                          </span>
                        )}
                      </span>

                      <select
                        className="odyssey-input text-[11px] py-0.5 px-1 h-6 ml-1"
                        value={drawerPageSize}
                        onChange={(e) => {
                          setDrawerPageSize(Number(e.target.value));
                          setDrawerPage(1);
                        }}
                      >
                        <option value={5}>5 / page</option>
                        <option value={10}>10 / page</option>
                        <option value={20}>20 / page</option>
                        <option value={50}>50 / page</option>
                      </select>
                    </div>

                    {totalDrawerPages > 1 && (
                      <div className="inventory-drawer__pagination-controls">
                        <button
                          type="button"
                          className="inventory-drawer__page-btn"
                          onClick={() => setDrawerPage(1)}
                          disabled={currentDrawerPage === 1}
                          title="First page"
                        >
                          <ChevronsLeft size={12} />
                        </button>
                        <button
                          type="button"
                          className="inventory-drawer__page-btn"
                          onClick={() => setDrawerPage((prev) => Math.max(1, prev - 1))}
                          disabled={currentDrawerPage === 1}
                          title="Previous page"
                        >
                          <ChevronLeft size={12} />
                        </button>

                        {getDrawerPageNumbers().map((p, idx) => {
                          if (p === "ellipsis") {
                            return (
                              <span
                                key={`ellipsis-${idx}`}
                                className="inventory-drawer__page-ellipsis"
                              >
                                …
                              </span>
                            );
                          }
                          const isActive = p === currentDrawerPage;
                          return (
                            <button
                              key={`p-${p}`}
                              type="button"
                              className={`inventory-drawer__page-btn ${
                                isActive ? "inventory-drawer__page-btn--active" : ""
                              }`}
                              onClick={() => setDrawerPage(p)}
                            >
                              {p}
                            </button>
                          );
                        })}

                        <button
                          type="button"
                          className="inventory-drawer__page-btn"
                          onClick={() =>
                            setDrawerPage((prev) =>
                              Math.min(totalDrawerPages, prev + 1),
                            )
                          }
                          disabled={currentDrawerPage === totalDrawerPages}
                          title="Next page"
                        >
                          <ChevronRight size={12} />
                        </button>
                        <button
                          type="button"
                          className="inventory-drawer__page-btn"
                          onClick={() => setDrawerPage(totalDrawerPages)}
                          disabled={currentDrawerPage === totalDrawerPages}
                          title="Last page"
                        >
                          <ChevronsRight size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : null}
          </aside>
        </div>
      )}
    </section>
  );
}

