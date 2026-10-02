"use client";

import { Button } from "@odyssey/ui";
import { type FormEvent, useEffect, useState } from "react";

interface EncounterSoapEditorProps {
  autosaveState: "idle" | "pending" | "saving" | "saved" | "error";
  busy: boolean;
  canEdit: boolean;
  currentNoteId?: string | null;
  debugMode: boolean;
  encounterId: string;
  isDirty?: boolean;
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
  isDirty,
  lastSavedAt,
  onChange,
  onRetryAutosave,
  onSubmit,
  onTestFillAll,
  onTestFillSoap,
  value,
}: EncounterSoapEditorProps) {
  // Local submission state to lock the button immediately upon press,
  // preventing double-clicks or rapid spam before parent state re-renders.
  const [isSubmitting, setIsSubmitting] = useState(false);

  // When autosave/save settles from "saving" to another state, release isSubmitting
  useEffect(() => {
    if (autosaveState !== "saving") {
      setIsSubmitting(false);
    }
  }, [autosaveState]);

  const autosaveMessage = autosaveState === "pending"
    ? "Changes will save automatically."
    : autosaveState === "saving"
      ? "Saving changes…"
      : autosaveState === "saved"
        ? `Saved${lastSavedAt ? ` at ${lastSavedAt}` : ""}.`
        : autosaveState === "error"
          ? "Changes were not saved."
          : "Changes save automatically.";

  // Determine if note is actively saving
  const isSaving = autosaveState === "saving" || isSubmitting;

  // Determine if the note has already been saved and has no pending edits
  // If isDirty is explicitly provided, respect it; otherwise consider "saved" as not dirty
  const hasNoUnsavedChanges = isDirty !== undefined ? !isDirty : autosaveState === "saved";
  const isSaved = (autosaveState === "saved" || (!isDirty && Boolean(value.trim()))) && hasNoUnsavedChanges;

  // Save is allowed ONLY if:
  // 1. Doctor has edit permissions and workspace is not busy
  // 2. Not currently in saving/submitting state
  // 3. Not already saved (pressable only once until new edits are made)
  // 4. Textarea has actual content
  const canSave = canEdit && !busy && !isSaving && !isSaved && Boolean(value.trim());

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;
    setIsSubmitting(true);
    onSubmit(event);
  }

  const saveButtonLabel = isSaving ? (
    "Saving…"
  ) : isSaved ? (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
      Saved
    </span>
  ) : (
    "Save now"
  );

  const saveButtonTitle = isSaving
    ? "Saving SOAP consultation note…"
    : isSaved
      ? "Clinical note is up to date and safely recorded. Edit note to save a new revision."
      : "Save and commit consultation note to patient EHR record";

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
      <form className="encounter-note-form" onSubmit={handleFormSubmit}>
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
            <Button
              disabled={!canSave}
              type="submit"
              title={saveButtonTitle}
              variant={isSaved ? "secondary" : "default"}
              className={isSaved ? "encounter-soap-btn-saved" : undefined}
              style={
                isSaved
                  ? {
                      borderColor: "rgba(16, 185, 129, 0.4)",
                      color: "var(--odyssey-success, #059669)",
                      fontWeight: 600,
                    }
                  : undefined
              }
            >
              {saveButtonLabel}
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}
