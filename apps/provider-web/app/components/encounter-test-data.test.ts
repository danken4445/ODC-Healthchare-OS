import test from "node:test";
import assert from "node:assert/strict";
import {
  CLINICAL_TEST_PROFILES,
  generateRandomEncounterData,
  generateRandomTriageData,
  isDeveloperModeActive,
  setDeveloperModeActive,
} from "./encounter-test-data.ts";

test("CLINICAL_TEST_PROFILES contains realistic clinical cases", () => {
  assert.ok(CLINICAL_TEST_PROFILES.length >= 6, "Expected at least 6 clinical profiles");

  for (const profile of CLINICAL_TEST_PROFILES) {
    assert.ok(profile.id, "Profile must have an id");
    assert.ok(profile.name, "Profile must have a name");
    assert.ok(profile.category, "Profile must have a category");
    
    // SOAP documentation assertions
    assert.ok(profile.soap.includes("Subjective:"), `${profile.name} must have Subjective section`);
    assert.ok(profile.soap.includes("Objective:"), `${profile.name} must have Objective section`);
    assert.ok(profile.soap.includes("Assessment:"), `${profile.name} must have Assessment section`);
    assert.ok(profile.soap.includes("Plan:"), `${profile.name} must have Plan section`);

    // Prescription assertions
    assert.ok(profile.prescription.medication, `${profile.name} must have medication`);
    assert.ok(profile.prescription.dosage, `${profile.name} must have dosage`);
    assert.ok(profile.prescription.note !== undefined, `${profile.name} must have note`);

    // Certificate assertions
    assert.ok(profile.certificate.title, `${profile.name} must have certificate title`);
    assert.ok(profile.certificate.statement, `${profile.name} must have certificate statement`);

    // Lab & Referral assertions
    assert.ok(["routine", "urgent", "asap", "stat"].includes(profile.laboratory.priority));
    assert.ok(profile.laboratory.note, `${profile.name} must have lab note`);
    assert.ok(["routine", "urgent", "asap"].includes(profile.referral.priority));
    assert.ok(profile.referral.note, `${profile.name} must have referral note`);
  }
});

test("generateRandomEncounterData populates encounter fields without options", () => {
  const data = generateRandomEncounterData();

  assert.ok(data.profile);
  assert.ok(data.soap.length > 50);
  assert.ok(data.prescription.medication);
  assert.ok(data.prescription.dosage);
  assert.ok(data.certificate.title);
  assert.ok(data.certificate.statement);
  assert.ok(data.laboratory.priority);
  assert.ok(data.laboratory.note);
  assert.ok(data.referral.priority);
  assert.ok(data.referral.note);
  assert.equal(data.inventory.quantity, "1");
});

test("generateRandomEncounterData blends in real clinic resources when available", () => {
  const dummyLabs = [
    { id: "lab-1", name: "CBC", active: true, labCost: 250, code: "CBC", category: "hematology", turnaroundHours: 2, preparationInstructions: null },
    { id: "lab-2", name: "Urinalysis", active: true, labCost: 150, code: "UA", category: "clinical_microscopy", turnaroundHours: 1, preparationInstructions: null },
  ];
  const dummySpecialists = [
    { practitionerRoleId: "spec-role-1", displayName: "Dr. Smith", organizationName: "General Hospital", specialty: "Cardiology" },
  ];
  const dummyInventory = {
    departments: [{ id: "dept-1", code: "CLINIC", name: "Outpatient Clinic", active: true }],
    items: [{ id: "item-1", code: "MASK", name: "Surgical Mask", unit_of_measure: "piece", active: true }],
    stock: [{ id: "stock-1", department_id: "dept-1", item_id: "item-1", quantity: "100", batch_number: "B1", expiry_date: null, status: "available" }],
    usages: [],
  };

  const data = generateRandomEncounterData({
    laboratoryServices: dummyLabs,
    specialists: dummySpecialists,
    inventory: dummyInventory as any,
    currentDepartmentId: "dept-1",
  });

  assert.ok(["lab-1", "lab-2"].includes(data.laboratory.serviceId), "Should pick from available lab service IDs");
  assert.equal(data.referral.specialistRoleId, "spec-role-1", "Should pick available specialist role ID");
  assert.equal(data.inventory.stockId, "stock-1", "Should pick available stock ID");
  assert.equal(data.inventory.departmentId, "dept-1", "Should pick matching department ID");
});

test("isDeveloperModeActive and setDeveloperModeActive handle missing window gracefully", () => {
  assert.equal(isDeveloperModeActive(), false);
  // Should not throw in Node environment
  setDeveloperModeActive(true);
  setDeveloperModeActive(false);
});

test("generateRandomTriageData produces coherent, complete vital signs and assessment", () => {
  const triageData = generateRandomTriageData();

  assert.ok(triageData.profileName, "Expected profileName to be present");
  assert.ok(triageData.systolicBp >= 80 && triageData.systolicBp <= 220, "Systolic out of realistic bounds");
  assert.ok(triageData.diastolicBp >= 50 && triageData.diastolicBp <= 130, "Diastolic out of realistic bounds");
  assert.ok(triageData.pulseBpm >= 40 && triageData.pulseBpm <= 160, "Pulse out of realistic bounds");
  assert.ok(triageData.respiratoryRate >= 10 && triageData.respiratoryRate <= 40, "RR out of realistic bounds");
  assert.ok(triageData.temperatureC >= 35 && triageData.temperatureC <= 42, "Temp out of realistic bounds");
  assert.ok(triageData.oxygenSaturation >= 90 && triageData.oxygenSaturation <= 100, "SpO2 out of realistic bounds");
  assert.ok(triageData.weightKg > 20 && triageData.weightKg < 250, "Weight out of realistic bounds");
  assert.ok(triageData.heightCm > 100 && triageData.heightCm < 250, "Height out of realistic bounds");
  assert.ok(triageData.painScore >= 0 && triageData.painScore <= 10, "Pain score out of 0-10 bounds");
  assert.ok(["routine", "urgent", "emergency"].includes(triageData.acuity), "Invalid acuity value");
  assert.ok(triageData.chiefComplaint.length > 5, "Chief complaint is too short");
  assert.ok(triageData.notes.length > 5, "Triage notes are too short");
});
