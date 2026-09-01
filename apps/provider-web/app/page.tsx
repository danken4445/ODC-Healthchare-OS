"use client";

import {
  createBrowserSupabaseClient,
  createClinicService,
  finishClinicalEncounter,
  getClinicServices,
  getCurrentUserEmail,
  getPortalAccess,
  getCurrentStaffOrganization,
  getCurrentProviderRoleId,
  getDailyAppointmentQueue,
  getOrganizationClinicalRecords,
  getProviderAppointmentSlots,
  issueMedicalCertificate,
  issuePrescription,
  setAppointmentSlotUnavailable,
  saveProviderWeeklyAvailability,
  saveSoapNote,
  signInWithPassword,
  signOut,
  startAppointmentEncounter,
  subscribeToAppointmentQueue,
  subscribeToClinicalHistory,
  retireClinicService,
  updateClinicService,
} from "@odyssey/supabase-client";
import type {
  AppointmentQueueItem,
  AppointmentSlotSummary,
  ClinicServiceSummary,
  ClinicServiceInput,
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

function clinicalText(value: unknown): string {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return "";
  const text = (value as Record<string, unknown>).text;
  return typeof text === "string" ? text : "";
}

function dosageText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return clinicalText(value[0]);
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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
  const [serviceBusy, setServiceBusy] = useState(false);
  const [editingService, setEditingService] = useState<ClinicServiceSummary | null>(null);
  const [scheduleServiceId, setScheduleServiceId] = useState("");
  const [clinicalRecords, setClinicalRecords] =
    useState<OrganizationClinicalRecords | null>(null);
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(null);
  const [clinicalBusy, setClinicalBusy] = useState(false);
  const [canPrescribe, setCanPrescribe] = useState(false);
  const [providerRoleId, setProviderRoleId] = useState<string | null>(null);

  const ownedServices = services.filter(
    (service) => service.owner_practitioner_role_id === providerRoleId,
  );
  const selectedEncounter = clinicalRecords?.encounters.find(
    (encounter) => encounter.id === selectedEncounterId,
  );
  const selectedAppointment = queue.find(
    (appointment) => appointment.id === selectedEncounter?.appointment_id,
  );
  const priorEncounters = clinicalRecords?.encounters.filter(
    (encounter) =>
      encounter.patient_id === selectedEncounter?.patient_id &&
      encounter.id !== selectedEncounterId,
  ) ?? [];
  const currentSoapNote = clinicalRecords?.observations.find(
    (item) =>
      item.encounter_id === selectedEncounterId && item.code === "SOAP-NOTE",
  );
  const legacySoapDraft = ["SOAP-S", "SOAP-O", "SOAP-A", "SOAP-P"]
    .map((code) =>
      clinicalRecords?.observations.find(
        (item) => item.encounter_id === selectedEncounterId && item.code === code,
      ),
    )
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((item) => `${item.code_display}:\n${clinicalText(item.value)}`)
    .join("\n\n");
  const currentSoapDraft = currentSoapNote
    ? clinicalText(currentSoapNote.value)
    : legacySoapDraft;

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
    const unsubscribeClinical = subscribeToClinicalHistory(
      createBrowserSupabaseClient(),
      organizationId,
      () => void loadClinicalRecords(),
    );
    return () => {
      unsubscribe();
      unsubscribeClinical();
    };
  }, [loadAvailability, loadClinicalRecords, loadQueue, organizationId, signedInAs]);

  async function loadStaffClinic() {
    const result = await getCurrentStaffOrganization(
      createBrowserSupabaseClient(),
    );
    if (result.error)
      return setStatus(`Clinic access failed: ${result.error.message}`);
    const roleResult = await getCurrentProviderRoleId(
      createBrowserSupabaseClient(),
      result.data,
    );
    if (roleResult.error)
      return setStatus(`Provider role query failed: ${roleResult.error.message}`);
    setProviderRoleId(roleResult.data);
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
    setClinicalBusy(true);
    const result = await saveSoapNote(createBrowserSupabaseClient(), {
      encounterId: selectedEncounterId,
      text: String(fields.get("text") ?? ""),
      supersedesId: currentSoapNote?.id,
    });
    setClinicalBusy(false);
    if (result.error) return setStatus(`Unable to save SOAP note: ${result.error.message}`);
    form.reset();
    setStatus(currentSoapNote ? "SOAP note revision saved." : "SOAP note saved.");
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
    const selectedService = services.find(
      (service) => service.id === String(fields.get("scheduleServiceId") ?? ""),
    );
    if (!selectedService) {
      setStatus("Choose a service for this weekly schedule.");
      return;
    }
    const windows = WEEKDAYS.flatMap((day, index) => {
      if (!fields.get(`day-${index}-enabled`)) return [];
      const startTime = String(fields.get(`day-${index}-start`) ?? "");
      const endTime = String(fields.get(`day-${index}-end`) ?? "");
      if (!startTime || !endTime || endTime <= startTime) return [];
      return [{ dayOfWeek: index, startTime, endTime }];
    });
    if (!windows.length) return setStatus("Choose at least one day and a valid time range.");
    if (windows.length !== [...fields.keys()].filter((key) => key.endsWith("-enabled")).length) return setStatus("Every enabled day needs a valid start and end time.");
    setAvailabilityBusy(true);
    const result = await saveProviderWeeklyAvailability(createBrowserSupabaseClient(), selectedService.id, windows);
    setAvailabilityBusy(false);
    if (result.error) return setStatus(`Unable to save weekly availability: ${result.error.message}`);
    setStatus(`Weekly availability saved. ${result.data} future appointment slots are now bookable.`);
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

  async function handleSaveService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!organizationId) return setStatus("No staff clinic is assigned.");
    const fields = new FormData(form);
    const name = String(fields.get("name") ?? "").trim();
    const code = String(fields.get("code") ?? "").trim().toUpperCase();
    const durationMinutes = Number(fields.get("durationMinutes"));
    const basePriceValue = String(fields.get("basePrice") ?? "").trim();
    const basePrice = basePriceValue ? Number(basePriceValue) : null;
    if (!name || !code || !Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480 || (basePrice !== null && (!Number.isFinite(basePrice) || basePrice < 0))) {
      return setStatus("Enter a name, unique code, duration from 5–480 minutes, and a valid fee.");
    }
    const input: ClinicServiceInput = { name, code, durationMinutes, basePrice, description: String(fields.get("description") ?? ""), bookingEnabled: fields.get("bookingEnabled") === "on" };
    const scheduleChanged = Boolean(
      editingService &&
        (editingService.name !== name ||
          editingService.duration_minutes !== durationMinutes ||
          editingService.booking_enabled !== input.bookingEnabled),
    );
    setServiceBusy(true);
    const result = editingService
      ? await updateClinicService(createBrowserSupabaseClient(), organizationId, editingService.id, input)
      : await createClinicService(createBrowserSupabaseClient(), organizationId, input);
    setServiceBusy(false);
    if (result.error) return setStatus(`Unable to save service: ${result.error.message}`);
    setEditingService(null);
    form.reset();
    setStatus(
      editingService
        ? scheduleChanged
          ? "Service updated. Re-save weekly availability for this service."
          : "Service updated."
        : "Service added to your catalog.",
    );
    await loadAvailability();
  }

  async function handleRetireService(service: ClinicServiceSummary) {
    if (!window.confirm(`Retire ${service.name}? Existing appointments will be kept.`)) return;
    setServiceBusy(true);
    const result = await retireClinicService(createBrowserSupabaseClient(), service.id);
    setServiceBusy(false);
    if (result.error) return setStatus(`Unable to retire service: ${result.error.message}`);
    if (editingService?.id === service.id) setEditingService(null);
    setStatus("Service retired and removed from future booking.");
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
    setProviderRoleId(null);
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
            caption="Clinical appointments visible to this provider today."
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
                  ) : canPrescribe ? (
                    <AppointmentStatusBadge status={appointment.status} />
                  ) : null,
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
                <div>
                  <p className="eyebrow">{selectedAppointment?.patientName ?? "Patient"}</p>
                  <h2 id="chart-heading">Consultation chart</h2>
                </div>
                {canPrescribe && <Button disabled={clinicalBusy} onClick={() => void handleFinishEncounter()}>Complete encounter</Button>}
              </div>
              <div className="clinical-grid">
                <Card>
                  <h3>SOAP note</h3>
                  <form className="stack" onSubmit={handleSoap}>
                    <Field label="Complete SOAP note" hint="Record subjective, objective, assessment, and plan in this single note.">
                      <textarea
                        className="odyssey-input"
                        name="text"
                        rows={10}
                        maxLength={20000}
                        key={currentSoapNote?.id ?? `new-soap-note-${selectedEncounterId}`}
                        defaultValue={currentSoapDraft}
                        placeholder={"Subjective:\n\nObjective:\n\nAssessment:\n\nPlan:"}
                        required
                      />
                    </Field>
                    <Button type="submit" disabled={clinicalBusy}>Save SOAP note</Button>
                  </form>
                  <div className="record-list">
                    {clinicalRecords?.observations.filter((item) => item.encounter_id === selectedEncounterId && item.code.startsWith("SOAP-")).map((item) => (
                      <article key={item.id}><strong>{item.code_display}</strong><p>{clinicalText(item.value)}</p><small>{item.supersedes_id ? "Revision" : "Original"} · {item.effective_at ? new Date(item.effective_at).toLocaleString() : ""}</small></article>
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
                <Card className="patient-history-card">
                  <h3>Patient medical history</h3>
                  {!priorEncounters.length && <p className="hint">No earlier encounters are recorded at this clinic.</p>}
                  <div className="record-list">
                    {priorEncounters.map((encounter) => (
                      <article key={encounter.id}>
                        <strong>{encounter.service_type ?? "Clinical visit"}</strong>
                        <small>{encounter.period_start ? new Date(encounter.period_start).toLocaleString() : "Date pending"} · {encounter.status.replaceAll("_", " ")}</small>
                        {clinicalRecords?.observations.filter((item) => item.encounter_id === encounter.id).map((item) => <div key={item.id}><strong>{item.code_display ?? item.code}</strong><p>{clinicalText(item.value)}</p></div>)}
                        {clinicalRecords?.medicationRequests.filter((item) => item.encounter_id === encounter.id).map((item) => <div key={item.id}><strong>Prescription: {item.medication_display ?? item.medication_code}</strong><p>{dosageText(item.dosage_instruction)}</p>{item.note && <p>{item.note}</p>}</div>)}
                        {clinicalRecords?.documentReferences.filter((item) => item.encounter_id === encounter.id).map((item) => <div key={item.id}><strong>{item.content_title ?? item.type_display ?? "Clinical document"}</strong><p>{item.description}</p></div>)}
                      </article>
                    ))}
                  </div>
                </Card>
              </div>
            </section>
          )}

          {canPrescribe && <section>
            <div className="section-heading">
              <div>
                <p className="eyebrow">Doctor CMS</p>
                <h2>My services &amp; schedule</h2>
              </div>
              <span className="hint">Control what patients can book with you.</span>
            </div>
            <div className="two-column cms-grid">
              <Card>
                <div className="section-heading">
                  <h3>{editingService ? "Edit service" : "Add a service"}</h3>
                  {editingService && <Button size="sm" variant="ghost" onClick={() => setEditingService(null)}>Cancel</Button>}
                </div>
                <form className="stack" onSubmit={handleSaveService}>
                  <div className="service-form-row">
                    <Field label="Service name"><Input name="name" key={`name-${editingService?.id ?? "new"}`} defaultValue={editingService?.name ?? ""} required /></Field>
                    <Field label="Code"><Input name="code" key={`code-${editingService?.id ?? "new"}`} defaultValue={editingService?.code ?? ""} placeholder="CONSULT-30" required /></Field>
                  </div>
                  <Field label="Description"><Input name="description" key={`description-${editingService?.id ?? "new"}`} defaultValue={editingService?.description ?? ""} maxLength={500} /></Field>
                  <div className="service-form-row">
                    <Field label="Duration (minutes)"><Input name="durationMinutes" key={`duration-${editingService?.id ?? "new"}`} type="number" min="5" max="480" defaultValue={editingService?.duration_minutes ?? 30} required /></Field>
                    <Field label="Fee (PHP)"><Input name="basePrice" key={`price-${editingService?.id ?? "new"}`} type="number" min="0" step="0.01" defaultValue={editingService?.base_price ?? ""} /></Field>
                  </div>
                  <label className="booking-toggle"><input name="bookingEnabled" key={`booking-${editingService?.id ?? "new"}`} type="checkbox" defaultChecked={editingService?.booking_enabled ?? true} /> Available for online booking</label>
                  <Button type="submit" disabled={serviceBusy}>{serviceBusy ? "Saving…" : editingService ? "Save service" : "Add service"}</Button>
                </form>
              </Card>
              <Card>
                <h3>My service catalog</h3>
                <div className="service-list">
                  {ownedServices.map((service) => (
                    <article key={service.id}>
                      <div><strong>{service.name}</strong><small>{service.duration_minutes} min · {service.base_price === null ? "Fee on consultation" : `PHP ${service.base_price.toLocaleString()}`}</small></div>
                      <div className="service-actions"><Button size="sm" variant="ghost" onClick={() => setEditingService(service)}>Edit</Button><Button size="sm" variant="ghost" disabled={serviceBusy} onClick={() => void handleRetireService(service)}>Retire</Button></div>
                    </article>
                  ))}
                  {!ownedServices.length && <p className="hint">Add your first bookable service.</p>}
                </div>
              </Card>
            </div>
            <h3 className="schedule-heading">Weekly availability</h3>
            <p className="hint">Set a window such as 10:00 AM–5:00 PM. We create consecutive slots using the selected service duration.</p>
            <form className="weekly-schedule" onSubmit={handleCreateAvailability}>
              <Field label="Service">
                <select
                  className="odyssey-input"
                  name="scheduleServiceId"
                  value={scheduleServiceId}
                  onChange={(event) => setScheduleServiceId(event.target.value)}
                  required
                >
                  <option value="" disabled>
                    Select a service
                  </option>
                  {ownedServices
                    .filter((service) => service.booking_enabled)
                    .map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name} ({service.duration_minutes} min)
                      </option>
                    ))}
                </select>
              </Field>
              <div className="weekly-days">
                {WEEKDAYS.map((day, index) => <div className="weekly-day" key={day}>
                  <label className="day-enabled"><input name={`day-${index}-enabled`} type="checkbox" /> <strong>{day}</strong></label>
                  <Input aria-label={`${day} start time`} name={`day-${index}-start`} type="time" defaultValue="10:00" />
                  <span>to</span>
                  <Input aria-label={`${day} end time`} name={`day-${index}-end`} type="time" defaultValue="17:00" />
                </div>)}
              </div>
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
