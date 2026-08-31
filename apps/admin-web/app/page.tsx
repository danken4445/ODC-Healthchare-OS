"use client";

import {
  bookAppointmentSlot,
  createBrowserSupabaseClient,
  createWalkInPatient,
  getAvailableAppointmentSlots,
  getCurrentUserEmail,
  getDailyAppointmentQueue,
  signInWithPassword,
  signOut,
} from "@odyssey/supabase-client";
import type {
  AppointmentQueueItem,
  AppointmentSlotSummary,
  WalkInCredentials,
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

function formatTime(value: string | null): string {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function Home() {
  const [email, setEmail] = useState("front-desk@synthetic.odyssey.test");
  const [password, setPassword] = useState("");
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<AppointmentQueueItem[]>([]);
  const [slots, setSlots] = useState<AppointmentSlotSummary[]>([]);
  const [issuedCredentials, setIssuedCredentials] =
    useState<WalkInCredentials | null>(null);
  const [status, setStatus] = useState(
    "Sign in as front desk to view today's appointments.",
  );
  const [submitting, setSubmitting] = useState(false);

  async function loadSchedule() {
    const client = createBrowserSupabaseClient();
    const [appointmentResult, slotResult] = await Promise.all([
      getDailyAppointmentQueue(client, organizationId),
      getAvailableAppointmentSlots(client, organizationId),
    ]);
    if (appointmentResult.error || slotResult.error) {
      setStatus(
        `Unable to load clinic schedule: ${appointmentResult.error?.message ?? slotResult.error?.message}`,
      );
      return;
    }
    setAppointments(appointmentResult.data);
    setSlots(slotResult.data);
  }

  useEffect(() => {
    void getCurrentUserEmail(createBrowserSupabaseClient()).then((result) => {
      if (!result.error && result.data) {
        setSignedInAs(result.data);
        void loadSchedule();
      }
    });
  }, []);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await signInWithPassword(
      createBrowserSupabaseClient(),
      email,
      password,
    );
    if (result.error)
      return setStatus(`Sign-in failed: ${result.error.message}`);
    setSignedInAs(result.data);
    setStatus("Signed in. Today's clinic schedule is ready.");
    await loadSchedule();
  }

  async function handleCreateWalkIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const slotId = String(fields.get("slotId") ?? "");
    setSubmitting(true);
    setIssuedCredentials(null);
    const patientResult = await createWalkInPatient(
      createBrowserSupabaseClient(),
      {
        organizationId,
        name: String(fields.get("name") ?? "").trim(),
        birthDate: String(fields.get("birthDate") ?? "") || null,
        gender: String(fields.get("gender") ?? "") || null,
      },
    );
    if (patientResult.error) {
      setSubmitting(false);
      return setStatus(
        `Walk-in creation failed: ${patientResult.error.message}`,
      );
    }

    const bookingResult = await bookAppointmentSlot(
      createBrowserSupabaseClient(),
      slotId,
      patientResult.data.patientId,
    );
    setSubmitting(false);
    setIssuedCredentials(patientResult.data);
    if (bookingResult.error) {
      setStatus(
        `Patient created, but booking failed: ${bookingResult.error.message}. Keep the issued credentials and choose another slot.`,
      );
      await loadSchedule();
      return;
    }
    setStatus("Walk-in patient and appointment created.");
    form.reset();
    await loadSchedule();
  }

  async function handleSignOut() {
    const result = await signOut(createBrowserSupabaseClient());
    if (result.error)
      return setStatus(`Sign-out failed: ${result.error.message}`);
    setSignedInAs(null);
    setAppointments([]);
    setSlots([]);
    setIssuedCredentials(null);
    setStatus("Signed out.");
  }

  return (
    <main>
      <p className="eyebrow">Front desk</p>
      <h1>Today's clinic appointments</h1>
      {!signedInAs ? (
        <form onSubmit={handleSignIn} className="stack narrow-form">
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
          <Button type="submit">Sign in</Button>
          <p className="hint">Local reset password: LocalOnly-2026!</p>
        </form>
      ) : (
        <>
          <div className="session">
            <span>Signed in as {signedInAs}</span>
            <span>
              <Button onClick={() => void loadSchedule()}>Refresh</Button>{" "}
              <Button variant="secondary" onClick={handleSignOut}>
                Sign out
              </Button>
            </span>
          </div>

          <DataTable
            caption="Booked and arrived appointments for the clinic today."
            data={appointments}
            emptyMessage="No appointments today."
            getRowId={(appointment) => appointment.id}
            columns={[
              {
                id: "time",
                header: "Time",
                cell: (appointment) => formatTime(appointment.start_at),
              },
              {
                id: "patient",
                header: "Patient",
                cell: (appointment) => appointment.patientName,
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

          <section>
            <h2>Create walk-in patient and booking</h2>
            <form onSubmit={handleCreateWalkIn} className="stack">
              <Field label="Patient name">
                <Input
                  name="name"
                  minLength={2}
                  maxLength={120}
                  placeholder="Synthetic walk-in patient"
                  required
                />
              </Field>
              <div className="two-column">
                <Field label="Date of birth">
                  <Input name="birthDate" type="date" />
                </Field>
                <Field label="Gender">
                  <select
                    className="odyssey-input"
                    name="gender"
                    defaultValue=""
                  >
                    <option value="">Not provided</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="other">Other</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </Field>
              </div>
              <Field label="Available appointment slot">
                <select
                  className="odyssey-input"
                  name="slotId"
                  required
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select a time
                  </option>
                  {slots.map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      {formatTime(slot.start_at)} —{" "}
                      {slot.service_type ?? "Consultation"}
                    </option>
                  ))}
                </select>
              </Field>
              <Button type="submit" disabled={submitting || !slots.length}>
                {submitting ? "Creating…" : "Create walk-in and book"}
              </Button>
            </form>
          </section>
        </>
      )}

      {issuedCredentials && (
        <section className="credential" aria-live="polite">
          <strong>Give these credentials to the patient now</strong>
          <code>{issuedCredentials.walkInId}</code>
          <code>PIN: {issuedCredentials.pin}</code>
        </section>
      )}
      <p role="status">{status}</p>
    </main>
  );
}
