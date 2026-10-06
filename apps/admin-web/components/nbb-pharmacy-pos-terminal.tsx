"use client";

import {
  createNbbPharmacyPosSale,
  getNbbPharmacyPosCatalog,
} from "@odyssey/supabase-client";
import type { NbbPharmacyPosCatalogItem, NbbPosCheckoutResult } from "@odyssey/types";
import { Button } from "@odyssey/ui";
import {
  AlertCircle,
  CheckCircle2,
  Package,
  Pill,
  Plus,
  Minus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminData } from "./admin-data-context";
import { PageHeader } from "./page-header";

interface CartLine {
  catalogItem: NbbPharmacyPosCatalogItem;
  quantity: number;
}

interface NbbPharmacyPosTerminalProps {
  organizationId: string;
  organizationName?: string;
}

const money = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

function formatCentavos(centavos: number | bigint): string {
  const num = typeof centavos === "bigint" ? Number(centavos) : centavos;
  return money.format(num / 100);
}

export function NbbPharmacyPosTerminal({
  organizationId,
  organizationName,
}: NbbPharmacyPosTerminalProps) {
  const { client, permissions } = useAdminData();
  const [catalog, setCatalog] = useState<NbbPharmacyPosCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // Search & Cart state
  const [searchQuery, setSearchQuery] = useState("");
  const [patientName, setPatientName] = useState("");
  const [cart, setCart] = useState<Map<string, CartLine>>(new Map());

  // Checkout submission state
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [completedSale, setCompletedSale] = useState<{
    result: NbbPosCheckoutResult;
    patientName: string;
    items: Array<{ name: string; quantity: number; standardCentavos: number }>;
  } | null>(null);

  const canManagePos = permissions.includes("can_manage_pos");

  const loadCatalog = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    setErrorCode(null);
    setCheckoutError(null);

    const res = await getNbbPharmacyPosCatalog(client, organizationId);
    if (res.error) {
      console.error("Failed to load pharmacy catalog:", res.error);
      const msg = res.error.message || "";
      if (msg.includes("PHARMACY_ASSIGNMENT_REQUIRED")) {
        setErrorCode("PHARMACY_ASSIGNMENT_REQUIRED");
        setError("Pharmacy Department Assignment Required. Only cashiers assigned to the Pharmacy Department can dispense medications.");
      } else if (msg.includes("NBB_FACILITY_REQUIRED")) {
        setErrorCode("NBB_FACILITY_REQUIRED");
        setError("This terminal is available exclusively for No-Balance-Billing facilities.");
      } else if (msg.includes("42501")) {
        setErrorCode("PERMISSION_DENIED");
        setError("You do not have permission to manage POS sales.");
      } else {
        setError(msg ? `Catalog error: ${msg}` : "Unable to load pharmacy inventory catalog. Please try again.");
      }
    } else {
      setCatalog(res.data);
    }
    setLoading(false);
  }, [client, organizationId]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const filteredCatalog = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q)
    );
  }, [catalog, searchQuery]);

  const addToCart = (item: NbbPharmacyPosCatalogItem) => {
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(item.item_id);
      const currentQty = existing ? existing.quantity : 0;
      if (currentQty < item.available_quantity) {
        next.set(item.item_id, {
          catalogItem: item,
          quantity: currentQty + 1,
        });
      }
      return next;
    });
  };

  const updateQuantity = (itemId: string, newQty: number) => {
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(itemId);
      if (!existing) return prev;
      const maxAvailable = existing.catalogItem.available_quantity;
      if (newQty <= 0) {
        next.delete(itemId);
      } else {
        const clampedQty = Math.min(newQty, maxAvailable);
        next.set(itemId, { ...existing, quantity: Math.floor(clampedQty) });
      }
      return next;
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart((prev) => {
      const next = new Map(prev);
      next.delete(itemId);
      return next;
    });
  };

  const clearCart = () => {
    setCart(new Map());
    setCheckoutError(null);
  };

  const cartItemsArray = useMemo(() => Array.from(cart.values()), [cart]);

  const standardTotalInCentavos = useMemo(() => {
    return cartItemsArray.reduce((sum, line) => {
      const priceCents = Number(line.catalogItem.standard_unit_price_in_centavos);
      return sum + priceCents * line.quantity;
    }, 0);
  }, [cartItemsArray]);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setCheckoutError(null);

    const trimmedName = patientName.trim();
    if (!trimmedName) {
      setCheckoutError("Patient name is required.");
      return;
    }

    if (cartItemsArray.length === 0) {
      setCheckoutError("Cart is empty. Please select at least one item.");
      return;
    }

    // Client-side stock re-check
    for (const line of cartItemsArray) {
      if (line.quantity > line.catalogItem.available_quantity) {
        setCheckoutError(
          `Requested quantity for ${line.catalogItem.name} exceeds available pharmacy stock (${line.catalogItem.available_quantity}).`
        );
        return;
      }
    }

    setSubmitting(true);
    const checkoutResult = await createNbbPharmacyPosSale(client, {
      organizationId,
      patientName: trimmedName,
      items: cartItemsArray.map((line) => ({
        item_id: line.catalogItem.item_id,
        quantity: line.quantity,
      })),
    });

    if (checkoutResult.error) {
      const errMsg = checkoutResult.error.message || "";
      if (errMsg.includes("INSUFFICIENT_PHARMACY_STOCK")) {
        setCheckoutError("Insufficient stock in the Pharmacy Department for the requested items.");
      } else if (errMsg.includes("PATIENT_NAME_REQUIRED")) {
        setCheckoutError("Patient name is required.");
      } else if (errMsg.includes("PHARMACY_ASSIGNMENT_REQUIRED")) {
        setCheckoutError("You must be assigned to the Pharmacy Department to dispense medications.");
      } else if (errMsg.includes("NBB_FACILITY_REQUIRED")) {
        setCheckoutError("This terminal is available exclusively for No-Balance-Billing facilities.");
      } else {
        setCheckoutError("Sale failed to complete. Please verify inventory and try again.");
      }
      setSubmitting(false);
      return;
    }

    // Success
    setCompletedSale({
      result: checkoutResult.data,
      patientName: trimmedName,
      items: cartItemsArray.map((l) => ({
        name: l.catalogItem.name,
        quantity: l.quantity,
        standardCentavos: Number(l.catalogItem.standard_unit_price_in_centavos) * l.quantity,
      })),
    });
    setCart(new Map());
    setPatientName("");
    setSubmitting(false);
  };

  const startNewSale = () => {
    setCompletedSale(null);
    setCheckoutError(null);
    void loadCatalog();
  };

  return (
    <div className="nbb-pos-container" style={{ padding: "1.5rem", maxWidth: "1400px", margin: "0 auto" }}>
      <PageHeader
        eyebrow="No-Balance-Billing Terminal"
        title="Pharmacy Point of Sale"
        description={
          organizationName
            ? `Pharmacy dispensing for ${organizationName}. Zero patient liability with standard charge audit trail.`
            : "Pharmacy dispensing with zero patient liability under NBB PhilHealth coverage."
        }
        actions={
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button
              variant="outline"
              onClick={() => void loadCatalog()}
              disabled={loading || submitting}
            >
              <RefreshCw aria-hidden="true" size={16} /> Refresh Stock
            </Button>
          </div>
        }
      />

      {/* Permission or Configuration Error Banners */}
      {!canManagePos ? (
        <section
          className="data-error"
          role="alert"
          style={{
            padding: "1rem",
            marginBottom: "1rem",
            background: "var(--status-danger-bg)",
            border: "1px solid var(--status-danger-border)",
            borderRadius: "0.5rem",
            color: "var(--status-danger)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <AlertCircle size={20} />
            <strong>Access Denied</strong>
          </div>
          <p style={{ marginTop: "0.5rem", marginBottom: 0 }}>
            You do not possess POS management permissions (<code>can_manage_pos</code>) for this clinic.
          </p>
        </section>
      ) : null}

      {error ? (
        <section
          className="data-error"
          role="alert"
          style={{
            padding: "1rem",
            marginBottom: "1rem",
            background: errorCode === "PHARMACY_ASSIGNMENT_REQUIRED" ? "var(--status-warning-bg)" : "var(--status-danger-bg)",
            border: `1px solid ${errorCode === "PHARMACY_ASSIGNMENT_REQUIRED" ? "var(--status-warning-border)" : "var(--status-danger-border)"}`,
            borderRadius: "0.5rem",
            color: errorCode === "PHARMACY_ASSIGNMENT_REQUIRED" ? "var(--status-warning)" : "var(--status-danger)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <AlertCircle size={20} />
            <strong>{errorCode === "PHARMACY_ASSIGNMENT_REQUIRED" ? "Pharmacy Department Assignment Required" : "Catalog Notice"}</strong>
          </div>
          <p style={{ marginTop: "0.5rem", marginBottom: 0 }}>{error}</p>
        </section>
      ) : null}

      {/* Completed Sale Receipt View */}
      {completedSale ? (
        <section
          className="nbb-receipt-card"
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "0.75rem",
            padding: "2rem",
            maxWidth: "700px",
            margin: "2rem auto",
            boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
            <CheckCircle2
              size={56}
              color="var(--status-success)"
              style={{ margin: "0 auto 0.75rem" }}
            />
            <h2 style={{ margin: "0 0 0.25rem", fontSize: "1.5rem" }}>NBB Pharmacy Dispense Completed</h2>
            <p style={{ color: "var(--muted-foreground)", margin: 0 }}>
              Receipt Number: <strong>{completedSale.result.receipt_number}</strong>
            </p>
          </div>

          <div
            style={{
              background: "var(--status-success-bg)",
              border: "1px solid var(--status-success-border)",
              borderRadius: "0.5rem",
              padding: "1rem",
              marginBottom: "1.5rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <span style={{ fontSize: "0.875rem", color: "var(--status-success)", fontWeight: 500 }}>
                Patient Liability (NBB Guarantee)
              </span>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--status-success)" }}>
                {formatCentavos(completedSale.result.patient_balance_due_in_centavos)}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: "0.875rem", color: "var(--muted-foreground)" }}>Standard Audit Charges</span>
              <div style={{ fontSize: "1.125rem", fontWeight: 600 }}>
                {formatCentavos(completedSale.result.standard_total_in_centavos)}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ color: "var(--muted-foreground)" }}>Patient Name</span>
              <strong style={{ fontWeight: 600 }}>{completedSale.patientName}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ color: "var(--muted-foreground)" }}>Coverage Type</span>
              <span>PhilHealth No-Balance-Billing (NBB)</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ color: "var(--muted-foreground)" }}>Invoice Reference</span>
              <code>{completedSale.result.invoice_id}</code>
            </div>
          </div>

          <h3 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Dispensed Items</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "1.5rem", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--muted-foreground)" }}>
                <th style={{ padding: "0.5rem 0" }}>Item</th>
                <th style={{ padding: "0.5rem", textAlign: "center" }}>Qty</th>
                <th style={{ padding: "0.5rem 0", textAlign: "right" }}>Standard Charge</th>
              </tr>
            </thead>
            <tbody>
              {completedSale.items.map((it, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.5rem 0" }}>{it.name}</td>
                  <td style={{ padding: "0.5rem", textAlign: "center" }}>{it.quantity}</td>
                  <td style={{ padding: "0.5rem 0", textAlign: "right" }}>{formatCentavos(it.standardCentavos)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: "flex", justifyContent: "center" }}>
            <Button onClick={startNewSale} style={{ minWidth: "180px" }}>
              <Plus size={16} /> New NBB Sale
            </Button>
          </div>
        </section>
      ) : (
        /* Terminal Active Dispensing Grid */
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 420px",
            gap: "1.5rem",
            alignItems: "start",
          }}
        >
          {/* Left Column: Inventory Search & Catalog */}
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "0.75rem",
              padding: "1.25rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
              <Pill size={20} color="var(--primary)" />
              <h2 style={{ fontSize: "1.125rem", margin: 0, fontWeight: 600 }}>Pharmacy Available Stock</h2>
            </div>

            <div style={{ position: "relative", marginBottom: "1rem" }}>
              <Search
                size={18}
                style={{
                  position: "absolute",
                  left: "0.75rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--muted-foreground)",
                }}
              />
              <input
                type="text"
                placeholder="Search medication name or SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.5rem 0.75rem 0.5rem 2.25rem",
                  borderRadius: "0.375rem",
                  border: "1px solid var(--input)",
                  background: "var(--background)",
                  fontSize: "0.875rem",
                }}
              />
            </div>

            {loading ? (
              <section className="data-loading" aria-live="polite" style={{ padding: "2rem", textAlign: "center" }}>
                Loading pharmacy stock catalog…
              </section>
            ) : filteredCatalog.length === 0 ? (
              <div
                style={{
                  padding: "3rem 1rem",
                  textAlign: "center",
                  color: "var(--muted-foreground)",
                }}
              >
                <Package size={40} style={{ margin: "0 auto 0.5rem", opacity: 0.5 }} />
                <p style={{ margin: 0 }}>
                  {catalog.length === 0
                    ? "No available stock in Pharmacy Department."
                    : "No medication matched your search filter."}
                </p>
              </div>
            ) : (
              <div style={{ display: "grid", gap: "0.75rem" }}>
                {filteredCatalog.map((item) => {
                  const inCartQty = cart.get(item.item_id)?.quantity || 0;
                  const remainingAvailable = item.available_quantity - inCartQty;
                  const isOutOfStock = remainingAvailable <= 0;

                  return (
                    <div
                      key={item.item_id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0.75rem 1rem",
                        border: "1px solid var(--border)",
                        borderRadius: "0.5rem",
                        background: isOutOfStock ? "var(--muted)" : "var(--card)",
                        opacity: isOutOfStock ? 0.7 : 1,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>{item.name}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--muted-foreground)" }}>
                          SKU: {item.sku} • Unit: {item.unit_of_measure}
                        </div>
                        <div style={{ fontSize: "0.8125rem", marginTop: "0.25rem" }}>
                          Standard Rate: <strong>{formatCentavos(item.standard_unit_price_in_centavos)}</strong>
                          <span
                            style={{
                              marginLeft: "0.75rem",
                              color: isOutOfStock ? "var(--status-danger)" : "var(--status-success)",
                              fontWeight: 500,
                            }}
                          >
                            {remainingAvailable} {item.unit_of_measure} available
                          </span>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant={inCartQty > 0 ? "secondary" : "default"}
                        disabled={isOutOfStock || submitting}
                        onClick={() => addToCart(item)}
                      >
                        <Plus size={14} /> Add {inCartQty > 0 ? `(${inCartQty})` : ""}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Required Patient Name & Dispense Cart */}
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "0.75rem",
              padding: "1.25rem",
              position: "sticky",
              top: "1.5rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
              <ShoppingBag size={20} color="var(--primary)" />
              <h2 style={{ fontSize: "1.125rem", margin: 0, fontWeight: 600 }}>Dispense Cart</h2>
              {cartItemsArray.length > 0 && (
                <button
                  type="button"
                  onClick={clearCart}
                  style={{
                    marginLeft: "auto",
                    background: "none",
                    border: "none",
                    color: "var(--status-danger)",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            <form onSubmit={handleCheckout}>
              {/* Required Patient Name Input */}
              <div style={{ marginBottom: "1.25rem" }}>
                <label
                  htmlFor="nbb-patient-name"
                  style={{
                    display: "block",
                    fontWeight: 600,
                    fontSize: "0.875rem",
                    marginBottom: "0.375rem",
                  }}
                >
                  Patient name <span style={{ color: "var(--status-danger)" }}>*</span>
                </label>
                <input
                  id="nbb-patient-name"
                  type="text"
                  required
                  placeholder="Enter patient full name..."
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  disabled={submitting}
                  style={{
                    width: "100%",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "0.375rem",
                    border: "1px solid var(--input)",
                    background: "var(--background)",
                    fontSize: "0.875rem",
                  }}
                />
                <small style={{ color: "var(--muted-foreground)", fontSize: "0.75rem" }}>
                  Required for NBB dispense audit. Free text, not saved as patient profile.
                </small>
              </div>

              {/* Cart Items List */}
              <div style={{ marginBottom: "1.25rem", minHeight: "120px" }}>
                {cartItemsArray.length === 0 ? (
                  <div
                    style={{
                      border: "1px dashed var(--border)",
                      borderRadius: "0.5rem",
                      padding: "2rem 1rem",
                      textAlign: "center",
                      color: "var(--muted-foreground)",
                      fontSize: "0.875rem",
                    }}
                  >
                    No medications added to cart yet.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: "0.5rem", maxHeight: "280px", overflowY: "auto" }}>
                    {cartItemsArray.map(({ catalogItem, quantity }) => (
                      <div
                        key={catalogItem.item_id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "0.5rem 0.75rem",
                          background: "var(--background)",
                          borderRadius: "0.375rem",
                          border: "1px solid var(--border)",
                          fontSize: "0.8125rem",
                        }}
                      >
                        <div style={{ flex: 1, marginRight: "0.5rem" }}>
                          <div style={{ fontWeight: 600 }}>{catalogItem.name}</div>
                          <div style={{ color: "var(--muted-foreground)" }}>
                            {formatCentavos(Number(catalogItem.standard_unit_price_in_centavos) * quantity)}
                          </div>
                        </div>

                        {/* Quantity Controls */}
                        <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                          <button
                            type="button"
                            onClick={() => updateQuantity(catalogItem.item_id, quantity - 1)}
                            disabled={submitting}
                            style={{
                              width: "24px",
                              height: "24px",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: "4px",
                              border: "1px solid var(--border)",
                              background: "var(--card)",
                              cursor: "pointer",
                            }}
                          >
                            <Minus size={12} />
                          </button>
                          <span style={{ minWidth: "24px", textAlign: "center", fontWeight: 600 }}>
                            {quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(catalogItem.item_id, quantity + 1)}
                            disabled={quantity >= catalogItem.available_quantity || submitting}
                            style={{
                              width: "24px",
                              height: "24px",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: "4px",
                              border: "1px solid var(--border)",
                              background: "var(--card)",
                              cursor: quantity >= catalogItem.available_quantity ? "not-allowed" : "pointer",
                              opacity: quantity >= catalogItem.available_quantity ? 0.5 : 1,
                            }}
                          >
                            <Plus size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeFromCart(catalogItem.item_id)}
                            disabled={submitting}
                            style={{
                              marginLeft: "0.25rem",
                              background: "none",
                              border: "none",
                              color: "var(--status-danger)",
                              cursor: "pointer",
                              padding: "2px",
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Staff Audit & Financial Transparency Box */}
              <div
                style={{
                  background: "var(--surface-subtle)",
                  border: "1px solid var(--row-border)",
                  borderRadius: "0.5rem",
                  padding: "0.875rem",
                  marginBottom: "1.25rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                  <span style={{ color: "var(--muted-foreground)", fontSize: "0.8125rem" }}>Standard Audit Total</span>
                  <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                    {formatCentavos(standardTotalInCentavos)}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.875rem" }}>Patient Balance Due</span>
                  <strong style={{ color: "var(--status-success)", fontSize: "1.125rem" }}>
                    ₱0.00
                  </strong>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.375rem",
                    marginTop: "0.5rem",
                    fontSize: "0.75rem",
                    color: "var(--status-success)",
                  }}
                >
                  <ShieldCheck size={14} />
                  <span>No-Balance-Billing: 100% covered. No payment collected.</span>
                </div>
              </div>

              {checkoutError && (
                <div
                  role="alert"
                  style={{
                    padding: "0.75rem",
                    marginBottom: "1rem",
                    background: "var(--status-danger-bg)",
                    border: "1px solid var(--status-danger-border)",
                    borderRadius: "0.375rem",
                    color: "var(--status-danger)",
                    fontSize: "0.8125rem",
                  }}
                >
                  {checkoutError}
                </div>
              )}

              {/* Complete NBB Sale Action */}
              <Button
                type="submit"
                disabled={
                  !patientName.trim() ||
                  cartItemsArray.length === 0 ||
                  submitting ||
                  !canManagePos
                }
                style={{ width: "100%", padding: "0.75rem" }}
              >
                {submitting ? "Processing Sale..." : "Complete NBB sale"}
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
