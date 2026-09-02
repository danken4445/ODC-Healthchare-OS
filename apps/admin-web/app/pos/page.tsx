"use client";

import {
  createBrowserSupabaseClient,
  createPosSale,
  getBillingWorkspace,
  getPortalAccess,
  signInWithPassword,
  signOut,
  hasOrganizationPermission,
  getAccessibleOrganizations,
} from "@odyssey/supabase-client";
import type {
  InventoryItemSummary,
  PaymentMethod,
  PosCartItem,
  PosCheckoutResult,
  PosSaleSummary,
  PublicClinicSummary,
} from "@odyssey/types";
import {
  Button,
  DataTable,
  Field,
  Input,
  Badge,
  CurrencyDisplay,
} from "@odyssey/ui";
import { useEffect, useState, useCallback, type FormEvent } from "react";
import Link from "next/link";

interface CartItem {
  item: InventoryItemSummary;
  quantity: number;
}

export default function PosPage() {
  const [email, setEmail] = useState("front-desk@synthetic.odyssey.test");
  const [password, setPassword] = useState("");
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [accessibleClinics, setAccessibleClinics] = useState<PublicClinicSummary[]>([]);
  const [canManagePos, setCanManagePos] = useState(false);
  const [status, setStatus] = useState("Sign in to access POS.");
  const [submitting, setSubmitting] = useState(false);

  // Inventory items for POS
  const [items, setItems] = useState<InventoryItemSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [posPaymentMethod, setPosPaymentMethod] = useState<PaymentMethod>("cash");

  // Receipt
  const [receipt, setReceipt] = useState<PosCheckoutResult | null>(null);

  // Recent POS sales
  const [posSales, setPosSales] = useState<PosSaleSummary[]>([]);

  async function checkSession() {
    const client = createBrowserSupabaseClient();
    const { data: { session } } = await client.auth.getSession();
    if (session?.user?.email) {
      setSignedInAs(session.user.email);
      const access = await getPortalAccess(client, "admin");
      if (access.data?.allowed) {
        const clinics = await getAccessibleOrganizations(client, access.data.organizationIds);
        if (clinics.data) {
          setAccessibleClinics(clinics.data);
          if (clinics.data.length > 0 && !organizationId) {
            setOrganizationId(clinics.data[0].id);
          }
        }
      }
    }
  }

  const loadItems = useCallback(async () => {
    if (!organizationId) return;
    const client = createBrowserSupabaseClient();
    const canPos = await hasOrganizationPermission(client, organizationId, "can_manage_pos");
    setCanManagePos(!!canPos.data);

    // Load inventory items directly for POS
    const { data, error } = await client
      .from("inventory_items")
      .select("id, organization_id, sku, name, description, unit_of_measure, unit_cost, selling_price, unit_price, currency, active")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name");
    if (data) setItems(data);
    else if (error) setStatus(`Error loading items: ${error.message}`);

    // Load recent POS sales
    const ws = await getBillingWorkspace(client, organizationId);
    if (ws.data) setPosSales(ws.data.pos_sales);
  }, [organizationId]);

  useEffect(() => { void checkSession(); }, []);
  useEffect(() => { if (organizationId) void loadItems(); }, [organizationId, loadItems]);

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const client = createBrowserSupabaseClient();
    const result = await signInWithPassword(client, email, password);
    if (result.error) {
      setStatus(`Sign-in failed: ${result.error.message}`);
    } else {
      await checkSession();
      setStatus("Signed in. Loading POS…");
    }
    setSubmitting(false);
  }

  async function handleSignOut() {
    const client = createBrowserSupabaseClient();
    await signOut(client);
    setSignedInAs(null);
    setOrganizationId(null);
    setItems([]);
    setCart([]);
    setStatus("Signed out.");
  }

  function addToCart(item: InventoryItemSummary) {
    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === item.id);
      if (existing) {
        return prev.map((c) =>
          c.item.id === item.id ? { ...c, quantity: c.quantity + 1 } : c,
        );
      }
      return [...prev, { item, quantity: 1 }];
    });
  }

  function updateCartQuantity(itemId: string, qty: number) {
    if (qty <= 0) {
      setCart((prev) => prev.filter((c) => c.item.id !== itemId));
    } else {
      setCart((prev) =>
        prev.map((c) => (c.item.id === itemId ? { ...c, quantity: qty } : c)),
      );
    }
  }

  function removeFromCart(itemId: string) {
    setCart((prev) => prev.filter((c) => c.item.id !== itemId));
  }

  const cartTotal = cart.reduce(
    (sum, c) => sum + c.quantity * Number(c.item.selling_price),
    0,
  );

  async function handleCheckout() {
    if (!organizationId || cart.length === 0) return;
    setSubmitting(true);
    const client = createBrowserSupabaseClient();
    const posItems: PosCartItem[] = cart.map((c) => ({
      item_id: c.item.id,
      quantity: c.quantity,
    }));
    const result = await createPosSale(
      client,
      organizationId,
      posItems,
      customerName || undefined,
      posPaymentMethod,
    );
    if (result.error) {
      setStatus(`Checkout error: ${result.error.message}`);
    } else {
      setReceipt(result.data);
      setCart([]);
      setCustomerName("");
      setStatus("Sale completed!");
      await loadItems();
    }
    setSubmitting(false);
  }

  const filteredItems = items.filter(
    (item) =>
      !searchQuery ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (!signedInAs) {
    return (
      <main>
        <p className="eyebrow">Odyssey Admin — Point of Sale</p>
        <h1>Sign In</h1>
        <form onSubmit={handleSignIn}>
          <Field label="Email">
            <Input id="pos-email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password">
            <Input id="pos-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button type="submit" disabled={submitting}>Sign In</Button>
        </form>
        <p>{status}</p>
      </main>
    );
  }

  return (
    <main>
      <p className="eyebrow">Odyssey Admin — Point of Sale</p>
      <h1>🛒 POS Retail Operations</h1>
      <p>Signed in as <strong>{signedInAs}</strong> <Button size="sm" variant="ghost" onClick={handleSignOut}>Sign out</Button></p>

      {accessibleClinics.length > 1 && (
        <Field label="Select Clinic">
          <select
            id="pos-clinic-select"
            value={organizationId ?? ""}
            onChange={(e) => setOrganizationId(e.target.value)}
          >
            {accessibleClinics.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
      )}

      <nav style={{ display: "flex", gap: "1rem", margin: "1rem 0" }}>
        <Link href="/billing"><Button variant="outline">💰 Billing Dashboard</Button></Link>
        <Link href="/billing/claims"><Button variant="outline">📋 Claims</Button></Link>
        <Link href="/"><Button variant="ghost">← Dashboard</Button></Link>
      </nav>

      <p>{status}</p>

      {receipt && (
        <section style={{ padding: "1.5rem", background: "#f0faf0", border: "2px solid #4caf50", borderRadius: "0.5rem", marginBottom: "2rem" }}>
          <h2 style={{ marginTop: 0 }}>✅ Receipt</h2>
          <p><strong>Receipt #:</strong> {receipt.receipt_number}</p>
          <p><strong>Total:</strong> <CurrencyDisplay amount={receipt.total} /></p>
          <Button size="sm" variant="ghost" onClick={() => setReceipt(null)}>Dismiss</Button>
        </section>
      )}

      {canManagePos && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
          {/* Item Catalog */}
          <section>
            <h2>Item Catalog</h2>
            <Field label="Search items">
              <Input
                id="pos-search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Name or SKU…"
              />
            </Field>
            <DataTable<InventoryItemSummary>
              caption="Available items"
              data={filteredItems}
              getRowId={(row) => row.id}
              columns={[
                { id: "name", header: "Item", cell: (r) => r.name },
                { id: "sku", header: "SKU", cell: (r) => <Badge variant="muted">{r.sku}</Badge> },
                { id: "price", header: "Price", cell: (r) => <CurrencyDisplay amount={Number(r.selling_price)} /> },
                {
                  id: "add",
                  header: "",
                  cell: (r) => (
                    <Button size="sm" onClick={() => addToCart(r)}>
                      + Add
                    </Button>
                  ),
                },
              ]}
              emptyMessage="No items found."
            />
          </section>

          {/* Cart */}
          <section>
            <h2>🛒 Cart ({cart.length} items)</h2>
            {cart.length === 0 ? (
              <p style={{ color: "var(--odyssey-muted-foreground)" }}>Cart is empty. Add items from the catalog.</p>
            ) : (
              <>
                <table className="odyssey-table" style={{ marginBottom: "1rem" }}>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Price</th>
                      <th>Subtotal</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((c) => (
                      <tr key={c.item.id}>
                        <td>{c.item.name}</td>
                        <td>
                          <Input
                            type="number"
                            min="1"
                            style={{ width: "4rem" }}
                            value={c.quantity}
                            onChange={(e) => updateCartQuantity(c.item.id, Number(e.target.value))}
                          />
                        </td>
                        <td><CurrencyDisplay amount={Number(c.item.selling_price)} /></td>
                        <td><CurrencyDisplay amount={c.quantity * Number(c.item.selling_price)} /></td>
                        <td>
                          <Button size="sm" variant="destructive" onClick={() => removeFromCart(c.item.id)}>×</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3} style={{ textAlign: "right", fontWeight: 700 }}>Total:</td>
                      <td><CurrencyDisplay amount={cartTotal} /></td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>

                <Field label="Customer Name (optional)">
                  <Input
                    id="pos-customer"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Walk-in customer"
                  />
                </Field>
                <Field label="Payment Method">
                  <select
                    id="pos-pay-method"
                    value={posPaymentMethod}
                    onChange={(e) => setPosPaymentMethod(e.target.value as PaymentMethod)}
                  >
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="qr_ewallet">QR / E-Wallet</option>
                  </select>
                </Field>
                <Button disabled={submitting || cart.length === 0} onClick={handleCheckout}>
                  Complete Sale — <CurrencyDisplay amount={cartTotal} />
                </Button>
              </>
            )}
          </section>
        </div>
      )}

      <h2>Recent POS Sales</h2>
      <DataTable<PosSaleSummary>
        caption="Recent POS transactions"
        data={posSales}
        getRowId={(row) => row.id}
        columns={[
          { id: "receipt", header: "Receipt #", cell: (r) => r.receipt_number },
          { id: "customer", header: "Customer", cell: (r) => r.customer_name ?? "Walk-in" },
          { id: "total", header: "Total", cell: (r) => <CurrencyDisplay amount={r.total} /> },
          { id: "status", header: "Status", cell: (r) => <Badge variant={r.status === "completed" ? "success" : "muted"}>{r.status}</Badge> },
          { id: "date", header: "Completed", cell: (r) => r.completed_at ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(r.completed_at)) : "—" },
        ]}
        emptyMessage="No POS sales yet."
      />
    </main>
  );
}
