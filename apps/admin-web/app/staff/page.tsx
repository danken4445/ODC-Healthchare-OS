"use client";

import {
  createBrowserSupabaseClient,
  createClinicAccount,
  getAccessibleOrganizations,
  getCurrentUserEmail,
  getPortalAccess,
} from "@odyssey/supabase-client";
import type {
  AssignableClinicAccountRole,
  PublicClinicSummary,
} from "@odyssey/types";
import { Button, Field, Input } from "@odyssey/ui";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

const roles: Array<{ value: AssignableClinicAccountRole; label: string }> = [
  { value: "admin", label: "Clinic administrator" },
  { value: "front_desk", label: "Front desk" },
  { value: "doctor", label: "Doctor" },
  { value: "nurse", label: "Nurse" },
  { value: "lab_staff", label: "Laboratory staff" },
  { value: "specialist", label: "Specialist" },
];

export default function StaffAdministrationPage() {
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const [clinics, setClinics] = useState<PublicClinicSummary[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [authorized, setAuthorized] = useState<boolean | null>(null);
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
        accessResult.data?.allowed &&
        !accessResult.data.isSuperadmin &&
        accessResult.data.roleCodes.some(
          (role) => role === "admin" || role === "owner",
        ),
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
      setOrganizationId(clinicResult.data[0].id);
      setAuthorized(true);
      setStatus("Create an account for one of your assigned clinics.");
    }
    void load();
  }, []);

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
  }

  return (
    <main>
      <p className="eyebrow">Clinic administration</p>
      <h1>Staff accounts</h1>
      {authorized ? (
        <>
          <p className="hint">Signed in as {signedInAs}</p>
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
              <Field label="Clinic">
                <select
                  className="odyssey-input"
                  value={organizationId}
                  onChange={(event) => setOrganizationId(event.target.value)}
                >
                  {clinics.map((clinic) => (
                    <option key={clinic.id} value={clinic.id}>
                      {clinic.name}
                    </option>
                  ))}
                </select>
              </Field>
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
                  {roles.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
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
