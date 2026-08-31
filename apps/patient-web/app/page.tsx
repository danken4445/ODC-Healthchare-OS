"use client";

import {
  bookAppointmentSlot,
  createBrowserSupabaseClient,
  getAvailableAppointmentSlots,
  getCurrentUserEmail,
  getPatientAccessRecords,
  getWalkInPatientRecords,
  registerPatient,
  signInWithPassword,
  signOut,
} from "@odyssey/supabase-client";
import type {
  AppointmentSlotSummary,
  PatientAccessRecords,
  WalkInAccessRecords,
} from "@odyssey/types";
import {
  AppointmentStatusBadge,
  Button,
  DataTable,
  Field,
  Input,
} from "@odyssey/ui";
import { useEffect, useRef, useState, type FormEvent } from "react";

const organizationId = "10000000-0000-0000-0000-000000000001";
const clinicName = "Synthetic Access Control Clinic";
const localTestPassword = "LocalOnly-2026!";

function formatAppointmentTime(value: string | null): string {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function Home() {
  const [email, setEmail] = useState("patient@synthetic.odyssey.test");
  const [password, setPassword] = useState("");
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const [slots, setSlots] = useState<AppointmentSlotSummary[]>([]);
  const [records, setRecords] = useState<PatientAccessRecords | null>(null);
  const [walkInRecords, setWalkInRecords] =
    useState<WalkInAccessRecords | null>(null);
  const [busySlotId, setBusySlotId] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [walkInSubmitting, setWalkInSubmitting] = useState(false);
  const authRequestInFlight = useRef(false);
  const walkInRequestInFlight = useRef(false);
  const [status, setStatus] = useState(
    "Register or sign in to book an appointment.",
  );

  async function loadPatientDashboard() {
    const client = createBrowserSupabaseClient();
    const [slotResult, recordResult] = await Promise.all([
      getAvailableAppointmentSlots(client, organizationId),
      getPatientAccessRecords(client),
    ]);
    if (slotResult.error || recordResult.error) {
      setStatus(
        `Unable to load appointments: ${slotResult.error?.message ?? recordResult.error?.message}`,
      );
      return;
    }
    setSlots(slotResult.data);
    setRecords(recordResult.data);
  }

  useEffect(() => {
    const client = createBrowserSupabaseClient();
    void getCurrentUserEmail(client).then((result) => {
      if (!result.error && result.data) {
        setSignedInAs(result.data);
        void loadPatientDashboard();
      }
    });
  }, []);

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authRequestInFlight.current) return;
    authRequestInFlight.current = true;
    setAuthSubmitting(true);
    const fields = new FormData(event.currentTarget);
    try {
      const result = await registerPatient(
        createBrowserSupabaseClient(),
        {
          displayName: String(fields.get("displayName") ?? ""),
          email: String(fields.get("registrationEmail") ?? ""),
          organizationId,
          password: String(fields.get("registrationPassword") ?? ""),
        },
        window.location.origin,
      );
      if (result.error)
        return setStatus(`Registration failed: ${result.error.message}`);
      if (!result.data.signedIn) {
        setStatus(
          `Registration received for ${result.data.email}. Confirm the email, then sign in.`,
        );
        return;
      }
      setSignedInAs(result.data.email);
      setStatus("Registration complete. Choose an available appointment slot.");
      await loadPatientDashboard();
    } finally {
      authRequestInFlight.current = false;
      setAuthSubmitting(false);
    }
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authRequestInFlight.current) return;
    authRequestInFlight.current = true;
    setAuthSubmitting(true);
    try {
      const result = await signInWithPassword(
        createBrowserSupabaseClient(),
        email,
        password,
      );
      if (result.error)
        return setStatus(`Sign-in failed: ${result.error.message}`);
      setSignedInAs(result.data);
      setStatus("Signed in. Choose an available appointment slot.");
      await loadPatientDashboard();
    } finally {
      authRequestInFlight.current = false;
      setAuthSubmitting(false);
    }
  }

  async function handleBook(slotId: string) {
    setBusySlotId(slotId);
    const result = await bookAppointmentSlot(
      createBrowserSupabaseClient(),
      slotId,
    );
    setBusySlotId(null);
    if (result.error)
      return setStatus(`Booking failed: ${result.error.message}`);
    setStatus("Appointment booked. It is now in the doctor's live queue.");
    await loadPatientDashboard();
  }

  async function handleWalkInAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (walkInRequestInFlight.current) return;
    walkInRequestInFlight.current = true;
    setWalkInSubmitting(true);
    const fields = new FormData(event.currentTarget);
    try {
      const result = await getWalkInPatientRecords(
        createBrowserSupabaseClient(),
        {
          organizationId,
          walkInId: String(fields.get("walkInId") ?? ""),
          pin: String(fields.get("pin") ?? ""),
        },
      );
      if (result.error)
        return setStatus(`Walk-in access failed: ${result.error.message}`);
      setWalkInRecords(result.data);
      setStatus("Walk-in credentials verified. Your booking appears below.");
    } finally {
      walkInRequestInFlight.current = false;
      setWalkInSubmitting(false);
    }
  }

  async function handleSignOut() {
    const result = await signOut(createBrowserSupabaseClient());
    if (result.error)
      return setStatus(`Sign-out failed: ${result.error.message}`);
    setSignedInAs(null);
    setRecords(null);
    setSlots([]);
    setStatus("Signed out.");
  }

  const displayedAppointments =
    walkInRecords?.appointments ?? records?.appointments ?? [];

  return (
    <main>
      <p className="eyebrow">Patient portal</p>
      <h1>Book a clinic appointment</h1>
      <p className="hint">{clinicName}</p>

      {!signedInAs ? (
        <div className="two-column">
          <section>
            <h2>Create an account</h2>
            <form
              className="stack"
              onSubmit={handleRegister}
              aria-busy={authSubmitting}
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
                <Input name="registrationEmail" type="email" required />
              </Field>
              <Field label="Password">
                <Input
                  name="registrationPassword"
                  type="password"
                  minLength={8}
                  required
                />
              </Field>
              <Button type="submit" disabled={authSubmitting}>
                {authSubmitting ? "Registering…" : "Register"}
              </Button>
            </form>
          </section>
          <section>
            <h2>Sign in</h2>
            <form
              className="stack"
              onSubmit={handleSignIn}
              aria-busy={authSubmitting}
            >
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
              <Button type="submit" disabled={authSubmitting}>
                {authSubmitting ? "Signing in…" : "Sign in"}
              </Button>
              <p className="hint">Local reset password: {localTestPassword}</p>
            </form>
          </section>
        </div>
      ) : (
        <>
          <div className="session">
            <span>Signed in as {signedInAs}</span>
            <Button variant="secondary" onClick={handleSignOut}>
              Sign out
            </Button>
          </div>
          <section>
            <h2>Available slots</h2>
            <DataTable
              caption="Available appointments for this clinic."
              data={slots}
              emptyMessage="No appointment slots are available."
              getRowId={(slot) => slot.id}
              columns={[
                {
                  id: "time",
                  header: "Date and time",
                  cell: (slot) => formatAppointmentTime(slot.start_at),
                },
                {
                  id: "service",
                  header: "Service",
                  cell: (slot) => slot.service_type ?? "Consultation",
                },
                {
                  id: "action",
                  header: "",
                  cell: (slot) => (
                    <Button
                      size="sm"
                      disabled={busySlotId !== null}
                      onClick={() => void handleBook(slot.id)}
                      aria-label={`Book ${formatAppointmentTime(slot.start_at)}`}
                    >
                      {busySlotId === slot.id ? "Booking…" : "Book"}
                    </Button>
                  ),
                },
              ]}
            />
          </section>
        </>
      )}

      {!signedInAs && (
        <section>
          <h2>Use a front-desk walk-in ID</h2>
          <form
            className="inline-form"
            onSubmit={handleWalkInAccess}
            aria-busy={walkInSubmitting}
          >
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
            <Button type="submit" disabled={walkInSubmitting}>
              {walkInSubmitting ? "Verifying…" : "View my booking"}
            </Button>
          </form>
        </section>
      )}

      <p role="status">{status}</p>

      {(records || walkInRecords) && (
        <section>
          <h2>My appointments</h2>
          <DataTable
            caption="Appointments visible to this patient only."
            data={displayedAppointments}
            emptyMessage="No appointments booked yet."
            getRowId={(appointment) => appointment.id}
            columns={[
              {
                id: "time",
                header: "Date and time",
                cell: (appointment) =>
                  formatAppointmentTime(appointment.start_at),
              },
              {
                id: "service",
                header: "Service",
                cell: (appointment) =>
                  appointment.service_type ?? "Consultation",
              },
              {
                id: "status",
                header: "Status",
                cell: (appointment) => (
                  <AppointmentStatusBadge status={appointment.status} />
                ),
              },
            ]}
          />
        </section>
      )}
    </main>
  );
}
