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
  getPatientInvoices,
  subscribeToInvoiceUpdates,
  getOrganizationBranding,
  isOrganizationModuleEnabled,
} from "@odyssey/supabase-client";
import type {
  AppointmentDeliveryMode,
  AppointmentSlotSummary,
  ClinicServiceSummary,
  PatientAccessRecords,
  PublicClinicSummary,
  WalkInAccessInput,
  WalkInAccessRecords,
  PatientInvoice,
  OrganizationBranding,
} from "@odyssey/types";
import {
  AppointmentStatusBadge,
  Button,
  DataTable,
  Field,
  Input,
  InvoiceStatusBadge,
  PayorTypeBadge,
  CurrencyDisplay,
  QrPaymentCode,
  Select,
} from "@odyssey/ui";
import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { PatientHeader, type PatientTab } from "./components/PatientHeader";
import { PatientBookingsView } from "./components/PatientBookingsView";
import { BookingStepHeader } from "./components/BookingStepHeader";
import { ServiceCard } from "./components/ServiceCard";
import { AvailableSlotsCalendar } from "./components/AvailableSlotsCalendar";

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
  const [activeTab, setActiveTab] = useState<PatientTab>("all");
  const [slots, setSlots] = useState<AppointmentSlotSummary[]>([]);
  const [services, setServices] = useState<ClinicServiceSummary[]>([]);
  const [records, setRecords] = useState<PatientAccessRecords | null>(null);
  const [walkInRecords, setWalkInRecords] =
    useState<WalkInAccessRecords | null>(null);
  const [walkInCredentials, setWalkInCredentials] =
    useState<WalkInAccessInput | null>(null);
  const [invoices, setInvoices] = useState<PatientInvoice[]>([]);
  const [busySlotId, setBusySlotId] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [walkInSubmitting, setWalkInSubmitting] = useState(false);
  const authRequestInFlight = useRef(false);
  const walkInRequestInFlight = useRef(false);
  const [status, setStatus] = useState(
    "Choose a clinic, then register or sign in to book an appointment.",
  );
  const [liveStatus, setLiveStatus] = useState("Offline");
  const [branding, setBranding] = useState<OrganizationBranding | null>(null);

  const selectedClinic = clinics.find((clinic) => clinic.id === organizationId);
  const patientAtSelectedClinic = Boolean(records?.patients.length);

  async function loadPublicPortal(clinicId: string) {
    const client = createPublicSupabaseClient();
    const [serviceResult, slotResult, brandingResult, moduleResult] = await Promise.all([
      getClinicServices(client, clinicId),
      getAvailableAppointmentSlots(client, clinicId),
      getOrganizationBranding(client, clinicId),
      isOrganizationModuleEnabled(client, clinicId, "core_visit"),
    ]);
    if (serviceResult.error || slotResult.error) {
      setStatus(
        `Unable to load this clinic: ${serviceResult.error?.message ?? slotResult.error?.message}`,
      );
      return;
    }
    if (!moduleResult.error && !moduleResult.data) {
      setServices([]);
      setSlots([]);
      setStatus("Online booking is not currently enabled for this clinic.");
    } else {
      setServices(serviceResult.data);
      setSlots(slotResult.data);
    }
    if (!brandingResult.error) setBranding(brandingResult.data);
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
        serviceRequests: [],
        diagnosticReports: [],
      });
      return;
    }
    const [slotResult, recordResult] = await Promise.all([
      getAvailableAppointmentSlots(client, clinicId),
      getPatientAccessRecords(client, clinicId),
    ]);
    if (!slotResult.error && slotResult.data) {
      setSlots(slotResult.data);
    }
    if (!recordResult.error && recordResult.data) {
      setRecords(recordResult.data);
    }
    if (slotResult.error || recordResult.error) {
      setStatus(
        `Notice: ${slotResult.error?.message ?? recordResult.error?.message}`,
      );
      return;
    }
    await loadInvoices(clinicId);
  }

  async function loadInvoices(clinicId: string) {
    const client = createBrowserSupabaseClient();
    const invoiceResult = await getPatientInvoices(client, clinicId);
    if (!invoiceResult.error) {
      setInvoices(invoiceResult.data ?? []);
    }
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
    if (!organizationId) return;
    return subscribeToAppointmentQueue(
      createBrowserSupabaseClient(),
      organizationId,
      () => {
        if (signedInAs) {
          void loadPatientDashboard(organizationId);
        } else {
          void loadPublicPortal(organizationId);
        }
      },
      (connectionStatus) =>
        setLiveStatus(
          connectionStatus === "SUBSCRIBED" ? "Live" : connectionStatus,
        ),
    );
  }, [organizationId, signedInAs]);

  useEffect(() => {
    if (!organizationId || !signedInAs) return;
    return subscribeToInvoiceUpdates(
      createBrowserSupabaseClient(),
      organizationId,
      () => void loadInvoices(organizationId),
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

  async function handleBook(
    slotId: string,
    deliveryMode: AppointmentDeliveryMode,
  ) {
    if (!organizationId || !patientAtSelectedClinic) return;
    setBusySlotId(slotId);
    const result = await bookAppointmentSlot(
      createBrowserSupabaseClient(),
      slotId,
      undefined,
      deliveryMode,
    );
    setBusySlotId(null);
    if (result.error)
      return setStatus(`Booking failed: ${result.error.message}`);
    // Optimistically remove the booked slot immediately so it disappears with zero refresh needed
    setSlots((current) => current.filter((slot) => slot.id !== slotId));
    setStatus(
      deliveryMode === "virtual"
        ? "Virtual appointment booked. Your teleconsult room opens 30 minutes before the scheduled time."
        : "Appointment booked. It is now in the doctor's live queue.",
    );
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
    const result = await updateOwnPatientProfile(
      createBrowserSupabaseClient(),
      {
        patientId: patient.id,
        displayName: String(fields.get("displayName") ?? ""),
        birthDate: String(fields.get("birthDate") ?? "") || null,
        gender: (String(fields.get("gender") ?? "") || null) as
          "female" | "male" | "other" | "unknown" | null,
        phone: String(fields.get("phone") ?? ""),
        address: String(fields.get("address") ?? ""),
      },
    );
    if (result.error)
      return setStatus(`Profile update failed: ${result.error.message}`);
    setStatus("Profile updated.");
    await loadPatientDashboard(patient.organization_id);
  }

  const displayedAppointments =
    walkInRecords?.appointments ?? records?.appointments ?? [];

  return (
    <main
      className="patient-portal-shell"
      style={
        branding
          ? ({
              "--odyssey-primary": branding.primaryColor,
              "--odyssey-ring": branding.accentColor,
            } as CSSProperties)
          : undefined
      }
    >
      {signedInAs && (
        <PatientHeader
          patientName={records?.patients[0]?.displayName ?? signedInAs}
          selectedClinicName={selectedClinic?.name}
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          bookingCount={displayedAppointments.length}
          virtualBookingCount={
            displayedAppointments.filter(
              (a) =>
                a.delivery_mode === "virtual" ||
                a.service_type?.toLowerCase().includes("virtual"),
            ).length
          }
          hasActiveVirtual={displayedAppointments.some(
            (a) =>
              (a.delivery_mode === "virtual" ||
                a.service_type?.toLowerCase().includes("virtual")) &&
              (a.status === "booked" || a.status === "arrived"),
          )}
          liveStatus={liveStatus}
          onSignOut={handleSignOut}
        />
      )}

      <div className="patient-hero">
      <p className="eyebrow">Care that meets you where you are</p>
      {branding?.logoUrl && (
        <Image className="clinic-brand-logo" src={branding.logoUrl} alt={`${branding.displayName} logo`} width={144} height={48} sizes="144px" unoptimized />
      )}
      <h1>{branding?.displayName ?? "Your health, a little easier."}</h1>
      <p>{branding?.tagline ?? "Find care, book a visit, and keep your health information close—all in one calm, secure place."}</p>
      {!signedInAs ? <Button onClick={() => document.getElementById("clinic-heading")?.scrollIntoView({ behavior: "smooth" })}>Find care near me</Button> : null}
      </div>

      {(!signedInAs || activeTab === "all" || activeTab === "book") && (
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
      )}

      {organizationId && (!signedInAs || activeTab === "all" || activeTab === "book") && (
        <>
          <p className="hint">{selectedClinic?.name}</p>
          <section aria-labelledby="services-heading">
            <h2 id="services-heading">Clinic services</h2>
            <div className="service-grid">
              {services.map((service) => <ServiceCard description={service.description ?? "Friendly, professional care from your clinic team."} duration={service.duration_minutes} key={service.id} name={service.name} />)}
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
              {process.env.NODE_ENV === "development" ? <p className="hint">Development account password: {localTestPassword}</p> : null}
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
                Log out
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
            (activeTab === "all" || activeTab === "book") && (
              <section aria-labelledby="available-slots-heading">
                <BookingStepHeader current={2} description="Choose the time and visit type that feel right for you." title="Pick a date and time" />
                <span className="sr-only" id="available-slots-heading">Available slots</span>

                <AvailableSlotsCalendar
                  busySlotId={busySlotId}
                  onBook={(slotId, mode) => void handleBook(slotId, mode)}
                  services={services}
                  slots={slots}
                />
              </section>
            )
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

      <p className="patient-status" role="status">{status}</p>

      {(activeTab === "all" || activeTab === "bookings") && (records || walkInRecords) && (
        <section aria-labelledby="bookings-heading" style={{ marginTop: "1.5rem" }}>
          <div className="section-heading" style={{ marginBottom: "1rem" }}>
            <div>
              <h2 id="bookings-heading" style={{ margin: 0, fontSize: "1.5rem" }}>My appointments</h2>
              <p className="hint" style={{ marginTop: "0.25rem" }}>
                Track your active clinic visits and join virtual teleconsultation meeting rooms.
              </p>
            </div>
            <span className="live-indicator" data-live={liveStatus === "Live"}>
              {liveStatus} status
            </span>
          </div>
          <PatientBookingsView
            appointments={displayedAppointments}
            liveStatus={liveStatus}
          />
        </section>
      )}

      {(activeTab === "all" || activeTab === "profile") && records?.patients[0] && (
        <section aria-labelledby="profile-heading">
          <h2 id="profile-heading">My profile</h2>
          <form className="inline-form" onSubmit={handleProfileUpdate}>
            <Field label="Full name">
              <Input
                name="displayName"
                defaultValue={records.patients[0].displayName}
                minLength={2}
                maxLength={120}
                required
              />
            </Field>
            <Field label="Birth date">
              <Input
                name="birthDate"
                type="date"
                defaultValue={records.patients[0].birth_date ?? ""}
              />
            </Field>
            <Field label="Gender">
              <Select
                name="gender"
                defaultValue={records.patients[0].gender ?? ""}
              >
                <option value="">Prefer not to say</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
                <option value="unknown">Unknown</option>
              </Select>
            </Field>
            <Field label="Phone">
              <Input
                name="phone"
                maxLength={40}
                defaultValue={
                  Array.isArray(records.patients[0].telecom) &&
                  typeof records.patients[0].telecom[0] === "object" &&
                  records.patients[0].telecom[0] &&
                  !Array.isArray(records.patients[0].telecom[0]) &&
                  typeof records.patients[0].telecom[0].value === "string"
                    ? records.patients[0].telecom[0].value
                    : ""
                }
              />
            </Field>
            <Field label="Address">
              <Input
                name="address"
                maxLength={500}
                defaultValue={
                  Array.isArray(records.patients[0].address) &&
                  typeof records.patients[0].address[0] === "object" &&
                  records.patients[0].address[0] &&
                  !Array.isArray(records.patients[0].address[0]) &&
                  typeof records.patients[0].address[0].text === "string"
                    ? records.patients[0].address[0].text
                    : ""
                }
              />
            </Field>
            <Button type="submit">Save profile</Button>
          </form>
          <div style={{ marginTop: "1.5rem", paddingTop: "1rem", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong>Account session</strong>
              <p className="hint" style={{ margin: 0 }}>Signed in as {signedInAs}</p>
            </div>
            <Button variant="secondary" onClick={handleSignOut} aria-label="Log out" title="Log out">
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, verticalAlign: "middle" }}>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Log out
            </Button>
          </div>
        </section>
      )}

      {(activeTab === "all" || activeTab === "records") && records && (
        <section aria-labelledby="history-heading">
          <div className="section-heading">
            <h2 id="history-heading">Medical history</h2>
            <span className="live-indicator" data-live={liveStatus === "Live"}>
              {liveStatus} records
            </span>
          </div>
          {!records.encounters.length ? (
            <p>No clinical visits recorded yet.</p>
          ) : (
            <div className="history-list">
              {records.encounters.map((encounter) => (
                <article className="history-card" key={encounter.id}>
                  <details className="history-card__disclosure">
                    <summary className="history-card__summary">
                      <span className="history-card__summary-copy">
                        <span className="history-card__title">
                          {encounter.service_type ?? "Clinical visit"}
                        </span>
                        <span className="hint history-card__meta">
                    {encounter.period_start
                      ? new Date(encounter.period_start).toLocaleString()
                      : "Date pending"}{" "}
                    · {encounter.status.replaceAll("_", " ")}
                        </span>
                      </span>
                      <span className="history-card__toggle" aria-hidden="true">
                        <span className="history-card__toggle-closed">View details</span>
                        <span className="history-card__toggle-open">Hide details</span>
                        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="m5 7.5 5 5 5-5" />
                        </svg>
                      </span>
                    </summary>
                    <div className="history-card__details">
                  {records.observations
                    .filter(
                      (item) =>
                        item.encounter_id === encounter.id &&
                        item.code.startsWith("SOAP-"),
                    )
                    .map((item) => (
                      <div key={item.id}>
                        <strong>{item.code_display}</strong>
                        <p>
                          {typeof item.value === "object" &&
                          item.value &&
                          !Array.isArray(item.value) &&
                          typeof item.value.text === "string"
                            ? item.value.text
                            : ""}
                        </p>
                        {item.supersedes_id && <small>Revised note</small>}
                      </div>
                    ))}
                  {records.medicationRequests
                    .filter((item) => item.encounter_id === encounter.id)
                    .map((item) => (
                      <div key={item.id}>
                        <strong>Prescription: {item.medication_display}</strong>
                        <p>
                          {Array.isArray(item.dosage_instruction) &&
                          typeof item.dosage_instruction[0] === "object" &&
                          item.dosage_instruction[0] &&
                          !Array.isArray(item.dosage_instruction[0]) &&
                          typeof item.dosage_instruction[0].text === "string"
                            ? item.dosage_instruction[0].text
                            : "Directions recorded"}
                        </p>
                        {item.note && <p>{item.note}</p>}
                      </div>
                    ))}
                  {records.documentReferences
                    .filter((item) => item.encounter_id === encounter.id)
                    .map((item) => {
                      const title =
                        item.content_title ??
                        item.type_display ??
                        "Medical certificate";
                      return (
                        <div key={item.id}>
                          <strong>{title}</strong>
                          <p>{item.description}</p>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              downloadClinicalDocument(
                                title,
                                item.description ?? "",
                                item.date_at,
                              )
                            }
                          >
                            Download certificate
                          </Button>
                        </div>
                      );
                    })}
                  {records.serviceRequests
                    .filter((item) => item.encounter_id === encounter.id)
                    .map((item) => (
                      <div key={item.id}>
                        <strong>
                          {item.category === "laboratory"
                            ? "Lab order"
                            : "Referral"}
                          : {item.code_display ?? item.code}
                        </strong>
                        <p>
                          {item.status.replaceAll("_", " ")}
                          {item.priority ? ` · ${item.priority}` : ""}
                        </p>
                      </div>
                    ))}
                  {records.diagnosticReports
                    .filter((item) => item.encounter_id === encounter.id)
                    .map((report) => (
                      <div key={report.id}>
                        <strong>
                          Lab result: {report.code_display ?? report.code}
                        </strong>
                        <p>
                          {report.status}
                          {report.issued_at
                            ? ` · ${new Date(report.issued_at).toLocaleString()}`
                            : ""}
                        </p>
                        {records.observations
                          .filter(
                            (item) => item.diagnostic_report_id === report.id,
                          )
                          .map((result) => (
                            <p key={result.id}>
                              {result.code_display ?? result.code}:{" "}
                              {typeof result.value === "string" ||
                              typeof result.value === "number"
                                ? String(result.value)
                                : JSON.stringify(result.value)}{" "}
                              {result.value_unit ?? ""}
                            </p>
                          ))}
                        {report.conclusion && <p>{report.conclusion}</p>}
                      </div>
                    ))}
                    </div>
                  </details>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {(activeTab === "all" || activeTab === "billing") && signedInAs && patientAtSelectedClinic && (
        <section aria-labelledby="billing-heading" style={{ marginTop: "2rem" }}>
          <div className="section-heading">
            <h2 id="billing-heading">💳 My Bills &amp; Invoices</h2>
          </div>
          {!invoices.length ? (
            <p>No bills or invoices issued for this clinic.</p>
          ) : (
            <div style={{ display: "grid", gap: "1.5rem" }}>
              {invoices.map((invoice) => (
                <article
                  className="odyssey-card"
                  key={invoice.id}
                  style={{
                    padding: "1.5rem",
                    border: "1px solid var(--odyssey-border)",
                    borderRadius: "var(--odyssey-radius)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <div>
                      <h3 style={{ margin: 0 }}>Invoice {invoice.invoice_number}</h3>
                      <small style={{ color: "var(--odyssey-muted-foreground)" }}>
                        Issued{" "}
                        {invoice.issued_at
                          ? new Date(invoice.issued_at).toLocaleDateString()
                          : "Pending"}
                      </small>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        alignItems: "center",
                      }}
                    >
                      <PayorTypeBadge payorType={invoice.payor_type} />
                      <InvoiceStatusBadge status={invoice.status} />
                    </div>
                  </div>

                  {invoice.payor_type === "philhealth_nbb" ? (
                    <div
                      style={{
                        padding: "0.75rem",
                        background: "#e8f5e9",
                        borderRadius: "0.25rem",
                        margin: "1rem 0",
                      }}
                    >
                      <strong>₱0 Balance Due (No Balance Billing)</strong>
                      <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}>
                        Covered 100% under PhilHealth No Balance Billing policy.
                        Standard catalog charges are claimed directly by the
                        facility from PhilHealth.
                      </p>
                    </div>
                  ) : invoice.payor_type === "hmo" ? (
                    <div
                      style={{
                        padding: "0.75rem",
                        background: "#e3f2fd",
                        borderRadius: "0.25rem",
                        margin: "1rem 0",
                      }}
                    >
                      <strong>Covered by HMO Guarantee</strong>
                      <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}>
                        Covered line items are submitted directly to your HMO.
                        Balance due: <CurrencyDisplay amount={invoice.balance_due} />
                      </p>
                    </div>
                  ) : null}

                  <table
                    className="odyssey-table"
                    style={{ margin: "1rem 0", width: "100%" }}
                  >
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Qty</th>
                        <th>Price</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.line_items.map((item, idx) => (
                        <tr key={idx}>
                          <td>{item.description}</td>
                          <td>{item.quantity}</td>
                          <td>
                            <CurrencyDisplay amount={item.unit_price} />
                          </td>
                          <td>
                            <CurrencyDisplay amount={item.line_total} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td
                          colSpan={3}
                          style={{ textAlign: "right", fontWeight: "bold" }}
                        >
                          Total:
                        </td>
                        <td>
                          <CurrencyDisplay amount={invoice.total_due} />
                        </td>
                      </tr>
                      {invoice.amount_paid > 0 && (
                        <tr>
                          <td
                            colSpan={3}
                            style={{ textAlign: "right", color: "green" }}
                          >
                            Amount Paid:
                          </td>
                          <td>
                            <CurrencyDisplay amount={invoice.amount_paid} />
                          </td>
                        </tr>
                      )}
                      <tr>
                        <td
                          colSpan={3}
                          style={{ textAlign: "right", fontWeight: "bold" }}
                        >
                          Balance Due:
                        </td>
                        <td style={{ fontWeight: "bold" }}>
                          <CurrencyDisplay amount={invoice.balance_due} />
                        </td>
                      </tr>
                    </tfoot>
                  </table>

                  {invoice.status !== "paid" &&
                    invoice.balance_due > 0 &&
                    invoice.qr_payment_token && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "0.75rem",
                          marginTop: "1rem",
                          padding: "1rem",
                          background: "#fafafa",
                          borderRadius: "var(--odyssey-radius)",
                        }}
                      >
                        <QrPaymentCode
                          token={invoice.qr_payment_token}
                          size={160}
                        />
                        <p
                          style={{
                            margin: 0,
                            fontSize: "0.85rem",
                            color: "var(--odyssey-muted-foreground)",
                          }}
                        >
                          Scan QR code to pay via e-wallet ·{" "}
                          <CurrencyDisplay amount={invoice.balance_due} />
                        </p>
                      </div>
                    )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
