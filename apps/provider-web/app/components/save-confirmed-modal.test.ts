import test from "node:test";
import assert from "node:assert/strict";
import {
  SaveConfirmedModal,
  TriageSaveConfirmedModal,
  EncounterSaveConfirmedModal,
  buildTriageSaveSummary,
  buildEncounterSaveSummary,
  type TriageVitalsSummary,
  type SaveSummaryItem,
} from "@odyssey/ui";

test("SaveConfirmedModal exports components and builders correctly", () => {
  assert.ok(typeof SaveConfirmedModal === "function", "SaveConfirmedModal must be exported as a function");
  assert.ok(typeof TriageSaveConfirmedModal === "function", "TriageSaveConfirmedModal must be exported as a function");
  assert.ok(typeof EncounterSaveConfirmedModal === "function", "EncounterSaveConfirmedModal must be exported as a function");
  assert.ok(typeof buildTriageSaveSummary === "function", "buildTriageSaveSummary must be exported as a function");
  assert.ok(typeof buildEncounterSaveSummary === "function", "buildEncounterSaveSummary must be exported as a function");
});

test("buildTriageSaveSummary formats vital signs and routine acuity accurately", () => {
  const vitals: TriageVitalsSummary = {
    systolicBp: 120,
    diastolicBp: 80,
    pulseBpm: 72,
    respiratoryRate: 16,
    temperatureC: 36.8,
    oxygenSaturation: 98,
    weightKg: 65,
    heightCm: 170,
    painScore: 2,
    acuity: "routine",
  };

  const items = buildTriageSaveSummary(vitals);
  assert.ok(Array.isArray(items), "summaryItems should be an array");

  const bpItem = items.find((i) => i.label === "Blood Pressure");
  assert.ok(bpItem, "Must include Blood Pressure");
  assert.equal(bpItem.value, "120/80");
  assert.equal(bpItem.unit, "mmHg");
  assert.equal(bpItem.highlight, true);

  const pulseItem = items.find((i) => i.label === "Pulse Rate");
  assert.ok(pulseItem, "Must include Pulse Rate");
  assert.equal(pulseItem.value, 72);
  assert.equal(pulseItem.unit, "bpm");

  const o2Item = items.find((i) => i.label === "Oxygen Saturation");
  assert.ok(o2Item, "Must include Oxygen Saturation");
  assert.equal(o2Item.value, 98);
  assert.equal(o2Item.unit, "%");

  const tempItem = items.find((i) => i.label === "Temperature");
  assert.ok(tempItem, "Must include Temperature");
  assert.equal(tempItem.value, 36.8);
  assert.equal(tempItem.unit, "°C");

  const respItem = items.find((i) => i.label === "Respiratory Rate");
  assert.ok(respItem, "Must include Respiratory Rate");
  assert.equal(respItem.value, 16);
  assert.equal(respItem.unit, "/min");

  const acuityItem = items.find((i) => i.label === "Clinical Acuity");
  assert.ok(acuityItem, "Must include Clinical Acuity");
  assert.equal(acuityItem.value, "Routine");
  assert.equal(acuityItem.badgeVariant, "success");

  const painItem = items.find((i) => i.label === "Pain Score");
  assert.ok(painItem, "Must include Pain Score");
  assert.equal(painItem.value, "2 / 10");
  assert.equal(painItem.badgeVariant, "info");

  const weightItem = items.find((i) => i.label === "Weight");
  assert.ok(weightItem, "Must include Weight");
  assert.equal(weightItem.value, 65);
  assert.equal(weightItem.unit, "kg");

  const heightItem = items.find((i) => i.label === "Height");
  assert.ok(heightItem, "Must include Height");
  assert.equal(heightItem.value, 170);
  assert.equal(heightItem.unit, "cm");
});

test("buildTriageSaveSummary handles urgent and emergency acuities and high pain", () => {
  const urgentVitals: TriageVitalsSummary = {
    systolicBp: 165,
    diastolicBp: 100,
    pulseBpm: 110,
    respiratoryRate: 24,
    temperatureC: 39.1,
    oxygenSaturation: 91,
    painScore: 5,
    acuity: "urgent",
  };

  const urgentItems = buildTriageSaveSummary(urgentVitals);
  const urgentAcuity = urgentItems.find((i) => i.label === "Clinical Acuity");
  assert.equal(urgentAcuity?.value, "Urgent");
  assert.equal(urgentAcuity?.badgeVariant, "warning");

  const moderatePain = urgentItems.find((i) => i.label === "Pain Score");
  assert.equal(moderatePain?.badgeVariant, "warning");

  const emergencyVitals: TriageVitalsSummary = {
    systolicBp: 210,
    diastolicBp: 130,
    pulseBpm: 145,
    respiratoryRate: 34,
    temperatureC: 40.5,
    oxygenSaturation: 82,
    painScore: 9,
    acuity: "emergency",
  };

  const emergencyItems = buildTriageSaveSummary(emergencyVitals);
  const emergencyAcuity = emergencyItems.find((i) => i.label === "Clinical Acuity");
  assert.equal(emergencyAcuity?.value, "Emergency");
  assert.equal(emergencyAcuity?.badgeVariant, "danger");

  const severePain = emergencyItems.find((i) => i.label === "Pain Score");
  assert.equal(severePain?.badgeVariant, "danger");
});

test("buildEncounterSaveSummary calculates words, SOAP sections, and revisions", () => {
  const soapNote = `Subjective: Patient reports acute onset right knee pain following a recreational basketball game yesterday. No prior knee surgeries.
Objective: Mild localized edema over anterior cruciate ligament joint line. Lachman test 2+ with soft end-point. Range of motion 10-90 degrees restricted by pain.
Assessment: Suspected anterior cruciate ligament (ACL) sprain, Grade II.
Plan: Rest, ice, compression, elevation (RICE) protocol. Prescribe Celecoxib 200mg daily. Order non-contrast right knee MRI. Return clinic in 1 week.`;

  const items = buildEncounterSaveSummary("enc-a1b2c3d4-5678", soapNote, 3);
  assert.ok(Array.isArray(items), "summaryItems should be an array");

  const refItem = items.find((i) => i.label === "Encounter Reference");
  assert.ok(refItem);
  assert.equal(refItem.value, "ENC-ENC-A1B2");
  assert.equal(refItem.highlight, true);

  const statusItem = items.find((i) => i.label === "Documentation Status");
  assert.ok(statusItem);
  assert.equal(statusItem.value, "Revision #3");
  assert.equal(statusItem.badgeVariant, "success");

  const wordCountItem = items.find((i) => i.label === "Word Count");
  assert.ok(wordCountItem);
  assert.ok(Number(wordCountItem.value?.toString().replace(/\D/g, "")) > 50, "Word count should exceed 50");
  assert.equal(wordCountItem.unit, "(4/4 SOAP sections)");
});

test("buildEncounterSaveSummary handles initial draft without revision", () => {
  const note = "Brief triage consultation note.";
  const items = buildEncounterSaveSummary("enc-11223344-9999", note);

  const statusItem = items.find((i) => i.label === "Documentation Status");
  assert.equal(statusItem?.value, "Active Record");

  const wordCountItem = items.find((i) => i.label === "Word Count");
  assert.equal(wordCountItem?.value, "4 words");
  assert.equal(wordCountItem?.unit, undefined);
});
