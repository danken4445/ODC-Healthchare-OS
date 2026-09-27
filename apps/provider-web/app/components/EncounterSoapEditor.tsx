"use client";

import { Button } from "@odyssey/ui";
import type { FormEvent } from "react";

interface EncounterSoapEditorProps {
  autosaveState: "idle" | "pending" | "saving" | "saved" | "error";
  busy: boolean;
  canEdit: boolean;
  currentNoteId?: string | null;
  debugMode: boolean;
  encounterId: string;
  lastSavedAt: string | null;
  onChange: (value: string) => void;
  onRetryAutosave: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTestFillAll: () => void;
  onTestFillSoap: () => void;
  value: string;
}

export function EncounterSoapEditor({
  autosaveState,
  busy,
  canEdit,
  currentNoteId,
  debugMode,
  encounterId,
  lastSavedAt,
  onChange,
  onRetryAutosave,
  onSubmit,
  onTestFillAll,
  onTestFillSoap,
  value,
}: EncounterSoapEditorProps) {
  const autosaveMessage = autosaveState === "pending"
    ? "Changes will save automatically."
    : autosaveState === "saving"
      ? "Saving changes…"
      : autosaveState === "saved"
        ? `Saved${lastSavedAt ? ` at ${lastSavedAt}` : ""}.`
        : autosaveState === "error"
          ? "Changes were not saved."
          : "Changes save automatically.";

  return (
    <section
      className="encounter-soap-editor"
      aria-labelledby="encounter-soap-editor-heading"
    >
      <div className="encounter-section-heading">
        <div>
          <p className="eyebrow">Current encounter</p>
          <h2 id="encounter-soap-editor-heading">Clinical documentation</h2>
        </div>
        <div className="encounter-heading-aside">
          {debugMode ? (
            <Button
              id="odc-soap-test-fill-btn"
              size="sm"
              type="button"
              variant="outline"
              onClick={onTestFillSoap}
              title="Randomly generate SOAP note"
            >
              ⚡ Test Fill SOAP
            </Button>
          ) : null}
          <span>{currentNoteId ? "Revision" : "New note"}</span>
        </div>
      </div>
      <form className="encounter-note-form" onSubmit={onSubmit}>
        <label htmlFor="encounter-soap-note">
          SOAP documentation
          {debugMode ? (
            <span className="dev-field-badge">
              Dev Mode · Type ODC to randomize
            </span>
          ) : (
            <span className="dev-field-hint">Tip: Type ODC for Test Fill</span>
          )}
        </label>
        <textarea
          id="encounter-soap-note"
          key={currentNoteId ?? encounterId}
          name="text"
          rows={18}
          maxLength={20000}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={
            "Subjective:\n\nObjective:\n\nAssessment:\n\nPlan:\n\n(Easter egg: Type 'ODC' to activate Developer Test Fill)"
          }
          required
        />
        <div className="encounter-note-actions">
          <div className="encounter-note-save-status" role="status" aria-live="polite">
            <p>{autosaveMessage}</p>
            <span>Saved notes are versioned in the patient record.</span>
          </div>
          <div className="encounter-note-btn-group">
            {debugMode ? (
              <Button
                id="odc-note-all-fill-btn"
                type="button"
                variant="outline"
                onClick={onTestFillAll}
                title="Randomly populate all encounter inputs"
              >
                ⚡ Test Fill All
              </Button>
            ) : null}
            {autosaveState === "error" ? (
              <Button disabled={busy || !canEdit} onClick={onRetryAutosave} type="button" variant="outline">
                Retry save
              </Button>
            ) : null}
            <Button disabled={busy || !canEdit || autosaveState === "saving"} type="submit">
              {autosaveState === "saving" ? "Saving…" : "Save now"}
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}
