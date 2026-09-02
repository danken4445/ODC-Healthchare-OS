"use client";

import {
  createBrowserSupabaseClient,
  createClinicAccount,
  getAccessibleOrganizations,
  getClinicRoleDefinitions,
  getStaffAdministration,
  getCurrentUserEmail,
  getPortalAccess,
  hasOrganizationPermission,
  assignStaffDepartment,
  saveClinicRoleDefinition,
} from "@odyssey/supabase-client";
import type {
  AssignableClinicAccountRole,
  ClinicRoleDefinition,
  ClinicRolePermission,
  ClinicStaffMember,
  DepartmentSummary,
  PublicClinicSummary,
} from "@odyssey/types";
import { Button, Field, Input } from "@odyssey/ui";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

const permissionOptions: Array<{
  value: ClinicRolePermission;
  label: string;
  hint: string;
}> = [
  {
    value: "can_access_admin_portal",
    label: "Administrative workspace",
    hint: "Open the clinic operations workspace.",
  },
  {
    value: "can_manage_appointments",
    label: "Appointments",
    hint: "Schedule, check in, cancel, and mark no-shows.",
  },
  {
    value: "can_access_provider_portal",
    label: "Clinical workspace",
    hint: "Open the provider and triage workspace.",
  },
  {
    value: "can_record_triage",
    label: "Triage",
    hint: "Record vital signs and complete triage.",
  },
  {
    value: "can_start_consultation",
    label: "Consultations",
    hint: "Start assigned, triage-complete consultations.",
  },
  {
    value: "can_manage_provider_schedule",
    label: "Provider schedule",
    hint: "Maintain bookable availability and services.",
  },
  {
    value: "can_manage_staff_roles",
    label: "Staff and roles",
    hint: "Create staff accounts and manage role access.",
  },
  {
    value: "can_view_inventory",
    label: "View inventory",
    hint: "Open stock visibility screens.",
  },
  {
    value: "can_manage_inventory",
    label: "Manage inventory",
    hint: "Adjust stock and departments.",
  },
  {
    value: "can_tag_inventory_usage",
    label: "Tag consumables",
    hint: "Record consumables against encounters.",
  },
  {
    value: "can_order_diagnostics",
    label: "Order diagnostics",
    hint: "Place lab orders and specialist referrals.",
  },
  {
    value: "can_view_diagnostics",
    label: "View diagnostics",
    hint: "Review clinic diagnostic requests and reports.",
  },
  {
    value: "can_view_lab_worklist",
    label: "Lab worklist",
    hint: "See active laboratory orders.",
  },
  {
    value: "can_record_lab_results",
    label: "Record lab results",
    hint: "Publish final reports and observations.",
  },
  {
    value: "can_view_referrals",
    label: "Specialist referrals",
    hint: "See referrals routed to this specialist.",
  },
  {
    value: "can_update_referrals",
    label: "Update referrals",
    hint: "Progress or complete routed referrals.",
  },
  {
    value: "can_manage_laboratory_services",
    label: "Laboratory services",
    hint: "Maintain the laboratory service catalog and lab costs.",
  },
];

const portalPermissions = permissionOptions.filter((permission) =>
  ["can_access_admin_portal", "can_access_provider_portal"].includes(
    permission.value,
  ),
);
const featurePermissions = permissionOptions.filter(
  (permission) => !portalPermissions.includes(permission),
);

export default function StaffAdministrationPage() {
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const [clinics, setClinics] = useState<PublicClinicSummary[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [roles, setRoles] = useState<ClinicRoleDefinition[]>([]);
  const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
  const [staff, setStaff] = useState<ClinicStaffMember[]>([]);
  const [editingRole, setEditingRole] = useState<ClinicRoleDefinition | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("Checking administrative access.");

  useEffect(() => {
    async function load() {
      const client = createBrowserSupabaseClient();
      const [userResult, accessResult] = await Promise.all([
        getCurrentUserEmail(client),
        getPortalAccess(client, "admin"),
      ]);
      const canManage = Boolean(
        accessResult.data?.allowed && !accessResult.data.isSuperadmin,
      );
      if (
        userResult.error ||
        !userResult.data ||
        accessResult.error ||
        !canManage
      ) {
        setAuthorized(false);
        setStatus("Only clinic administrators and owners can manage accounts.");
        return;
      }

      const clinicResult = await getAccessibleOrganizations(
        client,
        accessResult.data.organizationIds,
      );
      if (clinicResult.error || !clinicResult.data.length) {
        setAuthorized(false);
        setStatus(
          "No assigned clinic is available for account administration.",
        );
        return;
      }
      setSignedInAs(userResult.data);
      setClinics(clinicResult.data);
      const firstOrganizationId = clinicResult.data[0].id;
      const permissionResult = await hasOrganizationPermission(
        client,
        firstOrganizationId,
        "can_manage_staff_roles",
      );
      if (permissionResult.error || !permissionResult.data) {
        setAuthorized(false);
        setStatus("Your role does not have staff and role management access.");
        return;
      }
      setOrganizationId(firstOrganizationId);
      setAuthorized(true);
      await loadRoles(firstOrganizationId);
      await loadStaffAdministration(firstOrganizationId);
      setStatus("Manage staff accounts and clinic role access.");
    }
    void load();
  }, []);

  async function loadRoles(clinicId = organizationId) {
    if (!clinicId) return;
    const result = await getClinicRoleDefinitions(
      createBrowserSupabaseClient(),
      clinicId,
    );
    if (result.error)
      return setStatus(`Unable to load roles: ${result.error.message}`);
    setRoles(result.data);
  }

  async function loadStaffAdministration(clinicId = organizationId) {
    if (!clinicId) return;
    const result = await getStaffAdministration(
      createBrowserSupabaseClient(),
      clinicId,
    );
    if (result.error)
      return setStatus(
        `Unable to load staff assignments: ${result.error.message}`,
      );
    setDepartments(result.data.departments);
    setStaff(result.data.staff);
  }

  async function handleClinicChange(clinicId: string) {
    setOrganizationId(clinicId);
    setEditingRole(null);
    await Promise.all([loadRoles(clinicId), loadStaffAdministration(clinicId)]);
  }

  async function handleDepartmentAssignment(
    userId: string,
    departmentId: string | null,
  ) {
    if (!organizationId) return;
    setSubmitting(true);
    const result = await assignStaffDepartment(createBrowserSupabaseClient(), {
      organizationId,
      userId,
      departmentId,
    });
    setSubmitting(false);
    if (result.error)
      return setStatus(`Department assignment failed: ${result.error.message}`);
    setStaff((current) =>
      current.map((member) =>
        member.userId === userId ? { ...member, departmentId } : member,
      ),
    );
    setStatus("Staff department assignment saved.");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setSubmitting(true);
    const result = await createClinicAccount(createBrowserSupabaseClient(), {
      displayName: String(fields.get("displayName") ?? ""),
      email: String(fields.get("email") ?? ""),
      organizationId,
      password: String(fields.get("password") ?? ""),
      roleCode: String(
        fields.get("roleCode") ?? "front_desk",
      ) as AssignableClinicAccountRole,
    });
    setSubmitting(false);
    if (result.error)
      return setStatus(`Account creation failed: ${result.error.message}`);
    form.reset();
    setStatus(
      `Created ${result.data.email} as ${result.data.roleCode.replace("_", " ")}.`,
    );
    await loadStaffAdministration();
  }

  async function handleSaveRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    const fields = new FormData(event.currentTarget);
    const code = editingRole?.code ?? "";
    const permissions = permissionOptions
      .filter((permission) => fields.get(permission.value))
      .map((permission) => permission.value);
    setSubmitting(true);
    const result = await saveClinicRoleDefinition(
      createBrowserSupabaseClient(),
      {
        organizationId,
        code,
        name: String(fields.get("name") ?? "").trim(),
        permissions,
      },
    );
    setSubmitting(false);
    if (result.error)
      return setStatus(`Role save failed: ${result.error.message}`);
    setStatus(`Saved ${String(fields.get("name"))} access.`);
    setEditingRole(null);
    await loadRoles();
  }

  return (
    <main>
      <p className="eyebrow">Clinic administration</p>
      <h1>Staff accounts</h1>
      {authorized ? (
        <>
          <p className="hint">Signed in as {signedInAs}</p>
          <section>
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
          <section aria-labelledby="department-assignments-heading">
            <h2 id="department-assignments-heading">
              Staff department assignments
            </h2>
            <p className="hint">
              Assign a default department for inventory tagging. Staff without
              an assignment will choose the department when tagging a supply.
            </p>
            <div className="record-list">
              {staff.map((member) => (
                <article key={`${member.userId}-${member.roleCode}`}>
                  <strong>{member.displayName}</strong>
                  <p>
                    {member.email ?? "No email"} ·{" "}
                    {member.roleCode.replaceAll("_", " ")}
                  </p>
                  <Field label="Department">
                    <select
                      className="odyssey-input"
                      value={member.departmentId ?? ""}
                      onChange={(event) =>
                        void handleDepartmentAssignment(
                          member.userId,
                          event.target.value || null,
                        )
                      }
                    >
                      <option value="">No default — choose when tagging</option>
                      {departments
                        .filter((department) => department.active)
                        .map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.name} ({department.code})
                          </option>
                        ))}
                    </select>
                  </Field>
                </article>
              ))}
              {!staff.length && (
                <p className="hint">No clinic staff accounts found.</p>
              )}
            </div>
          </section>
          <section aria-labelledby="roles-heading">
            <h2 id="roles-heading">Roles and access</h2>
            <p className="hint">
              Turning on permissions replaces that role’s default access for
              this clinic.
            </p>
            <div className="two-column">
              <div className="record-list">
                {roles.map((role) => (
                  <article key={role.code}>
                    <strong>{role.name}</strong>
                    {role.isCustom && <small> Custom role</small>}
                    <p>
                      {role.permissions.length
                        ? role.permissions
                            .map(
                              (permission) =>
                                permissionOptions.find(
                                  (option) => option.value === permission,
                                )?.label ?? permission,
                            )
                            .join(" · ")
                        : "No access enabled"}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingRole(role)}
                    >
                      Edit access
                    </Button>
                  </article>
                ))}
              </div>
              <form
                className="stack"
                onSubmit={handleSaveRole}
                aria-busy={submitting}
              >
                <h3>
                  {editingRole ? `Edit ${editingRole.name}` : "Create a role"}
                </h3>
                <Field label="Role name">
                  <Input
                    name="name"
                    key={editingRole?.code ?? "new-name"}
                    defaultValue={editingRole?.name ?? ""}
                    required
                    minLength={2}
                    maxLength={80}
                  />
                </Field>
                <fieldset className="stack">
                  <legend>Portal access</legend>
                  <p className="hint">
                    Choose which workspaces this role can open. Feature access
                    is configured separately below.
                  </p>
                  {portalPermissions.map((permission) => (
                    <label key={permission.value}>
                      <input
                        type="checkbox"
                        name={permission.value}
                        key={`${editingRole?.code ?? "new"}-${permission.value}`}
                        defaultChecked={
                          editingRole?.permissions.includes(permission.value) ??
                          false
                        }
                      />{" "}
                      <strong>
                        {permission.label.replace(" workspace", " portal")}
                      </strong>
                      <small className="hint"> — {permission.hint}</small>
                    </label>
                  ))}
                </fieldset>
                <fieldset className="stack">
                  <legend>Feature permissions</legend>
                  {featurePermissions.map((permission) => (
                    <label key={permission.value}>
                      <input
                        type="checkbox"
                        name={permission.value}
                        key={`${editingRole?.code ?? "new"}-${permission.value}`}
                        defaultChecked={
                          editingRole?.permissions.includes(permission.value) ??
                          false
                        }
                      />{" "}
                      <strong>{permission.label}</strong>
                      <small className="hint"> — {permission.hint}</small>
                    </label>
                  ))}
                </fieldset>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Saving…" : "Save role access"}
                </Button>
                {editingRole && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setEditingRole(null)}
                  >
                    Cancel
                  </Button>
                )}
              </form>
            </div>
          </section>
          <section>
            <h2>Create clinic account</h2>
            <p className="hint">
              Accounts are assigned only to the clinic selected below.
              Front-desk accounts cannot access this page or create further
              accounts.
            </p>
            <form
              className="stack narrow-form"
              onSubmit={handleSubmit}
              aria-busy={submitting}
            >
              <Field label="Full name">
                <Input
                  name="displayName"
                  minLength={2}
                  maxLength={120}
                  required
                />
              </Field>
              <Field label="Email">
                <Input name="email" type="email" required />
              </Field>
              <Field label="Temporary password">
                <Input name="password" type="password" minLength={8} required />
              </Field>
              <Field label="Role">
                <select
                  className="odyssey-input"
                  name="roleCode"
                  defaultValue="front_desk"
                >
                  {roles
                    .filter((role) => role.code !== "owner")
                    .map((role) => (
                      <option key={role.code} value={role.code}>
                        {role.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating…" : "Create account"}
              </Button>
            </form>
          </section>
        </>
      ) : (
        <section>
          <p>{status}</p>
          <Link href="/">Return to the clinic schedule</Link>
        </section>
      )}
      {authorized && <p role="status">{status}</p>}
    </main>
  );
}
