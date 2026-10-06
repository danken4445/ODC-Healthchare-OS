"use client";

import type { InventoryViewMode, InventoryWorkspace } from "@odyssey/types";
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronRight,
  Layers,
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
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {workspace.departments.find(
                      (department) => department.id === row.department_id,
                    )?.name ?? "Unknown"}
                  </td>
                  <td>
                    <strong>{row.itemName}</strong>
                    <small>{row.sku}</small>
                  </td>
                  <td>
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
              ))}
            </tbody>
          </table>
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
                    {activeRows.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="text-center py-4 text-muted-foreground">
                          No stock allocated to this department.
                        </td>
                      </tr>
                    ) : (
                      activeRows.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <strong>{row.itemName}</strong>
                            <small>
                              {row.sku} · ₱{row.unitPrice.toFixed(2)}
                            </small>
                          </td>
                          <td className="font-semibold text-foreground">
                            {number(Number(row.quantity))} {row.unit}
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
            ) : null}
          </aside>
        </div>
      )}
    </section>
  );
}

