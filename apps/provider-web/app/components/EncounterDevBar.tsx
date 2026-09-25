"use client";

import { Badge, Button } from "@odyssey/ui";
import { type ReactNode } from "react";

interface EncounterDevBarProps {
  activeProfileName?: string;
  onTestFillAll: () => void;
  onTestFillSoap: () => void;
  onTestFillOrders: () => void;
  onClearDrafts: () => void;
  onExitDevMode: () => void;
}

export function EncounterDevBar({
  activeProfileName,
  onTestFillAll,
  onTestFillSoap,
  onTestFillOrders,
  onClearDrafts,
  onExitDevMode,
}: EncounterDevBarProps) {
  return (
    <aside
      id="encounter-dev-toolbar"
      className="encounter-dev-toolbar"
      aria-label="Developer Debug Mode Bar"
    >
      <div className="dev-toolbar-left">
        <div className="dev-toolbar-badge-group">
          <span className="dev-pulse-dot" aria-hidden="true" />
          <Badge variant="success">ODC Developer Mode</Badge>
          <span className="dev-easter-egg-tag">Easter Egg Active</span>
        </div>
        <div className="dev-toolbar-meta">
          <p className="dev-toolbar-title">
            Encounter Test Fill Generator
          </p>
          {activeProfileName ? (
            <p className="dev-toolbar-profile">
              Current Case: <strong>{activeProfileName}</strong>
            </p>
          ) : (
            <p className="dev-toolbar-hint">
              Ready to generate randomized encounter test inputs.
            </p>
          )}
        </div>
      </div>

      <div className="dev-toolbar-actions">
        <button
          type="button"
          id="odc-dev-fill-all-btn"
          className="dev-action-btn dev-action-btn--primary"
          onClick={onTestFillAll}
          title="Randomly generate and populate all encounter fields (SOAP, Rx, Certificate, Lab, Referral, Item)"
        >
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          <span>Test Fill All (Randomize)</span>
        </button>

        <button
          type="button"
          id="odc-dev-fill-soap-btn"
          className="dev-action-btn"
          onClick={onTestFillSoap}
          title="Randomly generate SOAP note only"
        >
          <span>📝 SOAP Only</span>
        </button>

        <button
          type="button"
          id="odc-dev-fill-orders-btn"
          className="dev-action-btn"
          onClick={onTestFillOrders}
          title="Randomly generate Orders & Charges (Rx, Cert, Lab, Referral, Tagging)"
        >
          <span>💊 Orders Only</span>
        </button>

        <button
          type="button"
          id="odc-dev-clear-btn"
          className="dev-action-btn dev-action-btn--ghost"
          onClick={onClearDrafts}
          title="Clear all generated encounter inputs"
        >
          <span>🧹 Clear</span>
        </button>

        <button
          type="button"
          id="odc-dev-exit-btn"
          className="dev-action-btn dev-action-btn--exit"
          onClick={onExitDevMode}
          title="Exit developer debug mode"
          aria-label="Exit developer debug mode"
        >
          ✕ Exit
        </button>
      </div>
    </aside>
  );
}
