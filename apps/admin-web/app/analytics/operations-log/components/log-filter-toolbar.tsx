"use client";

import { Download, RefreshCw, Search, X } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import type { DatePreset, OperationsLogFiltersState } from "../../../../hooks/use-operations-logs";

interface LogFilterToolbarProps {
  filters: OperationsLogFiltersState;
  setFilters: Dispatch<SetStateAction<OperationsLogFiltersState>>;
  staffList: Array<{ id: string; name: string }>;
  onRefresh: () => void;
  onExportCsv: () => void;
  loading: boolean;
}

const MODULE_OPTIONS = [
  { value: "all", label: "All Modules" },
  { value: "billing", label: "Billing & Cashier / POS" },
  { value: "appointments", label: "Appointments & Queue" },
  { value: "pharmacy", label: "Pharmacy & Dispensing" },
  { value: "clinical", label: "Clinical Care (EHR)" },
  { value: "diagnostics", label: "Diagnostics (Mini-LIS)" },
  { value: "inventory", label: "Inventory & Supplies" },
  { value: "governance", label: "Clinic Governance" },
];

const ACTION_OPTIONS = [
  { value: "all", label: "All Actions" },
  { value: "insert", label: "Created / Inserted" },
  { value: "update", label: "Updated / Changed" },
  { value: "delete", label: "Deleted / Removed" },
];

export function LogFilterToolbar({
  filters,
  setFilters,
  staffList,
  onRefresh,
  onExportCsv,
  loading,
}: LogFilterToolbarProps) {
  const setPreset = (preset: DatePreset) => {
    setFilters((prev) => ({ ...prev, datePreset: preset }));
  };

  return (
    <section className="operations-log-toolbar" aria-label="Log Filters">
      {/* Date preset selector row */}
      <div className="filter-presets-row">
        <div className="button-group" role="group" aria-label="Date range presets">
          <Button
            size="sm"
            variant={filters.datePreset === "today" ? "primary" : "outline"}
            onClick={() => setPreset("today")}
          >
            Today
          </Button>
          <Button
            size="sm"
            variant={filters.datePreset === "7d" ? "primary" : "outline"}
            onClick={() => setPreset("7d")}
          >
            Last 7 Days
          </Button>
          <Button
            size="sm"
            variant={filters.datePreset === "30d" ? "primary" : "outline"}
            onClick={() => setPreset("30d")}
          >
            Last 30 Days
          </Button>
          <Button
            size="sm"
            variant={filters.datePreset === "custom" ? "primary" : "outline"}
            onClick={() => setPreset("custom")}
          >
            Custom Range
          </Button>
        </div>

        {filters.datePreset === "custom" && (
          <div className="custom-date-inputs">
            <label className="date-input-label">
              <span>From:</span>
              <Input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))}
              />
            </label>
            <label className="date-input-label">
              <span>To:</span>
              <Input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))}
              />
            </label>
          </div>
        )}

        <div className="toolbar-actions">
          <Button size="sm" variant="outline" onClick={onExportCsv} title="Export CSV">
            <Download size={14} aria-hidden="true" />
            <span>Export CSV</span>
          </Button>
          <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading} title="Refresh Logs">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} aria-hidden="true" />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Filter dropdowns and search row */}
      <div className="filter-controls-row">
        {/* Module select */}
        <div className="filter-field">
          <label htmlFor="filter-module" className="sr-only">
            Filter by Module
          </label>
          <select
            id="filter-module"
            className="filter-select"
            value={filters.module}
            onChange={(e) => setFilters((prev) => ({ ...prev, module: e.target.value }))}
          >
            {MODULE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Action select */}
        <div className="filter-field">
          <label htmlFor="filter-action" className="sr-only">
            Filter by Action
          </label>
          <select
            id="filter-action"
            className="filter-select"
            value={filters.action}
            onChange={(e) => setFilters((prev) => ({ ...prev, action: e.target.value }))}
          >
            {ACTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Staff operator select */}
        <div className="filter-field">
          <label htmlFor="filter-staff" className="sr-only">
            Filter by Staff
          </label>
          <select
            id="filter-staff"
            className="filter-select"
            value={filters.actorId}
            onChange={(e) => setFilters((prev) => ({ ...prev, actorId: e.target.value }))}
          >
            <option value="all">All Operators</option>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Free text search input */}
        <div className="search-field flex-1">
          <Search size={16} aria-hidden="true" />
          <Input
            value={filters.search}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            placeholder="Search by description, operator, record ID, or table..."
          />
          {filters.search ? (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setFilters((prev) => ({ ...prev, search: "" }))}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
