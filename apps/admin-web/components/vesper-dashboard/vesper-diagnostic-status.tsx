"use client";

import React, { useState } from "react";
import type { VesperDiagnosticTest } from "../../hooks/use-vesper-dashboard-data";

interface VesperDiagnosticStatusProps {
  tests: VesperDiagnosticTest[];
}

export function VesperDiagnosticStatus({ tests }: VesperDiagnosticStatusProps) {
  const [activeTab, setActiveTab] = useState<"Laboratory" | "All">("Laboratory");

  const filteredTests =
    activeTab === "All"
      ? tests
      : tests.filter((t) => t.category === "Laboratory");

  return (
    <div className="vesper-card">
      <div className="vesper-card__header vesper-card__header--column">
        <h2 className="vesper-card__title">Diagnostic Test Status</h2>
        <div className="vesper-pill-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "Laboratory"}
            className={`vesper-pill-tab ${
              activeTab === "Laboratory" ? "vesper-pill-tab--active" : ""
            }`}
            onClick={() => setActiveTab("Laboratory")}
          >
            Laboratory
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "All"}
            className={`vesper-pill-tab ${
              activeTab === "All" ? "vesper-pill-tab--active" : ""
            }`}
            onClick={() => setActiveTab("All")}
          >
            All Orders
          </button>
        </div>
      </div>

      <div className="vesper-table-container">
        <table className="vesper-table">
          <thead>
            <tr>
              <th style={{ width: "48%" }}>Test</th>
              <th style={{ width: "26%" }}>Requested Date</th>
              <th style={{ width: "26%" }}>Completed Date</th>
            </tr>
          </thead>
          <tbody>
            {filteredTests.length > 0 ? (
              filteredTests.map((test) => {
                return (
                  <tr key={test.id}>
                    <td>
                      <div className="vesper-test-cell">
                        <span className={`vesper-shape-indicator vesper-shape-${test.shape} vesper-color-${test.color}`} />
                        <span className="vesper-test-name">{test.name}</span>
                      </div>
                    </td>
                    <td>
                      <span className="vesper-date-text">{test.requestedDate}</span>
                    </td>
                    <td>
                      <span
                        className={
                          test.completedDate === "In Progress" || !test.completedDate
                            ? "vesper-date-badge--pending"
                            : "vesper-date-text"
                        }
                      >
                        {test.completedDate ?? "In Progress"}
                      </span>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={3} className="vesper-table-empty">
                  No diagnostic test records available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
