import test from "node:test";
import assert from "node:assert/strict";
import { buildEncounterSaveSummary } from "@odyssey/ui";

test("Encounter SOAP Editor logic: anti-spam and single-press state rules", () => {
  // Simulating the canSave and button label determination rules implemented in EncounterSoapEditor

  function determineSoapButtonState({
    autosaveState,
    isDirty,
    busy,
    canEdit,
    value,
    isSubmitting = false,
  }: {
    autosaveState: "idle" | "pending" | "saving" | "saved" | "error";
    isDirty?: boolean;
    busy: boolean;
    canEdit: boolean;
    value: string;
    isSubmitting?: boolean;
  }) {
    const isSaving = autosaveState === "saving" || isSubmitting;
    const hasNoUnsavedChanges = isDirty !== undefined ? !isDirty : autosaveState === "saved";
    const isSaved = (autosaveState === "saved" || (!isDirty && Boolean(value.trim()))) && hasNoUnsavedChanges;
    const canSave = canEdit && !busy && !isSaving && !isSaved && Boolean(value.trim());

    const label = isSaving ? "Saving…" : isSaved ? "Saved ✓" : "Save now";

    return { canSave, isSaving, isSaved, label };
  }

  // Case 1: Just saved -> button MUST be disabled with "Saved ✓" so it cannot be spammed
  const savedState = determineSoapButtonState({
    autosaveState: "saved",
    isDirty: false,
    busy: false,
    canEdit: true,
    value: "Subjective: Patient has mild asthma. Objective: Normal vitals. Assessment: Asthma. Plan: Inhaler.",
  });
  assert.equal(savedState.canSave, false, "Saved note must NOT be pressable again");
  assert.equal(savedState.isSaved, true, "Must be flagged as isSaved");
  assert.equal(savedState.label, "Saved ✓", "Label must show confirmed saved checkmark");

  // Case 2: User types new edits -> isDirty becomes true, autosave becomes pending -> button enables as "Save now"
  const dirtyPendingState = determineSoapButtonState({
    autosaveState: "pending",
    isDirty: true,
    busy: false,
    canEdit: true,
    value: "Subjective: Patient has mild asthma with new nighttime cough. Objective: Normal vitals. Assessment: Asthma. Plan: Inhaler.",
  });
  assert.equal(dirtyPendingState.canSave, true, "Dirty pending note MUST be pressable");
  assert.equal(dirtyPendingState.isSaved, false, "Must not be isSaved");
  assert.equal(dirtyPendingState.label, "Save now", "Label must be Save now");

  // Case 3: While saving (or submitting) -> button disabled with "Saving…"
  const savingState = determineSoapButtonState({
    autosaveState: "saving",
    isDirty: true,
    busy: false,
    canEdit: true,
    value: "Subjective: Patient has mild asthma...",
  });
  assert.equal(savingState.canSave, false, "Saving note must NOT be pressable");
  assert.equal(savingState.isSaving, true, "Must be flagged as isSaving");
  assert.equal(savingState.label, "Saving…", "Label must be Saving…");

  // Case 4: Synchronous submit lock (isSubmitting = true) before async React re-render
  const submittingLockState = determineSoapButtonState({
    autosaveState: "pending",
    isDirty: true,
    busy: false,
    canEdit: true,
    value: "Subjective: Patient has mild asthma...",
    isSubmitting: true,
  });
  assert.equal(submittingLockState.canSave, false, "Submitting lock must block rapid multi-clicks");
  assert.equal(submittingLockState.isSaving, true);
  assert.equal(submittingLockState.label, "Saving…");

  // Case 5: Empty note cannot be saved
  const emptyState = determineSoapButtonState({
    autosaveState: "idle",
    isDirty: true,
    busy: false,
    canEdit: true,
    value: "   ",
  });
  assert.equal(emptyState.canSave, false, "Empty note cannot be saved");

  // Case 6: Note loaded from existing encounter (idle, unchanged)
  const existingLoadedState = determineSoapButtonState({
    autosaveState: "idle",
    isDirty: false,
    busy: false,
    canEdit: true,
    value: "Existing recorded SOAP note.",
  });
  assert.equal(existingLoadedState.canSave, false, "Existing unchanged note must be locked as saved");
  assert.equal(existingLoadedState.label, "Saved ✓");
});

test("persistSoapNote anti-spam and confirmation guarantee logic", async () => {
  let dbSaveCount = 0;
  let lastSavedText = "";
  let currentRevision = 0;
  let confirmationModalPayload: { noteSnippet: string; revisionNumber: number } | null = null;

  async function mockPersistSoapNote(text: string, source: "auto" | "manual") {
    const trimmed = text.trim();
    if (!trimmed) return false;

    // Anti-spam guard: if identical text is already saved, bypass DB write
    if (trimmed === lastSavedText) {
      if (source === "manual") {
        confirmationModalPayload = {
          noteSnippet: trimmed,
          revisionNumber: currentRevision > 0 ? currentRevision : 1,
        };
      }
      return true;
    }

    // New content save
    dbSaveCount++;
    currentRevision++;
    lastSavedText = trimmed;

    if (source === "manual") {
      confirmationModalPayload = {
        noteSnippet: trimmed,
        revisionNumber: currentRevision,
      };
    }
    return true;
  }

  const initialNote = "Subjective: Test note. Objective: Vitals stable. Assessment: Healthy. Plan: Follow-up.";

  // 1. Initial manual save
  await mockPersistSoapNote(initialNote, "manual");
  assert.equal(dbSaveCount, 1, "First save commits to DB");
  assert.equal(currentRevision, 1, "Revision becomes 1");
  assert.ok(confirmationModalPayload, "Confirmation modal payload must be created");
  assert.equal(confirmationModalPayload?.revisionNumber, 1);

  // Clear confirmation modal to simulate user clicking 'Continue'
  confirmationModalPayload = null;

  // 2. User presses "Save now" again on identical content -> anti-spam must prevent DB write but guarantee confirmation
  await mockPersistSoapNote(initialNote, "manual");
  assert.equal(dbSaveCount, 1, "Duplicate save must NOT call database");
  assert.equal(currentRevision, 1, "Revision count must not increment on identical content");
  assert.ok(confirmationModalPayload, "Confirmation modal must STILL be triggered for clinician reassurance");
  assert.equal(confirmationModalPayload?.revisionNumber, 1);

  // 3. User modifies text -> saves new revision
  confirmationModalPayload = null;
  const revisedNote = initialNote + " Additional instruction: hydrate well.";
  await mockPersistSoapNote(revisedNote, "manual");
  assert.equal(dbSaveCount, 2, "Modified note commits new revision to DB");
  assert.equal(currentRevision, 2, "Revision becomes 2");
  assert.equal(confirmationModalPayload?.revisionNumber, 2);
});

test("Encounter Save Confirmation Modal summary builder generates valid record info", () => {
  const note = `Subjective: Patient with seasonal rhinitis.
Objective: Turbinates congested.
Assessment: Allergic rhinitis.
Plan: Antihistamines 10mg daily.`;

  const summary = buildEncounterSaveSummary("enc-test-123456", note, 2);
  assert.ok(Array.isArray(summary));
  assert.ok(summary.some((item) => item.label === "Encounter Reference" && String(item.value).includes("ENC-ENC-TEST")));
  assert.ok(summary.some((item) => item.label === "Documentation Status" && item.value === "Revision #2"));
  assert.ok(summary.some((item) => item.label === "Word Count" && item.unit === "(4/4 SOAP sections)"));
});
