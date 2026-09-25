"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminData } from "../components/admin-data-context";
import {
  getDiagnosticsWorkspace,
  getWaitingRoomQueue,
  markClinicalNotificationRead,
} from "@odyssey/supabase-client";

export interface VesperKpis {
  avgConsultationTime: {
    value: number | string;
    unit: string;
    delta: string;
    isPositive: boolean;
  };
  avgQueueWaitTime: {
    value: number | string;
    unit: string;
    delta: string;
    isPositive: boolean;
  };
  pendingLabResults: {
    value: number;
    delta: string;
    isPositive: boolean;
  };
  overdueClaims: {
    value: number;
    delta: string;
    isPositive: boolean;
  };
}

export interface VesperPatientRecord {
  id: string;
  fullName: string;
  initials: string;
  age: number | string;
  gender: "female" | "male" | "other";
  bedOrQueue: string;
  alertsCount: number;
  status: string;
  birthDate?: string;
  telecom?: string;
  address?: string;
  mrn?: string;
}

export interface VesperDiagnosticTest {
  id: string;
  name: string;
  category: "Laboratory" | "Imaging" | "General";
  requestedDate: string;
  completedDate: string | null;
  status: "completed" | "in_progress" | "pending";
  shape: "square" | "circle" | "triangle";
  color: "red" | "teal" | "amber";
}

export interface VesperRecentModule {
  name: string;
  href: string;
  iconName: string;
  date: string;
  actionLabel: string;
}

export interface VesperTask {
  id: string;
  label: string;
  completed: boolean;
  fromName: string;
  fromAvatar: string;
  category: "claim" | "referral" | "clinical" | "approval";
}

export interface VesperNotification {
  id: string;
  title: string;
  message: string;
  kind: string;
  read: boolean;
  createdAt: string;
}

export function useVesperDashboardData() {
  const { client, email, organization } = useAdminData();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [kpis, setKpis] = useState<VesperKpis>({
    avgConsultationTime: {
      value: 0,
      unit: "mins",
      delta: "—",
      isPositive: true,
    },
    avgQueueWaitTime: {
      value: 0,
      unit: "mins",
      delta: "—",
      isPositive: true,
    },
    pendingLabResults: {
      value: 0,
      delta: "—",
      isPositive: true,
    },
    overdueClaims: {
      value: 0,
      delta: "—",
      isPositive: true,
    },
  });

  const [patientRecords, setPatientRecords] = useState<VesperPatientRecord[]>([]);
  const [diagnosticTests, setDiagnosticTests] = useState<VesperDiagnosticTest[]>([]);
  const [tasks, setTasks] = useState<VesperTask[]>([]);
  const [recentModules, setRecentModules] = useState<VesperRecentModule[]>([]);
  const [notifications, setNotifications] = useState<VesperNotification[]>([]);

  const loadData = useCallback(async () => {
    if (!organization) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 1. Fetch real patients from Supabase
      const patientsPromise = client
        .from("patients")
        .select("id, name, birth_date, gender, telecom, address, walk_in_id, created_at")
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false })
        .limit(20);

      // 2. Fetch encounters to compute real consultation times
      const encountersPromise = client
        .from("encounters")
        .select("id, status, period_start, period_end, service_type")
        .eq("organization_id", organization.id)
        .order("period_start", { ascending: false })
        .limit(100);

      // 3. Fetch waiting room queue for wait time
      const queuePromise = getWaitingRoomQueue(client, organization.id);

      // 4. Fetch diagnostics workspace for pending lab results & tests
      const diagPromise = getDiagnosticsWorkspace(client, organization.id);

      // 5. Fetch claims to compute overdue claims
      const claimsPromise = client
        .from("claims")
        .select("id, status, submitted_at, payor_type, total_claimed, created_at")
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false })
        .limit(50);

      // 6. Fetch active referrals
      const referralsPromise = client
        .from("service_requests")
        .select("id, category, status, priority, code_display, created_at")
        .eq("organization_id", organization.id)
        .eq("category", "referral")
        .order("created_at", { ascending: false })
        .limit(20);

      const [
        patientsRes,
        encountersRes,
        queueRes,
        diagRes,
        claimsRes,
        referralsRes,
      ] = await Promise.allSettled([
        patientsPromise,
        encountersPromise,
        queuePromise,
        diagPromise,
        claimsPromise,
        referralsPromise,
      ]);

      // --- Process Patients ---
      if (patientsRes.status === "fulfilled" && !patientsRes.value.error && patientsRes.value.data) {
        const dbPatients: VesperPatientRecord[] = patientsRes.value.data.map((p: any, idx: number) => {
          let fullName = "Unnamed Patient";
          if (typeof p.name === "string") fullName = p.name;
          else if (Array.isArray(p.name) && p.name[0]?.text) fullName = p.name[0].text;
          else if (typeof p.name === "object" && p.name?.text) fullName = p.name.text;
          else if (p.name?.family || p.name?.given) {
            const given = Array.isArray(p.name.given) ? p.name.given.join(" ") : p.name.given ?? "";
            fullName = `${given} ${p.name.family ?? ""}`.trim();
          }

          const initials = fullName
            .split(" ")
            .filter(Boolean)
            .map((w: string) => w[0]?.toUpperCase())
            .slice(0, 2)
            .join("") || "PT";

          let age: number | string = "—";
          if (p.birth_date) {
            const birthYear = new Date(p.birth_date).getFullYear();
            if (!isNaN(birthYear)) age = Math.max(1, new Date().getFullYear() - birthYear);
          }

          const gender: "female" | "male" | "other" =
            p.gender === "female" ? "female" : p.gender === "male" ? "male" : "other";

          return {
            id: p.id,
            fullName,
            initials,
            age,
            gender,
            bedOrQueue: String(301 + idx),
            alertsCount: 0,
            status: "Active",
            birthDate: p.birth_date,
            telecom: typeof p.telecom === "string" ? p.telecom : Array.isArray(p.telecom) ? p.telecom[0]?.value : undefined,
            address: typeof p.address === "string" ? p.address : Array.isArray(p.address) ? p.address[0]?.text : undefined,
            mrn: p.walk_in_id || `MRN-${p.id.slice(0, 8).toUpperCase()}`,
          };
        });

        setPatientRecords(dbPatients);
      } else {
        setPatientRecords([]);
      }

      // --- Process Encounters -> Consultation time KPI ---
      let avgConsultMins = 0;
      let consultDelta = "—";
      if (encountersRes.status === "fulfilled" && !encountersRes.value.error && encountersRes.value.data) {
        const finished = encountersRes.value.data.filter((e: any) => e.period_start && e.period_end && e.status === "finished");
        if (finished.length > 0) {
          const totalMins = finished.reduce((acc: number, curr: any) => {
            const start = new Date(curr.period_start).getTime();
            const end = new Date(curr.period_end).getTime();
            const mins = Math.max(1, Math.round((end - start) / 60000));
            return acc + mins;
          }, 0);
          avgConsultMins = Math.round(totalMins / finished.length);
          consultDelta = `${avgConsultMins}m avg`;
        }
      }

      // --- Process Queue -> Wait time KPI ---
      let waitTimeValue: number | string = 0;
      let waitTimeUnit = "mins";
      let queueDelta = "—";
      if (queueRes.status === "fulfilled" && !queueRes.value.error && queueRes.value.data) {
        const qData = queueRes.value.data;
        if (qData.length > 0) {
          waitTimeValue = qData.length * 15;
          queueDelta = `${qData.length} waiting`;
        }
      }

      // --- Process Diagnostics -> Pending lab results & Test list ---
      let pendingLabCount = 0;
      const realTests: VesperDiagnosticTest[] = [];

      if (diagRes.status === "fulfilled" && !diagRes.value.error && diagRes.value.data) {
        const dWorkspace = diagRes.value.data;
        const pendingReqs = dWorkspace.serviceRequests.filter(
          (sr) => sr.status === "active" || sr.status === "draft"
        );
        pendingLabCount = pendingReqs.length;

        const shapes: Array<"square" | "circle" | "triangle"> = ["square", "circle", "triangle"];
        const colors: Array<"red" | "teal" | "amber"> = ["red", "teal", "amber"];

        dWorkspace.serviceRequests.forEach((sr, i) => {
          const reqDate = new Date(sr.created_at);
          const reqFormatted = !isNaN(reqDate.getTime())
            ? `${String(reqDate.getMonth() + 1).padStart(2, "0")}/${String(reqDate.getDate()).padStart(2, "0")}/${reqDate.getFullYear()}`
            : "—";

          realTests.push({
            id: sr.id,
            name: sr.code_display || "Laboratory Diagnostic Request",
            category: "Laboratory",
            requestedDate: reqFormatted,
            completedDate: sr.status === "completed" ? reqFormatted : null,
            status: sr.status === "completed" ? "completed" : "in_progress",
            shape: sr.status === "completed" ? "circle" : sr.priority === "urgent" || sr.priority === "stat" ? "square" : "triangle",
            color: sr.status === "completed" ? "teal" : sr.priority === "urgent" || sr.priority === "stat" ? "red" : "amber",
          });
        });

        // Notifications
        if (dWorkspace.notifications?.length) {
          setNotifications(
            dWorkspace.notifications.map((n) => ({
              id: n.id,
              title: n.title,
              message: n.message,
              kind: n.kind,
              read: Boolean(n.read_at),
              createdAt: n.created_at,
            }))
          );
        } else {
          setNotifications([]);
        }
      }
      setDiagnosticTests(realTests);

      // --- Process Claims -> Overdue Claims KPI & Real Tasks ---
      let overdueClaimsCount = 0;
      const realTasks: VesperTask[] = [];

      if (claimsRes.status === "fulfilled" && !claimsRes.value.error && claimsRes.value.data) {
        const claimsData = claimsRes.value.data;
        const pendingClaims = claimsData.filter(
          (c: any) => c.status === "draft" || c.status === "submitted"
        );
        overdueClaimsCount = pendingClaims.length;

        // Turn pending claims into real tasks
        pendingClaims.slice(0, 5).forEach((c: any, idx: number) => {
          realTasks.push({
            id: `claim-${c.id}`,
            label: `Adjudicate HMO claim #${c.id.slice(0, 8).toUpperCase()} (${c.payor_type ?? "Self Pay"})`,
            completed: false,
            fromName: "Revenue Operations",
            fromAvatar: "RO",
            category: "claim",
          });
        });
      }

      // Turn active referrals into real tasks
      if (referralsRes.status === "fulfilled" && !referralsRes.value.error && referralsRes.value.data) {
        const referralsData = referralsRes.value.data;
        referralsData.slice(0, 5).forEach((refItem: any) => {
          realTasks.push({
            id: `ref-${refItem.id}`,
            label: `Authorize specialist referral: ${refItem.code_display || "Specialist Evaluation"}`,
            completed: false,
            fromName: "Clinical Staff",
            fromAvatar: "CS",
            category: "referral",
          });
        });
      }

      // Add unread clinical notification tasks if any
      if (diagRes.status === "fulfilled" && diagRes.value.data?.notifications) {
        diagRes.value.data.notifications.filter((n) => !n.read_at).slice(0, 3).forEach((n) => {
          realTasks.push({
            id: `notif-${n.id}`,
            label: n.title || n.message,
            completed: false,
            fromName: "Lab & Diagnostics",
            fromAvatar: "LD",
            category: "clinical",
          });
        });
      }

      setTasks(realTasks);

      // --- Process Recently Accessed Modules ---
      // Read actual module navigation history from localStorage or set active clinic modules
      let storedModules: VesperRecentModule[] = [];
      try {
        const raw = window.localStorage.getItem("odyssey_recent_modules");
        if (raw) storedModules = JSON.parse(raw);
      } catch {
        // ignore
      }

      if (storedModules && storedModules.length > 0) {
        setRecentModules(storedModules);
      } else {
        // Default to active modules that exist in this clinic
        const todayDate = new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }).format(new Date());
        setRecentModules([
          { name: "Queue", href: "/waiting-room", iconName: "Users", date: todayDate, actionLabel: "See details" },
          { name: "Outpatients", href: "/patients", iconName: "UserCheck", date: todayDate, actionLabel: "See details" },
          { name: "Teleconsult", href: "/teleconsult", iconName: "Video", date: todayDate, actionLabel: "See details" },
          { name: "Diagnostics / Mini-LIS", href: "/laboratory-services", iconName: "FlaskConical", date: todayDate, actionLabel: "See details" },
          { name: "Inventory", href: "/inventory", iconName: "Boxes", date: todayDate, actionLabel: "See details" },
          { name: "HMO Claims", href: "/billing/claims", iconName: "ClipboardCheck", date: todayDate, actionLabel: "See details" },
        ]);
      }

      setKpis({
        avgConsultationTime: {
          value: avgConsultMins,
          unit: "mins",
          delta: consultDelta,
          isPositive: avgConsultMins > 0,
        },
        avgQueueWaitTime: {
          value: waitTimeValue,
          unit: waitTimeUnit,
          delta: queueDelta,
          isPositive: Number(waitTimeValue) === 0,
        },
        pendingLabResults: {
          value: pendingLabCount,
          delta: pendingLabCount > 0 ? `${pendingLabCount} pending` : "0 pending",
          isPositive: pendingLabCount === 0,
        },
        overdueClaims: {
          value: overdueClaimsCount,
          delta: overdueClaimsCount > 0 ? `${overdueClaimsCount} open` : "0 open",
          isPositive: overdueClaimsCount === 0,
        },
      });
    } catch (err: any) {
      console.warn("Error loading Vesper dashboard data from Supabase:", err);
      setError(err?.message ?? "Failed to load clinic records");
    } finally {
      setLoading(false);
    }
  }, [client, organization]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const toggleTask = useCallback((taskId: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t))
    );
  }, []);

  const markNotificationRead = useCallback(
    async (notificationId: string) => {
      await markClinicalNotificationRead(client, notificationId);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
    },
    [client]
  );

  const createPatient = useCallback(
    async (input: {
      fullName: string;
      birthDate: string;
      gender: string;
      telecom?: string;
      address?: string;
    }): Promise<boolean> => {
      if (!organization) return false;
      const [given, ...familyParts] = input.fullName.trim().split(" ");
      const family = familyParts.join(" ") || given;

      const { error: insertError } = await client
        .from("patients")
        .insert({
          organization_id: organization.id,
          name: [{ family, given: [given], text: input.fullName }],
          birth_date: input.birthDate,
          gender: input.gender,
          telecom: input.telecom ? [{ system: "phone", value: input.telecom }] : [],
          address: input.address ? [{ text: input.address }] : [],
        });

      if (insertError) {
        console.error("Patient creation failed:", insertError);
        return false;
      }

      await loadData();
      return true;
    },
    [client, loadData, organization]
  );

  const createBooking = useCallback(
    async (input: {
      patientId: string;
      serviceType: string;
      startAt: string;
      minutesDuration?: number;
    }): Promise<boolean> => {
      if (!organization) return false;
      const endAt = new Date(
        new Date(input.startAt).getTime() + (input.minutesDuration ?? 30) * 60000
      ).toISOString();

      const { error: insertError } = await client.from("appointments").insert({
        organization_id: organization.id,
        patient_id: input.patientId,
        service_type: input.serviceType,
        status: "booked",
        start_at: input.startAt,
        end_at: endAt,
        minutes_duration: input.minutesDuration ?? 30,
      });

      if (insertError) {
        console.error("Booking creation failed:", insertError);
        return false;
      }

      await loadData();
      return true;
    },
    [client, loadData, organization]
  );

  const createReferral = useCallback(
    async (input: {
      patientId: string;
      codeDisplay: string;
      priority: string;
      note?: string;
    }): Promise<boolean> => {
      if (!organization) return false;
      const { error: insertError } = await client.from("service_requests").insert({
        organization_id: organization.id,
        patient_id: input.patientId,
        category: "referral",
        status: "active",
        priority: input.priority,
        code: "44054006",
        code_display: input.codeDisplay,
        note: input.note ?? "Specialist referral issued from dashboard.",
      });

      if (insertError) {
        console.error("Referral creation failed:", insertError);
        return false;
      }

      await loadData();
      return true;
    },
    [client, loadData, organization]
  );

  return {
    loading,
    error,
    kpis,
    patientRecords,
    diagnosticTests,
    recentModules,
    tasks,
    notifications,
    toggleTask,
    markNotificationRead,
    createPatient,
    createBooking,
    createReferral,
    refetch: loadData,
  };
}
