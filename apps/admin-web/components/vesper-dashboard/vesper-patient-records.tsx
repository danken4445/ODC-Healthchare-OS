"use client";

import { MoreVertical } from "lucide-react";
import React, { useState } from "react";
import type { VesperPatientRecord } from "../../hooks/use-vesper-dashboard-data";

interface VesperPatientRecordsProps {
  patients: VesperPatientRecord[];
  onSelectPatient: (patient: VesperPatientRecord) => void;
  onRefresh?: () => void;
}

export function VesperPatientRecords({
  patients,
  onSelectPatient,
  onRefresh,
}: VesperPatientRecordsProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="vesper-card">
      <div className="vesper-card__header">
        <div>
          <h2 className="vesper-card__title">Patient Records</h2>
          <p className="vesper-card__subtitle">Recently accessed records</p>
        </div>
        <div className="vesper-card__actions">
          <button
            className="vesper-icon-btn"
            type="button"
            aria-label="Patient records menu"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <MoreVertical size={18} />
          </button>
          {menuOpen && (
            <div className="vesper-dropdown-menu">
              <button
                type="button"
                className="vesper-dropdown-item"
                onClick={() => {
                  setMenuOpen(false);
                  onRefresh?.();
                }}
              >
                Refresh records
              </button>
              <a
                href="/patients"
                className="vesper-dropdown-item"
                onClick={() => setMenuOpen(false)}
              >
                View all patients
              </a>
            </div>
          )}
        </div>
      </div>

      <div className="vesper-table-container">
        <table className="vesper-table">
          <thead>
            <tr>
              <th style={{ width: "42%" }}>Full Name</th>
              <th style={{ width: "18%" }}>Age</th>
              <th style={{ width: "18%" }}>Bed</th>
              <th style={{ width: "22%" }}>Type</th>
            </tr>
          </thead>
          <tbody>
            {patients.length > 0 ? (
              patients.map((patient) => {
                const alertClass =
                  patient.alertsCount >= 5
                    ? "vesper-alert-pill--high"
                    : patient.alertsCount >= 3
                    ? "vesper-alert-pill--medium"
                    : patient.alertsCount >= 2
                    ? "vesper-alert-pill--amber"
                    : "vesper-alert-pill--low";

                return (
                  <tr
                    key={patient.id}
                    onClick={() => onSelectPatient(patient)}
                    className="vesper-table-row--interactive"
                  >
                    <td>
                      <div className="vesper-patient-cell">
                        <div className="vesper-avatar-chip">
                          {patient.initials}
                        </div>
                        <span className="vesper-patient-name">{patient.fullName}</span>
                      </div>
                    </td>
                    <td>
                      <span className="vesper-age-gender">
                        {patient.age}{" "}
                        <span
                          className={
                            patient.gender === "female"
                              ? "vesper-gender-female"
                              : "vesper-gender-male"
                          }
                        >
                          {patient.gender === "female" ? "♀" : "♂"}
                        </span>
                      </span>
                    </td>
                    <td>
                      <span className="vesper-bed-number">{patient.bedOrQueue}</span>
                    </td>
                    <td>
                      <span className={`vesper-alert-pill ${alertClass}`}>
                        {patient.alertsCount} alert{patient.alertsCount === 1 ? "" : "s"}
                      </span>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={4} className="vesper-table-empty">
                  No patient records available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
