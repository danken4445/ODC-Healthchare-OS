"use client";

import {
  getOrganizationFacilityClassification,
  setOrganizationFacilityClassification,
} from "@odyssey/supabase-client";
import type { FacilityClassification, PayorType } from "@odyssey/types";
import {
  AlertCircle,
  Building,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  Landmark,
  Lock,
  Receipt,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAdminData } from "./admin-data-context";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";

interface FacilityClassificationToggleProps {
  organizationId: string;
  organizationName?: string;
  onChanged?: (newClassification: FacilityClassification) => void;
  className?: string;
}

export function FacilityClassificationToggle({
  organizationId,
  organizationName,
  onChanged,
  className = "",
}: FacilityClassificationToggleProps) {
  const { client, isSuperadmin, permissions } = useAdminData();
  const [classification, setClassification] = useState<FacilityClassification | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Confirmation modal state
  const [pendingTarget, setPendingTarget] = useState<PayorType | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    const result = await getOrganizationFacilityClassification(client, organizationId);
    if (result.error) {
      setError(result.error.message);
    } else {
      setClassification(result.data);
    }
    setLoading(false);
  }, [client, organizationId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const canManage = Boolean(
    classification?.canManage ||
      isSuperadmin ||
      permissions.includes("can_manage_clinic_branding")
  );
  const isGovernmentNbb = classification?.defaultPayorType === "philhealth_nbb";

  function handleInitiateSwitch(target: PayorType) {
    if (!canManage) return;
    if (classification?.defaultPayorType === target) return;
    setPendingTarget(target);
    setConfirmOpen(true);
  }

  async function handleConfirmSwitch() {
    if (!pendingTarget || !organizationId) return;
    setSaving(true);
    setError(null);
    setStatusMessage(null);

    const result = await setOrganizationFacilityClassification(
      client,
      organizationId,
      pendingTarget,
    );

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    const updatedClassification: FacilityClassification = {
      organizationId: result.data.organizationId,
      defaultPayorType: result.data.defaultPayorType,
      isGovernmentNoBilling: result.data.isGovernmentNoBilling,
      canManage: true,
    };

    setClassification(updatedClassification);
    setConfirmOpen(false);
    setSaving(false);
    setPendingTarget(null);

    const modeName =
      pendingTarget === "philhealth_nbb"
        ? "Government No-Billing Facility (PhilHealth NBB)"
        : "Private Hospital (Standard Invoicing)";
    setStatusMessage(`Facility operating classification successfully changed to ${modeName}.`);

    onChanged?.(updatedClassification);
  }

  return (
    <section className={`facility-classification-section ${className}`} aria-labelledby="facility-classification-heading">
      <div className="facility-classification-header">
        <div className="section-title">
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <h2 id="facility-classification-heading" style={{ margin: 0 }}>
              Hospital Operating Classification & Billing Route
            </h2>
            {classification && (
              <span
                className={`facility-badge ${
                  isGovernmentNbb ? "facility-badge--government" : "facility-badge--private"
                }`}
              >
                {isGovernmentNbb ? (
                  <>
                    <Landmark size={13} aria-hidden="true" />
                    Government No-Billing (PhilHealth NBB)
                  </>
                ) : (
                  <>
                    <Building size={13} aria-hidden="true" />
                    Private Hospital (Standard Billing)
                  </>
                )}
              </span>
            )}
          </div>
          <p style={{ margin: "0.25rem 0 0", color: "var(--muted-foreground)", fontSize: "0.875rem" }}>
            Controls whether {organizationName ? <strong>{organizationName}</strong> : "this facility"} operates
            under the 100% PhilHealth No Balance Billing (NBB) guarantee or standard private hospital patient invoicing.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={() => void loadData()}
          disabled={loading}
          aria-label="Refresh facility classification"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {/* Permission Restriction Notice for Non-Admins */}
      {!canManage && !loading && (
        <div
          className="facility-admin-lock-notice"
          role="note"
          aria-label="Administrative access required"
        >
          <Lock size={18} className="facility-admin-lock-icon" aria-hidden="true" />
          <div>
            <strong>Restricted to Hospital Administrators</strong>
            <p>
              Only designated administrators (admin or owner) of this facility can modify its operational
              classification. Clinicians, nurses, front-desk staff, and unassigned accounts have read-only visibility.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="facility-alert facility-alert--error" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {statusMessage && (
        <div className="facility-alert facility-alert--success" role="status">
          <CheckCircle2 size={16} aria-hidden="true" />
          <span>{statusMessage}</span>
        </div>
      )}

      {loading && !classification ? (
        <p className="data-loading" style={{ margin: "1rem 0" }}>
          Loading facility classification…
        </p>
      ) : (
        <div className="facility-toggle-grid" role="radiogroup" aria-labelledby="facility-classification-heading">
          {/* Option 1: Government No-Billing Facility */}
          <div
            className={`facility-toggle-card ${
              isGovernmentNbb ? "facility-toggle-card--active" : ""
            } ${!canManage ? "facility-toggle-card--disabled" : ""}`}
            onClick={() => canManage && handleInitiateSwitch("philhealth_nbb")}
            role="radio"
            aria-checked={isGovernmentNbb}
            tabIndex={canManage ? 0 : -1}
            onKeyDown={(e) => {
              if (canManage && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                handleInitiateSwitch("philhealth_nbb");
              }
            }}
          >
            <div className="facility-toggle-card__top">
              <div className="facility-toggle-card__icon-wrapper facility-toggle-card__icon-wrapper--government">
                <Landmark size={22} aria-hidden="true" />
              </div>
              <div className="facility-toggle-card__header-text">
                <span className="facility-toggle-card__category">Government Healthcare Facility</span>
                <h3 className="facility-toggle-card__title">Government No-Billing Facility</h3>
              </div>
              <div className="facility-toggle-card__radio-indicator">
                <span className={`facility-radio-dot ${isGovernmentNbb ? "facility-radio-dot--selected" : ""}`}>
                  {isGovernmentNbb && <Check size={12} strokeWidth={3} aria-hidden="true" />}
                </span>
              </div>
            </div>

            <p className="facility-toggle-card__description">
              Configures the hospital under the <strong>PhilHealth No Balance Billing (NBB)</strong> policy. Patient
              out-of-pocket obligation is guaranteed at ₱0.
            </p>

            <ul className="facility-toggle-card__features" aria-label="Government No-Billing Features">
              <li>
                <Check size={14} className="feature-check" aria-hidden="true" />
                <span><strong>₱0 Patient Balance:</strong> Zero out-of-pocket payment required from covered patients.</span>
              </li>
              <li>
                <FileSpreadsheet size={14} className="feature-check" aria-hidden="true" />
                <span><strong>Automatic PhilHealth Claim:</strong> Itemized charges automatically route to PhilHealth institutional claims.</span>
              </li>
              <li>
                <Receipt size={14} className="feature-check" aria-hidden="true" />
                <span><strong>₱0 Paid Invoice:</strong> System generates a verified zero-due invoice for the patient’s records.</span>
              </li>
            </ul>

            <div className="facility-toggle-card__footer">
              {isGovernmentNbb ? (
                <span className="facility-active-badge facility-active-badge--gov">
                  <Check size={14} aria-hidden="true" /> Active Facility Mode
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  disabled={!canManage}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleInitiateSwitch("philhealth_nbb");
                  }}
                >
                  Switch to Government NBB
                </Button>
              )}
            </div>
          </div>

          {/* Option 2: Private Hospital */}
          <div
            className={`facility-toggle-card ${
              !isGovernmentNbb ? "facility-toggle-card--active" : ""
            } ${!canManage ? "facility-toggle-card--disabled" : ""}`}
            onClick={() => canManage && handleInitiateSwitch("self_pay")}
            role="radio"
            aria-checked={!isGovernmentNbb}
            tabIndex={canManage ? 0 : -1}
            onKeyDown={(e) => {
              if (canManage && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                handleInitiateSwitch("self_pay");
              }
            }}
          >
            <div className="facility-toggle-card__top">
              <div className="facility-toggle-card__icon-wrapper facility-toggle-card__icon-wrapper--private">
                <Building size={22} aria-hidden="true" />
              </div>
              <div className="facility-toggle-card__header-text">
                <span className="facility-toggle-card__category">Private Healthcare Institution</span>
                <h3 className="facility-toggle-card__title">Private Hospital</h3>
              </div>
              <div className="facility-toggle-card__radio-indicator">
                <span className={`facility-radio-dot ${!isGovernmentNbb ? "facility-radio-dot--selected" : ""}`}>
                  {!isGovernmentNbb && <Check size={12} strokeWidth={3} aria-hidden="true" />}
                </span>
              </div>
            </div>

            <p className="facility-toggle-card__description">
              Configures the hospital under <strong>standard private healthcare billing</strong>. Patients receive
              itemized invoices with QR, cash, or card checkout.
            </p>

            <ul className="facility-toggle-card__features" aria-label="Private Hospital Features">
              <li>
                <Check size={14} className="feature-check" aria-hidden="true" />
                <span><strong>Itemized Patient Invoicing:</strong> Standard catalog charges and consumables billed to the patient.</span>
              </li>
              <li>
                <Receipt size={14} className="feature-check" aria-hidden="true" />
                <span><strong>Multi-Channel Payment:</strong> Generates QR tokens, accepting Cash, Card, and Bank transfers.</span>
              </li>
              <li>
                <ShieldCheck size={14} className="feature-check" aria-hidden="true" />
                <span><strong>Corporate HMO Guarantees:</strong> Claims processed according to specific patient HMO / LOA coverages.</span>
              </li>
            </ul>

            <div className="facility-toggle-card__footer">
              {!isGovernmentNbb ? (
                <span className="facility-active-badge facility-active-badge--private">
                  <Check size={14} aria-hidden="true" /> Active Facility Mode
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  disabled={!canManage}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleInitiateSwitch("self_pay");
                  }}
                >
                  Switch to Private Hospital
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={
          pendingTarget === "philhealth_nbb"
            ? "Switch to Government No-Billing Facility?"
            : "Switch to Private Hospital?"
        }
        description="This change takes effect immediately for all future encounters, billing events, and patient invoices."
      >
        <div className="dialog-body">
          <div className="confirmation-summary">
            <span>Selected Hospital</span>
            <strong>{organizationName || "Current Organization"}</strong>
          </div>

          <div className="confirmation-summary">
            <span>Operating Mode Switch</span>
            <strong>
              {isGovernmentNbb
                ? "Government No-Billing → Private Hospital"
                : "Private Hospital → Government No-Billing"}
            </strong>
          </div>

          <div
            style={{
              padding: "0.85rem",
              borderRadius: "0.375rem",
              background: pendingTarget === "philhealth_nbb" ? "#f0fdf4" : "#f0f9ff",
              border: `1px solid ${pendingTarget === "philhealth_nbb" ? "#bbf7d0" : "#bae6fd"}`,
              fontSize: "0.875rem",
              color: "var(--foreground)",
              lineHeight: "1.4",
            }}
          >
            {pendingTarget === "philhealth_nbb" ? (
              <>
                <strong>PhilHealth No Balance Billing (NBB) will be enabled:</strong>
                <p style={{ margin: "0.35rem 0 0" }}>
                  Completed patient encounters will generate claims filed directly with PhilHealth, and patients will be
                  issued a ₱0 balance receipt.
                </p>
              </>
            ) : (
              <>
                <strong>Private Hospital Billing will be enabled:</strong>
                <p style={{ margin: "0.35rem 0 0" }}>
                  Completed encounters will generate standard patient invoices with due balances payable via cashier or QR code.
                </p>
              </>
            )}
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="dialog-actions">
            <Button variant="outline" type="button" onClick={() => setConfirmOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={() => void handleConfirmSwitch()}
            >
              {saving ? "Updating mode…" : "Confirm and apply"}
            </Button>
          </div>
        </div>
      </Dialog>
    </section>
  );
}
