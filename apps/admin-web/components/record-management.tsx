"use client";

import {
  adjudicateClaim,
  assignStaffDepartment,
  bookAppointmentSlot,
  createClinicAccount,
  createPosSale,
  finalizeBillingEvent,
  generateBillingEvent,
  getAvailableAppointmentSlots,
  getBillableEncounters,
  getClinicRoleDefinitions,
  getGovernancePatients,
  getStaffAdministration,
  recordPayment,
  saveAdminClinicService,
  saveClinicRoleDefinition,
  saveCompanyCoverage,
  saveDocumentTemplate,
  saveStaffDepartment,
  setClinicUserActive,
  setGovernancePatientActive,
  setOrganizationModule,
  submitClaim,
  updateAppointmentStatus,
} from "@odyssey/supabase-client";
import type {
  AppointmentDeliveryMode,
  AppointmentSlotSummary,
  BillableEncounter,
  ClinicRoleDefinition,
  DocumentTemplateCategory,
  GovernancePatientSummary,
  InventoryItemSummary,
  OrganizationModuleKey,
  PaymentMethod,
} from "@odyssey/types";
import { Edit3, ExternalLink, Plus, Power, ReceiptText } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  featurePermissions,
  permissionOptions,
  portalPermissions,
  type AdminDataset,
} from "../lib/admin-data";
import { useAdminData } from "./admin-data-context";
import type { DataRow } from "./data-table";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Input } from "./ui/input";

type ManagementProps = {
  dataset: AdminDataset;
  label?: string;
  onChanged: () => void;
  row?: DataRow;
};

type SelectOption = { id: string; label: string };
type PosItem = Pick<InventoryItemSummary, "id" | "name" | "sku" | "selling_price"> & { stock: number };

const permissionByDataset = {
  patients: "can_manage_patients",
  appointments: "can_manage_appointments",
  billing: "can_manage_billing",
  claims: "can_manage_claims",
  companies: "can_manage_billing",
  pos: "can_manage_pos",
  staff: "can_manage_staff_roles",
  departments: "can_manage_staff_roles",
  roles: "can_manage_staff_roles",
  services: "can_manage_service_catalog",
  templates: "can_manage_document_templates",
  features: "can_manage_feature_modules",
} as const;

const editableDatasets = new Set<AdminDataset>([
  "appointments",
  "billing",
  "companies",
  "pos",
  "staff",
  "departments",
  "roles",
  "services",
  "templates",
  "admins",
  "clinics",
]);

function value(row: DataRow | undefined, key: string, fallback = "") {
  const candidate = row?.[key];
  return typeof candidate === "string" || typeof candidate === "number" ? String(candidate) : fallback;
}

function checked(row: DataRow | undefined, key: string, fallback: boolean) {
  return typeof row?.[key] === "boolean" ? Boolean(row[key]) : fallback;
}

function formatSlot(slot: AppointmentSlotSummary) {
  const start = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(slot.start_at));
  return `${start} · ${slot.service_type}`;
}

function Field({ children, label, span = false }: { children: React.ReactNode; label: string; span?: boolean }) {
  return <label className={`field-label${span ? " field-span" : ""}`}>{label}{children}</label>;
}

function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="ui-input" {...props}>{children}</select>;
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="ui-input ui-textarea" {...props} />;
}

function useCanManage(dataset: AdminDataset) {
  const { isSuperadmin, permissions } = useAdminData();
  if (dataset === "companies") return isSuperadmin || permissions.includes("can_manage_billing") || permissions.includes("can_manage_claims");
  const permission = permissionByDataset[dataset as keyof typeof permissionByDataset];
  return isSuperadmin || Boolean(permission && permissions.includes(permission));
}

function RecordEditorDialog({ dataset, label, onChanged, row }: ManagementProps) {
  const { client, organization } = useAdminData();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patients, setPatients] = useState<GovernancePatientSummary[]>([]);
  const [slots, setSlots] = useState<AppointmentSlotSummary[]>([]);
  const [encounters, setEncounters] = useState<BillableEncounter[]>([]);
  const [roles, setRoles] = useState<ClinicRoleDefinition[]>([]);
  const [departments, setDepartments] = useState<SelectOption[]>([]);
  const [posItems, setPosItems] = useState<PosItem[]>([]);
  const editing = Boolean(row);

  const loadOptions = useCallback(async () => {
    if (!organization) return;
    setLoadingOptions(true);
    setError(null);
    if (dataset === "appointments" || dataset === "companies") {
      const patientResult = await getGovernancePatients(client, organization.id);
      if (patientResult.error) setError(patientResult.error.message);
      else setPatients(patientResult.data);
      if (dataset === "appointments") {
        const slotResult = await getAvailableAppointmentSlots(client, organization.id);
        if (slotResult.error) setError(slotResult.error.message);
        else setSlots(slotResult.data);
      }
    } else if (dataset === "billing") {
      const result = await getBillableEncounters(client, organization.id);
      if (result.error) setError(result.error.message);
      else setEncounters(result.data);
    } else if (dataset === "staff") {
      const [roleResult, staffResult] = await Promise.all([
        getClinicRoleDefinitions(client, organization.id),
        getStaffAdministration(client, organization.id),
      ]);
      if (roleResult.error) setError(roleResult.error.message);
      else setRoles(roleResult.data);
      if (staffResult.error) setError(staffResult.error.message);
      else setDepartments(staffResult.data.departments.filter((department) => department.active).map((department) => ({ id: department.id, label: department.name })));
    } else if (dataset === "pos") {
      const [itemResult, stockResult] = await Promise.all([
        client.from("inventory_items").select("id, name, sku, selling_price").eq("organization_id", organization.id).eq("active", true).order("name"),
        client.from("department_stock").select("item_id, quantity").eq("organization_id", organization.id),
      ]);
      if (itemResult.error || stockResult.error) setError(itemResult.error?.message ?? stockResult.error?.message ?? "Inventory could not be loaded.");
      else {
        const stock = new Map<string, number>();
        for (const item of stockResult.data ?? []) stock.set(item.item_id, (stock.get(item.item_id) ?? 0) + Number(item.quantity));
        setPosItems((itemResult.data ?? []).map((item) => ({ ...item, stock: stock.get(item.id) ?? 0 })));
      }
    }
    setLoadingOptions(false);
  }, [client, dataset, organization]);

  useEffect(() => {
    if (open) void loadOptions();
  }, [loadOptions, open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organization) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    let result: { error: { message: string } | null } = { error: { message: "This operation is not available." } };

    if (dataset === "services") {
      const deliveryModes = [form.get("inPerson") ? "in_person" : null, form.get("virtual") ? "virtual" : null].filter(Boolean) as AppointmentDeliveryMode[];
      result = await saveAdminClinicService(client, organization.id, {
        id: row ? value(row, "id") : undefined,
        name: String(form.get("name") ?? "").trim(),
        description: String(form.get("description") ?? "").trim(),
        durationMinutes: Number(form.get("durationMinutes")),
        basePrice: Number(form.get("basePrice")),
        currency: String(form.get("currency") ?? "PHP"),
        bookingEnabled: Boolean(form.get("bookingEnabled")),
        active: Boolean(form.get("active")),
        deliveryModes,
      });
    } else if (dataset === "templates") {
      result = await saveDocumentTemplate(client, organization.id, {
        id: row ? value(row, "id") : undefined,
        name: String(form.get("name") ?? "").trim(),
        category: String(form.get("category")) as DocumentTemplateCategory,
        description: String(form.get("description") ?? "").trim(),
        body: String(form.get("body") ?? ""),
        active: Boolean(form.get("active")),
      });
    } else if (dataset === "staff" && !editing) {
      const accountResult = await createClinicAccount(client, {
        organizationId: organization.id,
        displayName: String(form.get("displayName") ?? "").trim(),
        email: String(form.get("email") ?? "").trim(),
        password: String(form.get("password") ?? ""),
        roleCode: String(form.get("roleCode") ?? "front_desk"),
      });
      result = accountResult;
      if (!accountResult.error && accountResult.data && form.get("departmentId")) {
        result = await assignStaffDepartment(client, { organizationId: organization.id, userId: accountResult.data.id, departmentId: String(form.get("departmentId")) });
      }
    } else if (dataset === "staff" && editing) {
      result = await assignStaffDepartment(client, { organizationId: organization.id, userId: value(row, "id"), departmentId: String(form.get("departmentId") || "") || null });
    } else if (dataset === "appointments") {
      result = await bookAppointmentSlot(client, String(form.get("slotId")), String(form.get("patientId")), String(form.get("deliveryMode")) as AppointmentDeliveryMode);
    } else if (dataset === "billing") {
      const generated = await generateBillingEvent(client, organization.id, String(form.get("encounterId")), (String(form.get("payorType")) || undefined) as "self_pay" | "hmo" | "philhealth_nbb" | "government_subsidized" | undefined);
      result = generated;
      if (!generated.error && generated.data) result = await finalizeBillingEvent(client, generated.data);
    } else if (dataset === "companies") {
      result = await saveCompanyCoverage(client, {
        organizationId: organization.id,
        id: row ? value(row, "id") : undefined,
        patientId: String(form.get("patientId")),
        coverageType: String(form.get("coverageType")),
        subscriberId: String(form.get("subscriberId") || "") || undefined,
        payorName: String(form.get("company") ?? "").trim(),
        periodStart: String(form.get("periodStart") || "") || undefined,
        periodEnd: String(form.get("periodEnd") || "") || undefined,
        status: String(form.get("status")),
      });
    } else if (dataset === "pos") {
      result = await createPosSale(client, organization.id, [{ item_id: String(form.get("itemId")), quantity: Number(form.get("quantity")) }], String(form.get("customerName") || "") || undefined, String(form.get("paymentMethod")) as PaymentMethod);
    } else if (dataset === "admins") {
      result = await createClinicAccount(client, {
        organizationId: organization.id,
        displayName: String(form.get("displayName") ?? "").trim(),
        email: String(form.get("email") ?? "").trim(),
        password: String(form.get("password") ?? ""),
        roleCode: "admin",
      });
    } else if (dataset === "clinics" && row) {
      const response = await client.from("organizations").update({ name: String(form.get("name") ?? "").trim(), active: Boolean(form.get("active")) }).eq("id", value(row, "id"));
      result = { error: response.error };
    }

    setSaving(false);
    if (result.error) return setError(result.error.message);
    setOpen(false);
    onChanged();
  }

  const title = editing ? `Edit ${label?.toLowerCase() ?? "record"}` : label ?? "Create record";
  return (
    <>
      <Button size={editing ? "sm" : "md"} variant={editing ? "outline" : "primary"} onClick={() => setOpen(true)}>
        {editing ? <Edit3 aria-hidden="true" size={14} /> : dataset === "billing" ? <ReceiptText aria-hidden="true" size={16} /> : <Plus aria-hidden="true" size={16} />}
        {editing ? "Edit" : label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={title} description="Changes are saved to the selected organization and remain subject to database permissions and audit logging.">
        <form className="dialog-body" onSubmit={submit}>
          {loadingOptions ? <p className="form-status" aria-live="polite">Loading available records…</p> : null}
          {dataset === "services" ? <div className="form-grid">
            <Field label="Service name"><Input name="name" defaultValue={value(row, "name")} required /></Field>
            <Field label="Duration (minutes)"><Input name="durationMinutes" type="number" min="5" defaultValue={value(row, "durationMinutes", "30")} required /></Field>
            <Field label="Base price"><Input name="basePrice" type="number" min="0" step="0.01" defaultValue={value(row, "basePrice", "0")} required /></Field>
            <Field label="Currency"><Input name="currency" defaultValue={value(row, "currency", "PHP")} maxLength={3} required /></Field>
            <Field label="Description" span><Textarea name="description" defaultValue={value(row, "description")} /></Field>
            <label className="check-option"><input name="inPerson" type="checkbox" defaultChecked={!row || value(row, "deliveryModes").includes("in_person")} /> In-person</label>
            <label className="check-option"><input name="virtual" type="checkbox" defaultChecked={value(row, "deliveryModes").includes("virtual")} /> Virtual</label>
            <label className="check-option"><input name="bookingEnabled" type="checkbox" defaultChecked={checked(row, "bookingEnabled", true)} /> Available for booking</label>
            <label className="check-option"><input name="active" type="checkbox" defaultChecked={checked(row, "active", true)} /> Active</label>
          </div> : null}

          {dataset === "templates" ? <div className="form-grid">
            <Field label="Template name"><Input name="name" defaultValue={value(row, "name")} required /></Field>
            <Field label="Category"><Select name="category" defaultValue={value(row, "categoryCode", "general")}><option value="medical_certificate">Medical certificate</option><option value="prescription">Prescription</option><option value="referral">Referral</option><option value="laboratory">Laboratory</option><option value="invoice">Invoice</option><option value="general">General</option></Select></Field>
            <Field label="Description" span><Input name="description" defaultValue={value(row, "description")} /></Field>
            <Field label="Template body" span><Textarea name="body" defaultValue={value(row, "body")} required /></Field>
            <label className="check-option field-span"><input name="active" type="checkbox" defaultChecked={checked(row, "active", true)} /> Active and available to staff</label>
          </div> : null}

          {dataset === "staff" ? <div className="form-grid">
            {!editing ? <><Field label="Full name"><Input name="displayName" required /></Field><Field label="Work email"><Input name="email" type="email" required /></Field><Field label="Temporary password"><Input name="password" type="password" minLength={8} required /></Field><Field label="Role"><Select name="roleCode" defaultValue="front_desk">{roles.map((role) => <option key={role.code} value={role.code}>{role.name}</option>)}</Select></Field></> : <div className="confirmation-summary field-span"><span>Staff member</span><strong>{value(row, "name")}</strong></div>}
            <Field label="Department" span><Select name="departmentId" defaultValue={value(row, "departmentId")}><option value="">Not assigned</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.label}</option>)}</Select></Field>
          </div> : null}

          {dataset === "appointments" ? <div className="form-grid">
            <Field label="Patient"><Select name="patientId" required><option value="">Select patient</option>{patients.filter((patient) => patient.active).map((patient) => <option key={patient.patientId} value={patient.patientId}>{patient.displayName}</option>)}</Select></Field>
            <Field label="Delivery mode"><Select name="deliveryMode" defaultValue="in_person"><option value="in_person">In-person</option><option value="virtual">Virtual</option></Select></Field>
            <Field label="Available slot" span><Select name="slotId" required><option value="">Select date and time</option>{slots.map((slot) => <option key={slot.id} value={slot.id}>{formatSlot(slot)}</option>)}</Select></Field>
          </div> : null}

          {dataset === "billing" ? <div className="form-grid">
            <Field label="Completed encounter" span><Select name="encounterId" required><option value="">Select encounter</option>{encounters.map((encounter) => <option key={encounter.id} value={encounter.id}>{encounter.patient_name} · {encounter.service_name ?? encounter.service_type ?? "Encounter"}</option>)}</Select></Field>
            <Field label="Payor route" span><Select name="payorType" defaultValue=""><option value="">Use recorded coverage</option><option value="self_pay">Self-pay invoice</option><option value="hmo">HMO claim</option><option value="philhealth_nbb">PhilHealth NBB claim</option><option value="government_subsidized">Government-subsidized claim</option></Select></Field>
          </div> : null}

          {dataset === "companies" ? <div className="form-grid">
            <Field label="Company / payor"><Input name="company" defaultValue={value(row, "company")} required /></Field>
            <Field label="Subscriber ID"><Input name="subscriberId" defaultValue={value(row, "subscriberId")} /></Field>
            <Field label="Covered patient"><Select name="patientId" defaultValue={value(row, "patientId")} required><option value="">Select patient</option>{patients.map((patient) => <option key={patient.patientId} value={patient.patientId}>{patient.displayName}</option>)}</Select></Field>
            <Field label="Coverage type"><Select name="coverageType" defaultValue={value(row, "coverageTypeCode", "employer_sponsored")}><option value="employer_sponsored">Employer sponsored</option><option value="company">Company</option><option value="corporate">Corporate</option><option value="employer">Employer</option></Select></Field>
            <Field label="Start date"><Input name="periodStart" type="date" defaultValue={value(row, "periodStart")} /></Field>
            <Field label="End date"><Input name="periodEnd" type="date" defaultValue={value(row, "periodEnd")} /></Field>
            <Field label="Status" span><Select name="status" defaultValue={value(row, "statusCode", "active")}><option value="active">Active</option><option value="draft">Draft</option><option value="cancelled">Cancelled</option><option value="entered_in_error">Entered in error</option></Select></Field>
          </div> : null}

          {dataset === "pos" ? <div className="form-grid">
            <Field label="Inventory item" span><Select name="itemId" required><option value="">Select item</option>{posItems.filter((item) => item.stock > 0).map((item) => <option key={item.id} value={item.id}>{item.name} ({item.sku}) · {item.stock} available · ₱{Number(item.selling_price).toFixed(2)}</option>)}</Select></Field>
            <Field label="Quantity"><Input name="quantity" type="number" min="1" step="1" defaultValue="1" required /></Field>
            <Field label="Payment method"><Select name="paymentMethod" defaultValue="cash"><option value="cash">Cash</option><option value="card">Card</option><option value="qr_ewallet">QR / e-wallet</option><option value="bank_transfer">Bank transfer</option><option value="check">Check</option></Select></Field>
            <Field label="Customer name" span><Input name="customerName" placeholder="Walk-in customer" /></Field>
          </div> : null}

          {dataset === "admins" ? <div className="form-grid">
            <div className="confirmation-summary field-span"><span>Organization scope</span><strong>{organization?.name ?? "Select an organization"}</strong></div>
            <Field label="Full name"><Input name="displayName" required /></Field>
            <Field label="Work email"><Input name="email" type="email" required /></Field>
            <Field label="Temporary password" span><Input name="password" type="password" minLength={8} required /></Field>
          </div> : null}

          {dataset === "clinics" ? <div className="form-grid">
            <Field label="Organization name" span><Input name="name" defaultValue={value(row, "name")} required /></Field>
            <label className="check-option field-span"><input name="active" type="checkbox" defaultChecked={checked(row, "active", true)} /> Organization is active</label>
          </div> : null}

          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="dialog-actions"><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving || loadingOptions}>{saving ? "Saving…" : editing ? "Save changes" : dataset === "billing" ? "Create and finalize" : "Create record"}</Button></div>
        </form>
      </Dialog>
    </>
  );
}

function PaymentDialog({ onChanged, row }: Pick<ManagementProps, "onChanged" | "row">) {
  const { client } = useAdminData();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    const result = await recordPayment(client, value(row, "id"), Number(form.get("amount")), String(form.get("method")) as PaymentMethod, String(form.get("reference") || "") || undefined);
    setSaving(false);
    if (result.error) return setError(result.error.message);
    setOpen(false);
    onChanged();
  }
  return <><Button size="sm" variant="outline" onClick={() => setOpen(true)}>Record payment</Button><Dialog open={open} onOpenChange={setOpen} title="Record invoice payment" description={`${value(row, "invoice")} has an outstanding balance of ₱${Number(row?.balance ?? 0).toFixed(2)}.`}><form className="dialog-body" onSubmit={submit}><Field label="Amount"><Input name="amount" type="number" min="0.01" max={Number(row?.balance ?? 0)} step="0.01" defaultValue={value(row, "balance")} required /></Field><Field label="Payment method"><Select name="method"><option value="cash">Cash</option><option value="card">Card</option><option value="qr_ewallet">QR / e-wallet</option><option value="bank_transfer">Bank transfer</option><option value="check">Check</option></Select></Field><Field label="Reference"><Input name="reference" /></Field>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="dialog-actions"><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Record payment"}</Button></div></form></Dialog></>;
}

function ClaimActions({ onChanged, row }: Pick<ManagementProps, "onChanged" | "row">) {
  const { client } = useAdminData();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitted = Boolean(row?.submitted);
  const adjudicated = Boolean(row?.adjudicated);
  async function send() {
    setSaving(true);
    const result = await submitClaim(client, value(row, "id"));
    setSaving(false);
    if (result.error) return setError(result.error.message);
    onChanged();
  }
  async function adjudicate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    const result = await adjudicateClaim(client, value(row, "id"), String(form.get("result")) as "approved" | "denied" | "partial", Number(form.get("amount")) || undefined, String(form.get("reason") || "") || undefined);
    setSaving(false);
    if (result.error) return setError(result.error.message);
    setOpen(false);
    onChanged();
  }
  if (!submitted) return <div className="record-actions"><Button size="sm" disabled={saving} onClick={() => void send()}>{saving ? "Submitting…" : "Submit claim"}</Button>{error ? <span className="sr-only" role="alert">{error}</span> : null}</div>;
  if (adjudicated) return null;
  return <><Button size="sm" variant="outline" onClick={() => setOpen(true)}>Adjudicate</Button><Dialog open={open} onOpenChange={setOpen} title="Adjudicate claim" description="Record the payor decision and approved amount."><form className="dialog-body" onSubmit={adjudicate}><Field label="Decision"><Select name="result"><option value="approved">Approved</option><option value="partial">Partially approved</option><option value="denied">Denied</option></Select></Field><Field label="Approved amount"><Input name="amount" type="number" min="0" step="0.01" defaultValue={value(row, "amount")} /></Field><Field label="Reason"><Textarea name="reason" /></Field>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="dialog-actions"><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Record decision"}</Button></div></form></Dialog></>;
}

function AppointmentActions({ onChanged, row }: Pick<ManagementProps, "onChanged" | "row">) {
  const { client } = useAdminData();
  const [saving, setSaving] = useState(false);
  const status = value(row, "statusCode");
  async function change(next: "arrived" | "cancelled" | "noshow") {
    setSaving(true);
    await updateAppointmentStatus(client, value(row, "id"), next);
    setSaving(false);
    onChanged();
  }
  if (!['booked', 'arrived'].includes(status)) return null;
  return <div className="record-actions">{status === "booked" ? <Button size="sm" disabled={saving} onClick={() => void change("arrived")}>Check in</Button> : null}{status === "booked" ? <Button size="sm" variant="outline" disabled={saving} onClick={() => void change("noshow")}>No-show</Button> : null}<Button size="sm" variant="danger" disabled={saving} onClick={() => void change("cancelled")}>Cancel</Button></div>;
}

function PatientStatusAction({ onChanged, row }: Pick<ManagementProps, "onChanged" | "row">) {
  const { client, organization } = useAdminData();
  const [saving, setSaving] = useState(false);
  const active = Boolean(row?.active);
  async function toggle() {
    if (!organization) return;
    setSaving(true);
    const result = await setGovernancePatientActive(client, organization.id, value(row, "id"), !active);
    setSaving(false);
    if (result.error) return;
    onChanged();
  }
  return <Button size="sm" variant="outline" disabled={saving} onClick={() => void toggle()}><Power aria-hidden="true" size={14} />{active ? "Archive" : "Restore"}</Button>;
}

export function DepartmentDialog({
  department,
  onChanged,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  trigger = true,
}: {
  department?: DataRow;
  onChanged: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: boolean;
}) {
  const { client, organization } = useAdminData();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = setControlledOpen ?? setInternalOpen;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organization) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    const result = await saveStaffDepartment(client, {
      organizationId: organization.id,
      id: department?.id ? String(department.id) : undefined,
      name: String(form.get("name") ?? "").trim(),
      description: String(form.get("description") ?? "").trim(),
      active: Boolean(form.get("active")),
    });
    setSaving(false);
    if (result.error) return setError(result.error.message);
    setOpen(false);
    onChanged();
  }

  return (
    <>
      {trigger ? (
        <Button size={department ? "sm" : "md"} variant={department ? "outline" : "primary"} onClick={() => setOpen(true)}>
          {department ? <Edit3 aria-hidden="true" size={14} /> : <Plus aria-hidden="true" size={16} />}
          {department ? "Edit" : "Add department"}
        </Button>
      ) : null}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={department ? "Edit department" : "Add department"}
        description="Department codes are generated and preserved by the system. Deactivated departments remain in historical inventory and audit records."
      >
        <form className="dialog-body" onSubmit={submit}>
          <Field label="Department name">
            <Input name="name" defaultValue={value(department, "name")} minLength={2} maxLength={120} required />
          </Field>
          <Field label="Description">
            <Textarea name="description" defaultValue={value(department, "description") === "—" ? "" : value(department, "description")} maxLength={500} />
          </Field>
          <label className="check-option">
            <input name="active" type="checkbox" defaultChecked={checked(department, "active", true)} /> Active and available for assignment
          </label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="dialog-actions">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save department"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function RoleDialog({
  onChanged,
  role,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  trigger = true,
}: {
  onChanged: () => void;
  role?: DataRow;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: boolean;
}) {
  const { client, organization } = useAdminData();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = setControlledOpen ?? setInternalOpen;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organization) return;
    const form = new FormData(event.currentTarget);
    const permissions = permissionOptions
      .filter((permission) => form.get(permission.value))
      .map((permission) => permission.value);
    setSaving(true);
    setError(null);
    const isCustom = role ? Boolean(role.isCustom) : true;
    const result = await saveClinicRoleDefinition(client, {
      organizationId: organization.id,
      code: role ? String(role.code ?? "") : "",
      name: !isCustom && role ? String(role.name) : String(form.get("name") ?? "").trim(),
      permissions,
    });
    setSaving(false);
    if (result.error) return setError(result.error.message);
    setOpen(false);
    onChanged();
  }

  const rolePermissions: string[] = Array.isArray(role?.permissions) ? (role.permissions as string[]) : [];

  const permissionGroup = (title: string, options: typeof permissionOptions) => (
    <fieldset className="permission-group">
      <legend>{title}</legend>
      <div className="check-grid">
        {options.map((permission) => (
          <label key={permission.value}>
            <input
              type="checkbox"
              name={permission.value}
              defaultChecked={rolePermissions.includes(permission.value)}
            />
            <span>
              <strong>{permission.label}</strong>
              <small>{permission.hint}</small>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );

  const isCustom = role ? Boolean(role.isCustom) : true;

  return (
    <>
      {trigger ? (
        <Button size={role ? "sm" : "md"} variant={role ? "outline" : "primary"} onClick={() => setOpen(true)}>
          {role ? <Edit3 aria-hidden="true" size={14} /> : <Plus aria-hidden="true" size={16} />}
          {role ? "Edit access" : "Create role"}
        </Button>
      ) : null}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={role ? `Edit ${value(role, "name")}` : "Create clinic role"}
        description="The selected permissions become the complete effective access set for this role in the current clinic."
      >
        <form className="dialog-body role-editor" onSubmit={submit}>
          <Field label="Role name">
            <Input
              name="name"
              defaultValue={value(role, "name")}
              disabled={!isCustom}
              minLength={2}
              maxLength={80}
              required
            />
          </Field>
          {permissionGroup("Portal access", portalPermissions)}
          {permissionGroup("Feature permissions", featurePermissions)}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="dialog-actions">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save role access"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function CreateRecordAction({ actionHref, dataset, label, onChanged }: ManagementProps & { actionHref?: string }) {
  const router = useRouter();
  const canManage = useCanManage(dataset);
  if (!canManage || !label) return null;
  if (actionHref) return <Button onClick={() => router.push(actionHref)}><Plus aria-hidden="true" size={16} />{label}</Button>;
  if (dataset === "claims") return <Button onClick={() => router.push("/billing")}><ExternalLink aria-hidden="true" size={16} />Create from billing</Button>;
  if (dataset === "departments") return <DepartmentDialog onChanged={onChanged} />;
  if (dataset === "roles") return <RoleDialog onChanged={onChanged} />;
  if (!editableDatasets.has(dataset)) return null;
  return <RecordEditorDialog dataset={dataset} label={label} onChanged={onChanged} />;
}

export function RecordRowActions({ dataset, onChanged, row }: ManagementProps) {
  const router = useRouter();
  const { client, organization } = useAdminData();
  const canManage = useCanManage(dataset);
  if (dataset === "clinics") return <div className="record-actions"><Button size="sm" variant="outline" onClick={() => router.push(`/superadmin/clinics/${value(row, "code")}`)}>Open</Button>{canManage ? <RecordEditorDialog dataset="clinics" label="clinic" onChanged={onChanged} row={row} /> : null}</div>;
  if (!canManage) return null;
  if (dataset === "departments" && row) {
    const active = checked(row, "active", true);
    return (
      <div className="record-actions">
        <DepartmentDialog department={row} onChanged={onChanged} />
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            if (!organization) return;
            await saveStaffDepartment(client, {
              organizationId: organization.id,
              id: String(row.id),
              name: String(row.name),
              description: value(row, "description") === "—" ? "" : value(row, "description"),
              active: !active,
            });
            onChanged();
          }}
        >
          <Power aria-hidden="true" size={14} />
          {active ? "Deactivate" : "Restore"}
        </Button>
      </div>
    );
  }
  if (dataset === "roles" && row) {
    return (
      <div className="record-actions">
        <RoleDialog onChanged={onChanged} role={row} />
      </div>
    );
  }
  if (dataset === "services" || dataset === "templates" || dataset === "companies" || dataset === "staff") return <div className="record-actions"><RecordEditorDialog dataset={dataset} label={dataset === "staff" ? "staff assignment" : dataset.slice(0, -1)} onChanged={onChanged} row={row} />{dataset === "staff" ? <Button size="sm" variant="outline" onClick={async () => { if (!organization) return; await setClinicUserActive(client, organization.id, value(row, "id"), !Boolean(row?.active)); onChanged(); }}><Power aria-hidden="true" size={14} />{row?.active ? "Disable" : "Enable"}</Button> : null}</div>;
  if (dataset === "features") return <Button size="sm" variant="outline" onClick={async () => { if (!organization) return; await setOrganizationModule(client, organization.id, value(row, "key") as OrganizationModuleKey, !Boolean(row?.enabled)); onChanged(); }}><Power aria-hidden="true" size={14} />{row?.enabled ? "Disable" : "Enable"}</Button>;
  if (dataset === "patients") return <PatientStatusAction onChanged={onChanged} row={row} />;
  if (dataset === "appointments") return <AppointmentActions onChanged={onChanged} row={row} />;
  if (dataset === "billing" && Number(row?.balance ?? 0) > 0) return <PaymentDialog onChanged={onChanged} row={row} />;
  if (dataset === "claims") return <ClaimActions onChanged={onChanged} row={row} />;
  if (dataset === "admins" && row?.organizationId) return <Button size="sm" variant="outline" onClick={async () => { await setClinicUserActive(client, value(row, "organizationId"), value(row, "id"), !Boolean(row.active)); onChanged(); }}><Power aria-hidden="true" size={14} />{row.active ? "Disable" : "Enable"}</Button>;
  return null;
}
