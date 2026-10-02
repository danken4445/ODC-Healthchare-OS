import React from "react";
import type { PmrAlertsBanner } from "@odyssey/types";

export interface AlertBannerProps {
  alerts: PmrAlertsBanner;
}

export function AlertBanner({ alerts }: AlertBannerProps) {
  return (
    <div className="pmr-alerts-banner" role="alert" aria-label="Clinical Alerts and Allergies">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>ALLERGIES &amp; ADVERSE REACTIONS</strong>
        <span style={{ fontSize: "8pt", fontWeight: 700, color: "#111" }}>
          CODE STATUS: {alerts.codeStatus}
        </span>
      </div>

      <p>{alerts.allergyStatement}</p>

      {alerts.allergies.length > 0 && (
        <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: "8.5pt" }}>
          {alerts.allergies.map((allergy) => (
            <li key={allergy.id}>
              <strong>{allergy.substance}</strong> ({allergy.category.toUpperCase()}) —{" "}
              <span>{allergy.manifestation}</span>{" "}
              {allergy.criticality === "high" && (
                <span className="flag-critical" style={{ marginLeft: 4 }}>
                  [CRITICAL ALERT]
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {alerts.criticalFlags.length > 0 && (
        <div style={{ marginTop: 6, paddingTop: 4, borderTop: "1px dashed #b91c1c" }}>
          {alerts.criticalFlags.map((flag) => (
            <div key={flag.id} style={{ fontSize: "8pt", color: "#900" }}>
              <strong>▲ {flag.title}:</strong> {flag.description}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
