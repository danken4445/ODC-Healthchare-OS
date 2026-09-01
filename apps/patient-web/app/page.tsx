"use client";

import {
  bookAppointmentSlot,
  createBrowserSupabaseClient,
  createPublicSupabaseClient,
  enrollPatientAtClinic,
  getAvailableAppointmentSlots,
  getClinicServices,
  getCurrentUserEmail,
  getPortalAccess,
  getPatientAccessRecords,
  getPublicClinics,
  getWalkInPatientRecords,
  registerPatient,
  signInWithPassword,
  signOut,
  setPatientClinicContext,
  subscribeToAppointmentQueue,
  subscribeToClinicalHistory,
  subscribeToWaitingRoomQueue,
  updateOwnPatientProfile,
} from "@odyssey/supabase-client";
import type {
  AppointmentSlotSummary,
  ClinicServiceSummary,
  PatientAccessRecords,
  PublicClinicSummary,
  WalkInAccessInput,
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

const localTestPassword = "LocalOnly-2026!";

function formatAppointmentTime(value: string | null): string {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function downloadClinicalDocument(
  title: string,
  statement: string,
  issuedAt: string,
) {
  const content = `${title}\nIssued: ${new Date(issuedAt).toLocaleString()}\n\n${statement}\n`;
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "clinical-document"}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [email, setEmail] = useState("patient@synthetic.odyssey.test");
  const [password, setPassword] = useState("");
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const [clinics, setClinics] = useState<PublicClinicSummary[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [slots, setSlots] = useState<AppointmentSlotSummary[]>([]);
  const [services, setServices] = useState<ClinicServiceSummary[]>([]);
  const [records, setRecords] = useState<PatientAccessRecords | null>(null);
  const [walkInRecords, setWalkInRecords] =
    useState<WalkInAccessRecords | null>(null);
  const [walkInCredentials, setWalkInCredentials] =
    useState<WalkInAccessInput | null>(null);
  const [busySlotId, setBusySlotId] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [walkInSubmitting, setWalkInSubmitting] = useState(false);
  const authRequestInFlight = useRef(false);
  const walkInRequestInFlight = useRef(false);
  const [status, setStatus] = useState(
    "Choose a clinic, then register or sign in to book an appointment.",
  );
  const [liveStatus, setLiveStatus] = useState("Offline");

  const selectedClinic = clinics.find((clinic) => clinic.id === organizationId);
  const patientAtSelectedClinic = Boolean(records?.patients.length);

  async function loadPublicPortal(clinicId: string) {
    const client = createBrowserSupabaseClient();
    const [serviceResult, slotResult] = await Promise.all([
      getClinicServices(client, clinicId),
      getAvailableAppointmentSlots(client, clinicId),
    ]);
    if (serviceResult.error || slotResult.error) {
      setStatus(
        `Unable to load this clinic: ${serviceResult.error?.message ?? slotResult.error?.message}`,
      );
      return;
    }
    setServices(serviceResult.data);
    setSlots(slotResult.data);
  }

  async function loadPatientDashboard(clinicId: string) {
    const client = createBrowserSupabaseClient();
    const contextResult = await setPatientClinicContext(client, clinicId);
    if (contextResult.error) {
      setRecords({
        patients: [],
        appointments: [],
        encounters: [],
        observations: [],
        medicationRequests: [],
        documentReferences: [],
      });
      return;
    }
    const [slotResult, recordResult] = await Promise.all([
      getAvailableAppointmentSlots(client, clinicId),
      getPatientAccessRecords(client, clinicId),
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

  function selectClinic(clinicId: string) {
    setOrganizationId(clinicId);
    setRecords(null);
    setWalkInRecords(null);
    setWalkInCredentials(null);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("odyssey.patient.clinic", clinicId);
    }
  }

  useEffect(() => {
    const client = createBrowserSupabaseClient();
    void getPublicClinics(createPublicSupabaseClient()).then((result) => {
      if (result.error)
        return setStatus(`Unable to load clinics: ${result.error.message}`);
      setClinics(result.data);
      const stored = window.localStorage.getItem("odyssey.patient.clinic");
      setOrganizationId(
        result.data.some((clinic) => clinic.id === stored)
          ? stored
          : (result.data[0]?.id ?? null),
      );
    });
    void getCurrentUserEmail(client).then((result) => {
      if (!result.error && result.data) void openPatientPortal(result.data);
    });
  }, []);

  useEffect(() => {
    if (!organizationId) return;
    void loadPublicPortal(organizationId);
    if (signedInAs) void loadPatientDashboard(organizationId);
  }, [organizationId, signedInAs]);

  useEffect(() => {
    if (!signedInAs || !organizationId) return;
    return subscribeToClinicalHistory(
      createBrowserSupabaseClient(), organizationId,
      () => void loadPatientDashboard(organizationId),
      (connectionStatus) => setLiveStatus(connectionStatus === "SUBSCRIBED" ? "Live" : connectionStatus),
    );
  }, [organizationId, signedInAs]);

  useEffect(() => {
    if (!signedInAs || !organizationId) return;
    return subscribeToAppointmentQueue(
      createBrowserSupabaseClient(),
      organizationId,
      () => void loadPatientDashboard(organizationId),
      (connectionStatus) =>
        setLiveStatus(
          connectionStatus === "SUBSCRIBED" ? "Live" : connectionStatus,
        ),
    );
  }, [organizationId, signedInAs]);

  useEffect(() => {
    if (!walkInCredentials) return;
    return subscribeToWaitingRoomQueue(
      createBrowserSupabaseClient(),
      walkInCredentials.organizationId,
      () => void loadWalkInDashboard(walkInCredentials),
      (connectionStatus) =>
        setLiveStatus(
          connectionStatus === "SUBSCRIBED" ? "Live" : connectionStatus,
        ),
    );
  }, [walkInCredentials]);

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || authRequestInFlight.current) return;
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
      await openPatientPortal(
        result.data.email,
        "Registration complete. Choose an available appointment slot.",
      );
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
      await openPatientPortal(
        result.data,
        "Signed in. This clinic's bookings are ready.",
      );
    } finally {
      authRequestInFlight.current = false;
      setAuthSubmitting(false);
    }
  }

  async function openPatientPortal(
    emailAddress: string,
    successMessage?: string,
  ) {
    const client = createBrowserSupabaseClient();
    const accessResult = await getPortalAccess(client, "patient");
    if (accessResult.error) {
      await signOut(client);
      return setStatus(`Portal access failed: ${accessResult.error.message}`);
    }
    if (!accessResult.data.allowed) {
      await signOut(client);
      setSignedInAs(null);
      setRecords(null);
      return setStatus(
        "This account is not authorized for the Patient portal. Staff and platform accounts use their assigned workspace.",
      );
    }
    setWalkInCredentials(null);
    setWalkInRecords(null);
    setSignedInAs(emailAddress);
    if (successMessage) setStatus(successMessage);
  }

  async function handleJoinClinic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    const displayName = String(
      new FormData(event.currentTarget).get("displayName") ?? "",
    );
    const result = await enrollPatientAtClinic(
      createBrowserSupabaseClient(),
      organizationId,
      displayName,
    );
    if (result.error)
      return setStatus(`Clinic enrollment failed: ${result.error.message}`);
    setStatus(
      `You can now book with ${selectedClinic?.name ?? "this clinic"}.`,
    );
    await loadPatientDashboard(organizationId);
  }

  async function handleBook(slotId: string) {
    if (!organizationId || !patientAtSelectedClinic) return;
    setBusySlotId(slotId);
    const result = await bookAppointmentSlot(
      createBrowserSupabaseClient(),
      slotId,
    );
    setBusySlotId(null);
    if (result.error)
      return setStatus(`Booking failed: ${result.error.message}`);
    setStatus("Appointment booked. It is now in the doctor's live queue.");
    await loadPatientDashboard(organizationId);
  }

  async function loadWalkInDashboard(
    credentials: WalkInAccessInput,
  ): Promise<boolean> {
    const result = await getWalkInPatientRecords(
      createBrowserSupabaseClient(),
      credentials,
    );
    if (result.error) {
      setStatus(`Walk-in access failed: ${result.error.message}`);
      return false;
    }
    setWalkInRecords(result.data);
    return true;
  }

  async function handleWalkInAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || walkInRequestInFlight.current) return;
    walkInRequestInFlight.current = true;
    setWalkInSubmitting(true);
    const fields = new FormData(event.currentTarget);
    try {
      const credentials = {
        organizationId,
        walkInId: String(fields.get("walkInId") ?? ""),
        pin: String(fields.get("pin") ?? ""),
      };
      if (!(await loadWalkInDashboard(credentials))) return;
      setWalkInCredentials(credentials);
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
    setLiveStatus("Offline");
    setStatus("Signed out.");
  }

  async function handleProfileUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const patient = records?.patients[0];
    if (!patient) return;
    const fields = new FormData(event.currentTarget);
    const result = await updateOwnPatientProfile(createBrowserSupabaseClient(), {
      patientId: patient.id,
      displayName: String(fields.get("displayName") ?? ""),
      birthDate: String(fields.get("birthDate") ?? "") || null,
      gender: (String(fields.get("gender") ?? "") || null) as "female" | "male" | "other" | "unknown" | null,
      phone: String(fields.get("phone") ?? ""),
      address: String(fields.get("address") ?? ""),
    });
    if (result.error) return setStatus(`Profile update failed: ${result.error.message}`);
    setStatus("Profile updated.");
    await loadPatientDashboard(patient.organization_id);
  }

  const displayedAppointments =
    walkInRecords?.appointments ?? records?.appointments ?? [];

  return (
    <main>
      <p className="eyebrow">Patient portal</p>
      <h1>Book a clinic appointment</h1>
      <section aria-labelledby="clinic-heading">
        <h2 id="clinic-heading">Choose a clinic</h2>
        <div className="clinic-picker">
          {clinics.map((clinic) => (
            <Button
              key={clinic.id}
              variant={clinic.id === organizationId ? "default" : "outline"}
              aria-pressed={clinic.id === organizationId}
              onClick={() => selectClinic(clinic.id)}
            >
              {clinic.name}
            </Button>
          ))}
        </div>
      </section>

      {organizationId && (
        <>
          <p className="hint">{selectedClinic?.name}</p>
          <section aria-labelledby="services-heading">
            <h2 id="services-heading">Clinic services</h2>
            <div className="service-grid">
              {services.map((service) => (
                <article className="service-card" key={service.id}>
                  <h3>{service.name}</h3>
                  <p>{service.description ?? "Clinic consultation service."}</p>
                  <p className="hint">{service.duration_minutes} minutes</p>
                </article>
              ))}
              {!services.length && <p>No services are available right now.</p>}
            </div>
          </section>
        </>
      )}

      {!signedInAs && organizationId && (
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
      )}

      {signedInAs && organizationId && (
        <>
          <div className="session">
            <span>Signed in as {signedInAs}</span>
            <span className="session-actions">
              <span
                className="live-indicator"
                data-live={liveStatus === "Live"}
              >
                {liveStatus} bookings
              </span>
              <Button variant="secondary" onClick={handleSignOut}>
                Sign out
              </Button>
            </span>
          </div>
          {!patientAtSelectedClinic ? (
            <section>
              <h2>Join {selectedClinic?.name}</h2>
              <p className="hint">
                Your account is universal, but each clinic keeps a separate
                patient record and booking history.
              </p>
              <form className="inline-form" onSubmit={handleJoinClinic}>
                <Field label="Name at this clinic">
                  <Input
                    name="displayName"
                    minLength={2}
                    maxLength={120}
                    required
                  />
                </Field>
                <Button type="submit">Join clinic</Button>
              </form>
            </section>
          ) : (
            <section>
              <h2>Available slots</h2>
              <DataTable
                caption="Available appointments for the selected clinic."
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
          )}
        </>
      )}

      {!signedInAs && organizationId && (
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
          <div className="section-heading">
            <h2>My appointments</h2>
            <span className="live-indicator" data-live={liveStatus === "Live"}>
              {liveStatus} status
            </span>
          </div>
          <DataTable
            caption="Appointments visible at the selected clinic only."
            data={displayedAppointments}
            emptyMessage="No appointments booked yet."
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

      {records?.patients[0] && (
        <section aria-labelledby="profile-heading">
          <h2 id="profile-heading">My profile</h2>
          <form className="inline-form" onSubmit={handleProfileUpdate}>
            <Field label="Full name"><Input name="displayName" defaultValue={records.patients[0].displayName} minLength={2} maxLength={120} required /></Field>
            <Field label="Birth date"><Input name="birthDate" type="date" defaultValue={records.patients[0].birth_date ?? ""} /></Field>
            <Field label="Gender"><select className="odyssey-input" name="gender" defaultValue={records.patients[0].gender ?? ""}><option value="">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option><option value="unknown">Unknown</option></select></Field>
            <Field label="Phone"><Input name="phone" maxLength={40} defaultValue={Array.isArray(records.patients[0].telecom) && typeof records.patients[0].telecom[0] === "object" && records.patients[0].telecom[0] && !Array.isArray(records.patients[0].telecom[0]) && typeof records.patients[0].telecom[0].value === "string" ? records.patients[0].telecom[0].value : ""} /></Field>
            <Field label="Address"><Input name="address" maxLength={500} defaultValue={Array.isArray(records.patients[0].address) && typeof records.patients[0].address[0] === "object" && records.patients[0].address[0] && !Array.isArray(records.patients[0].address[0]) && typeof records.patients[0].address[0].text === "string" ? records.patients[0].address[0].text : ""} /></Field>
            <Button type="submit">Save profile</Button>
          </form>
        </section>
      )}

      {records && (
        <section aria-labelledby="history-heading">
          <div className="section-heading"><h2 id="history-heading">Medical history</h2><span className="live-indicator" data-live={liveStatus === "Live"}>{liveStatus} records</span></div>
          {!records.encounters.length ? <p>No clinical visits recorded yet.</p> : (
            <div className="history-list">
              {records.encounters.map((encounter) => (
                <article className="history-card" key={encounter.id}>
                  <h3>{encounter.service_type ?? "Clinical visit"}</h3>
                  <p className="hint">{encounter.period_start ? new Date(encounter.period_start).toLocaleString() : "Date pending"} · {encounter.status.replaceAll("_", " ")}</p>
                  {records.observations.filter((item) => item.encounter_id === encounter.id && item.code.startsWith("SOAP-")).map((item) => <div key={item.id}><strong>{item.code_display}</strong><p>{typeof item.value === "object" && item.value && !Array.isArray(item.value) && typeof item.value.text === "string" ? item.value.text : ""}</p>{item.supersedes_id && <small>Revised note</small>}</div>)}
                  {records.medicationRequests.filter((item) => item.encounter_id === encounter.id).map((item) => <div key={item.id}><strong>Prescription: {item.medication_display}</strong><p>{Array.isArray(item.dosage_instruction) && typeof item.dosage_instruction[0] === "object" && item.dosage_instruction[0] && !Array.isArray(item.dosage_instruction[0]) && typeof item.dosage_instruction[0].text === "string" ? item.dosage_instruction[0].text : "Directions recorded"}</p>{item.note && <p>{item.note}</p>}</div>)}
                  {records.documentReferences.filter((item) => item.encounter_id === encounter.id).map((item) => {
                    const title = item.content_title ?? item.type_display ?? "Medical certificate";
                    return <div key={item.id}><strong>{title}</strong><p>{item.description}</p><Button size="sm" variant="outline" onClick={() => downloadClinicalDocument(title, item.description ?? "", item.date_at)}>Download certificate</Button></div>;
                  })}
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
