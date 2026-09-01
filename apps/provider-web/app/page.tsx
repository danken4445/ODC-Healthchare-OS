"use client";

import {
  addSoapObservation,
  createAppointmentSlot,
  createBrowserSupabaseClient,
  finishClinicalEncounter,
  getClinicServices,
  getCurrentUserEmail,
  getPortalAccess,
  getCurrentStaffOrganization,
  getDailyAppointmentQueue,
  getOrganizationClinicalRecords,
  getProviderAppointmentSlots,
  issueMedicalCertificate,
  issuePrescription,
  setAppointmentSlotUnavailable,
  signInWithPassword,
  signOut,
  startAppointmentEncounter,
  subscribeToAppointmentQueue,
} from "@odyssey/supabase-client";
import type {
  AppointmentQueueItem,
  AppointmentSlotSummary,
  ClinicServiceSummary,
  OrganizationClinicalRecords,
} from "@odyssey/types";
import {
  AppointmentStatusBadge,
  Button,
  Card,
  DataTable,
  Field,
  Input,
} from "@odyssey/ui";
import { useCallback, useEffect, useState, type FormEvent } from "react";

function formatTime(value: string | null): string {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function Home() {
  const [email, setEmail] = useState("doctor@synthetic.odyssey.test");
  const [password, setPassword] = useState("");
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [queue, setQueue] = useState<AppointmentQueueItem[]>([]);
  const [slots, setSlots] = useState<AppointmentSlotSummary[]>([]);
  const [services, setServices] = useState<ClinicServiceSummary[]>([]);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState("Offline");
  const [status, setStatus] = useState(
    "Sign in as the assigned doctor to see today's queue.",
  );
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [clinicalRecords, setClinicalRecords] =
    useState<OrganizationClinicalRecords | null>(null);
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(null);
  const [clinicalBusy, setClinicalBusy] = useState(false);
  const [canPrescribe, setCanPrescribe] = useState(false);

  const loadQueue = useCallback(
    async (clinicId = organizationId) => {
      if (!clinicId) return;
      const result = await getDailyAppointmentQueue(
        createBrowserSupabaseClient(),
        clinicId,
      );
      if (result.error) {
        setStatus(`Queue query failed: ${result.error.message}`);
        return;
      }
      setQueue(result.data);
    },
    [organizationId],
  );

  const loadAvailability = useCallback(
    async (clinicId = organizationId) => {
      if (!clinicId) return;
      const client = createBrowserSupabaseClient();
      const [slotResult, serviceResult] = await Promise.all([
        getProviderAppointmentSlots(client, clinicId),
        getClinicServices(client, clinicId),
      ]);
      if (slotResult.error || serviceResult.error) {
        setStatus(
          `Availability query failed: ${slotResult.error?.message ?? serviceResult.error?.message}`,
        );
        return;
      }
      setSlots(slotResult.data);
      setServices(serviceResult.data);
    },
    [organizationId],
  );

  const loadClinicalRecords = useCallback(async (clinicId = organizationId) => {
    if (!clinicId) return;
    const result = await getOrganizationClinicalRecords(createBrowserSupabaseClient(), clinicId);
    if (result.error) return setStatus(`Clinical record query failed: ${result.error.message}`);
    setClinicalRecords(result.data);
  }, [organizationId]);

  useEffect(() => {
    void getCurrentUserEmail(createBrowserSupabaseClient()).then((result) => {
      if (!result.error && result.data) {
        void openProviderPortal(result.data);
      }
    });
  }, []);

  useEffect(() => {
    if (!signedInAs || !organizationId) return;
    void loadQueue();
    void loadAvailability();
    void loadClinicalRecords();
    const unsubscribe = subscribeToAppointmentQueue(
      createBrowserSupabaseClient(),
      organizationId,
      () => void loadQueue(),
      (connectionStatus) => {
        setLiveStatus(
          connectionStatus === "SUBSCRIBED" ? "Live" : connectionStatus,
        );
      },
    );
    return unsubscribe;
  }, [loadAvailability, loadClinicalRecords, loadQueue, organizationId, signedInAs]);

  async function loadStaffClinic() {
    const result = await getCurrentStaffOrganization(
      createBrowserSupabaseClient(),
    );
    if (result.error)
      return setStatus(`Clinic access failed: ${result.error.message}`);
    setOrganizationId(result.data);
    await Promise.all([loadQueue(result.data), loadAvailability(result.data), loadClinicalRecords(result.data)]);
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await signInWithPassword(
      createBrowserSupabaseClient(),
      email,
      password,
    );
    if (result.error)
      return setStatus(`Sign-in failed: ${result.error.message}`);
    await openProviderPortal(result.data);
  }

  async function openProviderPortal(emailAddress: string) {
    const client = createBrowserSupabaseClient();
    const accessResult = await getPortalAccess(client, "provider");
    if (accessResult.error) {
      await signOut(client);
      return setStatus(`Portal access failed: ${accessResult.error.message}`);
    }
    if (!accessResult.data.allowed) {
      await signOut(client);
      setSignedInAs(null);
      setOrganizationId(null);
      return setStatus(
        "This account is not authorized for the Provider workspace. Use the portal assigned to your role.",
      );
    }
    setSignedInAs(emailAddress);
    setCanPrescribe(accessResult.data.roleCodes.some((role) => role === "doctor" || role === "specialist"));
    setStatus("Signed in. Loading your assigned clinic queue.");
    await loadStaffClinic();
  }

  async function handleStart(appointmentId: string) {
    setStartingId(appointmentId);
    const result = await startAppointmentEncounter(
      createBrowserSupabaseClient(),
      appointmentId,
    );
    setStartingId(null);
    if (result.error)
      return setStatus(`Unable to start encounter: ${result.error.message}`);
    setStatus(`Encounter ${result.data} is in progress.`);
    setSelectedEncounterId(result.data);
    await loadClinicalRecords();
    await loadQueue();
  }

  async function handleSoap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEncounterId) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const section = String(fields.get("section")) as "S" | "O" | "A" | "P";
    const current = clinicalRecords?.observations.find((item) => item.encounter_id === selectedEncounterId && item.code === `SOAP-${section}`);
    setClinicalBusy(true);
    const result = await addSoapObservation(createBrowserSupabaseClient(), {
      encounterId: selectedEncounterId, section, text: String(fields.get("text") ?? ""), supersedesId: current?.id,
    });
    setClinicalBusy(false);
    if (result.error) return setStatus(`Unable to save SOAP note: ${result.error.message}`);
    form.reset();
    setStatus(current ? "SOAP note revision saved." : "SOAP note saved.");
    await loadClinicalRecords();
  }

  async function handlePrescription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEncounterId) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setClinicalBusy(true);
    const result = await issuePrescription(createBrowserSupabaseClient(), { encounterId: selectedEncounterId, medication: String(fields.get("medication") ?? ""), dosage: String(fields.get("dosage") ?? ""), note: String(fields.get("note") ?? "") });
    setClinicalBusy(false);
    if (result.error) return setStatus(`Unable to issue prescription: ${result.error.message}`);
    form.reset(); setStatus("Prescription issued."); await loadClinicalRecords();
  }

  async function handleCertificate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEncounterId) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setClinicalBusy(true);
    const result = await issueMedicalCertificate(createBrowserSupabaseClient(), { encounterId: selectedEncounterId, title: String(fields.get("title") ?? ""), statement: String(fields.get("statement") ?? "") });
    setClinicalBusy(false);
    if (result.error) return setStatus(`Unable to issue certificate: ${result.error.message}`);
    form.reset(); setStatus("Medical certificate issued."); await loadClinicalRecords();
  }

  async function handleFinishEncounter() {
    if (!selectedEncounterId) return;
    setClinicalBusy(true);
    const result = await finishClinicalEncounter(createBrowserSupabaseClient(), selectedEncounterId);
    setClinicalBusy(false);
    if (result.error) return setStatus(`Unable to complete encounter: ${result.error.message}`);
    setSelectedEncounterId(null); setStatus("Encounter completed and shared with the patient.");
    await Promise.all([loadQueue(), loadClinicalRecords()]);
  }

  async function handleCreateAvailability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return setStatus("No staff clinic is assigned.");
    const form = event.currentTarget;
    const fields = new FormData(form);
    const start = new Date(String(fields.get("startAt") ?? ""));
    const selectedService = services.find(
      (service) => service.id === String(fields.get("clinicServiceId") ?? ""),
    );
    if (!selectedService || Number.isNaN(start.getTime())) {
      setStatus("Choose a service and valid start time.");
      return;
    }
    const end = new Date(
      start.getTime() + selectedService.duration_minutes * 60_000,
    );
    setAvailabilityBusy(true);
    const result = await createAppointmentSlot(createBrowserSupabaseClient(), {
      clinicServiceId: selectedService.id,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
    });
    setAvailabilityBusy(false);
    if (result.error)
      return setStatus(`Unable to add availability: ${result.error.message}`);
    setStatus("Availability added. Patients can book it now.");
    form.reset();
    await loadAvailability();
  }

  async function handleAvailabilityToggle(
    slot: AppointmentSlotSummary,
    unavailable: boolean,
  ) {
    setAvailabilityBusy(true);
    const result = await setAppointmentSlotUnavailable(
      createBrowserSupabaseClient(),
      slot.id,
      unavailable,
    );
    setAvailabilityBusy(false);
    if (result.error)
      return setStatus(
        `Unable to update availability: ${result.error.message}`,
      );
    setStatus(
      unavailable ? "Availability withdrawn." : "Availability reopened.",
    );
    await loadAvailability();
  }

  async function handleSignOut() {
    const result = await signOut(createBrowserSupabaseClient());
    if (result.error)
      return setStatus(`Sign-out failed: ${result.error.message}`);
    setSignedInAs(null);
    setOrganizationId(null);
    setQueue([]);
    setSlots([]);
    setServices([]);
    setLiveStatus("Offline");
    setClinicalRecords(null);
    setSelectedEncounterId(null);
    setStatus("Signed out.");
  }

  return (
    <main>
      <p className="eyebrow">Provider workspace</p>
      <h1>My queue today</h1>
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
                {liveStatus} queue
              </span>
              <Button variant="secondary" onClick={handleSignOut}>
                Sign out
              </Button>
            </span>
          </div>
          <DataTable
            caption="Appointments assigned to this doctor today."
            data={queue}
            emptyMessage="Your queue is empty."
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
                cell: (appointment) =>
                  appointment.encounterStatus === "in_progress" ? (
                    <span className="encounter-status">In progress</span>
                  ) : (
                    <AppointmentStatusBadge status={appointment.status} />
                  ),
              },
              {
                id: "action",
                header: "",
                cell: (appointment) =>
                  appointment.encounterStatus === "in_progress" ? (
                    <Button size="sm" variant="outline" onClick={() => {
                      const encounter = clinicalRecords?.encounters.find((item) => item.appointment_id === appointment.id);
                      setSelectedEncounterId(encounter?.id ?? null);
                    }}>Open chart</Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={startingId !== null}
                      onClick={() => void handleStart(appointment.id)}
                      aria-label={`Start appointment for ${appointment.patientName}`}
                    >
                      {startingId === appointment.id
                        ? "Starting…"
                        : "Mark in progress"}
                    </Button>
                  ),
              },
            ]}
          />

          {selectedEncounterId && (
            <section aria-labelledby="chart-heading">
              <div className="section-heading">
                <h2 id="chart-heading">Consultation chart</h2>
                {canPrescribe && <Button disabled={clinicalBusy} onClick={() => void handleFinishEncounter()}>Complete encounter</Button>}
              </div>
              <div className="clinical-grid">
                <Card>
                  <h3>SOAP notes</h3>
                  <form className="stack" onSubmit={handleSoap}>
                    <Field label="Section"><select className="odyssey-input" name="section" required><option value="S">Subjective</option><option value="O">Objective</option><option value="A">Assessment</option><option value="P">Plan</option></select></Field>
                    <Field label="Clinical note"><textarea className="odyssey-input" name="text" rows={5} maxLength={10000} required /></Field>
                    <Button type="submit" disabled={clinicalBusy}>Save note</Button>
                  </form>
                  <div className="record-list">
                    {clinicalRecords?.observations.filter((item) => item.encounter_id === selectedEncounterId && item.code.startsWith("SOAP-")).map((item) => (
                      <article key={item.id}><strong>{item.code_display}</strong><p>{typeof item.value === "object" && item.value && !Array.isArray(item.value) && typeof item.value.text === "string" ? item.value.text : ""}</p><small>{item.supersedes_id ? "Revision" : "Original"} · {item.effective_at ? new Date(item.effective_at).toLocaleString() : ""}</small></article>
                    ))}
                  </div>
                </Card>
                {canPrescribe && <Card>
                  <h3>Prescription</h3>
                  <form className="stack" onSubmit={handlePrescription}>
                    <Field label="Medication"><Input name="medication" maxLength={240} required /></Field>
                    <Field label="Dosage and directions"><textarea className="odyssey-input" name="dosage" rows={3} maxLength={1000} required /></Field>
                    <Field label="Note"><Input name="note" maxLength={1000} /></Field>
                    <Button type="submit" disabled={clinicalBusy}>Issue prescription</Button>
                  </form>
                </Card>}
                {canPrescribe && <Card>
                  <h3>Medical certificate</h3>
                  <form className="stack" onSubmit={handleCertificate}>
                    <Field label="Certificate title"><Input name="title" defaultValue="Medical Certificate" maxLength={200} required /></Field>
                    <Field label="Statement"><textarea className="odyssey-input" name="statement" rows={4} maxLength={5000} required /></Field>
                    <Button type="submit" disabled={clinicalBusy}>Issue certificate</Button>
                  </form>
                </Card>}
              </div>
            </section>
          )}

          {canPrescribe && <section>
            <h2>My availability</h2>
            <form className="inline-form" onSubmit={handleCreateAvailability}>
              <Field label="Service">
                <select
                  className="odyssey-input"
                  name="clinicServiceId"
                  required
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select a service
                  </option>
                  {services
                    .filter((service) => service.booking_enabled)
                    .map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name} ({service.duration_minutes} min)
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Start time">
                <Input name="startAt" type="datetime-local" required />
              </Field>
              <Button type="submit" disabled={availabilityBusy}>
                {availabilityBusy ? "Saving…" : "Add availability"}
              </Button>
            </form>
            <DataTable
              caption="Upcoming appointment slots assigned to you."
              data={slots}
              emptyMessage="No upcoming availability."
              getRowId={(slot) => slot.id}
              columns={[
                {
                  id: "time",
                  header: "Time",
                  cell: (slot) => formatTime(slot.start_at),
                },
                {
                  id: "service",
                  header: "Service",
                  cell: (slot) => slot.service_type ?? "Consultation",
                },
                {
                  id: "availability",
                  header: "Availability",
                  cell: (slot) =>
                    slot.status === "free"
                      ? "Bookable"
                      : slot.status === "busy_unavailable"
                        ? "Unavailable"
                        : "Booked",
                },
                {
                  id: "action",
                  header: "",
                  cell: (slot) =>
                    slot.appointment_id || slot.status === "busy" ? null : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={availabilityBusy}
                        onClick={() =>
                          void handleAvailabilityToggle(
                            slot,
                            slot.status === "free",
                          )
                        }
                      >
                        {slot.status === "free" ? "Withdraw" : "Reopen"}
                      </Button>
                    ),
                },
              ]}
            />
          </section>}
        </>
      )}
      <p role="status">{status}</p>
    </main>
  );
}
