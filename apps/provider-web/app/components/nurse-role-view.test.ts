import test from "node:test";
import assert from "node:assert/strict";

/**
 * Logic verification for Nurse vs Doctor role isolation in Provider Web.
 */

function determineIsNurse({
  roleCodes,
  canTriage,
  canPrescribe,
  signedInAs,
}: {
  roleCodes: string[];
  canTriage: boolean;
  canPrescribe: boolean;
  signedInAs: string | null;
}): boolean {
  if (
    roleCodes.includes("nurse") &&
    !roleCodes.includes("doctor") &&
    !roleCodes.includes("specialist")
  ) {
    return true;
  }
  if (canTriage && !canPrescribe) {
    return true;
  }
  if (signedInAs?.toLowerCase().includes("nurse")) {
    return true;
  }
  return false;
}

function formatClinicianDisplay({
  signedInAs,
  practitionerName,
  isNurse,
}: {
  signedInAs: string | null;
  practitionerName?: string | null;
  isNurse: boolean;
}) {
  const rawName =
    practitionerName ||
    (signedInAs
      ? signedInAs
          .split("@")[0]
          .replace(/[._-]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())
      : isNurse
        ? "Nurse"
        : "Clinician");

  const displayName = isNurse
    ? rawName.toLowerCase().startsWith("dr.")
      ? rawName.replace(/^dr\.\s*/i, "Nurse ")
      : rawName.toLowerCase().includes("nurse")
        ? rawName
        : `Nurse ${rawName}`
    : rawName.toLowerCase().startsWith("dr.")
      ? rawName
      : `Dr. ${rawName}`;

  const initials = isNurse
    ? displayName
        .replace(/^Nurse\s+/i, "")
        .split(" ")
        .filter(Boolean)
        .map((w) => w[0]?.toUpperCase())
        .slice(0, 2)
        .join("") || "RN"
    : displayName
        .replace(/^Dr\.\s*/i, "")
        .split(" ")
        .filter(Boolean)
        .map((w) => w[0]?.toUpperCase())
        .slice(0, 2)
        .join("") || "DR";

  return { displayName, initials };
}

function getVisibleTabs(isNurse: boolean) {
  const doctorTabs = [
    { id: "all", label: "Overview" },
    { id: "queue", label: "Daily queue" },
    { id: "chart", label: "Consultation" },
    { id: "diagnostics", label: "Diagnostics" },
    { id: "schedule", label: "Availability" },
  ];

  const nurseTabs = [
    { id: "all", label: "Overview" },
    { id: "queue", label: "Daily queue" },
    { id: "diagnostics", label: "Diagnostics" },
  ];

  return isNurse ? nurseTabs : doctorTabs;
}

test("determineIsNurse correctly identifies nurse accounts", () => {
  // Nurse via role code
  assert.equal(
    determineIsNurse({
      roleCodes: ["nurse"],
      canTriage: true,
      canPrescribe: false,
      signedInAs: "staff@clinic.org",
    }),
    true,
  );

  // Nurse via triage without prescribe permission
  assert.equal(
    determineIsNurse({
      roleCodes: [],
      canTriage: true,
      canPrescribe: false,
      signedInAs: "sarah@clinic.org",
    }),
    true,
  );

  // Nurse via email
  assert.equal(
    determineIsNurse({
      roleCodes: [],
      canTriage: false,
      canPrescribe: false,
      signedInAs: "nurse@synthetic.odyssey.test",
    }),
    true,
  );

  // Doctor must NOT be classified as Nurse
  assert.equal(
    determineIsNurse({
      roleCodes: ["doctor"],
      canTriage: true,
      canPrescribe: true,
      signedInAs: "doctor@synthetic.odyssey.test",
    }),
    false,
  );

  // Specialist must NOT be classified as Nurse
  assert.equal(
    determineIsNurse({
      roleCodes: ["specialist"],
      canTriage: true,
      canPrescribe: true,
      signedInAs: "specialist@clinic.org",
    }),
    false,
  );
});

test("formatClinicianDisplay formats nurse names without Dr. prefix", () => {
  // Case from user screenshot: nurse@synthetic.odyssey.test
  const nurseScreen = formatClinicianDisplay({
    signedInAs: "nurse@synthetic.odyssey.test",
    isNurse: true,
  });
  assert.equal(nurseScreen.displayName, "Nurse");
  assert.equal(nurseScreen.initials, "N");
  assert.notEqual(nurseScreen.displayName, "Dr. Nurse");

  // With practitioner name "Synthetic Nurse"
  const syntheticNurse = formatClinicianDisplay({
    signedInAs: "nurse@odc.com",
    practitionerName: "Synthetic Nurse",
    isNurse: true,
  });
  assert.equal(syntheticNurse.displayName, "Synthetic Nurse");
  assert.equal(syntheticNurse.initials, "SN");

  // Named nurse e.g. "Sarah Connor"
  const namedNurse = formatClinicianDisplay({
    signedInAs: "sconnor@clinic.org",
    practitionerName: "Sarah Connor",
    isNurse: true,
  });
  assert.equal(namedNurse.displayName, "Nurse Sarah Connor");
  assert.equal(namedNurse.initials, "SC");

  // Doctor gets Dr. prefix
  const doctor = formatClinicianDisplay({
    signedInAs: "reyes@clinic.org",
    practitionerName: "Maria Reyes",
    isNurse: false,
  });
  assert.equal(doctor.displayName, "Dr. Maria Reyes");
  assert.equal(doctor.initials, "MR");
});

test("getVisibleTabs excludes Consultation and Availability for Nurse accounts", () => {
  const nurseTabs = getVisibleTabs(true);
  const nurseTabIds = nurseTabs.map((t) => t.id);

  assert.deepEqual(nurseTabIds, ["all", "queue", "diagnostics"]);
  assert.equal(nurseTabIds.includes("chart"), false, "Consultation tab must not be visible to nurse");
  assert.equal(nurseTabIds.includes("schedule"), false, "Availability tab must not be visible to nurse");

  const doctorTabs = getVisibleTabs(false);
  const doctorTabIds = doctorTabs.map((t) => t.id);
  assert.deepEqual(doctorTabIds, ["all", "queue", "chart", "diagnostics", "schedule"]);
});
