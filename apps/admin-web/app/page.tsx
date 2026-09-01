"use client";

import {
  bookAppointmentSlot,
  createBrowserSupabaseClient,
  createWalkInPatient,
  getAccessibleOrganizations,
  getAvailableAppointmentSlots,
  getCurrentUserEmail,
  getDailyAppointmentQueue,
  getOrganizationPatients,
  getPortalAccess,
  signInWithPassword,
  signOut,
  subscribeToAppointmentQueue,
  updateAppointmentStatus,
} from "@odyssey/supabase-client";
import type {
  AppointmentQueueItem,
  AppointmentSlotSummary,
  PatientSummary,
  PublicClinicSummary,
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
import Link from "next/link";

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
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [accessibleClinics, setAccessibleClinics] = useState<
    PublicClinicSummary[]
  >([]);
  const [canManageAccounts, setCanManageAccounts] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [appointments, setAppointments] = useState<AppointmentQueueItem[]>([]);
  const [slots, setSlots] = useState<AppointmentSlotSummary[]>([]);
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [issuedCredentials, setIssuedCredentials] =
    useState<WalkInCredentials | null>(null);
  const [status, setStatus] = useState(
    "Sign in as front desk to view today's appointments.",
  );
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState("Offline");

  async function loadSchedule(clinicId = organizationId) {
    if (!clinicId) return;
    const client = createBrowserSupabaseClient();
    const [appointmentResult, slotResult, patientResult] = await Promise.all([
      getDailyAppointmentQueue(client, clinicId, undefined, [
        "booked",
        "arrived",
        "fulfilled",
        "cancelled",
        "noshow",
      ]),
      getAvailableAppointmentSlots(client, clinicId),
      getOrganizationPatients(client, clinicId),
    ]);
    if (appointmentResult.error || slotResult.error || patientResult.error) {
      setStatus(
        `Unable to load clinic schedule: ${appointmentResult.error?.message ?? slotResult.error?.message ?? patientResult.error?.message}`,
      );
      return;
    }
    setAppointments(appointmentResult.data);
    setSlots(slotResult.data);
    setPatients(patientResult.data);
  }

  useEffect(() => {
    void getCurrentUserEmail(createBrowserSupabaseClient()).then((result) => {
      if (!result.error && result.data) {
        void openAdminPortal(result.data);
      }
    });
  }, []);

  useEffect(() => {
    if (!signedInAs || !organizationId) return;
    const unsubscribe = subscribeToAppointmentQueue(
      createBrowserSupabaseClient(),
      organizationId,
      () => void loadSchedule(),
      (connectionStatus) =>
        setLiveStatus(
          connectionStatus === "SUBSCRIBED" ? "Live" : connectionStatus,
        ),
    );
    return unsubscribe;
  }, [organizationId, signedInAs]);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await signInWithPassword(
      createBrowserSupabaseClient(),
      email,
      password,
    );
    if (result.error)
      return setStatus(`Sign-in failed: ${result.error.message}`);
    await openAdminPortal(result.data);
  }

  async function openAdminPortal(emailAddress: string) {
    const client = createBrowserSupabaseClient();
    const accessResult = await getPortalAccess(client, "admin");
    if (accessResult.error) {
      await signOut(client);
      setCanManageAccounts(false);
      return setStatus(`Portal access failed: ${accessResult.error.message}`);
    }
    if (!accessResult.data.allowed) {
      await signOut(client);
      setSignedInAs(null);
      setOrganizationId(null);
      setCanManageAccounts(false);
      return setStatus(
        "This account is not authorized for the administrative workspace. Use the portal assigned to your role.",
      );
    }

    setSignedInAs(emailAddress);
    setIsPlatformAdmin(accessResult.data.isSuperadmin);
    setCanManageAccounts(
      accessResult.data.roleCodes.some(
        (role) => role === "admin" || role === "owner",
      ),
    );
    if (accessResult.data.isSuperadmin) {
      setAccessibleClinics([]);
      setOrganizationId(null);
      return setStatus("Platform administrator access confirmed.");
    }

    const clinicResult = await getAccessibleOrganizations(
      client,
      accessResult.data.organizationIds,
    );
    if (clinicResult.error || !clinicResult.data.length) {
      await signOut(client);
      setSignedInAs(null);
      return setStatus(
        `Clinic access failed: ${clinicResult.error?.message ?? "No assigned clinic is available."}`,
      );
    }
    setAccessibleClinics(clinicResult.data);
    const firstClinicId = clinicResult.data[0].id;
    setOrganizationId(firstClinicId);
    setStatus("Signed in. Loading your clinic schedule.");
    await loadSchedule(firstClinicId);
  }

  async function handleClinicChange(clinicId: string) {
    setOrganizationId(clinicId);
    setStatus("Loading the selected clinic schedule.");
    await loadSchedule(clinicId);
  }

  async function handleCreateWalkIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    if (!organizationId) return setStatus("No staff clinic is assigned.");
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

  async function handleBookExisting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    if (!organizationId) return setStatus("No staff clinic is assigned.");
    setSubmitting(true);
    const result = await bookAppointmentSlot(
      createBrowserSupabaseClient(),
      String(fields.get("existingSlotId") ?? ""),
      String(fields.get("patientId") ?? ""),
    );
    setSubmitting(false);
    if (result.error)
      return setStatus(
        `Administrative booking failed: ${result.error.message}`,
      );
    setStatus("Appointment scheduled for the selected patient.");
    form.reset();
    await loadSchedule();
  }

  async function handleStatusChange(
    appointmentId: string,
    nextStatus: "arrived" | "cancelled" | "noshow",
  ) {
    setUpdatingId(appointmentId);
    const result = await updateAppointmentStatus(
      createBrowserSupabaseClient(),
      appointmentId,
      nextStatus,
    );
    setUpdatingId(null);
    if (result.error)
      return setStatus(`Status update failed: ${result.error.message}`);
    setStatus(`Appointment marked ${nextStatus.replace("noshow", "no show")}.`);
    await loadSchedule();
  }

  async function handleSignOut() {
    const result = await signOut(createBrowserSupabaseClient());
    if (result.error)
      return setStatus(`Sign-out failed: ${result.error.message}`);
    setSignedInAs(null);
    setOrganizationId(null);
    setAccessibleClinics([]);
    setIsPlatformAdmin(false);
    setCanManageAccounts(false);
    setAppointments([]);
    setSlots([]);
    setPatients([]);
    setIssuedCredentials(null);
    setLiveStatus("Offline");
    setStatus("Signed out.");
  }

  if (signedInAs && isPlatformAdmin) {
    return (
      <main>
        <p className="eyebrow">Odyssey platform administration</p>
        <h1>Platform access confirmed</h1>
        <div className="session">
          <span>Signed in as {signedInAs}</span>
          <Button variant="secondary" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
        <section>
          <p>
            This account can administer clinic configuration, roles, and audit
            data. It has no ambient access to patients, appointments, or other
            clinical records.
          </p>
          <p className="hint">
            The dedicated Superadmin management screens are scheduled for the
            Platform &amp; Governance loop.
          </p>
        </section>
        <p role="status">{status}</p>
      </main>
    );
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
            <span className="session-actions">
              <span
                className="live-indicator"
                data-live={liveStatus === "Live"}
              >
                {liveStatus} schedule
              </span>
              {organizationId && (
                <Link href={`/waiting-room?clinic=${organizationId}`}>
                  Waiting-room display
                </Link>
              )}
              {canManageAccounts && <Link href="/staff">Staff accounts</Link>}
              <Button onClick={() => void loadSchedule()}>Refresh</Button>{" "}
              <Button variant="secondary" onClick={handleSignOut}>
                Sign out
              </Button>
            </span>
          </div>

          {accessibleClinics.length > 1 && (
            <section>
              <Field label="Clinic workspace">
                <select
                  className="odyssey-input"
                  value={organizationId ?? ""}
                  onChange={(event) =>
                    void handleClinicChange(event.target.value)
                  }
                >
                  {accessibleClinics.map((clinic) => (
                    <option key={clinic.id} value={clinic.id}>
                      {clinic.name}
                    </option>
                  ))}
                </select>
              </Field>
            </section>
          )}

          <DataTable
            caption="Booked and arrived appointments for the clinic today."
            data={appointments}
            emptyMessage="No appointments today."
            getRowId={(appointment) => appointment.id}
            columns={[
              {
                id: "queue",
                header: "Queue",
                cell: (appointment) =>
                  appointment.queue_number
                    ? `A-${String(appointment.queue_number).padStart(3, "0")}`
                    : "—",
              },
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
              {
                id: "actions",
                header: "Actions",
                cell: (appointment) => (
                  <span className="table-actions">
                    {appointment.status === "booked" && (
                      <Button
                        size="sm"
                        disabled={updatingId !== null}
                        onClick={() =>
                          void handleStatusChange(appointment.id, "arrived")
                        }
                      >
                        Check in
                      </Button>
                    )}
                    {["booked", "arrived"].includes(appointment.status) && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={updatingId !== null}
                          onClick={() =>
                            void handleStatusChange(appointment.id, "noshow")
                          }
                        >
                          No show
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={updatingId !== null}
                          onClick={() =>
                            void handleStatusChange(appointment.id, "cancelled")
                          }
                        >
                          Cancel
                        </Button>
                      </>
                    )}
                  </span>
                ),
              },
            ]}
          />

          <section>
            <h2>Schedule an existing patient</h2>
            <form onSubmit={handleBookExisting} className="stack">
              <Field label="Patient">
                <select
                  className="odyssey-input"
                  name="patientId"
                  required
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select a patient
                  </option>
                  {patients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.displayName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Appointment slot">
                <select
                  className="odyssey-input"
                  name="existingSlotId"
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
              <Button
                type="submit"
                disabled={submitting || !slots.length || !patients.length}
              >
                {submitting ? "Scheduling…" : "Schedule appointment"}
              </Button>
            </form>
          </section>

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
