"use client";

import {
  getOrganizationFeeSettings,
  getProfessionalFeeOverview,
  listProfessionalFeeHistory,
  setClinicServiceProfessionalFeeBounds,
  setOrganizationFeeModel,
  setProfessionalFeeForPractitioner,
  type FeeModel,
  type OrganizationFeeSettings,
  type ProfessionalFeeHistoryItem,
  type ProfessionalFeeOverviewItem,
} from "@odyssey/supabase-client";
import { History, PencilLine, SlidersHorizontal } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAdminData } from "./admin-data-context";
import { Dialog } from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { PageHeader } from "./page-header";

interface HistoryState {
  data?: ProfessionalFeeHistoryItem[];
  error?: string;
  loading: boolean;
}

function formatCurrency(amount: number | null, currency: string) {
  if (amount === null) return "Not declared";
  return new Intl.NumberFormat("en-PH", { style: "currency", currency }).format(amount);
}

function formatBounds(item: ProfessionalFeeOverviewItem) {
  const minimum = item.min_professional_fee === null ? "No minimum" : `Min ${formatCurrency(item.min_professional_fee, item.currency)}`;
  const maximum = item.max_professional_fee === null ? "No maximum" : `Max ${formatCurrency(item.max_professional_fee, item.currency)}`;
  return `${minimum} · ${maximum}`;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function optionalAmount(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? Number(text) : null;
}

function FeeEntryDialog({
  item,
  onChanged,
}: {
  item: ProfessionalFeeOverviewItem;
  onChanged: () => Promise<void>;
}) {
  const { client } = useAdminData();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get("amount"));
    const effectiveFromValue = String(form.get("effectiveFrom") ?? "");
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Enter a professional fee of zero or more.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    const result = await setProfessionalFeeForPractitioner(client, {
      servicePractitionerId: item.service_practitioner_id,
      amount,
      effectiveFrom: effectiveFromValue ? new Date(effectiveFromValue).toISOString() : undefined,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setSuccess("Professional fee saved. The updated fee is now recorded in its immutable history.");
    await onChanged();
  }

  return (
    <>
      <Button className="fee-action" variant="outline" onClick={() => setOpen(true)}>
        <PencilLine aria-hidden="true" size={16} /> Set fee
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`Set fee for ${item.practitioner_name}`}
        description={`${item.service_name}. The fee is versioned; it does not rewrite prior billing records.`}
      >
        <form className="dialog-body" onSubmit={submit}>
          <label className="field-label">Professional fee ({item.currency})
            <Input name="amount" type="number" min="0" step="0.01" defaultValue={item.current_fee ?? ""} required />
          </label>
          <label className="field-label">Effective from (optional)
            <Input name="effectiveFrom" type="datetime-local" />
          </label>
          <p className="form-status">{formatBounds(item)}</p>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {success ? <p className="form-success" role="status">{success}</p> : null}
          <div className="dialog-actions">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save professional fee"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

function FeeBoundsDialog({
  item,
  onChanged,
}: {
  item: ProfessionalFeeOverviewItem;
  onChanged: () => Promise<void>;
}) {
  const { client } = useAdminData();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const minimum = optionalAmount(form.get("minimum"));
    const maximum = optionalAmount(form.get("maximum"));
    if ((minimum !== null && (!Number.isFinite(minimum) || minimum < 0)) || (maximum !== null && (!Number.isFinite(maximum) || maximum < 0))) {
      setError("Enter fee bounds of zero or greater, or leave a bound blank.");
      return;
    }
    if (minimum !== null && maximum !== null && minimum > maximum) {
      setError("The minimum professional fee cannot exceed the maximum.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    const result = await setClinicServiceProfessionalFeeBounds(client, {
      serviceId: item.service_id,
      minProfessionalFee: minimum,
      maxProfessionalFee: maximum,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setSuccess("Fee bounds saved for this service.");
    await onChanged();
  }

  return (
    <>
      <Button className="fee-action" variant="ghost" onClick={() => setOpen(true)}>
        <SlidersHorizontal aria-hidden="true" size={16} /> Bounds
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`Professional-fee bounds: ${item.service_name}`}
        description="Bounds apply to every practitioner assigned to this service. Leave either value blank to remove that limit."
      >
        <form className="dialog-body" onSubmit={submit}>
          <label className="field-label">Minimum fee ({item.currency})
            <Input name="minimum" type="number" min="0" step="0.01" defaultValue={item.min_professional_fee ?? ""} />
          </label>
          <label className="field-label">Maximum fee ({item.currency})
            <Input name="maximum" type="number" min="0" step="0.01" defaultValue={item.max_professional_fee ?? ""} />
          </label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {success ? <p className="form-success" role="status">{success}</p> : null}
          <div className="dialog-actions">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save bounds"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

function FeeHistoryDisclosure({ item }: { item: ProfessionalFeeOverviewItem }) {
  const { client } = useAdminData();
  const [history, setHistory] = useState<HistoryState>({ loading: false });

  const loadHistory = useCallback(async (force = false) => {
    if (history.loading || (history.data && !force)) return;
    setHistory({ loading: true });
    const result = await listProfessionalFeeHistory(client, item.service_practitioner_id);
    setHistory(result.error
      ? { loading: false, error: result.error.message }
      : { loading: false, data: result.data });
  }, [client, history.data, history.error, history.loading, item.service_practitioner_id]);

  return (
    <details className="fee-history" onToggle={(event) => { if (event.currentTarget.open) void loadHistory(); }}>
      <summary><History aria-hidden="true" size={16} /> View history</summary>
      <div className="fee-history__content" aria-live="polite" aria-busy={history.loading}>
        {history.loading ? <p>Loading immutable fee history…</p> : null}
        {history.error ? <div><p className="form-error" role="alert">{history.error}</p><Button className="fee-history__retry" variant="ghost" onClick={() => void loadHistory(true)}>Retry history</Button></div> : null}
        {history.data?.length === 0 ? <p>No professional fee has been recorded for this assignment.</p> : null}
        {history.data?.length ? <ol>
          {history.data.map((entry) => <li key={entry.id}>
            <strong>{formatCurrency(entry.amount, item.currency)}</strong>
            <span>Effective {formatTimestamp(entry.effective_from)}</span>
          </li>)}
        </ol> : null}
      </div>
    </details>
  );
}

export function ProfessionalFeeManagement() {
  const { client, isSuperadmin, organization, permissions } = useAdminData();
  const [settings, setSettings] = useState<OrganizationFeeSettings | null>(null);
  const [overview, setOverview] = useState<ProfessionalFeeOverviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [changingModel, setChangingModel] = useState(false);
  const [modelMessage, setModelMessage] = useState<string | null>(null);

  const canManage = isSuperadmin || permissions.includes("can_manage_services");
  const load = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    setError(null);
    const [settingsResult, overviewResult] = await Promise.all([
      getOrganizationFeeSettings(client, organization.id),
      getProfessionalFeeOverview(client, organization.id),
    ]);
    if (settingsResult.error || overviewResult.error) {
      setError(settingsResult.error?.message ?? overviewResult.error?.message ?? "Professional fees could not be loaded.");
      setLoading(false);
      return;
    }
    setSettings(settingsResult.data);
    setOverview(overviewResult.data);
    setLoading(false);
  }, [client, organization]);

  useEffect(() => { void load(); }, [load]);

  const serviceCount = useMemo(() => new Set(overview.map((item) => item.service_id)).size, [overview]);

  async function changeModel(feeModel: FeeModel) {
    if (!organization || !settings || feeModel === settings.fee_model || settings.is_government) return;
    setChangingModel(true);
    setModelMessage(null);
    const result = await setOrganizationFeeModel(client, organization.id, feeModel);
    setChangingModel(false);
    if (result.error) {
      setModelMessage(result.error.message);
      return;
    }
    setModelMessage(feeModel === "practitioner_declared"
      ? "Practitioner-declared fees are now active. A practitioner without a fee is not bookable for that service."
      : "Fixed-rate billing is now active. The clinic service price is used for professional fees.");
    await load();
  }

  if (!organization) {
    return <section className="data-loading" aria-live="polite">Loading the selected organization…</section>;
  }

  return (
    <>
      <PageHeader
        eyebrow="Revenue configuration"
        title="Professional fees"
        description="Set the organization fee model, review every service-practitioner fee, and maintain guarded professional-fee limits."
      />
      {error ? <section className="data-error" role="alert"><strong>Professional fees could not be loaded.</strong><p>{error}</p><Button className="fee-action" variant="outline" onClick={() => void load()}>Retry</Button></section> : null}
      {loading ? <section className="data-loading" aria-live="polite" aria-busy="true">Loading professional-fee settings…</section> : null}
      {!loading && settings ? <>
        <section className="panel-section fee-model-panel" aria-labelledby="fee-model-heading">
          <div>
            <p className="section-eyebrow">Organization policy</p>
            <h2 id="fee-model-heading">Fee model</h2>
            <p>{settings.is_government
              ? "Government facilities use fixed rates. The service price remains the only professional fee; clinician overrides are unavailable."
              : "Choose whether the clinic uses the service price or each practitioner’s declared professional fee."}</p>
          </div>
          <fieldset className="fee-model-options" disabled={!canManage || settings.is_government || changingModel}>
            <legend className="sr-only">Professional fee model</legend>
            <label><input type="radio" name="feeModel" checked={settings.fee_model === "fixed_rate"} onChange={() => void changeModel("fixed_rate")} /> <span><strong>Fixed rate</strong><small>Use the clinic service price.</small></span></label>
            {!settings.is_government ? <label><input type="radio" name="feeModel" checked={settings.fee_model === "practitioner_declared"} onChange={() => void changeModel("practitioner_declared")} /> <span><strong>Practitioner-declared</strong><small>Use each doctor’s current fee.</small></span></label> : null}
          </fieldset>
          {modelMessage ? <p className="form-status fee-model-message" role="status">{modelMessage}</p> : null}
        </section>

        <section className="panel-section" aria-labelledby="fee-overview-heading">
          <div className="management-tab-header">
            <div>
              <p className="section-eyebrow">Assigned services</p>
              <h2 id="fee-overview-heading">Fee overview</h2>
              <p>{serviceCount} service{serviceCount === 1 ? "" : "s"} · {overview.length} practitioner assignment{overview.length === 1 ? "" : "s"}</p>
            </div>
          </div>
          {overview.length === 0 ? <p className="table-empty">No active service-practitioner assignments are available for the selected organization.</p> : (
            <div className="fee-overview-table">
              <table>
                <caption className="sr-only">Current professional fee overview</caption>
                <thead><tr><th>Service</th><th>Doctor</th><th>Current fee</th><th>Fee bounds</th><th>Actions</th></tr></thead>
                <tbody>{overview.map((item) => <tr key={item.service_practitioner_id}>
                  <td>{item.service_name}</td>
                  <td>{item.practitioner_name}</td>
                  <td className="money">{formatCurrency(item.current_fee, item.currency)}{item.current_fee_effective_from ? <small>Effective {formatTimestamp(item.current_fee_effective_from)}</small> : null}</td>
                  <td>{formatBounds(item)}</td>
                  <td><div className="fee-actions">
                    {canManage && !settings.is_government && settings.fee_model === "practitioner_declared" ? <FeeEntryDialog item={item} onChanged={load} /> : null}
                    {canManage && !settings.is_government ? <FeeBoundsDialog item={item} onChanged={load} /> : null}
                    <FeeHistoryDisclosure item={item} />
                  </div></td>
                </tr>)}</tbody>
              </table>
            </div>
          )}
        </section>
      </> : null}
    </>
  );
}
