"use client";

import {
  claimWalkInPatient,
  createBrowserSupabaseClient,
  getCurrentUserEmail,
  getPatientAccessRecords,
  getWalkInPatientRecords,
  requestMagicLink,
  signInWithPassword,
  signOut,
} from "@odyssey/supabase-client";
import {
  getHumanNameDisplay,
  type PatientAccessRecords,
  type WalkInAccessRecords,
} from "@odyssey/types";
import {
  AppointmentStatusBadge,
  Button,
  DataTable,
  Field,
  Input,
} from "@odyssey/ui";
import { useEffect, useState, type FormEvent } from "react";

const organizationId = "10000000-0000-0000-0000-000000000001";

type AccessibleRecords = PatientAccessRecords | WalkInAccessRecords;

function formatValue(value: unknown): string {
  return value === null || value === undefined ? "—" : JSON.stringify(value);
}

export default function Home() {
  const [email, setEmail] = useState("patient@synthetic.odyssey.test");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState(
    "Sign in as a registered patient, or use a walk-in ID and PIN.",
  );
  const [records, setRecords] = useState<AccessibleRecords | null>(null);
  const [signedInAs, setSignedInAs] = useState<string | null>(null);

  useEffect(() => {
    void getCurrentUserEmail(createBrowserSupabaseClient()).then((result) => {
      if (!result.error) setSignedInAs(result.data);
    });
  }, []);

  async function loadRegisteredRecords() {
    const result = await getPatientAccessRecords(createBrowserSupabaseClient());
    if (result.error)
      return setStatus(`Record query failed: ${result.error.message}`);
    setRecords(result.data);
    setStatus(
      "Registered-patient RLS query completed. Only your records should appear below.",
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
    await loadRegisteredRecords();
  }

  async function sendMagicLink() {
    const result = await requestMagicLink(
      createBrowserSupabaseClient(),
      email,
      window.location.origin,
    );
    setStatus(
      result.error
        ? `Magic-link request failed: ${result.error.message}`
        : "Magic link requested. Check the inbox for this address.",
    );
  }

  async function useWalkIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const result = await getWalkInPatientRecords(
      createBrowserSupabaseClient(),
      {
        organizationId,
        walkInId: String(fields.get("walkInId")),
        pin: String(fields.get("pin")),
      },
    );
    if (result.error)
      return setStatus(`Walk-in access failed: ${result.error.message}`);
    setRecords(result.data);
    setStatus(
      "Walk-in credentials verified. The records below belong only to this walk-in patient.",
    );
  }

  async function claimWalkIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const result = await claimWalkInPatient(createBrowserSupabaseClient(), {
      organizationId,
      walkInId: String(fields.get("claimWalkInId")),
      pin: String(fields.get("claimPin")),
    });
    setStatus(
      result.error
        ? `Claim failed: ${result.error.message}`
        : "Record claimed. This account is now linked to the original patient row.",
    );
  }

  async function handleSignOut() {
    const result = await signOut(createBrowserSupabaseClient());
    if (result.error)
      return setStatus(`Sign-out failed: ${result.error.message}`);
    setSignedInAs(null);
    setRecords(null);
    setStatus("Signed out.");
  }

  return (
    <main>
      <p className="eyebrow">Phase 2 test console</p>
      <h1>Patient access</h1>
      <section>
        <h2>Registered patient</h2>
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
            <Button type="submit">Sign in and verify my records</Button>
            <Button type="button" variant="secondary" onClick={sendMagicLink}>
              Send magic link
            </Button>
          </form>
        ) : (
          <div className="session">
            <span>Signed in as {signedInAs}</span>
            <span>
              <Button onClick={loadRegisteredRecords}>Refresh records</Button>{" "}
              <Button variant="secondary" onClick={handleSignOut}>
                Sign out
              </Button>
            </span>
          </div>
        )}
      </section>
      <section>
        <h2>Walk-in patient</h2>
        <form onSubmit={useWalkIn} className="stack">
          <Field label="Walk-in ID">
            <Input
              name="walkInId"
              pattern="WK-\d{4}-\d{6}"
              placeholder="WK-2026-000001"
              required
            />
          </Field>
          <Field label="4-digit PIN">
            <Input name="pin" inputMode="numeric" pattern="\d{4}" required />
          </Field>
          <Button type="submit">Use walk-in credentials</Button>
        </form>
      </section>
      {signedInAs && (
        <section>
          <h2>Claim a walk-in record</h2>
          <form onSubmit={claimWalkIn} className="stack">
            <Field label="Walk-in ID">
              <Input name="claimWalkInId" required />
            </Field>
            <Field label="PIN">
              <Input
                name="claimPin"
                inputMode="numeric"
                pattern="\d{4}"
                required
              />
            </Field>
            <Button type="submit">Claim existing record</Button>
          </form>
        </section>
      )}
      <p role="status">{status}</p>
      {records && (
        <section>
          <h2>Accessible records</h2>
          <DataTable
            caption="Patient records available to this access session."
            data={records.patients}
            getRowId={(patient) => patient.id}
            columns={[
              {
                id: "name",
                header: "Patient",
                cell: (patient) => getHumanNameDisplay(patient.name),
              },
              {
                id: "walk-in",
                header: "Walk-in ID",
                cell: (patient) => patient.walk_in_id ?? "—",
              },
            ]}
          />
          {"appointments" in records && (
            <DataTable
              caption="Appointments"
              data={records.appointments}
              getRowId={(appointment) => appointment.id}
              columns={[
                {
                  id: "status",
                  header: "Status",
                  cell: (appointment) => (
                    <AppointmentStatusBadge status={appointment.status} />
                  ),
                },
                {
                  id: "start",
                  header: "Starts",
                  cell: (appointment) =>
                    appointment.start_at ?? "Not scheduled",
                },
                {
                  id: "type",
                  header: "Type",
                  cell: (appointment) =>
                    appointment.service_type ??
                    appointment.appointment_type ??
                    "—",
                },
              ]}
            />
          )}
          <DataTable
            caption="Encounters"
            data={records.encounters}
            getRowId={(encounter) => encounter.id}
            columns={[
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
            caption="Observations"
            data={records.observations}
            getRowId={(observation) => observation.id}
            columns={[
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
              {
                id: "value",
                header: "Value",
                cell: (observation) => formatValue(observation.value),
              },
            ]}
          />
        </section>
      )}
    </main>
  );
}
