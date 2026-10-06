"use client";

import {
  adjustDepartmentStock,
  createDepartment,
  createInventoryItem,
  getCurrentStaffDepartment,
  getInventoryWorkspace,
  getMyInventoryViewMode,
  listInventoryEncounters,
  receiveInventoryStock,
  saveInventoryExpirySettings,
  saveMyInventoryViewMode,
  subscribeToInventory,
  tagInventoryUsage,
  transferDepartmentStock,
  updateInventoryItemPricing,
} from "@odyssey/supabase-client";
import type {
  InventoryBatchSummary,
  InventoryEncounterOption,
  InventoryExpiryStatus,
  InventoryViewMode,
  InventoryWorkspace,
} from "@odyssey/types";
import {
  Badge,
  Button,
  Card,
  DataTable,
  Field,
  Input,
  TabGroup,
  TabPanel,
} from "@odyssey/ui";
import Link from "next/link";
import {
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Filter,
  Flame,
  HelpCircle,
  History,
  Info,
  Landmark,
  Layers,
  MapPin,
  PackageCheck,
  PackagePlus,
  PackageSearch,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Settings2,
  Sliders,
  Sparkles,
  Tag,
  Trash2,
  TrendingUp,
  UserCheck,
  X,
} from "lucide-react";
import { useAdminData } from "../../components/admin-data-context";
import { AdminSignIn } from "../../components/admin-sign-in";
import { InventoryHierarchy } from "../../components/inventory-hierarchy";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

/* ─── Helpers & Formatters ────────────────────────────────────── */

const emptyWorkspace: InventoryWorkspace = {
  departments: [],
  items: [],
  stock: [],
  batches: [],
  holds: [],
  usages: [],
  movements: [],
  expirySettings: null,
};

function fmt(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(
    value,
  );
}

function fmtCurrency(value: number, currency = "PHP"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function fmtTime(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

type StockStatus = "in_stock" | "low" | "out";
function getStockStatus(quantity: number, reorderLevel: number): StockStatus {
  if (quantity <= 0) return "out";
  if (quantity <= reorderLevel) return "low";
  return "in_stock";
}

const stockStatusConfig: Record<
  StockStatus,
  { label: string; variant: "success" | "warning" | "danger" }
> = {
  in_stock: { label: "In stock", variant: "success" },
  low: { label: "Low stock", variant: "warning" },
  out: { label: "Out of stock", variant: "danger" },
};

function getExpiryBadge(status: InventoryExpiryStatus, daysRemaining?: number | null) {
  switch (status) {
    case "expired":
      return (
        <span className="inv-badge-pill inv-badge-pill--expired">
          <AlertOctagon size={12} className="shrink-0" />
          Expired
        </span>
      );
    case "near_expiry":
      return (
        <span className="inv-badge-pill inv-badge-pill--near-expiry">
          <Clock size={12} className="shrink-0" />
          {typeof daysRemaining === "number"
            ? `${daysRemaining}d left`
            : "Near expiry"}
        </span>
      );
    case "legacy_unassigned":
      return (
        <span className="inv-badge-pill inv-badge-pill--legacy">
          <HelpCircle size={12} className="shrink-0" />
          No Expiry (Legacy)
        </span>
      );
    case "ok":
    default:
      return (
        <span className="inv-badge-pill inv-badge-pill--ok">
          <CheckCircle2 size={12} className="shrink-0" />
          {typeof daysRemaining === "number" ? `${daysRemaining}d remaining` : "Good"}
        </span>
      );
  }
}

interface BatchInputLine {
  id: string;
  quantity: string;
  expiryDate: string;
  lotNumber: string;
}

/* ─── Main Workspace Tabs ─────────────────────────────────────── */
const mainNavTabs = [
  { id: "ledger", label: "Stock Ledger", icon: Boxes },
  { id: "batches", label: "Batches & FEFO", icon: Layers },
  { id: "catalog", label: "Item Catalog", icon: FileSpreadsheet },
  { id: "operations", label: "Operations Hub", icon: ArrowLeftRight },
  { id: "usage", label: "Clinical Tagging", icon: UserCheck },
  { id: "audit", label: "Audit Trail", icon: History },
  { id: "settings", label: "Settings", icon: Settings2 },
];

/* ─── Page Component ──────────────────────────────────────────── */

export default function InventoryPage() {
  /* Auth & Workspace context */
  const {
    client,
    email: signedInAs,
    organization,
    permissions,
    signOut: handleSignOut,
  } = useAdminData();
  const organizationId = organization?.id ?? "";
  const canManage = permissions.includes("can_manage_inventory");
  const canTag = permissions.includes("can_tag_inventory_usage");

  const [workspace, setWorkspace] =
    useState<InventoryWorkspace>(emptyWorkspace);
  const [encounters, setEncounters] = useState<InventoryEncounterOption[]>([]);
  const [inventoryDepartmentId, setInventoryDepartmentId] = useState<
    string | null
  >(null);
  const [inventoryDepartmentSelection, setInventoryDepartmentSelection] =
    useState("");
  const [busy, setBusy] = useState(false);
  const [liveStatus, setLiveStatus] = useState("Offline");
  const [status, setStatus] = useState("Sign in to manage clinic inventory.");
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: "info" | "success" | "error";
  } | null>(null);

  /* Primary Navigation */
  const [activeMainTab, setActiveMainTab] = useState<string>("ledger");
  const [operationsSubTab, setOperationsSubTab] = useState<string>("receive");

  /* Global and local filter state */
  const [globalSearch, setGlobalSearch] = useState<string>("");
  const [stockFilterDept, setStockFilterDept] = useState<string>("all");
  const [stockFilterStatus, setStockFilterStatus] = useState<string>("all");
  const [batchFilterDept, setBatchFilterDept] = useState<string>("all");
  const [batchFilterStatus, setBatchFilterStatus] = useState<string>("all");
  const [showHierarchyMap, setShowHierarchyMap] = useState<boolean>(true);

  /* Pricing / Master item edit modal state */
  const [pricingItemId, setPricingItemId] = useState("");
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [showEditPricingModal, setShowEditPricingModal] = useState(false);

  /* Quick Receive Item ID */
  const [receiveItemId, setReceiveItemId] = useState("");
  const [preferredViewMode, setPreferredViewMode] =
    useState<InventoryViewMode>("visual");
  const [forceSimpleMode, setForceSimpleMode] = useState(false);

  /* Drilldown Batch Modal State */
  const [inspectStockId, setInspectStockId] = useState<string | null>(null);

  /* Dynamic Multi-batch Receiving Lines */
  const [receiveBatchLines, setReceiveBatchLines] = useState<BatchInputLine[]>([
    { id: "1", quantity: "1", expiryDate: "", lotNumber: "" },
  ]);

  /* Settings Form State */
  const [nearExpiryDaysSetting, setNearExpiryDaysSetting] = useState(90);
  const [pharmacyDeptSetting, setPharmacyDeptSetting] = useState("");

  const selectedReceiveItem = useMemo(
    () => workspace.items.find((i) => i.id === receiveItemId),
    [workspace.items, receiveItemId],
  );

  /* ─── Derived Item Master Totals ────────────────────────────── */
  const itemTotals = useMemo(
    () =>
      workspace.items.map((item) => {
        const stockRows = workspace.stock.filter((s) => s.item_id === item.id);
        const total = stockRows.reduce((sum, s) => sum + Number(s.quantity), 0);
        const itemBatches = workspace.batches.filter((b) => b.item_id === item.id);
        const usableTotal =
          itemBatches.length > 0
            ? itemBatches.reduce((sum, b) => sum + Number(b.usable_quantity), 0)
            : total;
        const expiredTotal = Math.max(0, total - usableTotal);
        const nearExpiryBatches = itemBatches.filter(
          (b) => b.expiry_status === "near_expiry" && b.quantity > 0,
        );
        const lowestReorder = stockRows.reduce(
          (min, s) => Math.min(min, Number(s.reorder_level)),
          Infinity,
        );
        return {
          ...item,
          total,
          usableTotal,
          expiredTotal,
          nearExpiryCount: nearExpiryBatches.length,
          lowestReorder: lowestReorder === Infinity ? 0 : lowestReorder,
          batchCount: itemBatches.length,
        };
      }),
    [workspace.items, workspace.stock, workspace.batches],
  );

  /* ─── Stock Rows with Enriched Batch & Expiry Context ────────── */
  const stockRows = useMemo(() => {
    const heldQuantityByStockId = new Map<string, number>();
    for (const hold of workspace.holds) {
      heldQuantityByStockId.set(
        hold.stock_id,
        (heldQuantityByStockId.get(hold.stock_id) ?? 0) + Number(hold.quantity),
      );
    }
    return workspace.stock
      .map((stock) => {
        const item = workspace.items.find((i) => i.id === stock.item_id);
        const dept = workspace.departments.find(
          (d) => d.id === stock.department_id,
        );
        const stockBatches = workspace.batches.filter(
          (b) => b.stock_id === stock.id,
        );
        const usableQuantity =
          stockBatches.length > 0
            ? stockBatches.reduce((sum, b) => sum + Number(b.usable_quantity), 0)
            : Number(stock.quantity);
        const expiredQuantity = Math.max(0, Number(stock.quantity) - usableQuantity);
        const nearExpiryBatches = stockBatches.filter(
          (b) => b.expiry_status === "near_expiry" && b.quantity > 0,
        );
        const expiredBatches = stockBatches.filter(
          (b) => b.expiry_status === "expired" && b.quantity > 0,
        );

        return {
          ...stock,
          availableQuantity: Math.max(
            0,
            usableQuantity - (heldQuantityByStockId.get(stock.id) ?? 0),
          ),
          usableQuantity,
          expiredQuantity,
          batches: stockBatches,
          nearExpiryCount: nearExpiryBatches.length,
          expiredCount: expiredBatches.length,
          isPerishable: item?.is_perishable ?? false,
          itemName: item?.name ?? "Unknown item",
          itemSku: item?.sku ?? "—",
          unit: item?.unit_of_measure ?? "unit",
          unitCost: Number(item?.unit_cost ?? 0),
          sellingPrice: Number(item?.selling_price ?? 0),
          departmentName: dept?.name ?? "Unknown",
          departmentCode: dept?.code ?? "—",
          stockStatus: getStockStatus(
            Number(stock.quantity),
            Number(stock.reorder_level),
          ),
        };
      })
      .filter((row) => {
        if (stockFilterDept !== "all" && row.department_id !== stockFilterDept)
          return false;
        if (stockFilterStatus !== "all" && row.stockStatus !== stockFilterStatus)
          return false;
        if (globalSearch) {
          const q = globalSearch.toLowerCase();
          const match =
            row.itemName.toLowerCase().includes(q) ||
            row.itemSku.toLowerCase().includes(q) ||
            row.departmentName.toLowerCase().includes(q) ||
            row.batches.some((b) => (b.lot_number ?? "").toLowerCase().includes(q));
          if (!match) return false;
        }
        return true;
      });
  }, [workspace, stockFilterDept, stockFilterStatus, globalSearch]);

  const taggableStockRows = useMemo(() => {
    const heldQuantityByStockId = new Map<string, number>();
    for (const hold of workspace.holds) {
      heldQuantityByStockId.set(
        hold.stock_id,
        (heldQuantityByStockId.get(hold.stock_id) ?? 0) + Number(hold.quantity),
      );
    }

    return workspace.stock
      .map((stock) => {
        const item = workspace.items.find((i) => i.id === stock.item_id);
        const department = workspace.departments.find(
          (d) => d.id === stock.department_id,
        );
        const stockBatches = workspace.batches.filter(
          (b) => b.stock_id === stock.id,
        );
        const usableQuantity =
          stockBatches.length > 0
            ? stockBatches.reduce((sum, b) => sum + Number(b.usable_quantity), 0)
            : Number(stock.quantity);

        return {
          ...stock,
          usableQuantity,
          availableQuantity: Math.max(
            0,
            usableQuantity - (heldQuantityByStockId.get(stock.id) ?? 0),
          ),
          itemName: item?.name ?? "Unknown item",
          departmentName: department?.name ?? "Unknown",
        };
      })
      .filter(
        (row) =>
          row.availableQuantity > 0 &&
          (!inventoryDepartmentSelection ||
            row.department_id === inventoryDepartmentSelection),
      );
  }, [inventoryDepartmentSelection, workspace]);

  /* ─── Executive KPI Metrics ───────────────────────────────── */
  const kpi = useMemo(() => {
    const totalItems = workspace.items.filter((i) => i.active).length;
    const totalDepartments = workspace.departments.filter(
      (d) => d.active,
    ).length;
    const lowStockCount = workspace.stock.filter(
      (s) =>
        Number(s.quantity) > 0 && Number(s.quantity) <= Number(s.reorder_level),
    ).length;
    const outOfStockCount = workspace.stock.filter(
      (s) => Number(s.quantity) <= 0,
    ).length;
    const nearExpiryBatchCount = workspace.batches.filter(
      (b) => b.expiry_status === "near_expiry" && b.quantity > 0,
    ).length;
    const expiredBatchCount = workspace.batches.filter(
      (b) => b.expiry_status === "expired" && b.quantity > 0,
    ).length;
    const okBatchCount = workspace.batches.filter(
      (b) => b.expiry_status === "ok" && b.quantity > 0,
    ).length;
    const totalBatches = workspace.batches.length;

    const inventoryCost = workspace.stock.reduce((sum, s) => {
      const item = workspace.items.find((i) => i.id === s.item_id);
      return sum + Number(s.quantity) * Number(item?.unit_cost ?? 0);
    }, 0);
    const retailValue = workspace.stock.reduce((sum, s) => {
      const item = workspace.items.find((i) => i.id === s.item_id);
      return sum + Number(s.quantity) * Number(item?.selling_price ?? 0);
    }, 0);
    const potentialMargin = retailValue - inventoryCost;
    const marginPct =
      retailValue > 0 ? (potentialMargin / retailValue) * 100 : 0;

    return {
      totalItems,
      totalDepartments,
      totalBatches,
      lowStockCount,
      outOfStockCount,
      nearExpiryBatchCount,
      expiredBatchCount,
      okBatchCount,
      alertCount: lowStockCount + outOfStockCount + expiredBatchCount,
      inventoryCost,
      retailValue,
      potentialMargin,
      marginPct,
    };
  }, [workspace]);

  /* ─── Data Loading ────────────────────────────────────────── */
  const loadInventory = useCallback(
    async (clinicId = organizationId, manage = canManage) => {
      if (!clinicId) return;
      const [inventoryResult, encounterResult] = await Promise.all([
        getInventoryWorkspace(client, clinicId, manage),
        listInventoryEncounters(client, clinicId),
      ]);
      if (inventoryResult.error) {
        setStatus(`Inventory query failed: ${inventoryResult.error.message}`);
        setToastMessage({
          text: `Inventory load failed: ${inventoryResult.error.message}`,
          type: "error",
        });
        return;
      }
      setWorkspace(inventoryResult.data);
      setEncounters(encounterResult.error ? [] : encounterResult.data);

      if (inventoryResult.data.expirySettings) {
        setNearExpiryDaysSetting(
          inventoryResult.data.expirySettings.near_expiry_days ?? 90,
        );
        setPharmacyDeptSetting(
          inventoryResult.data.expirySettings.pharmacy_department_id ?? "",
        );
      }
    },
    [canManage, client, organizationId],
  );

  /* ─── Effects ─────────────────────────────────────────────── */
  useEffect(() => {
    let current = true;
    if (!signedInAs || !organizationId)
      return () => {
        current = false;
      };
    void getCurrentStaffDepartment(client, organizationId).then(
      async (departmentResult) => {
        if (!current) return;
        if (departmentResult.error) {
          setStatus(
            `Department context query failed: ${departmentResult.error.message}`,
          );
          return;
        }
        setInventoryDepartmentId(departmentResult.data);
        setInventoryDepartmentSelection(departmentResult.data ?? "");
        setStatus("Inventory workspace ready.");
        await loadInventory(organizationId, canManage);
      },
    );
    return () => {
      current = false;
    };
  }, [canManage, client, loadInventory, organizationId, signedInAs]);

  useEffect(() => {
    if (!signedInAs || !organizationId) return;
    const unsubscribe = subscribeToInventory(
      client,
      organizationId,
      () => void loadInventory(),
      (connectionStatus) =>
        setLiveStatus(
          connectionStatus === "SUBSCRIBED" ? "Live" : connectionStatus,
        ),
    );
    return unsubscribe;
  }, [client, loadInventory, organizationId, signedInAs]);

  useEffect(() => {
    if (!signedInAs || !organizationId) return;
    let current = true;
    void getMyInventoryViewMode(client, organizationId).then((result) => {
      if (current && !result.error) setPreferredViewMode(result.data);
    });
    const media = window.matchMedia("(max-width: 767px)");
    const updateViewportMode = () => setForceSimpleMode(media.matches);
    updateViewportMode();
    media.addEventListener("change", updateViewportMode);
    return () => {
      current = false;
      media.removeEventListener("change", updateViewportMode);
    };
  }, [client, organizationId, signedInAs]);

  async function selectInventoryViewMode(mode: InventoryViewMode) {
    if (forceSimpleMode && mode === "visual") return;
    setPreferredViewMode(mode);
    const result = await saveMyInventoryViewMode(client, organizationId, mode);
    if (result.error)
      setStatus(`Could not save view preference: ${result.error.message}`);
  }

  /* ─── Form Helpers ────────────────────────────────────────── */
  async function runForm(
    event: FormEvent<HTMLFormElement>,
    action: (
      fields: FormData,
    ) => Promise<{ error: { message: string } | null }>,
    successMessage: string,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    const result = await action(new FormData(form));
    setBusy(false);
    if (result.error) {
      setStatus(`Operation failed: ${result.error.message}`);
      setToastMessage({ text: result.error.message, type: "error" });
      return;
    }
    form.reset();
    setStatus(successMessage);
    setToastMessage({ text: successMessage, type: "success" });
    await loadInventory();
  }

  /* ─── Multi-Batch Dynamic Lines ───────────────────────────── */
  const addBatchLine = () => {
    setReceiveBatchLines((prev) => [
      ...prev,
      {
        id: String(Date.now() + Math.random()),
        quantity: "1",
        expiryDate: "",
        lotNumber: "",
      },
    ]);
  };

  const removeBatchLine = (id: string) => {
    if (receiveBatchLines.length <= 1) return;
    setReceiveBatchLines((prev) => prev.filter((line) => line.id !== id));
  };

  const updateBatchLine = (
    id: string,
    field: keyof BatchInputLine,
    value: string,
  ) => {
    setReceiveBatchLines((prev) =>
      prev.map((line) => (line.id === id ? { ...line, [field]: value } : line)),
    );
  };

  /* ─── Filtered Batches for Explorer ───────────────────────── */
  const filteredBatches = useMemo(() => {
    return workspace.batches.filter((batch) => {
      if (batchFilterDept !== "all" && batch.department_id !== batchFilterDept)
        return false;
      if (batchFilterStatus !== "all" && batch.expiry_status !== batchFilterStatus)
        return false;
      if (globalSearch) {
        const q = globalSearch.toLowerCase();
        const match =
          (batch.item_name ?? "").toLowerCase().includes(q) ||
          (batch.item_sku ?? "").toLowerCase().includes(q) ||
          (batch.department_name ?? "").toLowerCase().includes(q) ||
          (batch.lot_number ?? "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [workspace.batches, batchFilterDept, batchFilterStatus, globalSearch]);

  const inspectedStockRow = useMemo(
    () => stockRows.find((s) => s.id === inspectStockId),
    [stockRows, inspectStockId],
  );

  /* ─── Sign-in Screen ──────────────────────────────────────── */
  if (!signedInAs) {
    return (
      <main className="inv-login">
        <div className="inv-login__card">
          <div className="inv-login__header">
            <span className="inv-login__icon" aria-hidden="true">
              <Boxes size={24} />
            </span>
            <p className="eyebrow">Supply Chain Operations</p>
            <h1>Inventory Management</h1>
            <p className="hint">
              Sign in with your clinical or supply room staff credentials to
              access the central inventory system.
            </p>
          </div>
          <AdminSignIn />
          <p role="status" className="inv-login__status">
            {status}
          </p>
        </div>
      </main>
    );
  }

  /* ─── Authenticated Workspace ─────────────────────────────── */
  const currentClinic = organization;

  return (
    <main className="inv-dashboard">
      {/* ── Toast Notification ──────────────────────────────── */}
      {toastMessage && (
        <div
          className={`inv-toast inv-toast--${toastMessage.type}`}
          role="status"
        >
          <div className="flex items-center gap-2">
            {toastMessage.type === "success" && (
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            )}
            {toastMessage.type === "error" && (
              <AlertCircle size={16} className="text-rose-600 shrink-0" />
            )}
            {toastMessage.type === "info" && (
              <Info size={16} className="text-blue-600 shrink-0" />
            )}
            <span className="text-xs font-semibold">{toastMessage.text}</span>
          </div>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground p-1"
            onClick={() => setToastMessage(null)}
            aria-label="Dismiss toast"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Top Executive Header ────────────────────────────── */}
      <header className="inv-header">
        <div className="inv-header__left">
          <div className="flex items-center gap-2">
            <span className="eyebrow">Clinical Supply Chain</span>
            <span className="inv-dot-separator" />
            <span className="text-xs font-medium text-muted-foreground">
              FEFO & Batch Controlled
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
              Inventory & Batch Logistics
            </h1>
            {currentClinic ? (
              <span className="inv-clinic-badge">
                <Building2 size={13} aria-hidden="true" />
                {currentClinic.name}
              </span>
            ) : null}
          </div>
        </div>

        <div className="inv-header__right">
          {/* Live stock indicator - strictly required by vertical slice test */}
          <div className="inv-live-pill">
            <span
              className={`inv-live-dot ${
                liveStatus === "Live" ? "inv-live-dot--active" : ""
              }`}
            />
            <span className="live-indicator">
              {liveStatus === "Live" ? "Live stock" : `${liveStatus} stock`}
            </span>
          </div>

          <div className="inv-header__divider" />

          {/* Search bar in header */}
          <div className="inv-search-box">
            <Search size={14} className="text-muted-foreground shrink-0" />
            <input
              type="text"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="Quick search SKU, item, lot…"
              aria-label="Search inventory"
            />
            {globalSearch && (
              <button
                type="button"
                onClick={() => setGlobalSearch("")}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Quick Action Button for Operations */}
          {canManage && (
            <Button
              size="sm"
              onClick={() => {
                setActiveMainTab("operations");
                setOperationsSubTab("receive");
              }}
            >
              <PackagePlus size={14} className="mr-1" />
              Receive Stock
            </Button>
          )}

          <Button
            size="sm"
            variant="secondary"
            onClick={() => void loadInventory()}
            title="Reload real-time inventory"
          >
            <RefreshCw
              size={13}
              className={`mr-1 ${busy ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            Refresh
          </Button>

          <Link className="inv-header__link" href="/pos">
            Pharmacy POS
          </Link>

          <span className="inv-header__user" title={signedInAs}>
            {signedInAs}
          </span>

          <Button
            size="sm"
            variant="secondary"
            onClick={() => void handleSignOut()}
          >
            Log out
          </Button>
        </div>
      </header>

      {/* ── Executive KPI Cards & Health Matrix ─────────────── */}
      <section className="inv-kpi-container" aria-label="Inventory Overview">
        <div className="inv-kpi-grid">
          {/* Card 1: Active Items */}
          <div
            className="inv-kpi-card cursor-pointer"
            onClick={() => setActiveMainTab("catalog")}
            role="button"
            tabIndex={0}
          >
            <div className="inv-kpi-card__top">
              <span className="inv-kpi-card__label">Active SKUs</span>
              <span className="inv-kpi-card__icon inv-kpi-card__icon--blue">
                <Boxes size={16} />
              </span>
            </div>
            <div className="inv-kpi-card__value">{kpi.totalItems}</div>
            <div className="inv-kpi-card__meta">
              Across {kpi.totalDepartments} clinic locations
            </div>
          </div>

          {/* Card 2: Active Lots */}
          <div
            className="inv-kpi-card cursor-pointer"
            onClick={() => {
              setActiveMainTab("batches");
              setBatchFilterStatus("all");
            }}
            role="button"
            tabIndex={0}
          >
            <div className="inv-kpi-card__top">
              <span className="inv-kpi-card__label">Physical Lots</span>
              <span className="inv-kpi-card__icon inv-kpi-card__icon--indigo">
                <Layers size={16} />
              </span>
            </div>
            <div className="inv-kpi-card__value">{kpi.totalBatches}</div>
            <div className="inv-kpi-card__meta">
              FEFO batch tracking enabled
            </div>
          </div>

          {/* Card 3: Near Expiry */}
          <div
            className={`inv-kpi-card cursor-pointer ${
              kpi.nearExpiryBatchCount > 0 ? "inv-kpi-card--highlight-amber" : ""
            }`}
            onClick={() => {
              setActiveMainTab("batches");
              setBatchFilterStatus("near_expiry");
            }}
            role="button"
            tabIndex={0}
          >
            <div className="inv-kpi-card__top">
              <span className="inv-kpi-card__label">Near Expiry</span>
              <span className="inv-kpi-card__icon inv-kpi-card__icon--amber">
                <Clock size={16} />
              </span>
            </div>
            <div className="inv-kpi-card__value text-amber-700 dark:text-amber-400">
              {kpi.nearExpiryBatchCount}
            </div>
            <div className="inv-kpi-card__meta text-amber-700/80">
              ≤ {workspace.expirySettings?.near_expiry_days ?? 90} days remaining
            </div>
          </div>

          {/* Card 4: Expired Lots */}
          <div
            className={`inv-kpi-card cursor-pointer ${
              kpi.expiredBatchCount > 0 ? "inv-kpi-card--highlight-rose" : ""
            }`}
            onClick={() => {
              setActiveMainTab("batches");
              setBatchFilterStatus("expired");
            }}
            role="button"
            tabIndex={0}
          >
            <div className="inv-kpi-card__top">
              <span className="inv-kpi-card__label">Expired Lots</span>
              <span className="inv-kpi-card__icon inv-kpi-card__icon--rose">
                <AlertOctagon size={16} />
              </span>
            </div>
            <div className="inv-kpi-card__value text-rose-700 dark:text-rose-400">
              {kpi.expiredBatchCount}
            </div>
            <div className="inv-kpi-card__meta text-rose-700/80">
              Requires disposal write-off
            </div>
          </div>

          {/* Card 5: Inventory Valuation */}
          <div className="inv-kpi-card">
            <div className="inv-kpi-card__top">
              <span className="inv-kpi-card__label">Valuation at Cost</span>
              <span className="inv-kpi-card__icon inv-kpi-card__icon--slate">
                <Landmark size={16} />
              </span>
            </div>
            <div className="inv-kpi-card__value text-foreground">
              {fmtCurrency(kpi.inventoryCost)}
            </div>
            <div className="inv-kpi-card__meta">
              Retail: {fmtCurrency(kpi.retailValue)}
            </div>
          </div>

          {/* Card 6: Estimated Gross Margin */}
          <div className="inv-kpi-card">
            <div className="inv-kpi-card__top">
              <span className="inv-kpi-card__label">Gross Margin</span>
              <span className="inv-kpi-card__icon inv-kpi-card__icon--emerald">
                <TrendingUp size={16} />
              </span>
            </div>
            <div className="inv-kpi-card__value text-emerald-700 dark:text-emerald-400">
              {fmtCurrency(kpi.potentialMargin)}
            </div>
            <div className="inv-kpi-card__meta text-emerald-700/80">
              {kpi.marginPct.toFixed(1)}% blended margin
            </div>
          </div>
        </div>

        {/* Visual Batch Health Ribbon */}
        {kpi.totalBatches > 0 && (
          <div className="inv-health-ribbon">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <Sparkles size={13} className="text-primary" />
                Lot Integrity & Expiry Health
              </span>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Good: {kpi.okBatchCount}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Near Expiry: {kpi.nearExpiryBatchCount}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  Expired: {kpi.expiredBatchCount}
                </span>
              </div>
            </div>
            <div className="inv-health-bar">
              <div
                className="inv-health-bar__segment inv-health-bar__segment--ok"
                style={{
                  width: `${(kpi.okBatchCount / kpi.totalBatches) * 100}%`,
                }}
                title={`Good lots: ${kpi.okBatchCount}`}
              />
              <div
                className="inv-health-bar__segment inv-health-bar__segment--near"
                style={{
                  width: `${(kpi.nearExpiryBatchCount / kpi.totalBatches) * 100}%`,
                }}
                title={`Near expiry lots: ${kpi.nearExpiryBatchCount}`}
              />
              <div
                className="inv-health-bar__segment inv-health-bar__segment--expired"
                style={{
                  width: `${(kpi.expiredBatchCount / kpi.totalBatches) * 100}%`,
                }}
                title={`Expired lots: ${kpi.expiredBatchCount}`}
              />
            </div>
          </div>
        )}
      </section>

      {/* ── Primary Navigation Bar ──────────────────────────── */}
      <nav className="inv-nav-tabs" aria-label="Inventory sections">
        {mainNavTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeMainTab === tab.id;
          let badgeCount: number | null = null;
          if (tab.id === "batches" && (kpi.nearExpiryBatchCount + kpi.expiredBatchCount > 0)) {
            badgeCount = kpi.nearExpiryBatchCount + kpi.expiredBatchCount;
          }

          return (
            <button
              key={tab.id}
              type="button"
              className={`inv-nav-tab ${isActive ? "inv-nav-tab--active" : ""}`}
              onClick={() => setActiveMainTab(tab.id)}
            >
              <Icon size={15} />
              <span>{tab.label}</span>
              {badgeCount !== null && (
                <span className="inv-nav-tab__badge">{badgeCount}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* ── TAB 1: STOCK LEDGER & LOCATIONS ─────────────────── */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeMainTab === "ledger" && (
        <div className="space-y-4">
          {/* Department Hierarchy Accordion / Map */}
          <div className="inv-section">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                  <MapPin size={15} className="text-primary" />
                  Facility Location Map
                </h2>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShowHierarchyMap(!showHierarchyMap)}
              >
                {showHierarchyMap ? "Hide Location Map" : "Show Location Map"}
              </Button>
            </div>

            {showHierarchyMap && (
              <InventoryHierarchy
                mode={forceSimpleMode ? "simple" : preferredViewMode}
                onModeChange={(mode) => void selectInventoryViewMode(mode)}
                workspace={workspace}
              />
            )}
          </div>

          {/* Department Stock Ledger Table */}
          <section className="inv-section">
            <div className="inv-section-header">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-foreground">
                    Real-Time Stock Ledger
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    ({stockRows.length} active records)
                  </span>
                </div>
                <p className="inv-section__description">
                  Live physical inventory balances, unexpired quantities, and batch allocations across departments.
                </p>
              </div>

              {/* Ledger Controls */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="inv-filter">
                  <label htmlFor="stock-dept-select">Department</label>
                  <select
                    id="stock-dept-select"
                    className="odyssey-input text-xs"
                    value={stockFilterDept}
                    onChange={(e) => setStockFilterDept(e.target.value)}
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
                  <label htmlFor="stock-status-select">Stock Health</label>
                  <select
                    id="stock-status-select"
                    className="odyssey-input text-xs"
                    value={stockFilterStatus}
                    onChange={(e) => setStockFilterStatus(e.target.value)}
                  >
                    <option value="all">All Stock Statuses</option>
                    <option value="in_stock">In Stock</option>
                    <option value="low">Low Stock</option>
                    <option value="out">Out of Stock</option>
                  </select>
                </div>
              </div>
            </div>

            <DataTable
              caption="Current stock and usable lots by department. Usable stock excludes expired batches."
              data={stockRows}
              emptyMessage="No stock allocations match the current filters."
              getRowId={(row) => row.id}
              columns={[
                {
                  id: "sku",
                  header: "SKU",
                  cell: (row) => <span className="inv-sku">{row.itemSku}</span>,
                },
                {
                  id: "item",
                  header: "Item Description",
                  cell: (row) => (
                    <div>
                      <span className="font-semibold text-foreground">
                        {row.itemName}
                      </span>
                      {row.isPerishable && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800">
                          Lot Tracked
                        </span>
                      )}
                    </div>
                  ),
                },
                {
                  id: "department",
                  header: "Department",
                  cell: (row) => (
                    <span className="inv-dept-badge">{row.departmentName}</span>
                  ),
                },
                {
                  id: "quantity",
                  header: "On Hand",
                  cell: (row) => (
                    <span className="inv-quantity font-semibold">
                      {fmt(Number(row.quantity))} {row.unit}
                    </span>
                  ),
                },
                {
                  id: "usable",
                  header: "Usable (Unexpired)",
                  cell: (row) => (
                    <div>
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                        {fmt(row.usableQuantity)} {row.unit}
                      </span>
                      {row.expiredQuantity > 0 && (
                        <span className="ml-1.5 text-xs text-rose-600 font-semibold">
                          ({fmt(row.expiredQuantity)} expired)
                        </span>
                      )}
                    </div>
                  ),
                },
                {
                  id: "expiryStatus",
                  header: "Lot & Expiry Health",
                  cell: (row) => {
                    if (!row.isPerishable) {
                      return (
                        <span className="text-xs text-muted-foreground">
                          Standard stock
                        </span>
                      );
                    }
                    return (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {row.expiredCount > 0 && (
                          <span className="inv-badge-pill inv-badge-pill--expired">
                            <AlertOctagon size={11} />
                            {row.expiredCount} Expired
                          </span>
                        )}
                        {row.nearExpiryCount > 0 && (
                          <span className="inv-badge-pill inv-badge-pill--near-expiry">
                            <Clock size={11} />
                            {row.nearExpiryCount} Near Expiry
                          </span>
                        )}
                        {row.expiredCount === 0 && row.nearExpiryCount === 0 && (
                          <span className="inv-badge-pill inv-badge-pill--ok">
                            <CheckCircle2 size={11} />
                            OK
                          </span>
                        )}
                      </div>
                    );
                  },
                },
                {
                  id: "status",
                  header: "Reorder Status",
                  cell: (row) => {
                    const config = stockStatusConfig[row.stockStatus];
                    return (
                      <Badge variant={config.variant}>{config.label}</Badge>
                    );
                  },
                },
                {
                  id: "actions",
                  header: "Lots",
                  cell: (row) => (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setInspectStockId(row.id)}
                    >
                      <Layers size={13} className="mr-1" />
                      {row.batches.length > 0
                        ? `${row.batches.length} lots`
                        : "Inspect"}
                    </Button>
                  ),
                },
              ]}
            />
          </section>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* ── TAB 2: BATCHES & FEFO MATRIX ────────────────────── */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeMainTab === "batches" && (
        <section className="inv-section">
          <div className="inv-section-header">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-foreground">
                  Lot & Batch Expiry Matrix (FEFO)
                </h2>
                <span className="text-xs text-muted-foreground">
                  ({filteredBatches.length} lots found)
                </span>
              </div>
              <p className="inv-section__description">
                Audit physical batches in real-time. Odyssey automatically consumes earlier expiration lots first under First-Expired, First-Out (FEFO) rules.
              </p>
            </div>

            {/* Filter Bar */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inv-filter">
                <label>Department</label>
                <select
                  className="odyssey-input text-xs"
                  value={batchFilterDept}
                  onChange={(e) => setBatchFilterDept(e.target.value)}
                >
                  <option value="all">All Departments</option>
                  {workspace.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="inv-filter">
                <label>Expiry Condition</label>
                <select
                  className="odyssey-input text-xs"
                  value={batchFilterStatus}
                  onChange={(e) => setBatchFilterStatus(e.target.value)}
                >
                  <option value="all">All Expiry Statuses</option>
                  <option value="ok">Good / Unexpired</option>
                  <option value="near_expiry">Near Expiry (≤90d)</option>
                  <option value="expired">Expired (Disposal Required)</option>
                  <option value="legacy_unassigned">Legacy Unassigned</option>
                </select>
              </div>
            </div>
          </div>

          <DataTable
            caption="All active inventory batches and expiry statuses."
            data={filteredBatches}
            emptyMessage="No batches match the selected criteria."
            getRowId={(b) => b.id}
            columns={[
              {
                id: "item",
                header: "Item Description",
                cell: (b) => (
                  <div>
                    <strong className="text-foreground">
                      {b.item_name ?? "Unknown item"}
                    </strong>
                    <small className="block inv-sku text-muted-foreground">
                      {b.item_sku ?? "—"}
                    </small>
                  </div>
                ),
              },
              {
                id: "department",
                header: "Location",
                cell: (b) => (
                  <span className="inv-dept-badge">
                    {b.department_name ?? "Unknown"}
                  </span>
                ),
              },
              {
                id: "lot",
                header: "Lot / Batch #",
                cell: (b) => (
                  <span className="font-mono font-semibold text-foreground px-2 py-0.5 rounded bg-muted/70 text-xs">
                    {b.lot_number || "—"}
                  </span>
                ),
              },
              {
                id: "expiry",
                header: "Expiration Date",
                cell: (b) => (
                  <div>
                    <span className="font-medium text-xs">
                      {b.expiry_date ? fmtDate(b.expiry_date) : "Unassigned"}
                    </span>
                    <div className="mt-1">
                      {getExpiryBadge(b.expiry_status, b.days_until_expiry)}
                    </div>
                  </div>
                ),
              },
              {
                id: "quantity",
                header: "Total Qty",
                cell: (b) => (
                  <span className="font-semibold text-foreground">
                    {fmt(b.quantity)}
                  </span>
                ),
              },
              {
                id: "usable",
                header: "Usable Qty",
                cell: (b) => (
                  <span
                    className={
                      b.usable_quantity > 0
                        ? "text-emerald-700 dark:text-emerald-400 font-semibold"
                        : "text-rose-600 font-semibold"
                    }
                  >
                    {fmt(b.usable_quantity)}
                  </span>
                ),
              },
              {
                id: "received",
                header: "Received At",
                cell: (b) => (
                  <span className="text-xs text-muted-foreground">
                    {fmtDate(b.received_at)}
                  </span>
                ),
              },
              {
                id: "action",
                header: "Action",
                cell: (b) => {
                  if (b.expiry_status === "expired" && canManage) {
                    return (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setActiveMainTab("operations");
                          setOperationsSubTab("adjust");
                        }}
                      >
                        <Trash2 size={12} className="mr-1 text-rose-600" />
                        Dispose
                      </Button>
                    );
                  }
                  return (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setActiveMainTab("operations");
                        setOperationsSubTab("transfer");
                      }}
                    >
                      <ArrowLeftRight size={12} className="mr-1" />
                      Transfer
                    </Button>
                  );
                },
              },
            ]}
          />
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* ── TAB 3: ITEM MASTER CATALOG ──────────────────────── */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeMainTab === "catalog" && (
        <section className="inv-section">
          <div className="inv-section-header">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-foreground">
                  Item Master Catalog
                </h2>
                <span className="text-xs text-muted-foreground">
                  ({itemTotals.length} items registered)
                </span>
              </div>
              <p className="inv-section__description">
                Central catalog of clinical consumables, medications, pricing, and gross margins aggregated clinic-wide.
              </p>
            </div>

            {canManage && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setActiveMainTab("operations");
                    setOperationsSubTab("add-item");
                  }}
                >
                  <Plus size={14} className="mr-1" />
                  Add Catalog Item
                </Button>
              </div>
            )}
          </div>

          <DataTable
            caption="Item-master totals derived across all department stock rows."
            data={itemTotals.filter((i) => {
              if (!globalSearch) return true;
              const q = globalSearch.toLowerCase();
              return (
                i.name.toLowerCase().includes(q) ||
                i.sku.toLowerCase().includes(q) ||
                (i.description ?? "").toLowerCase().includes(q)
              );
            })}
            emptyMessage="No items registered in catalog."
            getRowId={(row) => row.id}
            columns={[
              {
                id: "sku",
                header: "SKU",
                cell: (row) => <span className="inv-sku">{row.sku}</span>,
              },
              {
                id: "name",
                header: "Item Name",
                cell: (row) => (
                  <div>
                    <strong className="text-foreground">{row.name}</strong>
                    {row.description && (
                      <span className="block text-xs text-muted-foreground">
                        {row.description}
                      </span>
                    )}
                    {row.is_perishable && (
                      <span className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        Perishable / FEFO
                      </span>
                    )}
                  </div>
                ),
              },
              {
                id: "unit",
                header: "Unit",
                cell: (row) => (
                  <span className="font-mono text-xs text-muted-foreground">
                    {row.unit_of_measure}
                  </span>
                ),
              },
              {
                id: "total",
                header: "Total Stock Across Clinic",
                cell: (row) => (
                  <div>
                    <strong className="text-foreground">
                      {fmt(row.total)} {row.unit_of_measure}
                    </strong>
                    {row.expiredTotal > 0 && (
                      <div className="text-xs text-rose-600 font-semibold">
                        {fmt(row.usableTotal)} usable · {fmt(row.expiredTotal)} expired
                      </div>
                    )}
                  </div>
                ),
              },
              {
                id: "cost",
                header: "Unit Cost",
                cell: (row) => (
                  <span className="font-medium text-xs">
                    {fmtCurrency(Number(row.unit_cost), row.currency)}
                  </span>
                ),
              },
              {
                id: "price",
                header: "Selling Price",
                cell: (row) => (
                  <span className="font-semibold text-xs text-foreground">
                    {fmtCurrency(Number(row.selling_price), row.currency)}
                  </span>
                ),
              },
              {
                id: "margin",
                header: "Gross Margin",
                cell: (row) => {
                  const sellingPrice = Number(row.selling_price);
                  const margin = sellingPrice - Number(row.unit_cost);
                  const rate =
                    sellingPrice > 0 ? (margin / sellingPrice) * 100 : 0;
                  return (
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      {fmtCurrency(margin, row.currency)} ({rate.toFixed(1)}%)
                    </span>
                  );
                },
              },
              {
                id: "active",
                header: "Status",
                cell: (row) =>
                  row.active ? (
                    <Badge variant="success">Active</Badge>
                  ) : (
                    <Badge variant="muted">Inactive</Badge>
                  ),
              },
              {
                id: "settings",
                header: "Edit",
                cell: (row) =>
                  canManage ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setPricingItemId(row.id);
                        setActiveMainTab("operations");
                        setOperationsSubTab("pricing");
                      }}
                    >
                      <Sliders size={12} className="mr-1" />
                      Configure
                    </Button>
                  ) : null,
              },
            ]}
          />
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* ── TAB 4: OPERATIONS HUB ───────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeMainTab === "operations" && canManage && (
        <section className="inv-section">
          <div className="inv-section-header">
            <div>
              <h2 className="text-base font-bold text-foreground">
                Supply Room Operations Center
              </h2>
              <p className="inv-section__description">
                Receive by batch, transfer inventory between departments, correct physical discrepancies, and write off expired lots.
              </p>
            </div>
          </div>

          {/* Operations Sub-Navigation */}
          <div className="inv-subnav-tabs">
            <button
              type="button"
              className={`inv-subnav-tab ${
                operationsSubTab === "receive" ? "inv-subnav-tab--active" : ""
              }`}
              onClick={() => setOperationsSubTab("receive")}
            >
              <PackagePlus size={14} />
              Receive Stock
            </button>
            <button
              type="button"
              className={`inv-subnav-tab ${
                operationsSubTab === "transfer" ? "inv-subnav-tab--active" : ""
              }`}
              onClick={() => setOperationsSubTab("transfer")}
            >
              <ArrowLeftRight size={14} />
              Inter-Dept Transfer
            </button>
            <button
              type="button"
              className={`inv-subnav-tab ${
                operationsSubTab === "adjust" ? "inv-subnav-tab--active" : ""
              }`}
              onClick={() => setOperationsSubTab("adjust")}
            >
              <Trash2 size={14} />
              Adjust & Dispose
            </button>
            <button
              type="button"
              className={`inv-subnav-tab ${
                operationsSubTab === "add-item" ? "inv-subnav-tab--active" : ""
              }`}
              onClick={() => setOperationsSubTab("add-item")}
            >
              <Plus size={14} />
              New Catalog Item
            </button>
            <button
              type="button"
              className={`inv-subnav-tab ${
                operationsSubTab === "pricing" ? "inv-subnav-tab--active" : ""
              }`}
              onClick={() => setOperationsSubTab("pricing")}
            >
              <CircleDollarSign size={14} />
              Pricing & Lot Settings
            </button>
            <button
              type="button"
              className={`inv-subnav-tab ${
                operationsSubTab === "add-dept" ? "inv-subnav-tab--active" : ""
              }`}
              onClick={() => setOperationsSubTab("add-dept")}
            >
              <Building2 size={14} />
              Add Location
            </button>
          </div>

          {/* Sub-Panel 1: Receive Stock */}
          {operationsSubTab === "receive" && (
            <Card>
              <div className="mb-4">
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <PackagePlus size={18} className="text-primary" />
                  Receive Incoming Stock by Batch / Lot
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Record vendor receipts, purchase orders, or opening balances with lot provenance and expiration tracking.
                </p>
              </div>

              <form
                className="space-y-4"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!receiveItemId) {
                    setStatus("Please select an item to receive.");
                    setToastMessage({
                      text: "Please select an item to receive.",
                      type: "error",
                    });
                    return;
                  }
                  const form = event.currentTarget;
                  const formData = new FormData(form);
                  const departmentId = String(formData.get("departmentId"));
                  const movementType = String(formData.get("movementType")) as
                    | "opening"
                    | "receipt";
                  const reason = String(formData.get("reason"));

                  setBusy(true);
                  let result;
                  if (selectedReceiveItem?.is_perishable) {
                    const batches = receiveBatchLines.map((line) => ({
                      quantity: Number(line.quantity),
                      expiry_date: line.expiryDate || null,
                      lot_number: line.lotNumber.trim() || null,
                    }));

                    result = await receiveInventoryStock(client, {
                      itemId: receiveItemId,
                      departmentId,
                      batches,
                      reason,
                      movementType,
                    });
                  } else {
                    const qty = Number(formData.get("singleQuantity"));
                    result = await receiveInventoryStock(client, {
                      itemId: receiveItemId,
                      departmentId,
                      batches: [{ quantity: qty }],
                      reason,
                      movementType,
                    });
                  }
                  setBusy(false);

                  if (result.error) {
                    setStatus(`Receipt failed: ${result.error.message}`);
                    setToastMessage({
                      text: `Receipt failed: ${result.error.message}`,
                      type: "error",
                    });
                  } else {
                    form.reset();
                    setReceiveBatchLines([
                      { id: "1", quantity: "1", expiryDate: "", lotNumber: "" },
                    ]);
                    setStatus("Stock and batch allocations received successfully.");
                    setToastMessage({
                      text: "Stock and batch allocations received successfully.",
                      type: "success",
                    });
                    await loadInventory();
                  }
                }}
              >
                <div className="two-column">
                  <Field label="Item">
                    <select
                      className="odyssey-input"
                      name="itemId"
                      value={receiveItemId}
                      onChange={(e) => setReceiveItemId(e.target.value)}
                      required
                    >
                      <option value="" disabled>
                        Select catalog item
                      </option>
                      {workspace.items
                        .filter((item) => item.active)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} ({item.sku}){" "}
                            {item.is_perishable ? "[Perishable / Lot Tracked]" : ""}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Destination Department">
                    <select
                      className="odyssey-input"
                      name="departmentId"
                      required
                    >
                      <option value="" disabled>
                        Select destination location
                      </option>
                      {workspace.departments
                        .filter((department) => department.active)
                        .map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.name} ({department.code})
                          </option>
                        ))}
                    </select>
                  </Field>
                </div>

                <div className="two-column">
                  <Field label="Movement type">
                    <select className="odyssey-input" name="movementType">
                      <option value="receipt">Purchase / Vendor Receipt</option>
                      <option value="opening">Opening Balance</option>
                      <option value="adjustment">Donation / Free Intake</option>
                    </select>
                  </Field>
                  <Field label="Reason / Reference (PO #, Invoice #)">
                    <Input
                      name="reason"
                      minLength={2}
                      placeholder="e.g. PO-2026-0891, Direct Supplier Delivery"
                      required
                    />
                  </Field>
                </div>

                {/* Perishable Multi-Batch Intake Grid */}
                {selectedReceiveItem?.is_perishable ? (
                  <div className="inv-batch-intake-card">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="text-sm font-bold flex items-center gap-2 text-foreground">
                          <Clock size={15} className="text-primary" />
                          Batch & Expiration Lines
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          Specify individual lot numbers and expiry dates for each incoming batch.
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={addBatchLine}
                      >
                        <Plus size={13} className="mr-1" />
                        Add Batch Line
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {receiveBatchLines.map((line, idx) => (
                        <div key={line.id} className="inv-batch-intake-row">
                          <span className="text-xs font-bold text-muted-foreground w-6 text-center">
                            #{idx + 1}
                          </span>
                          <div className="flex-1">
                            <label className="inv-field-label">
                              Lot / Batch #
                            </label>
                            <Input
                              value={line.lotNumber}
                              onChange={(e) =>
                                updateBatchLine(
                                  line.id,
                                  "lotNumber",
                                  e.target.value,
                                )
                              }
                              placeholder="e.g. LOT-2026-A1"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="inv-field-label">
                              Expiration Date <span className="text-rose-500">*</span>
                            </label>
                            <Input
                              type="date"
                              value={line.expiryDate}
                              onChange={(e) =>
                                updateBatchLine(
                                  line.id,
                                  "expiryDate",
                                  e.target.value,
                                )
                              }
                              required
                            />
                          </div>
                          <div className="w-32">
                            <label className="inv-field-label">
                              Quantity <span className="text-rose-500">*</span>
                            </label>
                            <Input
                              type="number"
                              min="0.001"
                              step="0.001"
                              value={line.quantity}
                              onChange={(e) =>
                                updateBatchLine(
                                  line.id,
                                  "quantity",
                                  e.target.value,
                                )
                              }
                              required
                            />
                          </div>
                          {receiveBatchLines.length > 1 && (
                            <button
                              type="button"
                              className="p-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded mt-4"
                              onClick={() => removeBatchLine(line.id)}
                              title="Remove batch line"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="text-right text-xs font-semibold text-foreground pt-2">
                      Total Units to Receive:{" "}
                      <span className="text-sm font-bold text-primary">
                        {receiveBatchLines.reduce(
                          (sum, l) => sum + (Number(l.quantity) || 0),
                          0,
                        )}{" "}
                        {selectedReceiveItem.unit_of_measure}
                      </span>
                    </div>
                  </div>
                ) : (
                  <Field label="Quantity to add">
                    <Input
                      name="singleQuantity"
                      type="number"
                      min="0.001"
                      step="0.001"
                      defaultValue="1"
                      required
                    />
                  </Field>
                )}

                <Button disabled={busy || !receiveItemId} type="submit">
                  {busy ? "Processing intake…" : "Receive Stock"}
                </Button>
              </form>
            </Card>
          )}

          {/* Sub-Panel 2: Inter-Department Transfer */}
          {operationsSubTab === "transfer" && (
            <Card>
              <div className="mb-4">
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <ArrowLeftRight size={18} className="text-primary" />
                  Inter-Department Stock Transfer
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Move inventory between clinic locations. Batch provenance and expiry dates are preserved atomically under FEFO order.
                </p>
              </div>

              <form
                className="space-y-4"
                onSubmit={(event) =>
                  void runForm(
                    event,
                    async (fields) =>
                      transferDepartmentStock(client, {
                        itemId: String(fields.get("transferItemId")),
                        fromDepartmentId: String(fields.get("fromDepartmentId")),
                        toDepartmentId: String(fields.get("toDepartmentId")),
                        quantity: Number(fields.get("transferQuantity")),
                        reason: String(fields.get("transferReason")),
                      }),
                    "Stock and batch allocations transferred atomically.",
                  )
                }
              >
                <Field label="Item to transfer">
                  <select
                    className="odyssey-input"
                    name="transferItemId"
                    required
                  >
                    <option value="" disabled>
                      Select an item
                    </option>
                    {workspace.items
                      .filter((item) => item.active)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.sku})
                        </option>
                      ))}
                  </select>
                </Field>

                <div className="two-column">
                  <Field label="From Department (Source)">
                    <select
                      className="odyssey-input"
                      name="fromDepartmentId"
                      required
                    >
                      <option value="" disabled>
                        Select source location
                      </option>
                      {workspace.departments
                        .filter((department) => department.active)
                        .map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="To Department (Destination)">
                    <select
                      className="odyssey-input"
                      name="toDepartmentId"
                      required
                    >
                      <option value="" disabled>
                        Select destination location
                      </option>
                      {workspace.departments
                        .filter((department) => department.active)
                        .map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                </div>

                <div className="two-column">
                  <Field label="Transfer Quantity">
                    <Input
                      name="transferQuantity"
                      type="number"
                      min="0.001"
                      step="0.001"
                      required
                    />
                  </Field>
                  <Field label="Transfer Reason / Reference">
                    <Input
                      name="transferReason"
                      minLength={2}
                      placeholder="e.g. ER restocking request, Ward replenishment"
                      required
                    />
                  </Field>
                </div>

                <Button disabled={busy} type="submit">
                  {busy ? "Processing…" : "Execute Transfer"}
                </Button>
              </form>
            </Card>
          )}

          {/* Sub-Panel 3: Adjust & Dispose */}
          {operationsSubTab === "adjust" && (
            <Card>
              <div className="mb-4">
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Trash2 size={18} className="text-primary" />
                  Stock Correction & Expired Lot Disposal
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Post adjustments for physical count discrepancies, breakage, or expired lot write-offs. Disposals automatically purge expired batches in earliest-expiry order.
                </p>
              </div>

              <form
                className="space-y-4"
                onSubmit={(event) =>
                  void runForm(
                    event,
                    async (fields) => {
                      const movementType = String(fields.get("movementType")) as
                        | "adjustment"
                        | "disposal";
                      const rawDelta = Number(fields.get("quantity"));
                      const finalDelta =
                        movementType === "disposal"
                          ? -Math.abs(rawDelta)
                          : rawDelta;

                      return adjustDepartmentStock(client, {
                        itemId: String(fields.get("itemId")),
                        departmentId: String(fields.get("departmentId")),
                        quantityDelta: finalDelta,
                        reason: String(fields.get("reason")),
                        movementType,
                      });
                    },
                    "Stock adjustment / disposal posted successfully.",
                  )
                }
              >
                <div className="two-column">
                  <Field label="Item">
                    <select className="odyssey-input" name="itemId" required>
                      <option value="" disabled>
                        Select item
                      </option>
                      {workspace.items
                        .filter((item) => item.active)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} ({item.sku})
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Department">
                    <select
                      className="odyssey-input"
                      name="departmentId"
                      required
                    >
                      <option value="" disabled>
                        Select department
                      </option>
                      {workspace.departments
                        .filter((department) => department.active)
                        .map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                </div>

                <div className="two-column">
                  <Field label="Action Type">
                    <select className="odyssey-input" name="movementType">
                      <option value="adjustment">
                        Standard Correction (Use negative to reduce)
                      </option>
                      <option value="disposal">
                        Expired Stock Disposal / Write-Off
                      </option>
                    </select>
                  </Field>
                  <Field
                    label="Quantity"
                    hint="For disposal or breakage, enter the amount to discard."
                  >
                    <Input
                      name="quantity"
                      type="number"
                      step="0.001"
                      required
                    />
                  </Field>
                </div>

                <Field label="Audit Reason / Note">
                  <Input
                    name="reason"
                    minLength={2}
                    placeholder="e.g. Expired lot purge, Breakage during transport, Physical recount"
                    required
                  />
                </Field>

                <Button disabled={busy} type="submit">
                  {busy ? "Processing…" : "Post Adjustment / Disposal"}
                </Button>
              </form>
            </Card>
          )}

          {/* Sub-Panel 4: Add New Catalog Item */}
          {operationsSubTab === "add-item" && (
            <Card>
              <div className="mb-4">
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Plus size={18} className="text-primary" />
                  Register New Catalog Item
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Add a consumable supply or pharmaceutical medication to the clinic catalog with pricing and batch-tracking rules.
                </p>
              </div>

              <form
                className="space-y-4"
                onSubmit={(event) =>
                  void runForm(
                    event,
                    async (fields) =>
                      createInventoryItem(client, {
                        organizationId,
                        name: String(fields.get("name") ?? ""),
                        description: String(fields.get("description") ?? ""),
                        unitOfMeasure: String(fields.get("unit") ?? ""),
                        unitCost: Number(fields.get("unitCost")),
                        sellingPrice: Number(fields.get("sellingPrice")),
                        isPerishable: fields.get("isPerishable") === "on",
                        nearExpiryDaysOverride: fields.get(
                          "nearExpiryDaysOverride",
                        )
                          ? Number(fields.get("nearExpiryDaysOverride"))
                          : null,
                      }),
                    "Item added to the master catalog.",
                  )
                }
              >
                <Field label="Item Name">
                  <Input
                    name="name"
                    maxLength={200}
                    placeholder="e.g. Amoxicillin 500mg Capsule, Sterile Gauze 4x4"
                    required
                  />
                </Field>

                <div className="two-column">
                  <Field label="Unit of Measure">
                    <Input
                      name="unit"
                      placeholder="piece, vial, box, bottle"
                      required
                    />
                  </Field>
                  <Field label="Unit Cost (PHP)">
                    <Input
                      name="unitCost"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue="0"
                      required
                    />
                  </Field>
                </div>

                <Field label="Selling Price (PHP)">
                  <Input
                    name="sellingPrice"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue="0"
                    required
                  />
                </Field>

                <Field label="Description (Optional)">
                  <Input
                    name="description"
                    maxLength={500}
                    placeholder="Optional item details, dosage, or instructions"
                  />
                </Field>

                {/* Batch Tracking Option */}
                <div className="inv-batch-intake-card space-y-3">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      name="isPerishable"
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                      defaultChecked
                    />
                    <div>
                      <span className="font-semibold text-sm block">
                        Enable Batch / Lot & Expiry Tracking (Perishable)
                      </span>
                      <span className="text-xs text-muted-foreground block">
                        Requires lot numbers and expiration dates during stock receiving. Allocates stock using FEFO.
                      </span>
                    </div>
                  </label>

                  <Field
                    label="Custom Near-Expiry Warning Threshold (Optional)"
                    hint="Overrides clinic default window (e.g. 30, 60, 90, 180 days)."
                  >
                    <Input
                      name="nearExpiryDaysOverride"
                      type="number"
                      min="1"
                      max="3650"
                      placeholder="Leave blank to use clinic default"
                    />
                  </Field>
                </div>

                <Button disabled={busy} type="submit">
                  {busy ? "Adding…" : "Add Item to Catalog"}
                </Button>
              </form>
            </Card>
          )}

          {/* Sub-Panel 5: Pricing & Lot Settings */}
          {operationsSubTab === "pricing" && (
            <Card>
              <div className="mb-4">
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <CircleDollarSign size={18} className="text-primary" />
                  Update Item Pricing & Expiry Settings
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Configure selling prices, unit costs, and toggle batch expiry tracking per item.
                </p>
              </div>

              <form
                className="space-y-4"
                onSubmit={(event) =>
                  void runForm(
                    event,
                    async (fields) =>
                      updateInventoryItemPricing(client, {
                        itemId: String(fields.get("itemId") ?? ""),
                        unitCost: Number(fields.get("unitCost")),
                        sellingPrice: Number(fields.get("sellingPrice")),
                        isPerishable: fields.get("isPerishable") === "on",
                        nearExpiryDaysOverride: fields.get(
                          "nearExpiryDaysOverride",
                        )
                          ? Number(fields.get("nearExpiryDaysOverride"))
                          : null,
                      }),
                    "Item settings and pricing updated.",
                  )
                }
              >
                <Field label="Inventory Item">
                  <select
                    className="odyssey-input"
                    name="itemId"
                    value={pricingItemId}
                    onChange={(event) => setPricingItemId(event.target.value)}
                    required
                  >
                    <option value="">Select an item to configure</option>
                    {workspace.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.sku})
                      </option>
                    ))}
                  </select>
                </Field>

                {(() => {
                  const item = workspace.items.find(
                    (row) => row.id === pricingItemId,
                  );
                  return (
                    <div
                      className="space-y-4"
                      key={item?.id ?? "no-pricing-item"}
                    >
                      <div className="two-column">
                        <Field label="Unit Cost (PHP)">
                          <Input
                            name="unitCost"
                            type="number"
                            min="0"
                            step="0.01"
                            defaultValue={item?.unit_cost ?? 0}
                            required
                          />
                        </Field>
                        <Field label="Selling Price (PHP)">
                          <Input
                            name="sellingPrice"
                            type="number"
                            min="0"
                            step="0.01"
                            defaultValue={item?.selling_price ?? 0}
                            required
                          />
                        </Field>
                      </div>

                      <div className="inv-batch-intake-card space-y-3">
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            name="isPerishable"
                            className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                            defaultChecked={item?.is_perishable ?? false}
                          />
                          <div>
                            <span className="font-semibold text-sm block">
                              Batch / Lot & Expiry Tracking (Perishable)
                            </span>
                            <span className="text-xs text-muted-foreground block">
                              Perishable items require lot numbers and follow server FEFO consumption rules.
                            </span>
                          </div>
                        </label>

                        <Field
                          label="Near-Expiry Alert Horizon (Days)"
                          hint="Overrides clinic default near-expiry warning window."
                        >
                          <Input
                            name="nearExpiryDaysOverride"
                            type="number"
                            min="1"
                            max="3650"
                            defaultValue={item?.near_expiry_days_override ?? ""}
                            placeholder="e.g. 60"
                          />
                        </Field>
                      </div>
                    </div>
                  );
                })()}

                <Button disabled={busy || !pricingItemId} type="submit">
                  {busy ? "Saving…" : "Save Item Settings"}
                </Button>
              </form>
            </Card>
          )}

          {/* Sub-Panel 6: Add Location / Department */}
          {operationsSubTab === "add-dept" && (
            <Card>
              <div className="mb-4">
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Building2 size={18} className="text-primary" />
                  Create Stock Location / Department
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Departments represent separate storage locations (e.g. Main Pharmacy, ER Supply, Central Warehouse, Inpatient Ward).
                </p>
              </div>

              <form
                className="space-y-4"
                onSubmit={(event) =>
                  void runForm(
                    event,
                    async (fields) =>
                      createDepartment(client, {
                        organizationId,
                        name: String(fields.get("name") ?? ""),
                        description: String(fields.get("description") ?? ""),
                      }),
                    "Department created as a new stock location.",
                  )
                }
              >
                <Field label="Department / Location Name">
                  <Input
                    name="name"
                    maxLength={120}
                    placeholder="e.g. Main Pharmacy, Emergency Room Supply"
                    required
                  />
                </Field>
                <Field label="Description (Optional)">
                  <Input
                    name="description"
                    maxLength={500}
                    placeholder="Optional description or physical room number"
                  />
                </Field>
                <Button disabled={busy} type="submit">
                  {busy ? "Creating…" : "Create Department Location"}
                </Button>
              </form>
            </Card>
          )}
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* ── TAB 5: CLINICAL USAGE TAGGING ───────────────────── */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeMainTab === "usage" && canTag && (
        <section className="inv-section">
          <div className="inv-section-header">
            <div>
              <h2 className="text-base font-bold text-foreground">
                Point-of-Use Clinical Tagging
              </h2>
              <p className="inv-section__description">
                Tag supplies or medications to an active clinical encounter. Odyssey atomically decrements stock via FEFO and syncs to patient billing drafts.
              </p>
            </div>
          </div>

          <form
            className="inv-tag-form"
            onSubmit={(event) =>
              void runForm(
                event,
                async (fields) =>
                  tagInventoryUsage(client, {
                    encounterId: String(fields.get("encounterId")),
                    stockId: String(fields.get("stockId")),
                    quantity: Number(fields.get("usageQuantity")),
                    departmentId: inventoryDepartmentSelection || null,
                  }),
                "Consumable tagged to encounter, stock decremented, and billing draft updated.",
              )
            }
          >
            <Field label="In-Progress Clinical Encounter">
              <select className="odyssey-input" name="encounterId" required>
                <option value="">Select clinical encounter</option>
                {encounters.map((encounter) => (
                  <option key={encounter.id} value={encounter.id}>
                    {encounter.serviceType ?? "Clinical encounter"} ·{" "}
                    {encounter.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Dispensing Department"
              hint={
                inventoryDepartmentId
                  ? "Your account is assigned to this department."
                  : "Choose where this usage should be subtracted."
              }
            >
              <select
                className="odyssey-input"
                name="departmentId"
                value={inventoryDepartmentSelection}
                onChange={(event) =>
                  setInventoryDepartmentSelection(event.target.value)
                }
                disabled={Boolean(inventoryDepartmentId)}
                required
              >
                <option value="" disabled>
                  Select a department
                </option>
                {workspace.departments
                  .filter((department) => department.active)
                  .map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name} ({department.code})
                    </option>
                  ))}
              </select>
            </Field>

            <Field label="Department Stock Item">
              <select
                className="odyssey-input"
                name="stockId"
                required
                disabled={!taggableStockRows.length}
              >
                <option value="">Select item to dispense</option>
                {taggableStockRows
                  .filter(
                    (row) =>
                      row.availableQuantity > 0 &&
                      (!inventoryDepartmentSelection ||
                        row.department_id === inventoryDepartmentSelection),
                  )
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.itemName} · {row.departmentName} (
                      {fmt(row.availableQuantity)} available)
                    </option>
                  ))}
              </select>
            </Field>

            <Field label="Quantity to Dispense">
              <Input
                name="usageQuantity"
                type="number"
                min="0.001"
                step="0.001"
                defaultValue="1"
                required
              />
            </Field>

            <Button
              disabled={busy || !encounters.length || !taggableStockRows.length}
              type="submit"
            >
              <UserCheck size={14} className="mr-1" />
              Tag Consumable to Patient
            </Button>
          </form>

          {/* Usage Records Table */}
          {workspace.usages.length > 0 && (
            <div className="mt-6">
              <div className="mb-3">
                <h3 className="text-sm font-bold text-foreground">
                  Recent Encounter Usage & Billing Records
                </h3>
                <p className="text-xs text-muted-foreground">
                  Immutable records linked to patient charts and drafts.
                </p>
              </div>
              <DataTable
                caption="Immutable patient-linked usage records for billing."
                data={workspace.usages}
                emptyMessage="No usage records."
                getRowId={(row) => row.id}
                columns={[
                  {
                    id: "when",
                    header: "Used At",
                    cell: (row) => fmtTime(row.used_at),
                  },
                  {
                    id: "item",
                    header: "Item",
                    cell: (row) => {
                      const item = workspace.items.find(
                        (i) => i.id === row.item_id,
                      );
                      return item?.name ?? row.item_id.slice(0, 8);
                    },
                  },
                  {
                    id: "quantity",
                    header: "Qty",
                    cell: (row) => fmt(Number(row.quantity)),
                  },
                  {
                    id: "cost",
                    header: "Unit Cost",
                    cell: (row) =>
                      fmtCurrency(Number(row.unit_cost), row.currency),
                  },
                  {
                    id: "charge",
                    header: "Total Charge",
                    cell: (row) =>
                      fmtCurrency(
                        Number(row.quantity) * Number(row.unit_price),
                        row.currency,
                      ),
                  },
                  {
                    id: "encounter",
                    header: "Encounter",
                    cell: (row) => row.encounter_id.slice(0, 8),
                  },
                  {
                    id: "taggedBy",
                    header: "Tagged By",
                    cell: (row) => (
                      <span className="inv-actor-name">
                        {row.actorName ??
                          (row.tagged_by ? row.tagged_by.slice(0, 8) : "—")}
                      </span>
                    ),
                  },
                ]}
              />
            </div>
          )}
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* ── TAB 6: AUDIT TRAIL & LEDGER MOVEMENTS ───────────── */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeMainTab === "audit" && canManage && (
        <section className="inv-section">
          <div className="inv-section-header">
            <div>
              <h2 className="text-base font-bold text-foreground">
                Stock & Batch Movement Audit Log
              </h2>
              <p className="inv-section__description">
                Immutable, append-only ledger of all receipts, transfers, clinical usages, adjustments, and expired batch disposals.
              </p>
            </div>
          </div>

          <DataTable
            caption="Append-only inventory movement history linked with batch provenance."
            data={workspace.movements}
            emptyMessage="No stock movements recorded."
            getRowId={(row) => row.id}
            columns={[
              {
                id: "when",
                header: "Timestamp",
                cell: (row) => fmtTime(row.occurred_at),
              },
              {
                id: "type",
                header: "Action Type",
                cell: (row) => {
                  const label = row.movement_type.replaceAll("_", " ");
                  const variant =
                    row.movement_type === "usage"
                      ? "warning"
                      : row.movement_type === "disposal"
                        ? "danger"
                        : row.movement_type.startsWith("transfer")
                          ? "default"
                          : "success";
                  return <Badge variant={variant}>{label}</Badge>;
                },
              },
              {
                id: "item",
                header: "Item Description",
                cell: (row) => {
                  const item = workspace.items.find(
                    (i) => i.id === row.item_id,
                  );
                  return (
                    <div>
                      <strong className="text-foreground">
                        {item?.name ?? row.item_id.slice(0, 8)}
                      </strong>
                      <small className="block inv-sku text-muted-foreground">
                        {item?.sku ?? "—"}
                      </small>
                    </div>
                  );
                },
              },
              {
                id: "department",
                header: "Location",
                cell: (row) => {
                  const dept = workspace.departments.find(
                    (d) => d.id === row.department_id,
                  );
                  return (
                    <span className="inv-dept-badge">
                      {dept?.name ?? row.department_id.slice(0, 8)}
                    </span>
                  );
                },
              },
              {
                id: "quantity",
                header: "Quantity Change",
                cell: (row) => {
                  const delta = Number(row.quantity_delta);
                  return (
                    <span
                      className={
                        delta > 0
                          ? "inv-delta--positive font-bold"
                          : "inv-delta--negative font-bold"
                      }
                    >
                      {delta > 0 ? "+" : ""}
                      {fmt(delta)}
                    </span>
                  );
                },
              },
              {
                id: "recordedBy",
                header: "Recorded By",
                cell: (row) => (
                  <span className="inv-actor-name">
                    {row.actorName ??
                      (row.recorded_by
                        ? row.recorded_by.slice(0, 8)
                        : "System")}
                  </span>
                ),
              },
              {
                id: "reason",
                header: "Audit Note / Reference",
                cell: (row) => row.reason ?? "—",
              },
            ]}
          />
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* ── TAB 7: SETTINGS & POLICIES ──────────────────────── */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeMainTab === "settings" && canManage && (
        <section className="inv-section">
          <div className="inv-section-header">
            <div>
              <h2 className="text-base font-bold text-foreground">
                Clinic Expiry & POS Mapping Rules
              </h2>
              <p className="inv-section__description">
                Configure default near-expiry warning windows and link dedicated Pharmacy stock departments for retail and NBB POS checkout.
              </p>
            </div>
          </div>

          <Card>
            <form
              className="space-y-4 max-w-xl"
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy(true);
                const result = await saveInventoryExpirySettings(client, {
                  organizationId,
                  nearExpiryDays: Number(nearExpiryDaysSetting),
                  pharmacyDepartmentId: pharmacyDeptSetting || null,
                });
                setBusy(false);
                if (result.error) {
                  setStatus(`Failed to save settings: ${result.error.message}`);
                  setToastMessage({
                    text: result.error.message,
                    type: "error",
                  });
                } else {
                  setStatus("Inventory expiry and POS settings updated.");
                  setToastMessage({
                    text: "Inventory expiry and POS settings updated.",
                    type: "success",
                  });
                  await loadInventory();
                }
              }}
            >
              <Field
                label="Near-Expiry Alert Horizon (Days)"
                hint="Batches expiring within this number of days trigger near-expiry warnings across all clinical screens."
              >
                <Input
                  type="number"
                  min="1"
                  max="3650"
                  value={nearExpiryDaysSetting}
                  onChange={(e) => setNearExpiryDaysSetting(Number(e.target.value))}
                  required
                />
              </Field>

              <Field
                label="Designated Pharmacy Department"
                hint="Point-of-Sale (POS) and NBB checkouts automatically deduct stock from this department."
              >
                <select
                  className="odyssey-input"
                  value={pharmacyDeptSetting}
                  onChange={(e) => setPharmacyDeptSetting(e.target.value)}
                >
                  <option value="">Auto-detect (Pharmacy named department)</option>
                  {workspace.departments
                    .filter((d) => d.active)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.code})
                      </option>
                    ))}
                </select>
              </Field>

              <Button disabled={busy} type="submit">
                {busy ? "Saving settings…" : "Save Inventory Settings"}
              </Button>
            </form>
          </Card>
        </section>
      )}

      {/* ── Batch Drilldown Modal Dialog ────────────────────── */}
      {inspectStockId && inspectedStockRow && (
        <div className="inv-modal-backdrop">
          <div className="inv-modal-card">
            <div className="inv-modal-header">
              <div>
                <span className="eyebrow">Lot & Expiry Inspection</span>
                <h3 className="text-base font-bold text-foreground">
                  {inspectedStockRow.itemName} ({inspectedStockRow.departmentName})
                </h3>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setInspectStockId(null)}
              >
                <X size={15} />
              </Button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-3 p-3 bg-muted/40 rounded-lg text-xs">
                <div>
                  <span className="text-muted-foreground block font-medium">
                    Total on hand:
                  </span>
                  <strong className="text-sm font-bold text-foreground">
                    {fmt(Number(inspectedStockRow.quantity))}{" "}
                    {inspectedStockRow.unit}
                  </strong>
                </div>
                <div>
                  <span className="text-muted-foreground block font-medium">
                    Usable (unexpired):
                  </span>
                  <strong className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                    {fmt(inspectedStockRow.usableQuantity)}{" "}
                    {inspectedStockRow.unit}
                  </strong>
                </div>
                <div>
                  <span className="text-muted-foreground block font-medium">
                    Expired to dispose:
                  </span>
                  <strong className="text-sm font-bold text-rose-600">
                    {fmt(inspectedStockRow.expiredQuantity)}{" "}
                    {inspectedStockRow.unit}
                  </strong>
                </div>
              </div>

              {inspectedStockRow.batches.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-xs">
                  <Layers size={28} className="mx-auto mb-2 opacity-40" />
                  No specific lot allocations recorded. This item is tracked via aggregate department count.
                </div>
              ) : (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Allocated Lots ({inspectedStockRow.batches.length})
                  </h4>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-muted text-muted-foreground font-semibold border-b border-border">
                        <tr>
                          <th className="p-2.5">Lot / Batch #</th>
                          <th className="p-2.5">Expiry Date</th>
                          <th className="p-2.5">Status</th>
                          <th className="p-2.5">Received</th>
                          <th className="p-2.5 text-right">Quantity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {inspectedStockRow.batches.map((batch) => (
                          <tr key={batch.id} className="hover:bg-muted/40">
                            <td className="p-2.5 font-mono font-semibold">
                              {batch.lot_number || (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="p-2.5">
                              {batch.expiry_date
                                ? fmtDate(batch.expiry_date)
                                : "Unassigned"}
                            </td>
                            <td className="p-2.5">
                              {getExpiryBadge(
                                batch.expiry_status,
                                batch.days_until_expiry,
                              )}
                            </td>
                            <td className="p-2.5 text-muted-foreground">
                              {fmtDate(batch.received_at)}
                            </td>
                            <td className="p-2.5 text-right font-bold text-foreground">
                              {fmt(batch.quantity)} {inspectedStockRow.unit}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 border-t border-border bg-muted/20 flex justify-between items-center text-xs text-muted-foreground">
              <span>FEFO rule automatically dispenses earlier expiry lots first.</span>
              <Button size="sm" onClick={() => setInspectStockId(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Discreet Persistent Status footer */}
      <p role="status" className="inv-status-bar">
        {status}
      </p>
    </main>
  );
}
