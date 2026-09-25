"use client";

import { FileText, Plus, RefreshCw, Search } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { useAdminData } from "../../components/admin-data-context";

interface ClinicalEncounterRecord {
  id: string;
  patientName: string;
  initials: string;
  encounterDate: string;
  chiefComplaint: string;
  assessment: string;
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

export default function SoapNotesPage() {
  const { client, organization } = useAdminData();
  const [encounters, setEncounters] = useState<ClinicalEncounterRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEncounters = useCallback(async () => {
    if (!organization) return;
    try {
      setLoading(true);

      const [encountersRes, notesRes] = await Promise.allSettled([
        client
          .from("encounters")
          .select(`
            id,
            period_start,
            period_end,
            status,
            service_type,
            patients (
              id,
              name
            )
          `)
          .eq("organization_id", organization.id)
          .order("period_start", { ascending: false })
          .limit(50),
        client
          .from("observations")
          .select("encounter_id, value")
          .eq("organization_id", organization.id)
          .eq("code", "SOAP-NOTE")
          .limit(100),
      ]);

      const notesMap = new Map<string, string>();
      if (notesRes.status === "fulfilled" && !notesRes.value.error && notesRes.value.data) {
        notesRes.value.data.forEach((obs: any) => {
          if (obs.encounter_id) {
            let text = "";
            if (typeof obs.value === "string") text = obs.value;
            else if (obs.value && typeof obs.value === "object" && obs.value.text) {
              text = obs.value.text;
            }
            if (text) {
              notesMap.set(obs.encounter_id, text);
            }
          }
        });
      }

      if (encountersRes.status === "fulfilled" && !encountersRes.value.error && encountersRes.value.data) {
        const mapped: ClinicalEncounterRecord[] = encountersRes.value.data.map((e: any) => {
          const patientRaw = Array.isArray(e.patients) ? e.patients[0] : e.patients;
          const patientName = parsePatientName(patientRaw?.name);
          const initials = getInitials(patientName);

          let encounterDate = "—";
          if (e.period_start) {
            const dt = new Date(e.period_start);
            if (!isNaN(dt.getTime())) {
              encounterDate = dt.toLocaleDateString("en-US", {
                month: "2-digit",
                day: "2-digit",
                year: "numeric",
              });
            }
          }

          const soapText = notesMap.get(e.id);
          let assessment = "Assessment in progress";
          if (soapText) {
            assessment = soapText.length > 60 ? `${soapText.slice(0, 60)}...` : soapText;
          } else if (e.status === "finished") {
            assessment = "Consultation completed & finalized";
          }

          return {
            id: e.id,
            patientName,
            initials,
            encounterDate,
            chiefComplaint: e.service_type || "General Outpatient Consultation",
            assessment,
            status: e.status === "finished" ? "Finalized" : e.status === "in_progress" ? "In Review" : "Planned",
          };
        });

        setEncounters(mapped);
      } else {
        setEncounters([]);
      }
    } catch (err) {
      console.warn("Failed to load clinical encounters:", err);
      setEncounters([]);
    } finally {
      setLoading(false);
    }
  }, [client, organization]);

  useEffect(() => {
    void loadEncounters();
  }, [loadEncounters]);

  return (
    <div className="vesper-page-container">
      <div className="vesper-header-row">
        <div>
          <h1 className="vesper-h1">SOAP Clinical Notes</h1>
          <p className="vesper-header-subcopy">
            Subjective, Objective, Assessment & Plan documentation for {organization?.name ?? "Clinic"}.
          </p>
        </div>
        <button
          type="button"
          className="vesper-btn-outline"
          onClick={() => void loadEncounters()}
        >
          <RefreshCw size={14} /> Refresh Notes
        </button>
      </div>

      <div className="vesper-card" style={{ marginTop: "24px" }}>
        <div className="vesper-card__header">
          <div>
            <h2 className="vesper-card__title">Recent Clinical Encounters</h2>
            <p className="vesper-card__subtitle">
              {encounters.length} clinical encounter{encounters.length === 1 ? "" : "s"} recorded
            </p>
          </div>
        </div>

        <div className="vesper-table-container">
          <table className="vesper-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Encounter Date</th>
                <th>Chief Complaint</th>
                <th>Assessment & Diagnosis</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {encounters.length > 0 ? (
                encounters.map((enc) => (
                  <tr key={enc.id}>
                    <td>
                      <div className="vesper-patient-cell">
                        <div className="vesper-avatar-chip">{enc.initials}</div>
                        <span className="vesper-patient-name">{enc.patientName}</span>
                      </div>
                    </td>
                    <td>{enc.encounterDate}</td>
                    <td>{enc.chiefComplaint}</td>
                    <td>{enc.assessment}</td>
                    <td>
                      <span
                        className={`vesper-alert-pill ${
                          enc.status === "Finalized"
                            ? "vesper-alert-pill--low"
                            : "vesper-alert-pill--amber"
                        }`}
                      >
                        {enc.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="vesper-table-empty">
                    {loading
                      ? "Loading clinical notes..."
                      : "No clinical notes available"}
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
