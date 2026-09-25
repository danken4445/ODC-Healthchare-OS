"use client";

import { CheckCircle2, Clock, Pill, Plus, RefreshCw } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { useAdminData } from "../../components/admin-data-context";

interface PrescriptionRecord {
  id: string;
  patientName: string;
  initials: string;
  medication: string;
  instructions: string;
  authoredDate: string;
  status: string;
}

function parsePatientName(pName: any): string {
  if (!pName) return "Unnamed Patient";
  if (typeof pName === "string") return pName;
  if (Array.isArray(pName) && pName[0]?.text) return pName[0].text;
  if (typeof pName === "object" && pName?.text) return pName.text;
  if (pName?.family || pName?.given) {
    const given = Array.isArray(pName.given) ? pName.given.join(" ") : pName.given ?? "";
    return `${given} ${pName.family ?? ""}`.trim();
  }
  return "Patient";
}

function getInitials(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .map((w: string) => w[0]?.toUpperCase())
      .slice(0, 2)
      .join("") || "PT"
  );
}

export default function PrescriptionsPage() {
  const { client, organization } = useAdminData();
  const [prescriptions, setPrescriptions] = useState<PrescriptionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPrescriptions = useCallback(async () => {
    if (!organization) return;
    try {
      setLoading(true);
      const { data, error } = await client
        .from("medication_requests")
        .select(`
          id,
          medication_display,
          medication_code,
          dosage_instruction,
          authored_on,
          status,
          note,
          patients (
            id,
            name
          )
        `)
        .eq("organization_id", organization.id)
        .order("authored_on", { ascending: false })
        .limit(50);

      if (error) {
        console.warn("Error fetching medication requests:", error);
        setPrescriptions([]);
        return;
      }

      const mapped: PrescriptionRecord[] = (data ?? []).map((m: any) => {
        const patientRaw = Array.isArray(m.patients) ? m.patients[0] : m.patients;
        const patientName = parsePatientName(patientRaw?.name);
        const initials = getInitials(patientName);

        let authoredDate = "—";
        if (m.authored_on) {
          const dt = new Date(m.authored_on);
          if (!isNaN(dt.getTime())) {
            authoredDate = dt.toLocaleDateString("en-US", {
              month: "2-digit",
              day: "2-digit",
              year: "numeric",
            });
          }
        }

        let instructions = "As directed by physician";
        if (typeof m.dosage_instruction === "string" && m.dosage_instruction) {
          instructions = m.dosage_instruction;
        } else if (Array.isArray(m.dosage_instruction) && m.dosage_instruction[0]?.text) {
          instructions = m.dosage_instruction[0].text;
        } else if (m.note) {
          instructions = m.note;
        }

        return {
          id: m.id,
          patientName,
          initials,
          medication: m.medication_display || m.medication_code || "Prescribed Medication",
          instructions,
          authoredDate,
          status: m.status || "active",
        };
      });

      setPrescriptions(mapped);
    } catch (err) {
      console.warn("Failed to load medication requests:", err);
      setPrescriptions([]);
    } finally {
      setLoading(false);
    }
  }, [client, organization]);

  useEffect(() => {
    void loadPrescriptions();
  }, [loadPrescriptions]);

  return (
    <div className="vesper-page-container">
      <div className="vesper-header-row">
        <div>
          <h1 className="vesper-h1">Prescriptions</h1>
          <p className="vesper-header-subcopy">
            Provider medication orders and e-prescriptions for {organization?.name ?? "Clinic"}.
          </p>
        </div>
        <button
          type="button"
          className="vesper-btn-outline"
          onClick={() => void loadPrescriptions()}
        >
          <RefreshCw size={14} /> Refresh Prescriptions
        </button>
      </div>

      <div className="vesper-card" style={{ marginTop: "24px" }}>
        <div className="vesper-card__header">
          <div>
            <h2 className="vesper-card__title">Recent E-Prescriptions</h2>
            <p className="vesper-card__subtitle">
              {prescriptions.length} e-prescription{prescriptions.length === 1 ? "" : "s"} recorded
            </p>
          </div>
        </div>

        <div className="vesper-table-container">
          <table className="vesper-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Medication</th>
                <th>Dosage & Instructions</th>
                <th>Authored Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {prescriptions.length > 0 ? (
                prescriptions.map((rx) => (
                  <tr key={rx.id}>
                    <td>
                      <div className="vesper-patient-cell">
                        <div className="vesper-avatar-chip">{rx.initials}</div>
                        <span className="vesper-patient-name">{rx.patientName}</span>
                      </div>
                    </td>
                    <td>
                      <strong>{rx.medication}</strong>
                    </td>
                    <td>{rx.instructions}</td>
                    <td>{rx.authoredDate}</td>
                    <td>
                      <span
                        className={`vesper-alert-pill ${
                          rx.status.toLowerCase() === "active"
                            ? "vesper-alert-pill--low"
                            : "vesper-alert-pill--amber"
                        }`}
                      >
                        {rx.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="vesper-table-empty">
                    {loading
                      ? "Loading prescriptions..."
                      : "No medication prescriptions available"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
