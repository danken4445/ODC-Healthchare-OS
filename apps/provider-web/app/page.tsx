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
  getInventoryWorkspace,
  getCurrentStaffDepartment,
  hasOrganizationPermission,
  issueMedicalCertificate,
  issuePrescription,
  recordTriageVitalSigns,
  setAppointmentSlotUnavailable,
  saveProviderWeeklyAvailability,
  saveSoapNote,
  signInWithPassword,
  signOut,
  startAppointmentEncounter,
  subscribeToAppointmentQueue,
  subscribeToClinicalHistory,
  subscribeToInventory,
  tagInventoryUsage,
  retireClinicService,
  updateClinicService,
  createDiagnosticServiceRequest,
  getDiagnosticsWorkspace,
  getSpecialistOptions,
  getLaboratoryServices,
  markClinicalNotificationRead,
  recordDiagnosticReport,
  subscribeToDiagnostics,
  updateReferralStatus,
} from "@odyssey/supabase-client";
import type {
  AppointmentQueueItem,
  AppointmentSlotSummary,
  ClinicServiceSummary,
  ClinicServiceInput,
  OrganizationClinicalRecords,
  InventoryWorkspace,
  DiagnosticsWorkspace,
  SpecialistOption,
  LaboratoryServiceSummary,
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

function triageValue(value: unknown, key: string): string {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return "";
  const item = (value as Record<string, unknown>)[key];
  return typeof item === "string" || typeof item === "number"
    ? String(item)
    : "";
}

function triageBloodPressure(
  value: unknown,
  key: "systolic" | "diastolic",
): string {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return "";
  const bloodPressure = (value as Record<string, unknown>).blood_pressure;
  if (
    typeof bloodPressure !== "object" ||
    bloodPressure === null ||
    Array.isArray(bloodPressure)
  )
    return "";
  const reading = (bloodPressure as Record<string, unknown>)[key];
  return typeof reading === "number" ? String(reading) : "";
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

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
  const [editingService, setEditingService] =
    useState<ClinicServiceSummary | null>(null);
  const [scheduleServiceId, setScheduleServiceId] = useState("");
  const [clinicalRecords, setClinicalRecords] =
    useState<OrganizationClinicalRecords | null>(null);
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(
    null,
  );
  const [clinicalBusy, setClinicalBusy] = useState(false);
  const [canPrescribe, setCanPrescribe] = useState(false);
  const [providerRoleId, setProviderRoleId] = useState<string | null>(null);
  const [inventory, setInventory] = useState<InventoryWorkspace | null>(null);
  const [canTagInventory, setCanTagInventory] = useState(false);
  const [inventoryDepartmentId, setInventoryDepartmentId] = useState<
    string | null
  >(null);
  const [inventoryDepartmentSelection, setInventoryDepartmentSelection] =
    useState("");
  const [inventoryBusy, setInventoryBusy] = useState(false);
  const [canTriage, setCanTriage] = useState(false);
  const [selectedTriageAppointmentId, setSelectedTriageAppointmentId] =
    useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsWorkspace | null>(
    null,
  );
  const [specialists, setSpecialists] = useState<SpecialistOption[]>([]);
  const [selectedSpecialistRoleId, setSelectedSpecialistRoleId] = useState("");
  const [laboratoryServices, setLaboratoryServices] = useState<LaboratoryServiceSummary[]>([]);
  const [canOrderDiagnostics, setCanOrderDiagnostics] = useState(false);
  const [canRecordLabResults, setCanRecordLabResults] = useState(false);
  const [canUpdateReferrals, setCanUpdateReferrals] = useState(false);
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false);

  const ownedServices = services.filter(
    (service) => service.owner_practitioner_role_id === providerRoleId,
  );
  const selectedEncounter = clinicalRecords?.encounters.find(
    (encounter) => encounter.id === selectedEncounterId,
  );
  const selectedAppointment = queue.find(
    (appointment) => appointment.id === selectedEncounter?.appointment_id,
  );
  const priorEncounters =
    clinicalRecords?.encounters.filter(
      (encounter) =>
        encounter.patient_id === selectedEncounter?.patient_id &&
        encounter.id !== selectedEncounterId,
    ) ?? [];
  const currentSoapNote = clinicalRecords?.observations.find(
    (item) =>
      item.encounter_id === selectedEncounterId && item.code === "SOAP-NOTE",
  );
  const currentEncounterTriage = clinicalRecords?.observations.find(
    (item) =>
      item.encounter_id === selectedEncounterId &&
      item.code === "TRIAGE-VITALS",
  );
  const legacySoapDraft = ["SOAP-S", "SOAP-O", "SOAP-A", "SOAP-P"]
    .map((code) =>
      clinicalRecords?.observations.find(
        (item) =>
          item.encounter_id === selectedEncounterId && item.code === code,
      ),
    )
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((item) => `${item.code_display}:\n${clinicalText(item.value)}`)
    .join("\n\n");
  const currentSoapDraft = currentSoapNote
    ? clinicalText(currentSoapNote.value)
    : legacySoapDraft;
  const selectedTriageAppointment = queue.find(
    (appointment) => appointment.id === selectedTriageAppointmentId,
  );
  const selectedTriageEncounter = clinicalRecords?.encounters.find(
    (encounter) => encounter.appointment_id === selectedTriageAppointmentId,
  );
  const currentTriage = clinicalRecords?.observations.find(
    (observation) =>
      observation.encounter_id === selectedTriageEncounter?.id &&
      observation.code === "TRIAGE-VITALS",
  );

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

  const loadClinicalRecords = useCallback(
    async (clinicId = organizationId) => {
      if (!clinicId) return;
      const result = await getOrganizationClinicalRecords(
        createBrowserSupabaseClient(),
        clinicId,
      );
      if (result.error)
        return setStatus(
          `Clinical record query failed: ${result.error.message}`,
        );
      setClinicalRecords(result.data);
    },
    [organizationId],
  );

  const loadInventory = useCallback(
    async (clinicId = organizationId) => {
      if (!clinicId) return;
      const result = await getInventoryWorkspace(
        createBrowserSupabaseClient(),
        clinicId,
      );
      if (result.error)
        return setStatus(`Inventory query failed: ${result.error.message}`);
      setInventory(result.data);
    },
    [organizationId],
  );

  const loadDiagnostics = useCallback(
    async (clinicId = organizationId) => {
      if (!clinicId) return;
      const [workspaceResult, specialistResult, laboratoryServiceResult] = await Promise.all([
        getDiagnosticsWorkspace(createBrowserSupabaseClient(), clinicId),
        getSpecialistOptions(createBrowserSupabaseClient(), clinicId),
        getLaboratoryServices(createBrowserSupabaseClient(), clinicId),
      ]);
      if (workspaceResult.error)
        return setStatus(
          `Diagnostics query failed: ${workspaceResult.error.message}`,
        );
      setDiagnostics(workspaceResult.data);
      if (!specialistResult.error) setSpecialists(specialistResult.data);
      if (!laboratoryServiceResult.error) setLaboratoryServices(laboratoryServiceResult.data);
    },
    [organizationId],
  );

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
      () => {
        void loadClinicalRecords();
        void loadQueue();
      },
    );
    const unsubscribeInventory = canTagInventory
      ? subscribeToInventory(
          createBrowserSupabaseClient(),
          organizationId,
          () => void loadInventory(),
        )
      : () => undefined;
    const unsubscribeDiagnostics = subscribeToDiagnostics(
      createBrowserSupabaseClient(),
      organizationId,
      () => {
        void loadDiagnostics();
        void loadClinicalRecords();
      },
    );
    return () => {
      unsubscribe();
      unsubscribeClinical();
      unsubscribeInventory();
      unsubscribeDiagnostics();
    };
  }, [
    canTagInventory,
    loadAvailability,
    loadClinicalRecords,
    loadInventory,
    loadDiagnostics,
    loadQueue,
    organizationId,
    signedInAs,
  ]);

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
      return setStatus(
        `Provider role query failed: ${roleResult.error.message}`,
      );
    const departmentResult = await getCurrentStaffDepartment(
      createBrowserSupabaseClient(),
      result.data,
    );
    if (departmentResult.error)
      return setStatus(
        `Department context query failed: ${departmentResult.error.message}`,
      );
    const [
      inventoryPermission,
      triagePermission,
      consultationPermission,
      orderPermission,
      labPermission,
      referralPermission,
    ] = await Promise.all([
      hasOrganizationPermission(
        createBrowserSupabaseClient(),
        result.data,
        "can_tag_inventory_usage",
      ),
      hasOrganizationPermission(
        createBrowserSupabaseClient(),
        result.data,
        "can_record_triage",
      ),
      hasOrganizationPermission(
        createBrowserSupabaseClient(),
        result.data,
        "can_start_consultation",
      ),
      hasOrganizationPermission(
        createBrowserSupabaseClient(),
        result.data,
        "can_order_diagnostics",
      ),
      hasOrganizationPermission(
        createBrowserSupabaseClient(),
        result.data,
        "can_record_lab_results",
      ),
      hasOrganizationPermission(
        createBrowserSupabaseClient(),
        result.data,
        "can_update_referrals",
      ),
    ]);
    if (
      inventoryPermission.error ||
      triagePermission.error ||
      consultationPermission.error ||
      orderPermission.error ||
      labPermission.error ||
      referralPermission.error
    )
      return setStatus(
        `Workspace permission query failed: ${inventoryPermission.error?.message ?? triagePermission.error?.message ?? consultationPermission.error?.message ?? orderPermission.error?.message ?? labPermission.error?.message ?? referralPermission.error?.message}`,
      );
    setProviderRoleId(roleResult.data);
    setOrganizationId(result.data);
    setInventoryDepartmentId(departmentResult.data);
    setInventoryDepartmentSelection(departmentResult.data ?? "");
    setCanTagInventory(inventoryPermission.data);
    setCanTriage(triagePermission.data);
    setCanPrescribe(consultationPermission.data);
    setCanOrderDiagnostics(orderPermission.data);
    setCanRecordLabResults(labPermission.data);
    setCanUpdateReferrals(referralPermission.data);
    await Promise.all([
      loadQueue(result.data),
      loadAvailability(result.data),
      loadClinicalRecords(result.data),
      inventoryPermission.data ? loadInventory(result.data) : Promise.resolve(),
      loadDiagnostics(result.data),
    ]);
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

  async function handleTriage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTriageAppointmentId) return;
    const fields = new FormData(event.currentTarget);
    setClinicalBusy(true);
    const result = await recordTriageVitalSigns(createBrowserSupabaseClient(), {
      appointmentId: selectedTriageAppointmentId,
      systolicBp: Number(fields.get("systolicBp")),
      diastolicBp: Number(fields.get("diastolicBp")),
      pulseBpm: Number(fields.get("pulseBpm")),
      respiratoryRate: Number(fields.get("respiratoryRate")),
      temperatureC: Number(fields.get("temperatureC")),
      oxygenSaturation: Number(fields.get("oxygenSaturation")),
      weightKg: fields.get("weightKg") ? Number(fields.get("weightKg")) : null,
      heightCm: fields.get("heightCm") ? Number(fields.get("heightCm")) : null,
      painScore: fields.get("painScore")
        ? Number(fields.get("painScore"))
        : null,
      acuity: String(fields.get("acuity")) as
        "routine" | "urgent" | "emergency",
      chiefComplaint: String(fields.get("chiefComplaint") ?? "").trim() || null,
      notes: String(fields.get("notes") ?? "").trim() || null,
      supersedesId: currentTriage?.id,
    });
    setClinicalBusy(false);
    if (result.error)
      return setStatus(`Unable to save triage: ${result.error.message}`);
    setStatus(
      currentTriage
        ? "Triage vital-sign correction saved."
        : "Triage complete. The appointment is ready for the doctor.",
    );
    await Promise.all([loadClinicalRecords(), loadQueue()]);
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
    if (result.error)
      return setStatus(`Unable to save SOAP note: ${result.error.message}`);
    form.reset();
    setStatus(
      currentSoapNote ? "SOAP note revision saved." : "SOAP note saved.",
    );
    await loadClinicalRecords();
  }

  async function handlePrescription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEncounterId) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setClinicalBusy(true);
    const result = await issuePrescription(createBrowserSupabaseClient(), {
      encounterId: selectedEncounterId,
      medication: String(fields.get("medication") ?? ""),
      dosage: String(fields.get("dosage") ?? ""),
      note: String(fields.get("note") ?? ""),
    });
    setClinicalBusy(false);
    if (result.error)
      return setStatus(`Unable to issue prescription: ${result.error.message}`);
    form.reset();
    setStatus("Prescription issued.");
    await loadClinicalRecords();
  }

  async function handleCertificate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEncounterId) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setClinicalBusy(true);
    const result = await issueMedicalCertificate(
      createBrowserSupabaseClient(),
      {
        encounterId: selectedEncounterId,
        title: String(fields.get("title") ?? ""),
        statement: String(fields.get("statement") ?? ""),
      },
    );
    setClinicalBusy(false);
    if (result.error)
      return setStatus(`Unable to issue certificate: ${result.error.message}`);
    form.reset();
    setStatus("Medical certificate issued.");
    await loadClinicalRecords();
  }

  async function handleInventoryUsage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEncounterId) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setInventoryBusy(true);
    const result = await tagInventoryUsage(createBrowserSupabaseClient(), {
      encounterId: selectedEncounterId,
      stockId: String(fields.get("stockId") ?? ""),
      quantity: Number(fields.get("quantity")),
      departmentId: inventoryDepartmentSelection || null,
    });
    setInventoryBusy(false);
    if (result.error)
      return setStatus(`Unable to tag consumable: ${result.error.message}`);
    form.reset();
    setStatus("Consumable held for the patient and added to the draft bill. Stock will deduct when billing is finalized.");
    await loadInventory();
  }

  async function handleFinishEncounter() {
    if (!selectedEncounterId) return;
    setClinicalBusy(true);
    const result = await finishClinicalEncounter(
      createBrowserSupabaseClient(),
      selectedEncounterId,
    );
    setClinicalBusy(false);
    if (result.error)
      return setStatus(`Unable to complete encounter: ${result.error.message}`);
    setSelectedEncounterId(null);
    setStatus("Encounter completed and shared with the patient.");
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
    if (!windows.length)
      return setStatus("Choose at least one day and a valid time range.");
    if (
      windows.length !==
      [...fields.keys()].filter((key) => key.endsWith("-enabled")).length
    )
      return setStatus("Every enabled day needs a valid start and end time.");
    setAvailabilityBusy(true);
    const result = await saveProviderWeeklyAvailability(
      createBrowserSupabaseClient(),
      selectedService.id,
      windows,
    );
    setAvailabilityBusy(false);
    if (result.error)
      return setStatus(
        `Unable to save weekly availability: ${result.error.message}`,
      );
    setStatus(
      `Weekly availability saved. ${result.data} future appointment slots are now bookable.`,
    );
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
    const durationMinutes = Number(fields.get("durationMinutes"));
    const basePriceValue = String(fields.get("basePrice") ?? "").trim();
    const basePrice = basePriceValue ? Number(basePriceValue) : null;
    if (
      !name ||
      !Number.isInteger(durationMinutes) ||
      durationMinutes < 5 ||
      durationMinutes > 480 ||
      (basePrice !== null && (!Number.isFinite(basePrice) || basePrice < 0))
    ) {
      return setStatus(
        "Enter a name, unique code, duration from 5–480 minutes, and a valid fee.",
      );
    }
    const input: ClinicServiceInput = {
      name,
      durationMinutes,
      basePrice,
      description: String(fields.get("description") ?? ""),
      bookingEnabled: fields.get("bookingEnabled") === "on",
    };
    const scheduleChanged = Boolean(
      editingService &&
      (editingService.name !== name ||
        editingService.duration_minutes !== durationMinutes ||
        editingService.booking_enabled !== input.bookingEnabled),
    );
    setServiceBusy(true);
    const result = editingService
      ? await updateClinicService(
          createBrowserSupabaseClient(),
          organizationId,
          editingService.id,
          input,
        )
      : await createClinicService(
          createBrowserSupabaseClient(),
          organizationId,
          input,
        );
    setServiceBusy(false);
    if (result.error)
      return setStatus(`Unable to save service: ${result.error.message}`);
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
    if (
      !window.confirm(
        `Retire ${service.name}? Existing appointments will be kept.`,
      )
    )
      return;
    setServiceBusy(true);
    const result = await retireClinicService(
      createBrowserSupabaseClient(),
      service.id,
    );
    setServiceBusy(false);
    if (result.error)
      return setStatus(`Unable to retire service: ${result.error.message}`);
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
    setInventory(null);
    setCanTagInventory(false);
    setInventoryDepartmentId(null);
    setInventoryDepartmentSelection("");
    setCanTriage(false);
    setSelectedTriageAppointmentId(null);
    setDiagnostics(null);
    setSpecialists([]);
    setSelectedSpecialistRoleId("");
    setLaboratoryServices([]);
    setCanOrderDiagnostics(false);
    setCanRecordLabResults(false);
    setCanUpdateReferrals(false);
    setStatus("Signed out.");
  }

  async function handleDiagnosticOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEncounterId) return;
    const fields = new FormData(event.currentTarget);
    const category = String(fields.get("category")) as
      "laboratory" | "referral";
    setDiagnosticsBusy(true);
    const result = await createDiagnosticServiceRequest(
      createBrowserSupabaseClient(),
      {
        encounterId: selectedEncounterId,
        category,
        priority: String(fields.get("priority")) as
          "routine" | "urgent" | "asap" | "stat",
        note: String(fields.get("note") ?? ""),
        performerPractitionerRoleId:
          category === "referral"
            ? String(fields.get("specialistRoleId") ?? "")
            : null,
        laboratoryServiceId:
          category === "laboratory"
            ? String(fields.get("laboratoryServiceId") ?? "")
            : null,
      },
    );
    setDiagnosticsBusy(false);
    if (result.error)
      return setStatus(`Unable to place request: ${result.error.message}`);
    event.currentTarget.reset();
    setSelectedSpecialistRoleId("");
    setStatus(
      `${category === "laboratory" ? "Lab order" : "Referral"} placed.`,
    );
    await loadDiagnostics();
  }

  async function handleLabResult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setDiagnosticsBusy(true);
    const result = await recordDiagnosticReport(createBrowserSupabaseClient(), {
      serviceRequestId: String(fields.get("serviceRequestId")),
      conclusion: String(fields.get("conclusion") ?? ""),
      results: [
        {
          display: String(fields.get("resultDisplay")),
          value: String(fields.get("value")),
          unit: String(fields.get("unit") ?? ""),
          referenceRange: { text: String(fields.get("referenceRange") ?? "") },
        },
      ],
    });
    setDiagnosticsBusy(false);
    if (result.error)
      return setStatus(`Unable to record result: ${result.error.message}`);
    event.currentTarget.reset();
    setStatus(
      "Final diagnostic report published and ordering provider notified.",
    );
    await loadDiagnostics();
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
          {!!diagnostics?.notifications.length && (
            <section aria-labelledby="notifications-heading">
              <h2 id="notifications-heading">Diagnostics notifications</h2>
              <div className="record-list">
                {diagnostics.notifications.map((notification) => (
                  <article key={notification.id}>
                    <strong>{notification.title}</strong>
                    <p>{notification.message}</p>
                    <small>
                      {new Date(notification.created_at).toLocaleString()}
                    </small>{" "}
                    {!notification.read_at && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void markClinicalNotificationRead(
                            createBrowserSupabaseClient(),
                            notification.id,
                          ).then(() => loadDiagnostics())
                        }
                      >
                        Mark read
                      </Button>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}
          {canRecordLabResults && (
            <section aria-labelledby="lab-worklist-heading">
              <h2 id="lab-worklist-heading">Laboratory worklist</h2>
              {!diagnostics?.serviceRequests.some(
                (request) =>
                  request.category === "laboratory" &&
                  request.status === "active",
              ) && <p className="hint">No active laboratory orders.</p>}
              <div className="clinical-grid">
                {diagnostics?.serviceRequests
                  .filter(
                    (request) =>
                      request.category === "laboratory" &&
                      request.status === "active",
                  )
                  .map((request) => (
                    <Card key={request.id}>
                      <h3>{request.code_display ?? request.code}</h3>
                      <p className="hint">
                        {request.priority ?? "routine"} · ordered{" "}
                        {new Date(request.created_at).toLocaleString()}
                      </p>
                      {request.note && <p>{request.note}</p>}
                      <form className="stack" onSubmit={handleLabResult}>
                        <input
                          type="hidden"
                          name="serviceRequestId"
                          value={request.id}
                        />
                        <Field label="Result name">
                          <Input name="resultDisplay" required />
                        </Field>
                        <Field label="Value">
                          <Input name="value" required />
                        </Field>
                        <Field label="Unit">
                          <Input name="unit" />
                        </Field>
                        <Field label="Reference range">
                          <Input name="referenceRange" />
                        </Field>
                        <Field label="Conclusion">
                          <textarea
                            className="odyssey-input"
                            name="conclusion"
                            rows={3}
                            maxLength={5000}
                          />
                        </Field>
                        <Button type="submit" disabled={diagnosticsBusy}>
                          Publish final report
                        </Button>
                      </form>
                    </Card>
                  ))}
              </div>
            </section>
          )}
          {canUpdateReferrals && (
            <section aria-labelledby="referrals-heading">
              <h2 id="referrals-heading">My specialist referrals</h2>
              <DataTable
                caption="Referrals routed specifically to your specialist role."
                data={
                  diagnostics?.serviceRequests.filter(
                    (request) => request.category === "referral",
                  ) ?? []
                }
                emptyMessage="No referrals are assigned to you."
                getRowId={(request) => request.id}
                columns={[
                  {
                    id: "request",
                    header: "Referral",
                    cell: (request) => request.code_display ?? request.code,
                  },
                  {
                    id: "priority",
                    header: "Priority",
                    cell: (request) => request.priority ?? "routine",
                  },
                  {
                    id: "status",
                    header: "Status",
                    cell: (request) => request.status.replaceAll("_", " "),
                  },
                  {
                    id: "action",
                    header: "",
                    cell: (request) =>
                      request.status === "completed" ||
                      request.status === "revoked" ? null : (
                        <Button
                          size="sm"
                          onClick={() =>
                            void updateReferralStatus(
                              createBrowserSupabaseClient(),
                              request.id,
                              "completed",
                            ).then((result) => {
                              if (result.error)
                                setStatus(
                                  `Unable to update referral: ${result.error.message}`,
                                );
                              else void loadDiagnostics();
                            })
                          }
                        >
                          Complete
                        </Button>
                      ),
                  },
                ]}
              />
            </section>
          )}
          <DataTable
            caption={
              canTriage
                ? "Checked-in appointments awaiting nurse triage."
                : "Clinical appointments visible to this provider today."
            }
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
                  ) : appointment.triageStatus === "complete" ? (
                    <span className="encounter-status">Triage complete</span>
                  ) : appointment.status !== "arrived" ? (
                    canTriage ? (
                      <span className="hint">Awaiting check-in</span>
                    ) : (
                      <AppointmentStatusBadge status={appointment.status} />
                    )
                  ) : canPrescribe ? (
                    <AppointmentStatusBadge status={appointment.status} />
                  ) : (
                    <span className="hint">Awaiting triage</span>
                  ),
              },
              {
                id: "action",
                header: "",
                cell: (appointment) =>
                  canTriage &&
                  appointment.status === "arrived" &&
                  appointment.encounterStatus !== "in_progress" ? (
                    <Button
                      size="sm"
                      variant={
                        appointment.triageStatus === "complete"
                          ? "outline"
                          : "default"
                      }
                      onClick={() =>
                        setSelectedTriageAppointmentId(appointment.id)
                      }
                    >
                      {appointment.triageStatus === "complete"
                        ? "Review triage"
                        : `Record triage for ${appointment.patientName}`}
                    </Button>
                  ) : appointment.encounterStatus === "in_progress" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const encounter = clinicalRecords?.encounters.find(
                          (item) => item.appointment_id === appointment.id,
                        );
                        setSelectedEncounterId(encounter?.id ?? null);
                      }}
                    >
                      Open chart
                    </Button>
                  ) : appointment.status !== "arrived" ? (
                    <span className="hint">Awaiting check-in</span>
                  ) : appointment.triageStatus !== "complete" ? (
                    <span className="hint">Awaiting nurse triage</span>
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

          {canTriage && selectedTriageAppointment && (
            <section aria-labelledby="triage-heading">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">
                    {selectedTriageAppointment.patientName}
                  </p>
                  <h2 id="triage-heading">Triage assessment</h2>
                </div>
                <span className="hint">
                  {currentTriage
                    ? "Correcting this assessment creates an immutable new version."
                    : "Finalize the assessment before handing the patient to the doctor."}
                </span>
              </div>
              <Card>
                <form className="stack" onSubmit={handleTriage}>
                  <div className="two-column">
                    <Field label="Systolic blood pressure (mmHg)">
                      <Input
                        name="systolicBp"
                        type="number"
                        min="40"
                        max="300"
                        required
                        key={`${currentTriage?.id ?? "new"}-systolic`}
                        defaultValue={triageBloodPressure(
                          currentTriage?.value,
                          "systolic",
                        )}
                      />
                    </Field>
                    <Field label="Diastolic blood pressure (mmHg)">
                      <Input
                        name="diastolicBp"
                        type="number"
                        min="20"
                        max="200"
                        required
                        key={`${currentTriage?.id ?? "new"}-diastolic`}
                        defaultValue={triageBloodPressure(
                          currentTriage?.value,
                          "diastolic",
                        )}
                      />
                    </Field>
                    <Field label="Pulse (bpm)">
                      <Input
                        name="pulseBpm"
                        type="number"
                        min="20"
                        max="300"
                        required
                        key={`${currentTriage?.id ?? "new"}-pulse`}
                        defaultValue={triageValue(
                          currentTriage?.value,
                          "pulse_bpm",
                        )}
                      />
                    </Field>
                    <Field label="Respiratory rate (breaths/min)">
                      <Input
                        name="respiratoryRate"
                        type="number"
                        min="4"
                        max="100"
                        required
                        key={`${currentTriage?.id ?? "new"}-respiratory`}
                        defaultValue={triageValue(
                          currentTriage?.value,
                          "respiratory_rate",
                        )}
                      />
                    </Field>
                    <Field label="Temperature (°C)">
                      <Input
                        name="temperatureC"
                        type="number"
                        min="25"
                        max="45"
                        step="0.1"
                        required
                        key={`${currentTriage?.id ?? "new"}-temperature`}
                        defaultValue={triageValue(
                          currentTriage?.value,
                          "temperature_c",
                        )}
                      />
                    </Field>
                    <Field label="Oxygen saturation (%)">
                      <Input
                        name="oxygenSaturation"
                        type="number"
                        min="0"
                        max="100"
                        required
                        key={`${currentTriage?.id ?? "new"}-oxygen`}
                        defaultValue={triageValue(
                          currentTriage?.value,
                          "oxygen_saturation_percent",
                        )}
                      />
                    </Field>
                    <Field label="Weight (kg)">
                      <Input
                        name="weightKg"
                        type="number"
                        min="0.1"
                        max="700"
                        step="0.1"
                        key={`${currentTriage?.id ?? "new"}-weight`}
                        defaultValue={triageValue(
                          currentTriage?.value,
                          "weight_kg",
                        )}
                      />
                    </Field>
                    <Field label="Height (cm)">
                      <Input
                        name="heightCm"
                        type="number"
                        min="20"
                        max="300"
                        step="0.1"
                        key={`${currentTriage?.id ?? "new"}-height`}
                        defaultValue={triageValue(
                          currentTriage?.value,
                          "height_cm",
                        )}
                      />
                    </Field>
                    <Field label="Pain score (0–10)">
                      <Input
                        name="painScore"
                        type="number"
                        min="0"
                        max="10"
                        key={`${currentTriage?.id ?? "new"}-pain`}
                        defaultValue={triageValue(
                          currentTriage?.value,
                          "pain_score",
                        )}
                      />
                    </Field>
                    <Field label="Acuity">
                      <select
                        className="odyssey-input"
                        name="acuity"
                        key={`${currentTriage?.id ?? "new"}-acuity`}
                        defaultValue={
                          triageValue(currentTriage?.value, "acuity") ||
                          "routine"
                        }
                      >
                        <option value="routine">Routine</option>
                        <option value="urgent">Urgent</option>
                        <option value="emergency">Emergency</option>
                      </select>
                    </Field>
                  </div>
                  <Field label="Chief complaint">
                    <textarea
                      className="odyssey-input"
                      name="chiefComplaint"
                      rows={3}
                      maxLength={2000}
                      key={`${currentTriage?.id ?? "new"}-complaint`}
                      defaultValue={triageValue(
                        currentTriage?.value,
                        "chief_complaint",
                      )}
                    />
                  </Field>
                  <Field label="Triage notes">
                    <textarea
                      className="odyssey-input"
                      name="notes"
                      rows={4}
                      maxLength={5000}
                      key={`${currentTriage?.id ?? "new"}-notes`}
                      defaultValue={triageValue(currentTriage?.value, "notes")}
                    />
                  </Field>
                  <Button type="submit" disabled={clinicalBusy}>
                    {clinicalBusy
                      ? "Saving…"
                      : currentTriage
                        ? "Save triage correction"
                        : "Complete triage"}
                  </Button>
                </form>
              </Card>
            </section>
          )}

          {selectedEncounterId && (
            <section aria-labelledby="chart-heading">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">
                    {selectedAppointment?.patientName ?? "Patient"}
                  </p>
                  <h2 id="chart-heading">Consultation chart</h2>
                </div>
                {canPrescribe && (
                  <Button
                    disabled={clinicalBusy}
                    onClick={() => void handleFinishEncounter()}
                  >
                    Complete encounter
                  </Button>
                )}
              </div>
              <div className="clinical-grid">
                <Card>
                  <h3>Triage vital signs</h3>
                  {currentEncounterTriage ? (
                    <>
                      <p>
                        BP{" "}
                        {triageBloodPressure(
                          currentEncounterTriage.value,
                          "systolic",
                        )}
                        /
                        {triageBloodPressure(
                          currentEncounterTriage.value,
                          "diastolic",
                        )}{" "}
                        mmHg
                        {" · "}Pulse{" "}
                        {triageValue(currentEncounterTriage.value, "pulse_bpm")}{" "}
                        bpm
                        {" · "}Respiratory rate{" "}
                        {triageValue(
                          currentEncounterTriage.value,
                          "respiratory_rate",
                        )}
                        /min
                      </p>
                      <p>
                        Temperature{" "}
                        {triageValue(
                          currentEncounterTriage.value,
                          "temperature_c",
                        )}{" "}
                        °C
                        {" · "}Oxygen saturation{" "}
                        {triageValue(
                          currentEncounterTriage.value,
                          "oxygen_saturation_percent",
                        )}
                        %
                        {triageValue(
                          currentEncounterTriage.value,
                          "pain_score",
                        ) &&
                          ` · Pain ${triageValue(currentEncounterTriage.value, "pain_score")}/10`}
                      </p>
                      <p>
                        <strong>Acuity: </strong>
                        {triageValue(currentEncounterTriage.value, "acuity")}
                      </p>
                      {triageValue(
                        currentEncounterTriage.value,
                        "chief_complaint",
                      ) && (
                        <p>
                          <strong>Chief complaint: </strong>
                          {triageValue(
                            currentEncounterTriage.value,
                            "chief_complaint",
                          )}
                        </p>
                      )}
                      {triageValue(currentEncounterTriage.value, "notes") && (
                        <p>
                          {triageValue(currentEncounterTriage.value, "notes")}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="hint">No triage assessment is recorded.</p>
                  )}
                </Card>
                <Card>
                  <h3>SOAP note</h3>
                  <form className="stack" onSubmit={handleSoap}>
                    <Field
                      label="Complete SOAP note"
                      hint="Record subjective, objective, assessment, and plan in this single note."
                    >
                      <textarea
                        className="odyssey-input"
                        name="text"
                        rows={10}
                        maxLength={20000}
                        key={
                          currentSoapNote?.id ??
                          `new-soap-note-${selectedEncounterId}`
                        }
                        defaultValue={currentSoapDraft}
                        placeholder={
                          "Subjective:\n\nObjective:\n\nAssessment:\n\nPlan:"
                        }
                        required
                      />
                    </Field>
                    <Button type="submit" disabled={clinicalBusy}>
                      Save SOAP note
                    </Button>
                  </form>
                  <div className="record-list">
                    {clinicalRecords?.observations
                      .filter(
                        (item) =>
                          item.encounter_id === selectedEncounterId &&
                          item.code.startsWith("SOAP-"),
                      )
                      .map((item) => (
                        <article key={item.id}>
                          <strong>{item.code_display}</strong>
                          <p>{clinicalText(item.value)}</p>
                          <small>
                            {item.supersedes_id ? "Revision" : "Original"} ·{" "}
                            {item.effective_at
                              ? new Date(item.effective_at).toLocaleString()
                              : ""}
                          </small>
                        </article>
                      ))}
                  </div>
                </Card>
                {canPrescribe && (
                  <Card>
                    <h3>Prescription</h3>
                    <form className="stack" onSubmit={handlePrescription}>
                      <Field label="Medication">
                        <Input name="medication" maxLength={240} required />
                      </Field>
                      <Field label="Dosage and directions">
                        <textarea
                          className="odyssey-input"
                          name="dosage"
                          rows={3}
                          maxLength={1000}
                          required
                        />
                      </Field>
                      <Field label="Note">
                        <Input name="note" maxLength={1000} />
                      </Field>
                      <Button type="submit" disabled={clinicalBusy}>
                        Issue prescription
                      </Button>
                    </form>
                  </Card>
                )}
                {canOrderDiagnostics && (
                  <Card>
                    <h3>Laboratory order</h3>
                    <form className="stack" onSubmit={handleDiagnosticOrder}>
                      <input type="hidden" name="category" value="laboratory" />
                      <Field label="Laboratory service">
                        <select className="odyssey-input" name="laboratoryServiceId" defaultValue="" required>
                          <option value="" disabled>Select a laboratory service</option>
                          {laboratoryServices.filter((service) => service.active).map((service) => (
                            <option key={service.id} value={service.id}>{service.name} · PHP {service.labCost.toFixed(2)}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Priority">
                        <select
                          className="odyssey-input"
                          name="priority"
                          defaultValue="routine"
                        >
                          <option value="routine">Routine</option>
                          <option value="urgent">Urgent</option>
                          <option value="asap">ASAP</option>
                          <option value="stat">STAT</option>
                        </select>
                      </Field>
                      <Field label="Clinical note">
                        <textarea
                          className="odyssey-input"
                          name="note"
                          rows={3}
                          maxLength={5000}
                        />
                      </Field>
                      <Button type="submit" disabled={diagnosticsBusy}>
                        Place lab order
                      </Button>
                    </form>
                    <h3>Specialist referral</h3>
                    <form className="stack" onSubmit={handleDiagnosticOrder}>
                      <input type="hidden" name="category" value="referral" />
                      <Field label="Specialist" hint="The affiliated clinic or hospital is shown with each specialist.">
                        <select className="odyssey-input" name="specialistRoleId" value={selectedSpecialistRoleId} onChange={(event) => setSelectedSpecialistRoleId(event.target.value)} required>
                          <option value="" disabled>Select a specialist</option>
                          {specialists.map((specialist) => (
                            <option key={specialist.practitionerRoleId} value={specialist.practitionerRoleId}>
                              {specialist.displayName} · {specialist.organizationName}
                            </option>
                          ))}
                        </select>
                        {selectedSpecialistRoleId && <p className="hint">Affiliated clinic/hospital: {specialists.find((specialist) => specialist.practitionerRoleId === selectedSpecialistRoleId)?.organizationName}</p>}
                      </Field>
                      <Field label="Priority">
                        <select className="odyssey-input" name="priority" defaultValue="routine">
                          <option value="routine">Routine</option><option value="urgent">Urgent</option><option value="asap">ASAP</option><option value="stat">STAT</option>
                        </select>
                      </Field>
                      <Field label="Clinical note"><textarea className="odyssey-input" name="note" rows={3} maxLength={5000} /></Field>
                      <Button type="submit" disabled={diagnosticsBusy}>Place referral</Button>
                    </form>
                    <div className="record-list">
                      {diagnostics?.serviceRequests
                        .filter(
                          (request) =>
                            request.encounter_id === selectedEncounterId,
                        )
                        .map((request) => (
                          <article key={request.id}>
                            <strong>
                              {request.code_display ?? request.code}
                            </strong>
                            <p>
                              {request.category} ·{" "}
                              {request.status.replaceAll("_", " ")}
                            </p>
                          </article>
                        ))}
                    </div>
                  </Card>
                )}
                {canPrescribe && (
                  <Card>
                    <h3>Medical certificate</h3>
                    <form className="stack" onSubmit={handleCertificate}>
                      <Field label="Certificate title">
                        <Input
                          name="title"
                          defaultValue="Medical Certificate"
                          maxLength={200}
                          required
                        />
                      </Field>
                      <Field label="Statement">
                        <textarea
                          className="odyssey-input"
                          name="statement"
                          rows={4}
                          maxLength={5000}
                          required
                        />
                      </Field>
                      <Button type="submit" disabled={clinicalBusy}>
                        Issue certificate
                      </Button>
                    </form>
                  </Card>
                )}
                {canTagInventory && (
                  <Card>
                    <h3>Consumables used</h3>
                    <p className="hint">
                      Tagging writes the billing source record and decrements
                      the selected department immediately.
                    </p>
                    <form className="stack" onSubmit={handleInventoryUsage}>
                      <Field
                        label="Department"
                        hint={
                          inventoryDepartmentId
                            ? "Your account is assigned to this department."
                            : "Choose where this usage should be subtracted."
                        }
                      >
                        <select
                          className="odyssey-input"
                          name="departmentId"
                          value={inventoryDepartmentSelection}
                          onChange={(event) =>
                            setInventoryDepartmentSelection(event.target.value)
                          }
                          disabled={Boolean(inventoryDepartmentId)}
                          required
                        >
                          <option value="" disabled>
                            Select a department
                          </option>
                          {inventory?.departments
                            .filter((department) => department.active)
                            .map((department) => (
                              <option key={department.id} value={department.id}>
                                {department.name} ({department.code})
                              </option>
                            ))}
                        </select>
                      </Field>
                      <Field label="Item and available stock">
                        <select
                          className="odyssey-input"
                          name="stockId"
                          defaultValue=""
                          required
                        >
                          <option value="" disabled>
                            Select available stock
                          </option>
                          {inventory?.stock
                            .filter(
                              (stock) =>
                                Number(stock.quantity) > 0 &&
                                (!inventoryDepartmentSelection ||
                                  stock.department_id ===
                                    inventoryDepartmentSelection),
                            )
                            .map((stock) => {
                              const item = inventory.items.find(
                                (candidate) => candidate.id === stock.item_id,
                              );
                              const department = inventory.departments.find(
                                (candidate) =>
                                  candidate.id === stock.department_id,
                              );
                              return (
                                <option key={stock.id} value={stock.id}>
                                  {item?.name ?? "Item"} ·{" "}
                                  {department?.name ?? "Department"} (
                                  {Number(stock.quantity).toLocaleString()}{" "}
                                  {item?.unit_of_measure ?? "units"})
                                </option>
                              );
                            })}
                        </select>
                      </Field>
                      <Field label="Quantity used">
                        <Input
                          name="quantity"
                          type="number"
                          min="0.001"
                          step="0.001"
                          defaultValue="1"
                          required
                        />
                      </Field>
                      <Button type="submit" disabled={inventoryBusy}>
                        {inventoryBusy ? "Tagging…" : "Tag consumable"}
                      </Button>
                    </form>
                    <div className="record-list">
                      {inventory?.usages
                        .filter(
                          (usage) => usage.encounter_id === selectedEncounterId,
                        )
                        .map((usage) => {
                          const item = inventory.items.find(
                            (candidate) => candidate.id === usage.item_id,
                          );
                          const department = inventory.departments.find(
                            (candidate) => candidate.id === usage.department_id,
                          );
                          return (
                            <article key={usage.id}>
                              <strong>{item?.name ?? "Consumable"}</strong>
                              <p>
                                {Number(usage.quantity).toLocaleString()}{" "}
                                {item?.unit_of_measure ?? "units"} ·{" "}
                                {department?.name ?? "Department"}
                              </p>
                              <small>
                                {usage.currency}{" "}
                                {(
                                  Number(usage.unit_price) *
                                  Number(usage.quantity)
                                ).toFixed(2)}{" "}
                                billable usage
                              </small>
                            </article>
                          );
                        })}
                    </div>
                  </Card>
                )}
                <Card className="patient-history-card">
                  <h3>Patient medical history</h3>
                  {!priorEncounters.length && (
                    <p className="hint">
                      No earlier encounters are recorded at this clinic.
                    </p>
                  )}
                  <div className="record-list">
                    {priorEncounters.map((encounter) => (
                      <article key={encounter.id}>
                        <strong>
                          {encounter.service_type ?? "Clinical visit"}
                        </strong>
                        <small>
                          {encounter.period_start
                            ? new Date(encounter.period_start).toLocaleString()
                            : "Date pending"}{" "}
                          · {encounter.status.replaceAll("_", " ")}
                        </small>
                        {clinicalRecords?.observations
                          .filter((item) => item.encounter_id === encounter.id)
                          .map((item) => (
                            <div key={item.id}>
                              <strong>{item.code_display ?? item.code}</strong>
                              <p>{clinicalText(item.value)}</p>
                            </div>
                          ))}
                        {clinicalRecords?.medicationRequests
                          .filter((item) => item.encounter_id === encounter.id)
                          .map((item) => (
                            <div key={item.id}>
                              <strong>
                                Prescription:{" "}
                                {item.medication_display ??
                                  item.medication_code}
                              </strong>
                              <p>{dosageText(item.dosage_instruction)}</p>
                              {item.note && <p>{item.note}</p>}
                            </div>
                          ))}
                        {clinicalRecords?.documentReferences
                          .filter((item) => item.encounter_id === encounter.id)
                          .map((item) => (
                            <div key={item.id}>
                              <strong>
                                {item.content_title ??
                                  item.type_display ??
                                  "Clinical document"}
                              </strong>
                              <p>{item.description}</p>
                            </div>
                          ))}
                      </article>
                    ))}
                  </div>
                </Card>
              </div>
            </section>
          )}

          {canPrescribe && (
            <section>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Doctor CMS</p>
                  <h2>My services &amp; schedule</h2>
                </div>
                <span className="hint">
                  Control what patients can book with you.
                </span>
              </div>
              <div className="two-column cms-grid">
                <Card>
                  <div className="section-heading">
                    <h3>{editingService ? "Edit service" : "Add a service"}</h3>
                    {editingService && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingService(null)}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                  <form className="stack" onSubmit={handleSaveService}>
                    <div className="service-form-row">
                      <Field label="Service name">
                        <Input
                          name="name"
                          key={`name-${editingService?.id ?? "new"}`}
                          defaultValue={editingService?.name ?? ""}
                          required
                        />
                      </Field>
                    </div>
                    <Field label="Description">
                      <Input
                        name="description"
                        key={`description-${editingService?.id ?? "new"}`}
                        defaultValue={editingService?.description ?? ""}
                        maxLength={500}
                      />
                    </Field>
                    <div className="service-form-row">
                      <Field label="Duration (minutes)">
                        <Input
                          name="durationMinutes"
                          key={`duration-${editingService?.id ?? "new"}`}
                          type="number"
                          min="5"
                          max="480"
                          defaultValue={editingService?.duration_minutes ?? 30}
                          required
                        />
                      </Field>
                      <Field label="Fee (PHP)">
                        <Input
                          name="basePrice"
                          key={`price-${editingService?.id ?? "new"}`}
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue={editingService?.base_price ?? ""}
                        />
                      </Field>
                    </div>
                    <label className="booking-toggle">
                      <input
                        name="bookingEnabled"
                        key={`booking-${editingService?.id ?? "new"}`}
                        type="checkbox"
                        defaultChecked={editingService?.booking_enabled ?? true}
                      />{" "}
                      Available for online booking
                    </label>
                    <Button type="submit" disabled={serviceBusy}>
                      {serviceBusy
                        ? "Saving…"
                        : editingService
                          ? "Save service"
                          : "Add service"}
                    </Button>
                  </form>
                </Card>
                <Card>
                  <h3>My service catalog</h3>
                  <div className="service-list">
                    {ownedServices.map((service) => (
                      <article key={service.id}>
                        <div>
                          <strong>{service.name}</strong>
                          <small>
                            {service.duration_minutes} min ·{" "}
                            {service.base_price === null
                              ? "Fee on consultation"
                              : `PHP ${service.base_price.toLocaleString()}`}
                          </small>
                        </div>
                        <div className="service-actions">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingService(service)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={serviceBusy}
                            onClick={() => void handleRetireService(service)}
                          >
                            Retire
                          </Button>
                        </div>
                      </article>
                    ))}
                    {!ownedServices.length && (
                      <p className="hint">Add your first bookable service.</p>
                    )}
                  </div>
                </Card>
              </div>
              <h3 className="schedule-heading">Weekly availability</h3>
              <p className="hint">
                Set a window such as 10:00 AM–5:00 PM. We create consecutive
                slots using the selected service duration.
              </p>
              <form
                className="weekly-schedule"
                onSubmit={handleCreateAvailability}
              >
                <Field label="Service">
                  <select
                    className="odyssey-input"
                    name="scheduleServiceId"
                    value={scheduleServiceId}
                    onChange={(event) =>
                      setScheduleServiceId(event.target.value)
                    }
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
                  {WEEKDAYS.map((day, index) => (
                    <div className="weekly-day" key={day}>
                      <label className="day-enabled">
                        <input name={`day-${index}-enabled`} type="checkbox" />{" "}
                        <strong>{day}</strong>
                      </label>
                      <Input
                        aria-label={`${day} start time`}
                        name={`day-${index}-start`}
                        type="time"
                        defaultValue="10:00"
                      />
                      <span>to</span>
                      <Input
                        aria-label={`${day} end time`}
                        name={`day-${index}-end`}
                        type="time"
                        defaultValue="17:00"
                      />
                    </div>
                  ))}
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
            </section>
          )}
        </>
      )}
      <p role="status">{status}</p>
    </main>
  );
}
