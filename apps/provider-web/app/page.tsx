"use client";

import {
  createBrowserSupabaseClient,
  getCurrentUserEmail,
  getOrganizationClinicalRecords,
  signInWithPassword,
  signOut,
} from "@odyssey/supabase-client";
import type { OrganizationClinicalRecords } from "@odyssey/types";
import { Button, DataTable, Field, Input } from "@odyssey/ui";
import { useEffect, useState, type FormEvent } from "react";

const organizationId = "10000000-0000-0000-0000-000000000001";

export default function Home() {
  const [email, setEmail] = useState("doctor@odc.com");
  const [password, setPassword] = useState("");
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const [status, setStatus] = useState(
    "Sign in as a doctor, nurse, or lab staff member to verify organization-scoped access.",
  );
  const [results, setResults] = useState<OrganizationClinicalRecords | null>(
    null,
  );

  useEffect(() => {
    void getCurrentUserEmail(createBrowserSupabaseClient()).then((result) => {
      if (!result.error) setSignedInAs(result.data);
    });
  }, []);

  async function verifyRls() {
    const result = await getOrganizationClinicalRecords(
      createBrowserSupabaseClient(),
      organizationId,
    );
    if (result.error)
      return setStatus(`RLS query failed: ${result.error.message}`);
    setResults(result.data);
    setStatus(
      "Staff RLS query completed. No records from Synthetic Other Clinic should appear.",
    );
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await signInWithPassword(
      createBrowserSupabaseClient(),
      email,
      password,
    );
    if (result.error)
      return setStatus(`Sign-in failed: ${result.error.message}`);
    setSignedInAs(result.data);
    await verifyRls();
  }

  async function handleSignOut() {
    const result = await signOut(createBrowserSupabaseClient());
    if (result.error)
      return setStatus(`Sign-out failed: ${result.error.message}`);
    setSignedInAs(null);
    setResults(null);
    setStatus("Signed out.");
  }

  return (
    <main>
      <p className="eyebrow">Phase 2 test console</p>
      <h1>Provider access</h1>
      {!signedInAs ? (
        <form onSubmit={signIn} className="stack">
          <Field label="Email">
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              required
            />
          </Field>
          <Field label="Password">
            <Input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              required
            />
          </Field>
          <Button type="submit">Sign in and verify organization access</Button>
          <p className="hint">
            Try doctor@odc.com, nurse@odc.com, or lab@odc.com. Local reset
            password: LocalOnly-2026!.
          </p>
        </form>
      ) : (
        <div className="session">
          <span>Signed in as {signedInAs}</span>
          <span>
            <Button onClick={verifyRls}>Refresh records</Button>{" "}
            <Button variant="secondary" onClick={handleSignOut}>
              Sign out
            </Button>
          </span>
        </div>
      )}
      <p role="status">{status}</p>
      {results && (
        <section>
          <DataTable
            caption="Organization encounters"
            data={results.encounters}
            getRowId={(encounter) => encounter.id}
            columns={[
              {
                id: "patient",
                header: "Patient ID",
                cell: (encounter) => encounter.patient_id,
              },
              {
                id: "status",
                header: "Status",
                cell: (encounter) => encounter.status,
              },
              {
                id: "start",
                header: "Started",
                cell: (encounter) => encounter.period_start ?? "—",
              },
            ]}
          />
          <DataTable
            caption="Organization observations"
            data={results.observations}
            getRowId={(observation) => observation.id}
            columns={[
              {
                id: "patient",
                header: "Patient ID",
                cell: (observation) => observation.patient_id,
              },
              {
                id: "code",
                header: "Code",
                cell: (observation) => observation.code,
              },
              {
                id: "status",
                header: "Status",
                cell: (observation) => observation.status,
              },
            ]}
          />
          <DataTable
            caption="Organization medication requests"
            data={results.medicationRequests}
            getRowId={(request) => request.id}
            columns={[
              {
                id: "patient",
                header: "Patient ID",
                cell: (request) => request.patient_id,
              },
              {
                id: "medication",
                header: "Medication",
                cell: (request) =>
                  request.medication_display ?? request.medication_code,
              },
              {
                id: "status",
                header: "Status",
                cell: (request) => request.status,
              },
            ]}
          />
        </section>
      )}
    </main>
  );
}
