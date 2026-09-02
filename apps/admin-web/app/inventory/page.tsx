"use client";

import {
  adjustDepartmentStock,
  createBrowserSupabaseClient,
  createDepartment,
  createInventoryItem,
  getAccessibleOrganizations,
  getCurrentStaffDepartment,
  getCurrentUserEmail,
  getInventoryWorkspace,
  getPortalAccess,
  hasOrganizationPermission,
  listInventoryEncounters,
  signInWithPassword,
  signOut,
  subscribeToInventory,
  tagInventoryUsage,
  transferDepartmentStock,
} from "@odyssey/supabase-client";
import type {
  InventoryEncounterOption,
  InventoryWorkspace,
  PublicClinicSummary,
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
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

/* ─── Helpers ─────────────────────────────────────────────────── */

const emptyWorkspace: InventoryWorkspace = {
  departments: [],
  items: [],
  stock: [],
  usages: [],
  movements: [],
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
function getStockStatus(
  quantity: number,
  reorderLevel: number,
): StockStatus {
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

/* ─── SR Operations Tabs ──────────────────────────────────────── */
const srTabs = [
  { id: "receive", label: "Receive stock", icon: "📦" },
  { id: "adjust", label: "Adjust", icon: "🔧" },
  { id: "transfer", label: "Transfer", icon: "🔀" },
  { id: "add-item", label: "Add item", icon: "➕" },
  { id: "add-dept", label: "Add department", icon: "🏢" },
];

/* ─── Page Component ──────────────────────────────────────────── */

export default function InventoryPage() {
  /* Auth and workspace state */
  const [email, setEmail] = useState("inventory@synthetic.odyssey.test");
  const [password, setPassword] = useState("");
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const [clinics, setClinics] = useState<PublicClinicSummary[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [workspace, setWorkspace] =
    useState<InventoryWorkspace>(emptyWorkspace);
  const [encounters, setEncounters] = useState<InventoryEncounterOption[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [canTag, setCanTag] = useState(false);
  const [inventoryDepartmentId, setInventoryDepartmentId] = useState<string | null>(
    null,
  );
  const [inventoryDepartmentSelection, setInventoryDepartmentSelection] =
    useState("");
  const [busy, setBusy] = useState(false);
  const [liveStatus, setLiveStatus] = useState("Offline");
  const [status, setStatus] = useState("Sign in to manage clinic inventory.");

  /* Dashboard state */
  const [activeTab, setActiveTab] = useState("receive");
  const [stockFilter, setStockFilter] = useState<string>("all");

  /* ─── Derived data ────────────────────────────────────────── */
  const itemTotals = useMemo(
    () =>
      workspace.items.map((item) => {
        const stockRows = workspace.stock.filter(
          (s) => s.item_id === item.id,
        );
        const total = stockRows.reduce(
          (sum, s) => sum + Number(s.quantity),
          0,
        );
        const lowestReorder = stockRows.reduce(
          (min, s) => Math.min(min, Number(s.reorder_level)),
          Infinity,
        );
        return { ...item, total, lowestReorder };
      }),
    [workspace.items, workspace.stock],
  );

  const stockRows = useMemo(
    () =>
      workspace.stock
        .map((stock) => {
          const item = workspace.items.find((i) => i.id === stock.item_id);
          const dept = workspace.departments.find(
            (d) => d.id === stock.department_id,
          );
          return {
            ...stock,
            itemName: item?.name ?? "Unknown item",
            itemSku: item?.sku ?? "—",
            unit: item?.unit_of_measure ?? "unit",
            departmentName: dept?.name ?? "Unknown",
            departmentCode: dept?.code ?? "—",
            stockStatus: getStockStatus(
              Number(stock.quantity),
              Number(stock.reorder_level),
            ),
          };
        })
        .filter(
          (row) =>
            stockFilter === "all" || row.department_id === stockFilter,
        ),
    [workspace, stockFilter],
  );

  /* ─── KPI calculations ───────────────────────────────────── */
  const kpi = useMemo(() => {
    const totalItems = workspace.items.filter((i) => i.active).length;
    const totalDepartments = workspace.departments.filter(
      (d) => d.active,
    ).length;
    const lowStockCount = workspace.stock.filter(
      (s) =>
        Number(s.quantity) > 0 &&
        Number(s.quantity) <= Number(s.reorder_level),
    ).length;
    const outOfStockCount = workspace.stock.filter(
      (s) => Number(s.quantity) <= 0,
    ).length;
    const totalValue = workspace.stock.reduce((sum, s) => {
      const item = workspace.items.find((i) => i.id === s.item_id);
      return sum + Number(s.quantity) * Number(item?.unit_price ?? 0);
    }, 0);

    return {
      totalItems,
      totalDepartments,
      lowStockCount,
      outOfStockCount,
      alertCount: lowStockCount + outOfStockCount,
      totalValue,
    };
  }, [workspace]);

  /* ─── Data loading ────────────────────────────────────────── */
  const loadInventory = useCallback(
    async (clinicId = organizationId, manage = canManage) => {
      if (!clinicId) return;
      const client = createBrowserSupabaseClient();
      const [inventoryResult, encounterResult] = await Promise.all([
        getInventoryWorkspace(client, clinicId, manage),
        listInventoryEncounters(client, clinicId),
      ]);
      if (inventoryResult.error)
        return setStatus(
          `Inventory query failed: ${inventoryResult.error.message}`,
        );
      setWorkspace(inventoryResult.data);
      setEncounters(encounterResult.error ? [] : encounterResult.data);
    },
    [canManage, organizationId],
  );

  async function openInventoryPortal(emailAddress: string) {
    const client = createBrowserSupabaseClient();
    const accessResult = await getPortalAccess(client, "admin");
    if (accessResult.error || !accessResult.data.allowed) {
      await signOut(client);
      setSignedInAs(null);
      return setStatus(
        "This account is not authorized for the inventory workspace.",
      );
    }
    const clinicResult = await getAccessibleOrganizations(
      client,
      accessResult.data.organizationIds,
    );
    if (clinicResult.error || !clinicResult.data.length) {
      await signOut(client);
      return setStatus(
        `Clinic access failed: ${clinicResult.error?.message ?? "No assigned clinic."}`,
      );
    }
    const clinicId = clinicResult.data[0].id;
    const [manageResult, tagResult] = await Promise.all([
      hasOrganizationPermission(client, clinicId, "can_manage_inventory"),
      hasOrganizationPermission(client, clinicId, "can_tag_inventory_usage"),
    ]);
    if (
      manageResult.error ||
      tagResult.error ||
      (!manageResult.data && !tagResult.data)
    ) {
      await signOut(client);
      return setStatus("Your clinic role has no inventory permissions.");
    }
    setSignedInAs(emailAddress);
    setClinics(clinicResult.data);
    setOrganizationId(clinicId);
    setCanManage(manageResult.data);
    setCanTag(tagResult.data);
    const departmentResult = await getCurrentStaffDepartment(client, clinicId);
    if (departmentResult.error)
      return setStatus(
        `Department context query failed: ${departmentResult.error.message}`,
      );
    setInventoryDepartmentId(departmentResult.data);
    setInventoryDepartmentSelection(departmentResult.data ?? "");
    setStatus("Inventory workspace ready.");
    await loadInventory(clinicId, manageResult.data);
  }

  /* ─── Effects ─────────────────────────────────────────────── */
  useEffect(() => {
    void getCurrentUserEmail(createBrowserSupabaseClient()).then((result) => {
      if (!result.error && result.data) void openInventoryPortal(result.data);
    });
  }, []);

  useEffect(() => {
    if (!signedInAs || !organizationId) return;
    const unsubscribe = subscribeToInventory(
      createBrowserSupabaseClient(),
      organizationId,
      () => void loadInventory(),
      (connectionStatus) =>
        setLiveStatus(
          connectionStatus === "SUBSCRIBED" ? "Live" : connectionStatus,
        ),
    );
    return unsubscribe;
  }, [loadInventory, organizationId, signedInAs]);

  /* ─── Handlers ────────────────────────────────────────────── */
  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await signInWithPassword(
      createBrowserSupabaseClient(),
      email,
      password,
    );
    if (result.error)
      return setStatus(`Sign-in failed: ${result.error.message}`);
    await openInventoryPortal(result.data);
  }

  async function handleClinicChange(clinicId: string) {
    const client = createBrowserSupabaseClient();
    const [manageResult, tagResult] = await Promise.all([
      hasOrganizationPermission(client, clinicId, "can_manage_inventory"),
      hasOrganizationPermission(client, clinicId, "can_tag_inventory_usage"),
    ]);
    if (manageResult.error || tagResult.error)
      return setStatus("Unable to verify inventory permissions.");
    setOrganizationId(clinicId);
    setCanManage(manageResult.data);
    setCanTag(tagResult.data);
    const departmentResult = await getCurrentStaffDepartment(client, clinicId);
    if (departmentResult.error)
      return setStatus(
        `Department context query failed: ${departmentResult.error.message}`,
      );
    setInventoryDepartmentId(departmentResult.data);
    setInventoryDepartmentSelection(departmentResult.data ?? "");
    await loadInventory(clinicId, manageResult.data);
  }

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
    if (result.error)
      return setStatus(`Operation failed: ${result.error.message}`);
    form.reset();
    setStatus(successMessage);
    await loadInventory();
  }

  async function handleSignOut() {
    await signOut(createBrowserSupabaseClient());
    setSignedInAs(null);
    setClinics([]);
    setOrganizationId("");
    setWorkspace(emptyWorkspace);
    setCanManage(false);
    setCanTag(false);
    setInventoryDepartmentId(null);
    setInventoryDepartmentSelection("");
    setLiveStatus("Offline");
    setStatus("Signed out.");
  }

  /* ─── Sign-in screen ──────────────────────────────────────── */
  if (!signedInAs) {
    return (
      <main className="inv-login">
        <div className="inv-login__card">
          <div className="inv-login__header">
            <span className="inv-login__icon">📦</span>
            <p className="eyebrow">Supply Room Operations</p>
            <h1>Inventory Management</h1>
            <p className="hint">
              Sign in with your inventory staff credentials to access the supply
              room dashboard.
            </p>
          </div>
          <form className="stack narrow-form" onSubmit={handleSignIn}>
            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </Field>
            <Button type="submit">Sign in</Button>
            <p className="hint">Local reset password: LocalOnly-2026!</p>
          </form>
          <p role="status" className="inv-login__status">
            {status}
          </p>
        </div>
      </main>
    );
  }

  /* ─── Dashboard ───────────────────────────────────────────── */
  const currentClinic = clinics.find((c) => c.id === organizationId);

  return (
    <main className="inv-dashboard">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="inv-header">
        <div className="inv-header__left">
          <p className="eyebrow">Supply Room Operations</p>
          <h1>
            Inventory Dashboard
            {currentClinic ? (
              <span className="inv-header__clinic">{currentClinic.name}</span>
            ) : null}
          </h1>
        </div>
        <div className="inv-header__right">
          <span
            className="live-indicator"
            data-live={liveStatus === "Live"}
          >
            {liveStatus} stock
          </span>
          <span className="inv-header__user">{signedInAs}</span>
          <Link href="/">Appointments</Link>
          <Button size="sm" onClick={() => void loadInventory()}>
            Refresh
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void handleSignOut()}
          >
            Sign out
          </Button>
        </div>
      </div>

      {/* ── Clinic selector ─────────────────────────────────── */}
      {clinics.length > 1 && (
        <section className="inv-clinic-picker">
          <Field label="Clinic workspace">
            <select
              className="odyssey-input"
              value={organizationId}
              onChange={(event) =>
                void handleClinicChange(event.target.value)
              }
            >
              {clinics.map((clinic) => (
                <option key={clinic.id} value={clinic.id}>
                  {clinic.name}
                </option>
              ))}
            </select>
          </Field>
        </section>
      )}

      {/* ── KPI Cards ───────────────────────────────────────── */}
      <section className="inv-kpi-grid">
        <div className="inv-kpi-card">
          <span className="inv-kpi-card__icon">📋</span>
          <div className="inv-kpi-card__content">
            <span className="inv-kpi-card__value">{kpi.totalItems}</span>
            <span className="inv-kpi-card__label">Active items</span>
          </div>
        </div>
        <div className="inv-kpi-card">
          <span className="inv-kpi-card__icon">🏢</span>
          <div className="inv-kpi-card__content">
            <span className="inv-kpi-card__value">{kpi.totalDepartments}</span>
            <span className="inv-kpi-card__label">Departments</span>
          </div>
        </div>
        <div className="inv-kpi-card inv-kpi-card--alert">
          <span className="inv-kpi-card__icon">⚠️</span>
          <div className="inv-kpi-card__content">
            <span className="inv-kpi-card__value">{kpi.alertCount}</span>
            <span className="inv-kpi-card__label">
              {kpi.lowStockCount > 0
                ? `${kpi.lowStockCount} low · ${kpi.outOfStockCount} out`
                : "Stock alerts"}
            </span>
          </div>
        </div>
        <div className="inv-kpi-card inv-kpi-card--value">
          <span className="inv-kpi-card__icon">💰</span>
          <div className="inv-kpi-card__content">
            <span className="inv-kpi-card__value">
              {fmtCurrency(kpi.totalValue)}
            </span>
            <span className="inv-kpi-card__label">Total stock value</span>
          </div>
        </div>
      </section>

      {/* ── Department Stock Ledger ─────────────────────────── */}
      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Real-time ledger</p>
            <h2>Stock by department</h2>
          </div>
          <div className="inv-filter">
            <select
              className="odyssey-input"
              value={stockFilter}
              onChange={(event) => setStockFilter(event.target.value)}
            >
              <option value="all">All departments</option>
              {workspace.departments
                .filter((d) => d.active)
                .map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
        <DataTable
          caption="Current inventory quantity by item and department. Clinic totals are derived sums."
          data={stockRows}
          emptyMessage="No stock has been received yet."
          getRowId={(row) => row.id}
          columns={[
            {
              id: "sku",
              header: "SKU",
              cell: (row) => (
                <span className="inv-sku">{row.itemSku}</span>
              ),
            },
            {
              id: "item",
              header: "Item",
              cell: (row) => row.itemName,
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
              header: "Available",
              cell: (row) => (
                <span className="inv-quantity">
                  {fmt(Number(row.quantity))} {row.unit}
                </span>
              ),
            },
            {
              id: "reorder",
              header: "Reorder at",
              cell: (row) =>
                `${fmt(Number(row.reorder_level))} ${row.unit}`,
            },
            {
              id: "status",
              header: "Status",
              cell: (row) => {
                const config = stockStatusConfig[row.stockStatus];
                return (
                  <Badge variant={config.variant}>{config.label}</Badge>
                );
              },
            },
          ]}
        />
      </section>

      {/* ── Item Master Totals ──────────────────────────────── */}
      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Catalog</p>
            <h2>Item master</h2>
          </div>
          <span className="hint">
            Totals are derived across all departments.
          </span>
        </div>
        <DataTable
          caption="Item-master totals derived across all department stock rows."
          data={itemTotals}
          emptyMessage="No inventory items registered."
          getRowId={(row) => row.id}
          columns={[
            {
              id: "sku",
              header: "SKU",
              cell: (row) => (
                <span className="inv-sku">{row.sku}</span>
              ),
            },
            {
              id: "name",
              header: "Item",
              cell: (row) => row.name,
            },
            {
              id: "unit",
              header: "Unit",
              cell: (row) => row.unit_of_measure,
            },
            {
              id: "total",
              header: "Clinic total",
              cell: (row) => (
                <strong>
                  {fmt(row.total)} {row.unit_of_measure}
                </strong>
              ),
            },
            {
              id: "price",
              header: "Unit charge",
              cell: (row) =>
                fmtCurrency(Number(row.unit_price), row.currency),
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
          ]}
        />
      </section>

      {/* ── SR Operations ───────────────────────────────────── */}
      {canManage && (
        <section>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Supply room</p>
              <h2>SR Operations</h2>
            </div>
          </div>

          <TabGroup
            activeTab={activeTab}
            onTabChange={setActiveTab}
            tabs={srTabs}
          >
            {/* ── Receive stock ───────────────────────────────── */}
            <TabPanel active={activeTab === "receive"} id="receive">
              <Card>
                <h3>Receive incoming stock</h3>
                <p className="hint">
                  Record deliveries, donations, or opening balances for a
                  specific department location.
                </p>
                <form
                  className="stack"
                  onSubmit={(event) =>
                    void runForm(
                      event,
                      async (fields) =>
                        adjustDepartmentStock(
                          createBrowserSupabaseClient(),
                          {
                            itemId: String(fields.get("itemId")),
                            departmentId: String(
                              fields.get("departmentId"),
                            ),
                            quantityDelta: Number(
                              fields.get("quantity"),
                            ),
                            reason: String(fields.get("reason")),
                            movementType: String(
                              fields.get("movementType"),
                            ) as "opening" | "receipt",
                          },
                        ),
                      "Stock received and ledger updated.",
                    )
                  }
                >
                  <div className="two-column">
                    <Field label="Item">
                      <select
                        className="odyssey-input"
                        name="itemId"
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
                    <Field label="Department">
                      <select
                        className="odyssey-input"
                        name="departmentId"
                        required
                      >
                        <option value="" disabled>
                          Select a department
                        </option>
                        {workspace.departments
                          .filter((department) => department.active)
                          .map((department) => (
                            <option
                              key={department.id}
                              value={department.id}
                            >
                              {department.name} ({department.code})
                            </option>
                          ))}
                      </select>
                    </Field>
                  </div>
                  <div className="two-column">
                    <Field label="Movement type">
                      <select
                        className="odyssey-input"
                        name="movementType"
                      >
                        <option value="receipt">Receipt</option>
                        <option value="opening">Opening stock</option>
                      </select>
                    </Field>
                    <Field label="Quantity to add">
                      <Input
                        name="quantity"
                        type="number"
                        min="0.001"
                        step="0.001"
                        required
                      />
                    </Field>
                  </div>
                  <Field label="Reason / reference">
                    <Input
                      name="reason"
                      minLength={2}
                      placeholder="e.g. PO-2026-0042, Donation from NGO"
                      required
                    />
                  </Field>
                  <Button disabled={busy} type="submit">
                    {busy ? "Processing…" : "Receive stock"}
                  </Button>
                </form>
              </Card>
            </TabPanel>

            {/* ── Adjust stock ────────────────────────────────── */}
            <TabPanel active={activeTab === "adjust"} id="adjust">
              <Card>
                <h3>Stock correction</h3>
                <p className="hint">
                  Post an adjustment to correct miscounts, breakage, or
                  expiry. Use a negative number to reduce stock.
                </p>
                <form
                  className="stack"
                  onSubmit={(event) =>
                    void runForm(
                      event,
                      async (fields) =>
                        adjustDepartmentStock(
                          createBrowserSupabaseClient(),
                          {
                            itemId: String(fields.get("itemId")),
                            departmentId: String(
                              fields.get("departmentId"),
                            ),
                            quantityDelta: Number(
                              fields.get("quantity"),
                            ),
                            reason: String(fields.get("reason")),
                            movementType: "adjustment",
                          },
                        ),
                      "Stock adjustment posted.",
                    )
                  }
                >
                  <div className="two-column">
                    <Field label="Item">
                      <select
                        className="odyssey-input"
                        name="itemId"
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
                    <Field label="Department">
                      <select
                        className="odyssey-input"
                        name="departmentId"
                        required
                      >
                        <option value="" disabled>
                          Select a department
                        </option>
                        {workspace.departments
                          .filter((department) => department.active)
                          .map((department) => (
                            <option
                              key={department.id}
                              value={department.id}
                            >
                              {department.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                  </div>
                  <Field
                    label="Quantity change"
                    hint="Negative values reduce the current count."
                  >
                    <Input
                      name="quantity"
                      type="number"
                      step="0.001"
                      required
                    />
                  </Field>
                  <Field label="Reason for adjustment">
                    <Input
                      name="reason"
                      minLength={2}
                      placeholder="e.g. Physical count correction, Expired items"
                      required
                    />
                  </Field>
                  <Button disabled={busy} type="submit">
                    {busy ? "Processing…" : "Post adjustment"}
                  </Button>
                </form>
              </Card>
            </TabPanel>

            {/* ── Transfer stock ──────────────────────────────── */}
            <TabPanel active={activeTab === "transfer"} id="transfer">
              <Card>
                <h3>Inter-department transfer</h3>
                <p className="hint">
                  Move stock from one department to another within the
                  same clinic. Both sides update atomically.
                </p>
                <form
                  className="stack"
                  onSubmit={(event) =>
                    void runForm(
                      event,
                      async (fields) =>
                        transferDepartmentStock(
                          createBrowserSupabaseClient(),
                          {
                            itemId: String(
                              fields.get("transferItemId"),
                            ),
                            fromDepartmentId: String(
                              fields.get("fromDepartmentId"),
                            ),
                            toDepartmentId: String(
                              fields.get("toDepartmentId"),
                            ),
                            quantity: Number(
                              fields.get("transferQuantity"),
                            ),
                            reason: String(
                              fields.get("transferReason"),
                            ),
                          },
                        ),
                      "Stock transferred atomically between departments.",
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
                    <Field label="From department">
                      <select
                        className="odyssey-input"
                        name="fromDepartmentId"
                        required
                      >
                        <option value="" disabled>
                          Source
                        </option>
                        {workspace.departments
                          .filter((department) => department.active)
                          .map((department) => (
                            <option
                              key={department.id}
                              value={department.id}
                            >
                              {department.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field label="To department">
                      <select
                        className="odyssey-input"
                        name="toDepartmentId"
                        required
                      >
                        <option value="" disabled>
                          Destination
                        </option>
                        {workspace.departments
                          .filter((department) => department.active)
                          .map((department) => (
                            <option
                              key={department.id}
                              value={department.id}
                            >
                              {department.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                  </div>
                  <div className="two-column">
                    <Field label="Transfer quantity">
                      <Input
                        name="transferQuantity"
                        type="number"
                        min="0.001"
                        step="0.001"
                        required
                      />
                    </Field>
                    <Field label="Transfer reason">
                      <Input
                        name="transferReason"
                        minLength={2}
                        placeholder="e.g. ER restocking request"
                        required
                      />
                    </Field>
                  </div>
                  <Button disabled={busy} type="submit">
                    {busy ? "Processing…" : "Transfer stock"}
                  </Button>
                </form>
              </Card>
            </TabPanel>

            {/* ── Add item ────────────────────────────────────── */}
            <TabPanel active={activeTab === "add-item"} id="add-item">
              <Card>
                <h3>Register new item master</h3>
                <p className="hint">
                  Add a new consumable or supply to the clinic catalog.
                  Stock quantities are managed separately after adding.
                </p>
                <form
                  className="stack"
                  onSubmit={(event) =>
                    void runForm(
                      event,
                      async (fields) =>
                        createInventoryItem(
                          createBrowserSupabaseClient(),
                          {
                            organizationId,
                            sku: String(fields.get("sku") ?? ""),
                            name: String(fields.get("name") ?? ""),
                            description: String(
                              fields.get("description") ?? "",
                            ),
                            unitOfMeasure: String(
                              fields.get("unit") ?? "",
                            ),
                            unitPrice: Number(fields.get("unitPrice")),
                          },
                        ),
                      "Item added to the master catalog.",
                    )
                  }
                >
                  <div className="two-column">
                    <Field label="SKU / Code">
                      <Input
                        name="sku"
                        maxLength={80}
                        placeholder="e.g. SYR-10ML"
                        required
                      />
                    </Field>
                    <Field label="Item name">
                      <Input
                        name="name"
                        maxLength={200}
                        placeholder="e.g. Syringe 10 mL"
                        required
                      />
                    </Field>
                  </div>
                  <div className="two-column">
                    <Field label="Unit of measure">
                      <Input
                        name="unit"
                        placeholder="piece, vial, box"
                        required
                      />
                    </Field>
                    <Field label="Unit charge (PHP)">
                      <Input
                        name="unitPrice"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue="0"
                        required
                      />
                    </Field>
                  </div>
                  <Field label="Description">
                    <Input
                      name="description"
                      maxLength={500}
                      placeholder="Optional item description"
                    />
                  </Field>
                  <Button disabled={busy} type="submit">
                    {busy ? "Adding…" : "Add item to catalog"}
                  </Button>
                </form>
              </Card>
            </TabPanel>

            {/* ── Add department ───────────────────────────────── */}
            <TabPanel active={activeTab === "add-dept"} id="add-dept">
              <Card>
                <h3>Create stock location</h3>
                <p className="hint">
                  Departments are the stock boundary. Each department
                  maintains its own quantity per item.
                </p>
                <form
                  className="stack"
                  onSubmit={(event) =>
                    void runForm(
                      event,
                      async (fields) =>
                        createDepartment(createBrowserSupabaseClient(), {
                          organizationId,
                          code: String(fields.get("code") ?? ""),
                          name: String(fields.get("name") ?? ""),
                          description: String(
                            fields.get("description") ?? "",
                          ),
                        }),
                      "Department created as a new stock location.",
                    )
                  }
                >
                  <div className="two-column">
                    <Field label="Department code">
                      <Input
                        name="code"
                        maxLength={40}
                        placeholder="e.g. IPD, PHARMACY"
                        required
                      />
                    </Field>
                    <Field label="Department name">
                      <Input
                        name="name"
                        maxLength={120}
                        placeholder="e.g. In-Patient Department"
                        required
                      />
                    </Field>
                  </div>
                  <Field label="Description">
                    <Input
                      name="description"
                      maxLength={500}
                      placeholder="Optional description of this stock location"
                    />
                  </Field>
                  <Button disabled={busy} type="submit">
                    {busy ? "Creating…" : "Create department"}
                  </Button>
                </form>
              </Card>
            </TabPanel>
          </TabGroup>
        </section>
      )}

      {/* ── Consumable tagging ──────────────────────────────── */}
      {canTag && (
        <section>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Clinical usage</p>
              <h2>Tag consumable to encounter</h2>
            </div>
          </div>
          <p className="hint">
            Creates an immutable patient-linked usage record and decrements
            department stock in one atomic transaction.
          </p>
          <form
            className="inv-tag-form"
            onSubmit={(event) =>
              void runForm(
                event,
                async (fields) =>
                  tagInventoryUsage(createBrowserSupabaseClient(), {
                    encounterId: String(fields.get("encounterId")),
                    stockId: String(fields.get("stockId")),
                    quantity: Number(fields.get("usageQuantity")),
                    departmentId: inventoryDepartmentSelection || null,
                  }),
                "Consumable tagged and stock decremented.",
              )
            }
          >
            <Field label="In-progress encounter">
              <select
                className="odyssey-input"
                name="encounterId"
                required
              >
                <option value="">Select encounter</option>
                {encounters.map((encounter) => (
                  <option key={encounter.id} value={encounter.id}>
                    {encounter.serviceType ?? "Clinical encounter"} ·{" "}
                    {encounter.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Department"
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
            <Field label="Department stock">
              <select className="odyssey-input" name="stockId" required>
                <option value="">Select item and location</option>
                {stockRows
                  .filter(
                    (row) =>
                      Number(row.quantity) > 0 &&
                      (!inventoryDepartmentSelection ||
                        row.department_id === inventoryDepartmentSelection),
                  )
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.itemName} · {row.departmentName} (
                      {fmt(Number(row.quantity))})
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Quantity">
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
              disabled={busy || !encounters.length}
              type="submit"
            >
              Tag usage
            </Button>
          </form>
        </section>
      )}

      {/* ── Recent stock activity ───────────────────────────── */}
      {canManage && (
        <section>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Audit trail</p>
              <h2>Recent stock activity</h2>
            </div>
          </div>
          <DataTable
            caption="Append-only inventory movement history."
            data={workspace.movements}
            emptyMessage="No stock movements recorded."
            getRowId={(row) => row.id}
            columns={[
              {
                id: "when",
                header: "When",
                cell: (row) => fmtTime(row.occurred_at),
              },
              {
                id: "type",
                header: "Type",
                cell: (row) => {
                  const label = row.movement_type.replaceAll("_", " ");
                  const variant =
                    row.movement_type === "usage"
                      ? "warning"
                      : row.movement_type.startsWith("transfer")
                        ? "default"
                        : "success";
                  return <Badge variant={variant}>{label}</Badge>;
                },
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
                id: "department",
                header: "Department",
                cell: (row) => {
                  const dept = workspace.departments.find(
                    (d) => d.id === row.department_id,
                  );
                  return dept?.name ?? row.department_id.slice(0, 8);
                },
              },
              {
                id: "quantity",
                header: "Change",
                cell: (row) => {
                  const delta = Number(row.quantity_delta);
                  return (
                    <span
                      className={
                        delta > 0
                          ? "inv-delta--positive"
                          : "inv-delta--negative"
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
                header: "Recorded by",
                cell: (row) => (
                  <span className="inv-actor-name">
                    {row.actorName ?? (row.recorded_by ? row.recorded_by.slice(0, 8) : "System")}
                  </span>
                ),
              },
              {
                id: "reason",
                header: "Reason",
                cell: (row) => row.reason ?? "—",
              },
            ]}
          />
        </section>
      )}

      {/* ── Usage history ───────────────────────────────────── */}
      {canManage && workspace.usages.length > 0 && (
        <section>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Billing source</p>
              <h2>Encounter usage records</h2>
            </div>
            <span className="hint">
              Loop 5 billing reads these records as consumable line items.
            </span>
          </div>
          <DataTable
            caption="Immutable patient-linked usage records for billing."
            data={workspace.usages}
            emptyMessage="No encounter-linked usage records."
            getRowId={(row) => row.id}
            columns={[
              {
                id: "when",
                header: "Used at",
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
                id: "charge",
                header: "Charge",
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
                id: "patient",
                header: "Patient",
                cell: (row) => row.patient_id.slice(0, 8),
              },
              {
                id: "taggedBy",
                header: "Tagged by",
                cell: (row) => (
                  <span className="inv-actor-name">
                    {row.actorName ?? (row.tagged_by ? row.tagged_by.slice(0, 8) : "—")}
                  </span>
                ),
              },
            ]}
          />
        </section>
      )}

      <p role="status" className="inv-status">
        {status}
      </p>
    </main>
  );
}
